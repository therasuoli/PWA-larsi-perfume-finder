# Larsi Perfume Finder + Smart Scraper — Unified Alpha

یک مخزن یکپارچه شامل PWA جستجو و کشف عطر (در ریشه) و ابزار استخراج پژوهشی (در `tools/perfume-scraper/`).

## اجزا
- **PWA / GitHub Pages:** جستجو، دسته‌بندی، برندها، علاقه‌مندی، مقایسه، کمد عطر، دیتابیس قطعه‌بندی‌شده و کش آفلاین.
- **Scraper local dashboard:** پنل Python مستقل برای خزش سایت‌های عمومی، استخراج JSON-LD/Microdata، تصاویر و توضیحات، Excel/CSV/JSON، ادغام فایل‌های JSON/Excel و گزارش‌ها.
- **ترجمه توضیحات:** در داشبورد خزش، گزینه ترجمه فارسی را فعال و آدرس LibreTranslate-compatible را وارد کنید. ترجمه در فیلدهای `_fa` ذخیره می‌شود و متن اصلی دست‌نخورده می‌ماند. کلید API فقط برای همان اجرا در حافظه درخواست استفاده می‌شود.
- **GitHub Actions:** workflowهای کاتالوگ، تصویر و Scraper از نسخه‌های جدید اکشن‌ها استفاده می‌کنند تا Node 20 منسوخ‌شده نباشد.

## اجرای PWA
محتوای مخزن در GitHub Pages منتشر می‌شود؛ Node.js برای اجرای PWA در مرورگر نیاز نیست.

## اجرای داشبورد Scraper روی ویندوز
1. Python 3.10+ نصب کنید و گزینه Add Python to PATH را فعال کنید.
2. به `tools/perfume-scraper` بروید.
3. `start-dashboard.bat` را اجرا کنید یا `python -m pip install -e .` سپس `perfume-scraper-ui`.
4. پنل محلی: `http://127.0.0.1:8765`.

## اجرای Scraper در GitHub Actions
Workflow **Run Perfume Scraper** در مسیر `tools/perfume-scraper/.github/workflows/run-scraper.yml` اجرا می‌شود.
- حالت لینک دستی (`manual_urls` یا `custom`) بدون فایل اکسل منابع قابل اجراست.
- برای انتخاب فروشگاه‌ها و برندها، فایل‌های `perfume-online-stores.xlsx` و در حالت برند فایل `perfume-brands-by-country.xlsx` را داخل `tools/perfume-scraper/data/` قرار دهید. فایل‌های ورودی در ZIP فعلی موجود نیستند.
- خروجی در Actions → همان اجرا → Artifacts قرار می‌گیرد.

## ترجمه فارسی
LibreTranslate-compatible endpoint لازم است (برای مثال سرویس self-hosted). در داشبورد، گزینه ترجمه را روشن کنید و endpoint را وارد کنید؛ API key اختیاری است. هیچ کلید API داخل فایل‌های PWA، Workflow یا repository ذخیره نمی‌شود.
PWA می‌تواند ترجمه‌های واردشده در رکورد محصول (مثل `desc_fa`, `description_fa`, `long_description_fa`, `short_description_fa`) را در جزئیات عطر با دکمه نمایش متن اصلی/فارسی نشان دهد.

## تست‌ها
- Python: `cd tools/perfume-scraper && python -m pip install -e ".[dev]" && python -m pytest -q`
- Catalogue: `node scripts/validate-data.mjs`

## محدودیت ادغام
GitHub Pages فقط فایل‌های استاتیک اجرا می‌کند؛ داشبورد Python و خزش واقعی به اجرای محلی یا GitHub Actions نیاز دارند. PWA برای اجرای خزش مستقیم و امن از Pages به backend/token نیاز دارد و به همین دلیل scraper را به‌صورت ابزار جدا اما در همان مخزن حفظ کرده‌ایم.

Developer: Hadi Rasouli


## اتصال Supabase
راهنمای نصب و اتصال دیتابیس: `SUPABASE-SETUP-FA.md` — SQL آماده: `supabase/schema.sql`.
