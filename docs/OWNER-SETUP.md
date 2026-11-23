# Larsi Perfume Finder — راهنمای مالک و نگهداشت

این فایل فقط برای **مالک برنامه** است. کارهایی که در مرورگر یا کد کلاینت انجام نمی‌شوند و باید خودتان اجرا کنید.

## ۱) امنیت آپلود بانک (نسخه ۷٫۲ به بعد)

از ۷٫۲ دیگر هیچ توکن یا رمزی در کد مرورگر نیست. آپلود و حذف رکورد از طریق **Supabase Edge Function** با نام `bank-upload` انجام می‌شود.

### کارهایی که فقط مالک انجام می‌دهد

1. **تنظیم رمز مالک** — یک رشته تصادفی بلند بسازید (حداقل ۲۴ کاراکتر):
   ```bash
   openssl rand -base64 32
   ```
   سپس به‌عنوان Secret در پروژه Supabase ثبت کنید:
   ```bash
   supabase secrets set BANK_UPLOAD_PASSWORD='<رشته ساخته‌شده>'
   ```
2. **استقرار Edge Function** (پوشه `supabase/functions/bank-upload`):
   ```bash
   supabase functions deploy bank-upload --no-verify-jwt
   ```
   `--no-verify-jwt` لازم است چون این تابع با رمز خودش احراز هویت می‌کند، نه با JWT کاربر.
3. (اختیاری) محدودکردن مبدأ مجاز:
   ```bash
   supabase secrets set ALLOWED_ORIGIN='https://<username>.github.io'
   ```
4. **آزمایش** — بعد از استقرار، صفحه `owner.html` را باز کنید، فایلی کوچک بدهید و «پیش‌نمایش و شمارش» را بزنید؛ برای ارسال، همان رمز را وارد کنید.

### نحوه کار

- صفحه `owner.html` (لینک‌نشده در رابط عمومی) فایل JSON/CSV/XLSX را **سمت مرورگر** با SheetJS داخل مخزن تجزیه می‌کند، سپس رکوردهای نرمال‌شده را با رمزِ واردشده به Edge Function می‌فرستد.
- Edge Function رمز را با مقایسه زمان-ثابت با Secret چک می‌کند، سپس با **service role** در جدول `perfumes` آپ‌سِرت می‌کند (`updated_at` به‌روز می‌شود تا کلاینت‌ها با سینک دلتا فقط همان رکوردها را بگیرند).
- **حذف نرم**: با `action:'delete'` و فهرست شناسه‌ها، رکورد با `payload.deleted:true` علامت می‌خورد و از همه کلاینت‌ها پنهان می‌شود؛ حذف واقعی سطر از Supabase فقط با SQL خودتان ممکن است.
- محدودیت‌ها: ۲۰۰۰ رکورد در هر فراخوانی آپلود، ۵۰۰ شناسه در هر فراخوانی حذف، ۲۰ تلاش رمز در ۱۰ دقیقه از هر IP (به‌صورت best-effort).

### گزینه جایگزین: repository_dispatch

اگر ترجیح می‌دهید ورودی‌ها در مخزن GitHub بمانند (مسیر قدیمی `data/extra/bank-imports.json` + workflow)، می‌توانید به‌جای Edge Function از `repository_dispatch` استفاده کنید؛ فقط توجه کنید توکن GitHub باید در متغیر محیطی **سیستم خودتان** (نه مرورگر) باشد:
```bash
GH_TOKEN=github_pat_… curl -X POST https://api.github.com/repos/<owner>/<repo>/dispatches \
  -H "Accept: application/vnd.github+json" \
  -d '{"event_type":"bank-import"}'
```

## ۲) کلیدهای موجود

| کلید | کجا | مقدار نمونه |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Secrets پروژه GitHub (workflow) | از Supabase Dashboard |
| `BANK_UPLOAD_PASSWORD` | Secrets پروژه Supabase | رشته تصادفی ≥۲۴ کاراکتر |
| `ALLOWED_ORIGIN` | Secrets پروژه Supabase | آدرس GitHub Pages (اختیاری) |

> هیچ‌کدام از این مقادیر هرگز در کد کلاینت قرار نمی‌گیرند. کلید anon عمومی Supabase در `js/config.js` فقط دسترسی خواندن عمومی دارد (RLS: select فقط برای anon).

## ۳) پایپ‌لاین داده (GitHub Actions)

- workflow «Build and sync owner perfume catalogue» فقط با فایل‌های `data/extra/*.json` بانک را می‌سازد و به Supabase آپ‌سِرت می‌کند؛ **هیچ سطر موجود را حذف نمی‌کند**.
- کلون تازه بدون هیچ داده‌ای، به‌جای خطا، یک manifest خالی می‌سازد (خطای CI نمی‌دهد).
- برای حذف نرم از ابزار همان صفحه مالک یا Edge Function استفاده کنید.

## ۴) تست و اجرا

```bash
npm install       # یک‌بار
npm test          # Vitest — ۴۵ حالت (FA.norm، similarLocal، bankNormalize)
```

اجرای محلی رابط:
```bash
npx http-server -p 8123 .   # سپس http://127.0.0.1:8123/
```

## ۵) بازگرداندن لینک فروشگاه در آینده

`js/config.js`:
```js
store: { enabled: false, url: '' },
```
اگر روزی خواستید دکمه خرید برگردد، `enabled:true` و آدرس را بگذارید؛ هیچ کدی در حالت false لینک نمی‌سازد. افزودن مجدد دکمه نیازمند تغییر آگاهانه در کد رابط کاربری است (در ۷٫۳ حذف شد).
