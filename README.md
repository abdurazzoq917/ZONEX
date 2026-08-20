# ZONEX

Geolokatsiya asosidagi hudud egallash o'yini.

## Lokalda ishga tushirish

```powershell
npm start
```

So'ng `http://localhost:4173` manzilini oching.
Telefondan sinash uchun kompyuter IP manzilini ishlating (masalan
`http://192.168.1.5:4173`). Geolokatsiya faqat `localhost` yoki HTTPS orqali
ishlaydi.

## Qoidalar

1. Ism **faqat bir marta** so'raladi. Qurilma ID `localStorage` va cookie'da
   saqlanadi, shuning uchun bitta telefon = bitta akkaunt.
2. Bitta ismni ikki kishi ololmaydi (server 409 `name_taken` qaytaradi).
3. Har kimning rangi qurilma ID'sidan hisoblanadi — hamma har xil rangda.
4. Yurishni boshlab, boshlagan nuqtangizga qaytsangiz hudud yopiladi.
5. Hududlar serverda saqlanadi — chiqib qayta kirsangiz ham joyida qoladi.
6. Boshqa odamning hududini aylanib o'tsangiz — **bosib olasiz**
   (hududning yarmidan ko'pi ichida qolsa, u sizga o'tadi).
7. **Tezlik cheklovi:** o'rtacha 10 km/soatdan tez bo'lsa hudud yozilmaydi.
   Bir lahzalik tezlik 12 km/soatdan oshsa — nuqtalar yozilmaydi va
   ogohlantirish chiqadi. Mashina, velosiped, samokatda hudud egallab
   bo'lmaydi; piyoda yurganda esa hudud egallanaveradi.

Qoidalarni `api/_store.js` faylidagi `RULES` obyektidan o'zgartirish mumkin.

## Ma'lumot qayerda saqlanadi

| Holat | Saqlash joyi |
| --- | --- |
| Lokal server | `world.json` |
| Vercel (KV ulanmagan) | `/tmp/zonex-world.json` — **vaqtinchalik** |
| Vercel + Upstash/KV | Redis — doimiy |

Vercel'da `/tmp` har safar tozalanib ketishi mumkin. Hududlar butunlay
saqlanib turishi uchun bepul **Upstash Redis** ulang:

1. Vercel loyihasi → Storage → Upstash Redis (yoki upstash.com).
2. Project Settings → Environment Variables ichida quyidagilar bo'lsin
   (integratsiya odatda o'zi qo'shadi):
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
3. Qayta deploy qiling. Boshqa hech narsa o'zgartirish shart emas —
   `api/_store.js` ularni o'zi topib oladi.

`/api/world` javobidagi `"storage"` maydoni qaysi rejim ishlayotganini
ko'rsatadi: `kv` yoki `file`.

## API

| Yo'l | Metod | Vazifasi |
| --- | --- | --- |
| `/api/register` | POST | Akkaunt yaratish / tiklash |
| `/api/location` | POST | Jonli joylashuvni yuborish |
| `/api/territory` | POST | Hudud yopish, bosib olish |
| `/api/world` | GET | Barcha o'yinchilar va hududlar |

## Fayllar

| Fayl | Nima uchun |
| --- | --- |
| `index.html` | Sahifa tuzilishi |
| `styles.css` | Dizayn |
| `client.js` | Xarita, GPS, tezlik nazorati, jonli odamlar |
| `api/_store.js` | Ma'lumotlar ombori, ranglar, geometriya, qoidalar |
| `api/_http.js` | CORS va JSON yordamchilari |
| `local-server.js` | Lokal server (`api/` fayllarining aynan o'zini ishlatadi) |
