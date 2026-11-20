/* Larsi Perfume Finder — configuration (single source of truth for version, links and endpoints) */
(function () {
  'use strict';
  const LPF = (window.LPF = window.LPF || {});
  LPF.config = {
    name: 'Larsi Perfume Finder',
    nameFa: 'لارسی پرفیوم فایندر',
    version: '7.1.1',
    versionFa: '۷٫۱٫۱',
    releaseFa: 'آبان ۱۴۰۵ · نسخه پایدار توسعه',
    releaseISO: '2026-11-20',
    author: 'هادی رسولی',
    store: { name: 'فروشگاه لارسی', url: 'https://lar30.com', host: 'lar30.com' },
    // Catalogue and product images are read from the user's Supabase payload records.
    data: {},
    supabase: {
      url: 'https://eixzihvihoammvremxrl.supabase.co', // Supabase project URL
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpeHppaHZpaG9hbW12cmVteHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzc4NDksImV4cCI6MjExMDc1Mzg0OX0.7Sg8--D4wfsKoBXM0P9vUP-gG1w6CIEUuAvaEwr4Qsw', // Supabase anon/public key only (never service role)
      table: 'perfumes',
      pageSize: 1000,
      timeoutMs: 12000
    },
    storagePrefix: 'lpf:v5:',
    changelog: [
      { v: '7.1.1', date: 'آبان ۱۴۰۵', items: [
        'قطع و حذف همه سرویس‌های جستجوی آنلاین و داده تکمیلی خارجی',
        'جستجوی توسعه‌یافته در نام، نام فارسی، برند، نت‌ها، آکوردها، ویژگی‌ها و توضیحات کوتاه و بلند',
        'افزودن پیشنهادهای لحظه‌ای جستجو برای عطر، برند و نت با امکان انتخاب مستقیم',
        'ذخیره تاریخچه جستجو در همین دستگاه و پیشنهاد جایگزین هنگام بدون نتیجه بودن',
        'حذف خزش و Dataset خارجی؛ بازسازی بانک فقط از فایل‌های واردشده توسط مالک پروژه',
        'پشتیبانی از URL تصویر موجود در payload دیتابیس و حذف وابستگی به ایندکس تصاویر خارجی',
        'افزودن کش کاتالوگ در IndexedDB با نمایش سریع و به‌روزرسانی در پس‌زمینه',
        'اصلاح Service Worker، پاک‌سازی منابع غیرموجود و هماهنگ‌سازی همه شماره نسخه‌ها',
        'بهبود توضیحات درباره برنامه، ابزار پاک‌سازی کش و حفظ داده‌های شخصی',
        'بهبود دسترس‌پذیری پیشنهادهای جستجو، کیبورد و رعایت Reduce Motion'
      ] },
      { v: '5.4.0-alpha.1', date: 'آبان ۱۴۰۵', items: ['بازطراحی فضای صفحه اصلی با سبک Editorial + Luxury و حال‌وهوای رویایی', 'افزودن انیمیشن‌های ظریف، حرکت ورودی بخش‌ها و تعامل‌های نرم با رعایت Reduce Motion', 'افزودن راهنمای آغاز حرفه‌ای سه‌مرحله‌ای', 'یکپارچه‌سازی شماره نسخه در تنظیمات، درباره برنامه، Manifest و Service Worker', 'افزودن ابزار پاک‌سازی کش برنامه بدون حذف اطلاعات شخصی'] }
    ]
  };
})();
