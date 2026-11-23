/* Larsi Perfume Finder — Location & Weather Engine (v7.7)
 *
 * Replaces the hardcoded Shiraz weather with a location-aware, hemisphere-aware
 * engine that respects user privacy and degrades gracefully.
 *
 * PIPELINE:
 *   1. Try geolocation API (requires user permission)
 *   2. If denied/unavailable, try IP-based geolocation (no permission needed)
 *   3. If that fails too, fall back to manual city selection
 *   4. Fetch weather from Open-Meteo (free, no API key)
 *   5. Determine season based on HEMISPHERE (not hardcoded Northern)
 *   5. Cache weather for 15 minutes; handle API failures with stale cache
 *
 * PRIVACY:
 *   - Precise GPS coordinates are NEVER stored in localStorage
 *   - Only the city name + lat/lon (rounded to 2 decimal places) is cached
 *   - User can clear location at any time from Settings
 *   - IP geolocation uses ipapi.co (free, returns city-level accuracy)
 */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});

  const LOC_KEY = 'lpf:location';
  const WX_KEY = 'lpf:wx';
  const WX_CACHE_MINUTES = 15;

  // ─── Default location (Shiraz — used only on first run) ──────────────────
  const DEFAULTS = [
    { name: 'شیراز', nameEn: 'Shiraz', lat: 29.5918, lon: 52.5836, country: 'ایران', tz: 'Asia/Tehran' },
    { name: 'تهران', nameEn: 'Tehran', lat: 35.6892, lon: 51.3890, country: 'ایران', tz: 'Asia/Tehran' },
    { name: 'مشهد', nameEn: 'Mashhad', lat: 36.2605, lon: 59.6168, country: 'ایران', tz: 'Asia/Tehran' },
    { name: 'اصفهان', nameEn: 'Isfahan', lat: 32.6539, lon: 51.6660, country: 'ایران', tz: 'Asia/Tehran' },
    { name: 'دبی', nameEn: 'Dubai', lat: 25.2048, lon: 55.2708, country: 'امارات', tz: 'Asia/Dubai' },
    { name: 'استانبول', nameEn: 'Istanbul', lat: 41.0082, lon: 28.9784, country: 'ترکیه', tz: 'Europe/Istanbul' },
    { name: 'لندن', nameEn: 'London', lat: 51.5074, lon: -0.1278, country: 'بریتانیا', tz: 'Europe/London' },
    { name: 'پاریس', nameEn: 'Paris', lat: 48.8566, lon: 2.3522, country: 'فرانسه', tz: 'Europe/Paris' },
    { name: 'نیویورک', nameEn: 'New York', lat: 40.7128, lon: -74.0060, country: 'آمریکا', tz: 'America/New_York' },
    { name: 'توکیو', nameEn: 'Tokyo', lat: 35.6762, lon: 139.6503, country: 'ژاپن', tz: 'Asia/Tokyo' }
  ];

  // ─── Location detection ──────────────────────────────────────────────────
  /**
   * Attempts to detect the user's location via the Geolocation API.
   * Returns a promise that resolves to {lat, lon, accuracy} or rejects.
   * NOTE: This triggers a browser permission prompt.
   */
  function detectByGPS() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('geolocation-unsupported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        err => reject(new Error(err.code === 1 ? 'permission-denied' : 'gps-error')),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });
  }

  /**
   * IP-based geolocation fallback (no permission needed).
   * Uses ipapi.co free tier (1000 req/day).
   */
  async function detectByIP() {
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('ip-http-' + res.status);
      const j = await res.json();
      if (j.latitude && j.longitude) {
        return {
          lat: j.latitude,
          lon: j.longitude,
          name: j.city || j.region || 'نامشخص',
          nameEn: j.city || j.region || 'Unknown',
          country: j.country_name || '',
          tz: j.timezone || 'Asia/Tehran',
          source: 'ip'
        };
      }
      throw new Error('ip-no-data');
    } catch (e) {
      throw new Error('ip-failed');
    }
  }

  /**
   * Reverse-geocodes lat/lon to a city name using Open-Meteo's free geocoding API.
   */
  async function reverseGeocode(lat, lon) {
    try {
      // Open-Meteo doesn't have reverse geocoding, but we can use the free
      // BigDataCloud API (no key needed, returns city name)
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fa`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) throw new Error('rev-http-' + res.status);
      const j = await res.json();
      return {
        name: j.city || j.locality || j.principalSubdivision || 'نامشخص',
        nameEn: j.city || j.locality || j.principalSubdivision || 'Unknown',
        country: j.countryName || '',
        tz: 'Asia/Tehran' // BigDataCloud doesn't return tz; use a sensible default
      };
    } catch {
      return { name: 'موقعیت شما', nameEn: 'Your Location', country: '', tz: 'Asia/Tehran' };
    }
  }

  /**
   * Saves location to localStorage (rounded to 2 decimal places for privacy).
   * Never stores precise GPS coordinates.
   */
  function saveLocation(loc) {
    try {
      const safe = {
        lat: Math.round(loc.lat * 100) / 100,  // ~1.1km precision
        lon: Math.round(loc.lon * 100) / 100,
        name: loc.name || 'موقعیت شما',
        nameEn: loc.nameEn || 'Your Location',
        country: loc.country || '',
        tz: loc.tz || 'Asia/Tehran',
        source: loc.source || 'manual',
        savedAt: Date.now()
      };
      localStorage.setItem(LOC_KEY, JSON.stringify(safe));
      return safe;
    } catch { return null; }
  }

  function loadLocation() {
    try {
      const v = localStorage.getItem(LOC_KEY);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }

  function clearLocation() {
    try { localStorage.removeItem(LOC_KEY); } catch {}
  }

  /**
   * Full location detection pipeline: GPS → IP → manual.
   * Returns the detected/saved location, or null if all methods fail.
   */
  async function detectLocation() {
    // Step 1: try GPS (triggers permission prompt)
    try {
      const gps = await detectByGPS();
      const geo = await reverseGeocode(gps.lat, gps.lon);
      const loc = saveLocation({ ...geo, lat: gps.lat, lon: gps.lon, source: 'gps' });
      return loc;
    } catch (e) {
      if (e.message === 'permission-denied') {
        // User denied GPS — try IP fallback silently
      }
    }
    // Step 2: try IP geolocation
    try {
      const ipLoc = await detectByIP();
      const loc = saveLocation(ipLoc);
      return loc;
    } catch {
      // IP failed too — caller should show manual selection
    }
    return null;
  }

  // ─── Hemisphere-aware season detection ──────────────────────────────────
  /**
   * Determines the current season based on the user's hemisphere and date.
   * Northern hemisphere: spring=Mar-May, summer=Jun-Aug, autumn=Sep-Nov, winter=Dec-Feb
   * Southern hemisphere: swapped (summer=Dec-Feb, winter=Jun-Aug)
   * Tropical: simplified to "wet"/"dry" based on month
   */
  function getSeason(lat, date) {
    const month = (date || new Date()).getMonth(); // 0-11
    const isNorthern = lat >= 0;
    // Season boundaries (Northern):
    // spring: 2-4 (Mar-May), summer: 5-7 (Jun-Aug), autumn: 8-10 (Sep-Nov), winter: 11,0,1
    let season;
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'autumn';
    else season = 'winter';
    // Southern hemisphere: swap summer↔winter, spring↔autumn
    if (!isNorthern) {
      if (season === 'summer') season = 'winter';
      else if (season === 'winter') season = 'summer';
      else if (season === 'spring') season = 'autumn';
      else if (season === 'autumn') season = 'spring';
    }
    // Tropical regions (|lat| < 23.5): simplify
    if (Math.abs(lat) < 23.5) {
      // Near equator — temperature-based rather than calendar-based
      // The weather fetch will determine hot/warm/cool
    }
    return season;
  }

  /**
   * Maps temperature + humidity to a "fragrance mood" recommendation.
   * This is the core of the weather-aware recommendation engine.
   */
  function tempToMood(temp, humidity, season) {
    // Temperature-based mood (hemisphere-independent)
    if (temp == null) return { mood: 'neutral', advice: 'هوای امروز را بررسی کن.' };
    if (temp >= 30) return {
      mood: 'hot',
      advice: 'هوای گرم؛ عطرهای سبک و معطر بهتر پخش می‌شوند.',
      families: ['Sunlit Citrus', 'Green Leaf', 'Salt & Mineral'],
      avoid: ['Amber & Resin', 'Oud Court', 'Velvet Sweet']
    };
    if (temp >= 22) return {
      mood: 'warm',
      advice: 'هوای گرم و مطبوع؛ عطرهای گلی و مرکباتی امروز نرم‌تر می‌نشینند.',
      families: ['Petal Garden', 'White Bloom', 'Sunlit Citrus', 'Green Leaf'],
      avoid: ['Smoke & Leather', 'Oud Court']
    };
    if (temp >= 15) return {
      mood: 'mild',
      advice: 'هوای معتدل؛ تقریباً هر خانواده‌ای می‌شود.',
      families: ['Petal Garden', 'Wood & Root', 'Velvet Sweet', 'Spice Route'],
      avoid: []
    };
    if (temp >= 8) return {
      mood: 'cool',
      advice: 'هوای خنک؛ عنبری و چوبی امروز ماندگارترند.',
      families: ['Amber & Resin', 'Wood & Root', 'Smoke & Leather', 'Spice Route'],
      avoid: ['Sunlit Citrus', 'Salt & Mineral']
    };
    return {
      mood: 'cold',
      advice: 'هوای سرد؛ وقت عطرهای غلیظ و گرم است.',
      families: ['Amber & Resin', 'Oud Court', 'Smoke & Leather', 'Velvet Sweet'],
      avoid: ['Sunlit Citrus', 'Green Leaf', 'Salt & Mineral']
    };
  }

  // ─── Weather fetch ───────────────────────────────────────────────────────
  /**
   * Fetches current weather from Open-Meteo (free, no API key needed).
   * Returns {temp, humidity, code, ok} or {ok: false} on failure.
   */
  async function fetchWeather(lat, lon, tz) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m` +
      `&timezone=${encodeURIComponent(tz || 'auto')}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('wx-http-' + res.status);
    const j = await res.json();
    const c = j.current;
    if (!c) throw new Error('wx-no-current');
    return {
      ok: true,
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      code: c.weather_code,
      windSpeed: c.wind_speed_10m,
      fetchedAt: Date.now()
    };
  }

  /**
   * Full weather pipeline: fetch + cache + fallback.
   * Returns cached data if fresh, fetches new data if stale.
   */
  async function getWeather(loc) {
    if (!loc) return { ok: false };
    // Check cache first
    try {
      const cached = JSON.parse(localStorage.getItem(WX_KEY) || 'null');
      if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < WX_CACHE_MINUTES * 60000) {
        return cached;
      }
    } catch {}
    // Fetch fresh
    try {
      const wx = await fetchWeather(loc.lat, loc.lon, loc.tz);
      try { localStorage.setItem(WX_KEY, JSON.stringify(wx)); } catch {}
      return wx;
    } catch (e) {
      // Fallback: return stale cache if available
      try {
        const stale = JSON.parse(localStorage.getItem(WX_KEY) || 'null');
        if (stale) return { ...stale, stale: true };
      } catch {}
      return { ok: false, error: e.message };
    }
  }

  // ─── Weather code → emoji + Persian text ──────────────────────────────────
  const WX_CODES = [
    [0, '☀️', 'آسمان صاف'], [1, '🌤️', 'کمی ابری'], [2, '⛅', 'نیمه‌ابری'], [3, '☁️', 'ابری'],
    [45, '🌫️', 'مه‌آلود'], [48, '🌫️', 'مه یخ‌زده'],
    [51, '🌦️', 'ریزش سبک'], [53, '🌦️', 'ریزش'], [55, '🌦️', 'ریزش سنگین'],
    [61, '🌧️', 'باران سبک'], [63, '🌧️', 'باران'], [65, '🌧️', 'باران سنگین'],
    [71, '❄️', 'بارش برف'], [73, '❄️', 'برف'], [75, '❄️', 'برف سنگین'],
    [80, '🌦️', 'رگبار'], [81, '🌦️', 'رگبار'], [82, '🌦️', 'رگبار شدید'],
    [95, '⛈️', 'طوفان'], [96, '⛈️', 'طوفان با تندر'], [99, '⛈️', 'طوفان شدید']
  ];
  function wxCodeToText(code) {
    for (const [c, ic, tx] of WX_CODES) if (c === code) return [ic, tx];
    return ['🌤️', '—'];
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  LPF.location = {
    DEFAULTS,
    detectByGPS, detectByIP, reverseGeocode,
    detectLocation, saveLocation, loadLocation, clearLocation,
    getSeason, tempToMood, getWeather, wxCodeToText,
    LOC_KEY, WX_KEY
  };
})();
