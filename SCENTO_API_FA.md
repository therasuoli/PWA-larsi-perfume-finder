# Scento Perfume API

**Base URL:** `https://www.scento.com/api/perfume/v1` — عمومی، فقط‌خواندنی، بدون API Key.

| کاربرد | Endpoint |
|---|---|
| جستجو | `GET /search?q=oud&kind=perfume` |
| جزئیات و هرم نت | `GET /perfumes/{slug}` |
| عطرهای مشابه | `GET /perfumes/{slug}/neighbours` |

در برنامه، همه فراخوانی‌ها از `js/repo.js` (شیء `LPF.repo.api`) انجام می‌شود: timeout ۶٫۵ ثانیه، کش حافظه، و توقف موقت پس از خطاهای پیاپی. پاسخ‌ها فقط برای تکمیل اطلاعات استفاده می‌شوند؛ بانک محلی همیشه منبع اصلی است.

این API امتیاز کاربران، قیمت و موجودی ارائه نمی‌کند؛ امتیازهای برنامه شخصی و محلی هستند.
منابع: https://www.scento.com/developers/perfume-api · https://github.com/Scento-com/perfume-api
