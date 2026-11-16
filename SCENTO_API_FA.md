# راهنمای اتصال Scento Perfume API — نسخه 1.1

این پروژه از API رسمی Scento استفاده می‌کند:

- **Base URL:** `https://www.scento.com/api/perfume/v1`
- **مستندات رسمی:** https://www.scento.com/developers/perfume-api
- **OpenAPI 3.1:** https://www.scento.com/api/perfume/v1/openapi.json
- **روش:** فقط `GET`
- **احراز هویت:** بدون API Key و بدون ثبت‌نام
- **فرمت پاسخ:** JSON
- **CORS:** مستندات Scento اعلام می‌کند که فراخوانی مستقیم از مرورگر مجاز است.

## چه چیزی در نسخه 1.1 متصل شده است؟

1. جستجوی زنده عطرها با تایپ حداقل دو حرف در کادر جستجو.
2. دریافت مشخصات کامل عطر با انتخاب نتیجه Scento.
3. دریافت نت‌های آغازین (`top`)، میانی (`heart`) و پایانی (`base`).
4. دریافت عطرهای مشابه و نت‌های مشترک.
5. صفحه‌بندی نتایج با مقدار `continuation`.
6. حفظ بانک نمونه داخلی برای نمایش اولیه و زمانی که API در دسترس نباشد.

## Endpointهای استفاده‌شده در برنامه

### جستجو

```http
GET /search?q=oud&kind=perfume&lang=en
```

پارامترها:

- `q`: عبارت جستجو (الزامی)
- `kind`: نوع نتیجه؛ این برنامه از `perfume` استفاده می‌کند.
- `lang`: زبان لینک‌های Scento؛ پیش‌فرض `en`.
- `continuation`: مقدار بازگشتی برای دریافت صفحه بعد.

ساختار پاسخ مورد استفاده:

```js
const matches = response.detail.matches;
const nextPage = response.continuation;
```

هر نتیجه جستجو معمولاً دارای `name`، `house`، `family` و `page` است.

### مشخصات کامل عطر

```http
GET /perfumes/layton?lang=en
```

ساختار پاسخ:

```js
const perfume = response.detail;
const topNotes = perfume.pyramid.top;
const heartNotes = perfume.pyramid.heart;
const baseNotes = perfume.pyramid.base;
```

همچنین می‌توان `family`، `subfamily`، `concentration`، `character` و `wears` را دریافت کرد.

### عطرهای مشابه

```http
GET /perfumes/layton/neighbours?lang=en
```

ساختار پاسخ:

```js
const similar = response.detail.neighbours;
```

نتایج می‌توانند شامل `name`، `house`، `family`، `shared` و `difference` باشند.

## نمونه استفاده مستقل در JavaScript

```js
const SCENTO = "https://www.scento.com/api/perfume/v1";

async function searchPerfumes(query) {
  const url = new URL(`${SCENTO}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("kind", "perfume");
  url.searchParams.set("lang", "en");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getPerfume(slug) {
  const response = await fetch(
    `${SCENTO}/perfumes/${encodeURIComponent(slug)}?lang=en`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getNeighbours(slug) {
  const response = await fetch(
    `${SCENTO}/perfumes/${encodeURIComponent(slug)}/neighbours?lang=en`
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
```

## تست سریع در مرورگر

- جستجو: https://www.scento.com/api/perfume/v1/search?q=oud&kind=perfume
- مشخصات Layton: https://www.scento.com/api/perfume/v1/perfumes/layton
- مشابه‌های Layton: https://www.scento.com/api/perfume/v1/perfumes/layton/neighbours

اگر پاسخ JSON دریافت شد، endpoint پاسخ داده است. اگر مرورگر خطا داد، اینترنت، محدودیت شبکه یا در دسترس بودن سرویس را بررسی کنید.

## محدودیت‌ها و نکات داده‌ای

- Scento داده‌های عطر و نت‌ها را ارائه می‌کند؛ این API لزوماً تصویر محصول، قیمت، موجودی فروشگاه، بارکد یا جنسیت رسمی هر عطر را ارائه نمی‌دهد.
- در نتایج API، کشور سازنده و جنسیت ممکن است موجود نباشد. برنامه این اطلاعات را حدس نمی‌زند و در صورت نبود داده، «ثبت نشده» نمایش می‌دهد.
- تشخیص چند برند اماراتی در رابط صرفاً برای برچسب‌گذاری اولیه انجام می‌شود و جایگزین فیلد رسمی کشور سازنده نیست.
- فیلتر زنانه/مردانه برای نتایجی که جنسیتشان از منبع مشخص نشده، نتیجه‌ای برنمی‌گرداند.
- تصاویر محصولات در پاسخ‌های مستندشده این API جزو داده تضمین‌شده نیستند؛ بنابراین این نسخه تصویر واقعی را جعل نمی‌کند و از تصویر بطری گرافیکی جایگزین استفاده می‌کند.
- رایگان بودن و بدون کلید بودن به معنی مجوز بازنشر انبوه یا ساخت نسخه آینه‌ای از کل دیتابیس نیست. شرایط استفاده Scento را بخوانید: https://www.scento.com/terms-of-service#perfume-api
- برای دسترسی به نتایج زنده اینترنت لازم است. داده‌های نمایشی داخلی در زمان قطعی API همچنان در دسترس‌اند.

## انتشار روی GitHub Pages

1. محتوای پوشه `perfume-finder` را در ریشه مخزن GitHub قرار دهید.
2. از Settings → Pages، شاخه انتشار را انتخاب کنید.
3. وب‌سایت را با HTTPS باز کنید تا Service Worker فعال شود.
4. API به‌صورت مستقیم از مرورگر فراخوانی می‌شود و برای این اتصال به Worker یا API Key نیاز نیست.

## توسعه‌دهنده

هادی رسولی — Hadi Rasouli


## فهرست برندها و شمار عطرها

برای نمایش کامل برندها از endpoint جستجوی API استفاده نمی‌شود؛ API جستجو برای query مشخص طراحی شده است. به‌جای آن، پروژه فایل عمومی `houses.csv` را از مخزن رسمی Scento دریافت می‌کند:

`https://raw.githubusercontent.com/Scento-com/perfume-dataset/main/houses.csv`

ستون `name` نام برند، `country` کشور و `perfume_count` تعداد عطرهای آن برند در snapshot دیتاست را مشخص می‌کند. این روش باعث می‌شود شمار عطرها دقیقاً از رکورد منتشرشده Scento خوانده شود. فهرست در مرورگر cache می‌شود.

مخزن داده: https://github.com/Scento-com/perfume-dataset
مجوز: CC BY 4.0 — انتساب به Scento الزامی است.
