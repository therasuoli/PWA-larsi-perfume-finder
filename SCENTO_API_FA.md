# اتصال واقعی Scento Perfume API

**Base URL:** `https://www.scento.com/api/perfume/v1`

API عمومی REST، read-only، بدون API Key و با CORS باز است. پاسخ‌ها JSON هستند. در این پروژه از مسیرهای رسمی زیر استفاده می‌شود:

| کاربرد | Endpoint |
|---|---|
| جستجوی عطر | `GET /search?q=oud&kind=perfume` |
| جزئیات و هرم نت | `GET /perfumes/{perfume}` |
| عطرهای مشابه | `GET /perfumes/{perfume}/neighbours` |

نمونه درخواست:
```js
const BASE = 'https://www.scento.com/api/perfume/v1';
const response = await fetch(`${BASE}/perfumes/aventus-creed`);
if (!response.ok) throw new Error(`Scento API: ${response.status}`);
const folio = await response.json();
console.log(folio.lede, folio.detail.pyramid);
```

ساختار خروجی معمولاً شامل `folio`, `lede`, `detail`, `scento_page`, `further_reading`, `cite` است. برای پرتره عطر، `detail.pyramid` شامل `top`, `heart`, `base` است. در endpoint همسایه‌ها، `detail.neighbours` فهرست عطرهای مشابه و `shared` نت‌های مشترک را ارائه می‌کند.

منابع رسمی:
- https://www.scento.com/developers/perfume-api
- https://www.scento.com/api/perfume/v1/openapi.json
- https://github.com/Scento-com/perfume-api

**محدودیت داده:** API امتیاز ستاره‌ای یا review عمومی ارائه نمی‌کند. امتیازدهی این پروژه محلی است و میان دستگاه‌ها همگام نمی‌شود. همچنین API قیمت و موجودی فروشگاهی ارائه نمی‌دهد.
