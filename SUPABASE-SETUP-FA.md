# اتصال Larsi Perfume Finder به Supabase

## 1) ساخت دیتابیس
در Supabase پروژه بسازید و از SQL Editor فایل `supabase/schema.sql` را اجرا کنید.

## 2) تنظیم GitHub Secrets
Repository → Settings → Secrets and variables → Actions → New repository secret:
- `SUPABASE_URL`: آدرس پروژه Supabase (Project URL)
- `SUPABASE_SERVICE_ROLE_KEY`: کلید Service Role فقط برای Actions؛ هرگز در فایل‌های برنامه یا مرورگر قرار ندهید.

## 3) تنظیم اتصال برنامه (اختیاری برای استفاده مستقیم از DB)
در `js/config.js` مقدار `LPF.config.supabase.url` و `anonKey` را وارد کنید. اینجا فقط کلید anon/public مجاز است؛ service role را وارد نکنید.
اگر این دو مقدار خالی باشند یا DB در دسترس نباشد، اپ خودکار از بانک JSON فعلی استفاده می‌کند.

## 4) Sync خودکار
Workflow `update-catalog.yml` پس از بازسازی و اعتبارسنجی بانک، اسکریپت `scripts/sync-supabase.mjs` را اجرا می‌کند و رکوردها را در بسته‌های 250تایی upsert می‌کند. همچنین می‌توانید Workflow را دستی اجرا کنید.

## نکته امنیتی
دسترسی عمومی فقط SELECT است. درج/ویرایش/حذف با service role در GitHub Actions انجام می‌شود. Service role bypasses RLS؛ آن را در secrets نگه دارید و در مرورگر، ZIP عمومی، commit یا log چاپ نکنید.
