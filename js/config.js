/* Larsi Perfume Finder — configuration (single source of truth for version, links and endpoints) */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  LPF.config = {
    name: 'Larsi Perfume Finder',
    nameFa: 'لارسی پرفیوم فایندر',
    version: '5.0.0',
    versionFa: '۵٫۰٫۰',
    releaseFa: 'آبان ۱۴۰۵',
    releaseISO: '2026-11-17',
    author: 'هادی رسولی',
    store: { name: 'فروشگاه لارسی', url: 'https://lar30.com', host: 'lar30.com' },
    // Data repository: same-origin snapshot first (fast, offline-ready), live APIs second.
    data: {
      catalog: 'data/perfumes.json',
      meta: 'data/meta.json',
      images: 'data/perfume-images.json',
      upstreamCsv: 'https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/perfumes.csv'
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
