## 5.3.0-alpha.1 — 2026-11-20

**Fixed**
- Catalogue: chunks 04–07 (1,881 scraped records) were on disk but not listed in `manifest.json`, so the app never loaded them, and the weekly refresh kept resetting the manifest to 3 chunks. `build-data.mjs` now merges `data/extra/*.json`, deletes stale chunk files, and `validate-data.mjs` fails on orphan chunks.
- Bank Dev upload wrote `data/perfumes.json`, which the app does not read and the weekly job overwrites. It now writes `data/extra/bank-imports.json` (a build input) and the catalogue workflow also runs on pushes to `data/extra/**`.
- Boot script read the obsolete `lpf:v4:` storage namespace → wrong theme/font flash on every load.
- Late-arriving image index re-rendered the whole grid (scroll jump, lost state); photos are now attached in place.
- Store-stub records no longer query the Scento API (it tripped the circuit breaker and showed "offline").
- "Uncategorised" tile selected a value missing from the family dropdown; `href` values are now restricted to http(s); source-link label reflects the real host; Persian descriptions are no longer forced LTR.
- Image crawler only visits hosts it may extract images from (it was crawling a third-party shop).

**Performance**
- Similarity search: pre-computed lower-case note sets + memoised IDF, deferred to idle time.
- Removed per-card `backdrop-filter`, animated `drop-shadow`; hero animation pauses off-screen; `content-visibility:auto` on cards; chunk fetch retry; manifest preload.
- Catalogue payload for the same records dropped from ~4.7 MB to ~1.4 MB; removed unused 5 MB `perfume-database-with-images.json` and `similar.json` from the SW precache.

**UI**
- Sticky search toolbar, horizontally scrolling category tiles on phones, shimmer skeletons, sticky action bar in the phone detail sheet, higher-contrast light theme, larger minimum text size, 40px touch targets.

## 5.2.0-alpha.1 — 2026-11-19

- Removed the duplicate catalogue prefetch; the app loads the catalogue through the manifest/chunk loader only.
- Added parallel loading of 500-record JSON chunks and a compatibility fallback to the merged JSON.
- Added home-page category tiles with real category counts and click-to-filter.
- Added the number of scent families to the home statistics.
- Corrected catalogue metadata totals and normalized records missing brand values.
- Added a GitHub Actions workflow to refresh, split, validate, and commit the Scento catalogue on schedule or manual dispatch.
- Updated Service Worker cache manifest to actual app assets and versioned cache names; chunk files are cached from the catalogue manifest.
- Removed the unused oversized embedded-image database file.

# تغییرات نسخه‌ها

## 5.1.0-beta.1 — آبان ۱۴۰۵
- افزودن بخش «توسعه بانک» در منوی همبرگری؛ ورود پس از سه بار کلیک و تأیید رمز.
- پشتیبانی از ورود گروهی JSON، CSV و Excel (XLSX/XLS).
- اعتبارسنجی، نرمال‌سازی و ادغام رکوردها بر اساس شناسه عطر؛ بدون حذف رکوردهای قبلی.
- اتصال اختیاری به GitHub Contents API برای ثبت `data/perfumes.json` و فراداده بانک.
- توکن GitHub در localStorage ذخیره نمی‌شود و پس از تلاش موفق از فیلد پاک می‌شود.
- این قفل سمت مرورگر صرفاً بازدارنده است؛ برای کنترل دسترسی واقعی باید احراز هویت سمت سرور پیاده‌سازی شود.


## 5.0.0 — آبان ۱۴۰۵
- هماهنگ‌سازی نسخه برنامه، Manifest و Service Worker.
- تکمیل پشتیبان شامل عطرهای نامطلوب و تنظیمات ظاهری.
- ادغام امن نسخه پشتیبان با داده‌های موجود به‌جای جایگزینی کامل.
- افزودن بررسی دستی به‌روزرسانی PWA.
- آمار بانک: ۱٬۴۷۹ عطر، ۱۶۰ برند، ۰ شناسه تکراری؛ ۳٬۵۲۱ رکورد تا هدف ۵٬۰۰۰ باقی است.

# نسخه ۴٫۱٫۰ — آبان ۱۴۰۵

- شعار و پیام اصلی برند بازنویسی شد: «رایحه‌ای که امضای توست کشف کن».
- بخش Hero با جلوه‌های حرکتی ظریف، حلقه‌های پویا و عناصر شناور ارتقا یافت.
- انیمیشن‌ها با تنظیم کاهش حرکت سیستم سازگار شدند.
- شماره نسخه در تنظیمات و Service Worker به ۴٫۱٫۰ ارتقا یافت.

# Changelog

## 4.0.0 — آبان ۱۴۰۵ (نسخه نهایی)
**جدید**
- نام برنامه: Larsi Perfume Finder؛ هویت بصری و آیکون‌های جدید (شامل maskable)
- فوتر صفحه اول: «طراحی و برنامه نویسی هادی رسولی / تمامی حقوق مادی و معنوی متعلق به فروشگاه لارسی می‌باشد / lar30.com»
- منوی همبرگری (Drawer) با تم، اندازه نوشته، نصب برنامه و نسخه
- صفحه تخصصی «درباره ما»: قابلیت‌ها، جدول مخزن داده و APIها با تست زنده، تاریخچه نسخه‌ها
- بانک محلی ۱٬۴۷۹ عطر + نام فارسی خانواده‌ها و ۴۲۰ نت؛ جستجوی فارسی/انگلیسی با نرمال‌سازی
- فیلترهای واقعی: خانواده، غلظت، فصل، زمان، برند، نت، ویژگی؛ لینک عمیق `?p=slug`
- عطرهای مشابه با وزن‌دهی IDF + پیشنهاد Scento
- خزشگر تصاویر موازی و مؤدب؛ Service Worker با کش دائمی تصاویر

**رفع اشکال**
- Service Worker هرگز نصب نمی‌شد (مسیر `icons/` در حالی که پوشه `icon/` بود)
- فیلترهای جنسیت/کشور/روز-شب با داده واقعی کار نمی‌کردند (دیتاست این ستون‌ها را ندارد)
- اسلایدر اندازه نوشته اثری نداشت؛ دو بارگذاری تکراری کمد در `loadData`
- رشته خالی در `data/perfume-images.json` و هماهنگی کلیدها؛ فایل‌های `catalog-v14.js`/`ui-v14.js` استفاده‌نشده و دو workflow تکراری حذف شدند
- بارگذاری ۷۸۰KB CSV خام از شبکه خارجی در هر ورود؛ فونت Google → self-host
- مهاجرت خودکار امتیازها، کمد و علاقه‌مندی‌های v2/v3

## 3.0.0
کمد عطر، مقایسه، فیلتر پیشرفته، پشتیبان JSON.
## 2.0.0
Scento API، سه تم، PWA.
