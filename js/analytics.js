/* Larsi Perfume Finder — privacy-first local analytics (v7.4).
   No cookies, no network beacons, no identifiers: anonymous usage counters stored in
   localStorage on this device only. The owner can read aggregates in owner.html.
   Events: search (query + result count) and detail opens. There is NO purchase event
   by design (store link is disabled). */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  const KEY = 'lpf:analytics:v1';
  const MAX_RECENT = 300;

  const empty = () => ({
    since: new Date().toISOString(),
    totals: { searches: 0, detailOpens: 0, emptySearches: 0, agentMessages: 0, giftGuides: 0, sharedWardrobes: 0 },
    topQueries: {},   // query → count
    topPerfumes: {},  // id → opens
    days: {},        // yymmdd → {s, d}
    recent: []       // capped raw events for the owner
  });

  function read() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); return v && v.totals ? v : empty(); } catch { return empty(); }
  }
  function write(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage full/blocked: analytics is best-effort */ } }

  const dayStamp = () => {
    const d = new Date();
    return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  };

  function track(kind, payload) {
    try {
      const d = read();
      const day = dayStamp();
      if (kind === 'search') {
        d.totals.searches++;
        if (payload && payload.results === 0) d.totals.emptySearches++;
        const q = String((payload && payload.query) || '').trim();
        if (q) d.topQueries[q] = (d.topQueries[q] || 0) + 1;
        d.days[day] = d.days[day] || { s: 0, d: 0 }; d.days[day].s++;
        d.recent.push({ t: Date.now(), k: 'search', q: q.slice(0, 60), n: payload ? payload.results : null });
      } else if (kind === 'detail') {
        d.totals.detailOpens++;
        if (payload && payload.id) d.topPerfumes[payload.id] = (d.topPerfumes[payload.id] || 0) + 1;
        d.days[day] = d.days[day] || { s: 0, d: 0 }; d.days[day].d++;
        d.recent.push({ t: Date.now(), k: 'detail', id: String(payload ? payload.id : '').slice(0, 80) });
      } else if (kind === 'agent') {
        d.totals.agentMessages++;
        d.recent.push({ t: Date.now(), k: 'agent' });
      } else if (kind === 'gift') {
        d.totals.giftGuides++;
        d.recent.push({ t: Date.now(), k: 'gift' });
      } else if (kind === 'share') {
        d.totals.sharedWardrobes++;
        d.recent.push({ t: Date.now(), k: 'share' });
      } else return;
      d.recent = d.recent.slice(-MAX_RECENT);
      write(d);
    } catch { /* never let analytics break the app */ }
  }

  LPF.analytics = {
    track,
    read,
    summary() {
      const d = read();
      const topQueries = Object.entries(d.topQueries).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const topPerfumes = Object.entries(d.topPerfumes).sort((a, b) => b[1] - a[1]).slice(0, 15);
      const days = Object.entries(d.days).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14);
      return { totals: d.totals, topQueries, topPerfumes, days, since: d.since, events: d.recent.length };
    },
    reset() { try { localStorage.removeItem(KEY); } catch { } }
  };
})();
