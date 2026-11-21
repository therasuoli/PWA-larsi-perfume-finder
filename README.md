# Larsi Perfume Finder

وب‌اپلیکیشن فارسی (PWA) برای کشف، جستجو، مقایسه و کمد شخصی عطر — بدون فریمورک، بدون مرحله build اجباری و سازگار با GitHub Pages.

- **معماری:** وانیل JS با فضای نام `LPF` (ماژول‌های `config / lang-fa / algo / store / repo / app`)، داده کاتالوگ از Supabase با کش IndexedDB و همگام‌سازی دلتا (`updated_at`)، تجزیه در Web Worker.
- **امنیت:** هیچ توکن/رمز/کلید سرویس در کد کلاینت نیست؛ مدیریت بانک فقط از طریق Edge Function با Secret مالک (راهنمای `docs/OWNER-SETUP.md`). CSP با متاتگ محدود شده است.
- **داده شخصی:** علاقه‌مندی، کمد، امتیاز و تنظیمات فقط در همین مرورگر (`localStorage`) نگه داشته می‌شود و با مهاجرت کلیدهای نسخه‌های قبلی حفظ می‌شود.

## اجرا

```bash
npx http-server -p 8123 .   # http://127.0.0.1:8123/
```

## تست

```bash
npm install    # یک‌بار
npm test       # Vitest: FA.norm / similarLocal / bankNormalize
```

CI روی هر push اجرا می‌شود (`.github/workflows/ci.yml`).

## نقشه فایل‌ها

| مسیر | نقش |
|---|---|
| `js/boot.js` | اعمال تم و اندازه متن پیش از اولین رندر |
| `js/config.js` | نسخه، لینک‌ها، Supabase، فلگ فروشگاه |
| `js/lang-fa.js` | واژه‌نامه فارسی + نرمال‌سازی جستجو |
| `js/algo.js` | منطق خالص: prepare، شباهت، جایگزین اقتصادی، نرمال‌سازی ورودی بانک |
| `js/store.js` | داده شخصی و مهاجرت کلیدها |
| `js/repo.js` | دریافت دلتا از Supabase + کش IndexedDB + Worker |
| `js/worker-catalog.js` | تجزیه/آماده‌سازی کاتالوگ در Web Worker |
| `js/app.js` | رابط کاربری و وضعیت |
| `js/owner.js` + `owner.html` | کنسول مالک (لینک‌نشده) |
| `supabase/functions/bank-upload` | Edge Function آپلود/حذف نرم بانک |
| `tests/` | تست‌های Vitest و fixture |
| `scripts/` | پایپ‌لاین ساخت و همگام‌سازی داده (GitHub Actions) |
| `lib/xlsx/` | SheetJS ثابت (فقط صفحه مالک، lazy) |

## نسخه

نسخه در چهار جا هماهنگ نگه داشته می‌شود: `js/config.js`، `manifest.webmanifest`، `sw.js` و متن «درباره». تاریخچه تغییرات فقط در `CHANGELOG.md` است.
