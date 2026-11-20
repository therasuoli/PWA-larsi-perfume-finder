# Larsi Perfume Finder · لارسی پرفیوم فایندر

وب‌اپلیکیشن فارسی (PWA) برای کشف، مقایسه و مدیریت عطر — **نسخه ۵٫۳٫۰ آلفا (آبان ۱۴۰۵)**

- طراحی و برنامه نویسی: **هادی رسولی**
- تمامی حقوق مادی و معنوی متعلق به **فروشگاه لارسی** می‌باشد — [lar30.com](https://lar30.com)

بدون Build و بدون وابستگی اجرایی: فقط HTML + CSS + JS خالص. روی GitHub Pages یا هر هاست استاتیک اجرا می‌شود (HTTPS برای PWA).

## تغییرات نسخه ۵٫۱٫۰ بتا

- بخش مخفی «توسعه بانک» با ورود پس از سه بار کلیک و رمز عبور.
- واردکردن فایل‌های JSON، CSV و Excel و ادغام داده‌ها بر اساس شناسه عطر.
- ثبت مستقیم بانک ادغام‌شده در GitHub با GitHub Contents API؛ رکوردهای قبلی حفظ می‌شوند.
- توکن فقط در حافظه فرم استفاده می‌شود و در مرورگر ذخیره نمی‌شود.

## تغییرات نسخه ۵٫۰٫۰

- ارتقای نسخه و هماهنگ‌سازی PWA و Service Worker.
- پشتیبان‌گیری کامل‌تر از داده‌های شخصی و تنظیمات؛ ورود اطلاعات به‌صورت ادغام و بدون حذف داده‌های قبلی.
- افزودن بررسی دستی به‌روزرسانی.
- بانک فعلی: ۱٬۴۷۹ عطر از ۱۶۰ برند؛ هدف ۵٬۰۰۰ رکورد هنوز محقق نشده است.

## تغییرات نسخه ۴٫۱٫۰

- هویت کلامی و شعار صفحه آغازین بازطراحی شد.
- انیمیشن‌های ظریف و واکنش‌گرا به Hero اضافه شد؛ تنظیم کاهش حرکت سیستم رعایت می‌شود.
- شماره نسخه برنامه و کش Service Worker هماهنگ شد.

## منابع اضافه (`data/extra/`) — جدید در ۵٫۳٫۰

هر فایل `data/extra/*.json` (آرایه‌ای از عطرها) هنگام اجرای `node scripts/build-data.mjs` بعد از دیتاست Scento ادغام می‌شود و با به‌روزرسانی هفتگی از بین نمی‌رود. رکورد Scento روی تداخل شناسه/slug برنده است.

- `store-stubs.json`: ۱٬۸۱۹ رکورد فروشگاهی بدون نت/خانواده (علامت `stub:true`). فایل خام اصلی در `data/archive/` نگه‌داری شده و بارگذاری نمی‌شود.
- `bank-imports.json`: خروجی بخش «توسعه بانک».
- بازسازی آفلاین: `node scripts/build-data.mjs data/perfumes.json` (فقط ادغام extra).

## ساختار

```
index.html            صفحه اصلی (فوتر اعتبار فقط اینجاست)
css/app.css           طراحی (توکن‌ها، موبایل/تبلت/دسکتاپ)
js/config.js          نسخه، لینک فروشگاه، Endpointهای API، تاریخچه تغییرات
js/lang-fa.js         واژگان فارسی (خانواده‌ها، نت‌ها، فصل‌ها) و نرمال‌سازی جستجو
js/store.js           داده شخصی (علاقه‌مندی، امتیاز، کمد) + مهاجرت از نسخه‌های ۲ و ۳
js/repo.js            مخزن داده: بانک محلی + Scento API + ایندکس تصاویر
js/app.js             رابط کاربری و منطق
sw.js                 Service Worker (آفلاین، کش تصاویر)
data/perfumes-01.json … perfumes-07.json    بانک محلی ۳٬۳۸۱ رکورد در بخش‌های ۵۰۰تایی
data/perfume-images.json  ایندکس تصاویر (با خزشگر پر می‌شود)
data/meta.json        تاریخ ساخت و آمار بانک
scripts/build-data.mjs    ساخت بانک JSON و بخش‌ها از CSV مخزن Scento
scripts/sync_images.py    خزشگر تصاویر محصولات
.github/workflows/update-catalog.yml   بروزرسانی هفتگی بانک؛ sync-data.yml خزش تصاویر
```

## توسعه بانک (نسخه بتا)

1. در منوی همبرگری، روی «توسعه بانک» سه بار پشت سر هم کلیک کن و رمز مدیر را وارد کن.
2. فایل `.json`، `.csv`، `.xlsx` یا `.xls` را انتخاب و پیش‌نمایش تعداد رکوردها را بررسی کن.
3. مالک مخزن، نام مخزن، شاخه و یک Fine-grained Personal Access Token را وارد کن.
4. توکن باید فقط برای همان مخزن دسترسی `Contents: Read and write` داشته باشد؛ سپس «اعتبارسنجی و آپلود به GitHub» را بزن.
5. ابزار `data/extra/bank-imports.json` را از مخزن می‌خواند، داده‌ها را با شناسه ادغام می‌کند و نسخه جدید را در شاخه انتخابی commit می‌کند.

**ساختار فایل:** JSON باید آرایه‌ای از عطرها یا شیء دارای `perfumes`/`items`/`data` باشد. فایل جدولی باید ردیف عنوان داشته باشد؛ ستون‌های رایج مانند `id`, `name`, `house`/`brand`, `year`, `concentration`, `top_notes`, `heart_notes`, `base_notes` پشتیبانی می‌شوند. رکورد بدون نام عطر نادیده گرفته می‌شود.

**امنیت:** رمز این بخش در برنامه سمت کاربر بررسی می‌شود و کنترل دسترسی امن محسوب نمی‌شود؛ هر فردی که کد را بررسی کند می‌تواند این محدودیت را دور بزند. برای مخزن عمومی، توکن کوتاه‌عمر و محدود به همان مخزن بساز و بعد از استفاده آن را revoke کن. توکن را در چت یا فایل پروژه قرار نده. آپلود مستقیم فقط پس از واردکردن توکن معتبر توسط مدیر انجام می‌شود.

## نصب روی GitHub Pages

1. محتویات این پوشه را در ریشه مخزن بگذار (جایگزین فایل‌های قبلی؛ فایل‌های قدیمی `app.js`, `ui-v14.js`, `catalog-v14.js`, `styles.css`, `icon/` و workflowهای قدیمی حذف شوند).
2. Settings → Pages → Branch: `main` / root.
3. در Settings → Actions → General، دسترسی «Read and write permissions» را فعال کن تا Action بتواند داده را به‌روز کند.

## مخزن داده و APIها

| منبع | مسیر | توضیح |
|---|---|---|
| بانک محلی | `data/manifest.json` + `data/perfumes-*.json` | هم‌مبدأ، chunked؛ merged JSON فقط fallback |
| Scento Dataset | `Scento-com/perfume-dataset` (CSV) | منبع بالادستی؛ `node scripts/build-data.mjs` بانک محلی را می‌سازد |
| Scento API | `https://www.scento.com/api/perfume/v1` | `GET /search?q=` · `GET /perfumes/{slug}` · `GET /perfumes/{slug}/neighbours` |

API فقط **خواندنی و اختیاری** است؛ اگر در دسترس نباشد برنامه کامل کار می‌کند. درخواست‌ها timeout دارند و بعد از ۳ خطای پیاپی ۲ دقیقه متوقف می‌شوند. وضعیت APIها در «درباره ما ← بررسی اتصال APIها» دیده می‌شود.

## تصاویر محصولات (خزش سریع + نمایش سریع)

**خزش** — `python scripts/sync_images.py`
- ۳ worker موازی با یک محدودکننده سراسری (پیش‌فرض ۰٫۴ ثانیه بین شروع درخواست‌ها ≈ ۲٫۵ صفحه/ثانیه — حدود ۱۰ تا ۱۲ دقیقه برای کل بانک، نسبت به نسخه قبل که حداقل ۰٫۷۵ ثانیه و ترتیبی بود).
- `robots.txt` رعایت می‌شود؛ در 403/429 به‌صورت امن متوقف می‌شود و پیشرفت ذخیره می‌ماند.
- قابل ادامه (resume) و نوشتن اتمیک؛ `--workers`, `--interval`, `--max-pages`, `--force`.
- اگر Scento سرعت را محدود کرد، `--interval 1` را امتحان کن.

**نمایش** — lazy-load با فضای رزروشده (بدون پرش صفحه)، ۴ کارت اول با `fetchpriority=high`، محو شدن نرم، کش دائمی تصاویر در Service Worker (تا ۷۰۰ تصویر، بین نسخه‌ها حفظ می‌شود)، `preconnect` به CDN، و تصویر گرافیکی مخصوص هر خانواده بویایی تا وقتی عکس نیامده یا خراب است.
تصاویر دریافتی از API نیز هنگام باز کردن جزئیات به‌صورت خودکار یاد گرفته و ذخیره می‌شوند.

## توسعه محلی

```
python3 -m http.server 8000      # سپس http://localhost:8000
node scripts/build-data.mjs      # ساخت دوباره بانک داده
```

## حریم خصوصی و مجوز

امتیازها، علاقه‌مندی‌ها و کمد عطر فقط در مرورگر کاربر ذخیره می‌شوند. داده عطرها از Scento Perfume Dataset است و تصاویر متعلق به صاحبان حقوق مربوطه‌اند؛ مجوز دیتاست و شرایط API را جداگانه بخوانید و به API فشار نیاورید. فونت وزیرمتن با مجوز OFL (`fonts/OFL.txt`).

## Alpha 5.2.0 — compact catalogue and scheduled refresh

- The frontend loads catalogue data using `data/manifest.json` and parallel 500-record JSON chunks; the merged JSON is retained only as a compatibility fallback.
- The home screen shows catalogue size, unique brands, scent-family count, and category tiles. Category tiles filter the catalogue.
- GitHub Actions → **Refresh perfume catalogue (Alpha)** can be run manually, and is scheduled weekly. It fetches the Scento source CSV, rebuilds chunks and metadata, validates record counts and unique IDs, and commits only when data changes.
- The existing image-sync workflow remains separate under **Sync product images**.
- This workflow refreshes the Scento CSV source only; it does not crawl arbitrary retail websites.

Run local validation with: `node scripts/validate-data.mjs`.
