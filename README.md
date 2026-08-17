#  ZONEX

Geolokatsiya asosidagi hudud egallash o‘yini prototipi.

## Ishga tushirish

```powershell
npm start
```

So‘ng `http://localhost:4173` manzilini oching. Geolokatsiya odatda faqat HTTPS yoki localhost orqali ishlaydi.

## Ishlatish

1. Ism kiriting.
2. Joylashuvga ruxsat bering.
3. Yurishni boshlang va boshlagan nuqtangizga qaytib yopiq hudud hosil qiling.

Bu versiyada Node.js server barcha telefonlarning jonli joylashuvi, hududlari va reytingini bir xil xaritada tarqatadi. Ma’lumotlar `world.json` faylida saqlanadi. Internetdan ishlatish uchun ZIP faylni Node.js hostingga joylang va HTTPS yoqing; telefon geolokatsiyasi HTTPS talab qiladi.
