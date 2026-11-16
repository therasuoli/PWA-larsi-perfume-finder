# Changelog

تمام تغییرات مهم این پروژه در این فایل مستند می‌شود.

قالب بر اساس [Keep a Changelog](https://keepachangelog.com/fa/1.1.0/) و
[Semantic Versioning](https://semver.org/lang/fa/).

---

## [Unreleased]

### Planned
- مجازی‌سازی لیست عطرها برای بانک‌های بزرگ‌تر.
- صفحهٔ اختصاصی برای هر برند.
- فیلتر بر اساس خانوادهٔ بویایی.
- خروجی/ورودی JSON برای کمد شخصی.
- تست‌های خودکار با Vitest برای `ui-v14.js` و `catalog-v14.js`.

---

## [2.1.0] — 2026-11-16

نسخهٔ «Stability & UX» — تمرکز روی رفع باگ‌های بحرانی، ماژولار کردن کد و بهبود
دسترسی‌پذیری.

### Added
- **ماژول نمایش `ui-v14.js`** (`window.PFUI`): لایهٔ رندر خالص و بدون
  side-effect، شامل `card`, `similarCard`, `detailHTML`, `starsHTML`,
  `imgFor`/`imgHTML`, `renderGrid`, `renderSimilarTrack`, `renderBrandTrack`.
- **ماژول کاتالوگ `catalog-v14.js`** (`window.PFCatalog`): مدیریت فیلتر،
  مرتب‌سازی، صفحه‌بندی، جستجو و **hash-sync** (`#q=...&g=...&t=...&s=...`).
- **دکمهٔ پاک کردن جستجو** داخل نوار جستجو (`#searchClear`).
- **دکمهٔ بازگشت به بالا** (`#backTop`) با نمایش شرطی هنگام اسکرول.
- **اسکلتون لودینگ** (۸ کارت) در گرید اولیه به‌جای اسپینر خالی.
- **گالری تصاویر** در مودال جزئیات (اگر در `perfume-images.json` موجود باشد).
- **میانبر `⌘K / Ctrl+K`** برای فوکوس روی جستجو.
- **بستن مودال با `Escape`**.
- **`aria-pressed`** برای چیپ‌ها، دکمه‌های زمان، ستاره‌ها و دکمهٔ علاقه‌مندی.
- **`aria-live`** روی شمارنده‌ها، گرید کاتالوگ، اسلایدر مشابه‌ها و برندها.
- **`aria-labelledby`** برای مودال انبوردینگ.
- **`role="search"` / `role="group"`** برای نوار جستجو و گروه‌های فیلتر.
- **پشتیبانی کیبورد** (`Enter` / `Space`) برای کارت‌های عطر و مشابه‌ها.
- **`type="button"`** روی همهٔ دکمه‌های غیر submit.
- **تایم‌اوت ۸ ثانیه‌ای** برای API Scento با `AbortController`.
- **`skipWaiting` + `clients.claim`** در Service Worker برای آپدیت سریع.
- **پیام‌رسانی SW به کلاینت** (`SW_ACTIVATED`) و `CLEAR_IMAGE_CACHE`.
- **کش جداگانه برای تصاویر** با سقف ۳۰۰ (LRU) و `runtime` با سقف ۸۰.
- **`manifest.webmanifest`** کامل با `id`, `scope`, `shortcuts`, `screenshots`,
  آیکون‌های `maskable` و `display_override`.
- **`styles.css` بازنویسی‌شده** با توکن‌های `--radius`, `--radius-sm`,
  `--radius-pill`، حالت `:focus-visible` برای همهٔ عناصر تعاملی،
  `skeleton-card`، `image-gallery`، `back-top`، و `@media print`.
- **`sync_scento_images.py` بازنویسی‌شده**: retry با backoff، پشتیبانی از
  `Allow` در `robots.txt`، نوشتن اتمیک، اعتبارسنجی، ذخیرهٔ دوره‌ای هر ۵ صفحه،
  `--refresh-all`، مدیریت `Ctrl+C` با save، پارس بازگشتی JSON-LD.
- **`sync-scento-images.yml` بهبودیافته**: نصب وابستگی‌های پایتون، ورودی‌های
  `max_pages` و `delay`، اعتبارسنجی JSON، `pull --rebase` قبل از push،
  گزارش diff در `$GITHUB_STEP_SUMMARY`، `concurrency` برای جلوگیری از اجرای
  هم‌زمان.

### Fixed
- **اسلایدر اندازه نوشته** حالا واقعاً کار می‌کند: `--font-scale` روی `body`
  اعمال می‌شود و متن‌های کلیدی به `em` تبدیل شده‌اند (قبلاً کلاس `large-type`
  هیچ‌جا اضافه نمی‌شد).
- **کرش مودال جزئیات** بعد از دریافت داده از API: `applyPortrait` حالا
  `top`/`heart`/`base`/`season` را با `asNotes` نرمال می‌کند و ورودی‌های
  رشته‌ای/آبجکتی دیگر صفحه را نمی‌شکنند.
- **`localStorage` امن**: wrapper `store` با `try/catch` در همه‌جا؛ در حالت
  Private یا پر شدن سهمیه، صفحه دیگر خالی نمی‌ماند.
- **نمایش امتیاز شفاف**: «امتیاز تو: X از ۵» به‌جای «X رأی» گمراه‌کننده.
- **به‌روزرسانی ستاره‌ها** بدون فراخوانی مجدد `openDetail` و بدون هدر رفتن
  درخواست API (`refreshDetailRating` + `PFCatalog.refreshCard`).
- **`sortFilter`** حالا صفحه را ریست می‌کند.
- **خط «خانواده / فصل»** در مودال پس از دریافت داده API به‌روز می‌شود.
- **`state.selected`** هنگام بستن مودال پاک می‌شود.
- **منوی موبایل** با کلیک روی لینک بسته می‌شود.
- **BOM ابتدای CSV** پاک می‌شود (`\uFEFF`).
- **`id` پایدار** با هش (`brand|name`) وقتی ستون `id` یا `slug` نیست؛
  علاقه‌مندی‌ها و امتیازها با تغییر ترتیب داده جابه‌جا نمی‌شوند.
- **شمارندهٔ بانک و برند** دیگر با جستجوی آنلاین باد نمی‌کند
  (`bankCount` / `brandCount` از `state.items` اصلی جدا شدند).
- **inline `onerror`** حذف شد و با هندلر سراسری `error` در حالت capture
  جایگزین شد (سازگار با CSP).
- **`caches.addAll(CORE)`** با `cache.add` جدا برای هر فایل جایگزین شد تا
  نبود یک فایل، نصب کل SW را رد نکند.
- **HTML از cache-first** به **network-first** تغییر کرد تا کاربر نسخهٔ
  قدیمی را نبیند.
- **دکمه‌های قبلی/بعدی اسلایدر** در RTL اصلاح شد.
- **`about-band`** در موبایل به ستون تبدیل می‌شود و محتوا کنار نمی‌زند.

### Changed
- **`index.html`** بازنویسی شد: ترتیب اسکریپت‌ها (`ui-v14.js` →
  `catalog-v14.js` → `app.js`)، `?v=2.1` برای cache bust، متاتگ‌های iOS
  (`apple-touch-icon`, `apple-mobile-web-app-capable`, ...)، و بهبود
  ساختار ARIA.
- **`app.js`** به یک لایهٔ نازک تبدیل شد که فقط داده، API، مودال و تم را
  مدیریت می‌کند — همهٔ توابع رندر به `PFUI` و منطق فیلتر به `PFCatalog`
  منتقل شدند.
- **`styles.css`** با محافظت `overflow-x:hidden`، `:focus-visible` سراسری،
  و `-webkit-text-size-adjust` برای iOS.
- **نسخهٔ کش‌های SW** از `pf-v2-shell` به `pf-v2.1-{shell,runtime,img}`
  ارتقا یافت.
- **`theme-color`** به‌صورت داینامیک با تغییر تم به‌روز می‌شود.
- **`README.md`** با ساختار جدید فایل‌ها و نکات استقرار هم‌گام شد.

### Removed
- کلاس بی‌اثر `body.large-type`.
- هندلر inline `onerror` در `imgHTML`.
- وابستگی `render()` به فیلتر/مرتب‌سازی مستقیم در `app.js` (به `catalog-v14.js`
  منتقل شد).

### Security
- اعتبارسنجی URL تصویر در `imgFor` (فقط `https:` و دامنه‌های مجاز).
- حذف `javascript:` و `data:` از `src` تصاویر.
- `history.replaceState` با `try/catch`.

### Accessibility
- `aria-pressed`, `aria-live`, `aria-busy`, `aria-modal`, `aria-label` روی
  عناصر تعاملی و شمارنده‌ها.
- پشتیبانی کامل کیبورد برای ناوبری کارت‌ها.
- فوکوس روی دکمهٔ بستن هنگام باز شدن مودال.
- کنتراست بهتر `--muted` روی `--surface` در تم `sand`.

---

## [2.0.0] — Final Edition

### Added
- بازطراحی کامل UI و تجربه موبایل.
- افزودن تم‌های Dark / Light / Sand و اندازه فونت قابل تنظیم.
- انبوردینگ پویا و پذیرش شرایط.
- اتصال REST واقعی به Scento برای Search، Perfume Portrait و Scent Neighbours.
- اسلایدر مشابه‌ها با داده‌های Scento و fallback محلی مبتنی بر نت‌های مشترک.
- امتیازدهی ۵ ستاره محلی و علاقه‌مندی‌های محلی.
- بارگذاری دیتاست CSV از مخزن رسمی Scento و کش آخرین بانک دریافت‌شده.
- manifest تصاویر، استخراج‌گر Scento و GitHub Action زمان‌بندی‌شده.
- PWA و Service Worker.
