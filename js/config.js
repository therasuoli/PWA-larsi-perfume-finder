/* Larsi Perfume Finder — configuration (single source of truth for version, links and endpoints) */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  LPF.config = {
    name: 'Larsi Perfume Finder',
    nameFa: 'لارسی پرفیوم فایندر',
    version: '5.3.0-alpha.1',
    versionFa: '۵٫۳٫۰ آلفا',
    releaseFa: 'آبان ۱۴۰۵ · بتا',
    releaseISO: '2026-11-20',
    author: 'هادی رسولی',
    store: { name: 'فروشگاه لارسی', url: 'https://lar30.com', host: 'lar30.com' },
    // Data repository: same-origin snapshot first (fast, offline-ready), live APIs second.
    data: {
      catalog: 'data/perfumes.json',
      manifest: 'data/manifest.json',
      meta: 'data/meta.json',
      images: 'data/perfume-images.json',
      upstreamCsv: 'https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv'
    },
    supabase: {
      url: 'https://eixzihvihoammvremxrl.supabase.co', // Supabase project URL
      anonKey: '', // Supabase anon/public key only (never service role)
      table: 'perfumes',
      pageSize: 1000,
      timeoutMs: 12000
    },
    api: {
      base: 'https://www.scento.com/api/perfume/v1',
      timeoutMs: 6500,
      endpoints: [
        { id: 'search', path: '/search?q={q}&kind=perfume', title: 'جستجوی آنلاین عطر', sample: '/search?q=oud&kind=perfume' },
        { id: 'portrait', path: '/perfumes/{slug}', title: 'پرتره عطر و هرم نت', sample: '/perfumes/aventus-creed' },
        { id: 'neighbours', path: '/perfumes/{slug}/neighbours', title: 'عطرهای مشابه (همسایه‌ها)', sample: '/perfumes/aventus-creed/neighbours' }
      ]
    },
    imageHosts: ['imagedelivery.net', 'www.scento.com', 'scento.com'],
    storagePrefix: 'lpf:v5:',
    changelog: [
      { v: '5.3.0-alpha.1', date: 'آبان ۱۴۰۵', items: [
        'رفع خطای مهم بانک: ۱٬۸۱۹ رکورد فروشگاهی که در manifest ثبت نشده بودند اکنون از data/extra در بانک ادغام می‌شوند',
        'ساخت بانک دیگر چانک یتیم نمی‌سازد و اعتبارسنجی، چانک‌های ثبت‌نشده را رد می‌کند',
        'ورودی‌های «توسعه بانک» در data/extra/bank-imports.json ذخیره می‌شوند تا با به‌روزرسانی هفتگی از بین نروند',
        'رفع پرش تم/اندازه نوشته هنگام بارگذاری؛ رفع نمایش تصاویر بدون بازسازی کل فهرست',
        'سرعت: محاسبه عطرهای مشابه چندبرابر سریع‌تر، حذف blur از کارت‌ها، توقف انیمیشن‌های Hero خارج از دید، رندر تنبل کارت‌ها',
        'رابط: نوار جستجوی چسبان، دسته‌ها به‌صورت اسکرولر در موبایل، کنتراست بهتر تم روز، متن‌های خواناتر و اهداف لمسی بزرگ‌تر'
      ] },
      { v: '5.1.0-beta.1', date: 'آبان ۱۴۰۵', items: [
        'افزودن بخش مخفی توسعه بانک با ورود پس از سه بار کلیک و رمز عبور',
        'ورود فایل‌های JSON، CSV و Excel و اعتبارسنجی رکوردها پیش از ثبت',
        'ادغام هوشمند بر اساس شناسه عطر؛ افزودن رکوردهای جدید و به‌روزرسانی موارد تکراری',
        'اتصال مستقیم و اختیاری به GitHub Contents API برای ثبت بانک و فراداده در مخزن',
        'بهبود وضعیت نسخه بتا، مدیریت خطا و راهنمای امنیت توکن GitHub'
      ] },
      { v: '5.0.0', date: 'آبان ۱۴۰۵', items: [
        'ارتقای نسخه برنامه و هماهنگ‌سازی شناسه کش و فایل‌های انتشار',
        'تکمیل پشتیبان‌گیری افزایشی شامل علاقه‌مندی‌ها، عطرهای نامطلوب، امتیازها، کمد عطر و تنظیمات',
        'افزودن بررسی دستی به‌روزرسانی PWA و پیام وضعیت نسخه',
        'ثبت آمار واقعی بانک عطرها؛ هدف ۵۰۰۰ رکورد صرفاً هدف توسعه است'
      ] },
      { v: '4.1.0', date: 'آبان ۱۴۰۵', items: [
        'بازطراحی بخش آغازین با پیام برند تازه و هویت بصری لوکس‌تر',
        'افزودن حرکت‌های ظریف و انیمیشن‌های شناور به بطری و عناصر تزئینی',
        'بهبود تجربه موبایل و رعایت تنظیم کاهش حرکت سیستم',
        'هماهنگ‌سازی شماره نسخه برنامه و Service Worker'
      ] },
      { v: '4.0.0', date: 'آبان ۱۴۰۵', items: [
        'بازطراحی کامل رابط (Mobile-first، تبلت و دسکتاپ) با منوی همبرگری و صفحه «درباره ما»',
        'بانک داده محلی ۱٬۴۷۹ عطری (بدون وابستگی به شبکه خارجی برای نمایش اولیه) + Scento API',
        'جستجوی فارسی و انگلیسی (نت‌ها، خانواده‌ها و ویژگی‌ها) با نرمال‌سازی حروف',
        'فیلترهای واقعی: خانواده بویایی، غلظت، فصل، زمان استفاده، نت، برند و ویژگی',
        'بارگذاری سریع تصاویر: lazy-load، رزرو فضا، کش پایدار و جایگزین گرافیکی',
        'رفع اشکال Service Worker (مسیر آیکون‌ها)، فونت self-host و اندازه نوشته',
        'مهاجرت خودکار کمد عطر، امتیازها و علاقه‌مندی‌های نسخه‌های قبل'
      ] },
      { v: '3.0.0', date: 'پیش از این', items: ['کمد عطر شخصی، مقایسه ۲ تا ۴ عطر، فیلتر پیشرفته، پشتیبان‌گیری JSON'] },
      { v: '2.0.0', date: 'پیش از این', items: ['اتصال به Scento API، تم‌های سه‌گانه و PWA'] }
    ]
  };
})();
