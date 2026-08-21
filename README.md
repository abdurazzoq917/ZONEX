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

1. **Username** faqat bir marta so'raladi (ism emas). Faqat harf, raqam,
   `_` va `.` — 3 tadan 16 tagacha belgi. Qurilma ID `localStorage` va
   cookie'da saqlanadi, shuning uchun bitta telefon = bitta akkaunt.
2. Bitta usernameni ikki kishi ololmaydi (server 409 `name_taken` qaytaradi).
   Katta-kichik harf farq qilmaydi: `Ali` va `ali` — bitta username.
3. Har kimning rangi qurilma ID'sidan hisoblanadi — hamma har xil rangda.
4. Yurishni boshlab, boshlagan nuqtangizga qaytsangiz hudud yopiladi.
   Yopilgan hudud xaritada **qoladi** — u yerning egasi siz bo'lasiz.
   Internet uzilsa ham hudud telefonda saqlanib turadi va aloqa tiklanganda
   o'zi serverga yuboriladi.
5. Hududlar serverda saqlanadi — chiqib qayta kirsangiz ham joyida qoladi.
6. Boshqa odamning hududini aylanib o'tsangiz — **bosib olasiz**:
   - hududning yarmidan ko'pi (yoki butunlay) ichida qolsa, u sizga o'tadi;
   - qisman ustidan yursangiz, faqat siz yurib o'tgan qism sizga o'tadi va
     eski egasining maydonidan chiqariladi (bir joy ikki marta sanalmaydi);
   - yeringizni qaytarib olish uchun o'sha joydan qayta aylaning.
7. Reytingda eng katta maydonga ega odam birinchi turadi.
8. **Tezlik cheklovi:** o'rtacha 10 km/soatdan tez bo'lsa hudud yozilmaydi.
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
saqlanib turishi uchun bepul **Upstash Redis** ulang.

### Vercel orqali (eng oson)

1. [vercel.com](https://vercel.com) → **ZONEX** loyihasi → yuqoridagi
   **Storage** bo'limi.
2. **Create Database** → **Upstash for Redis** → **Continue**.
3. Nom bering (masalan `zonex-db`), region **eu-central-1** yoki eng
   yaqinini tanlang → **Create**.
4. Ochilgan oynada **Connect Project** → ZONEX → **Connect**.
   Vercel `KV_REST_API_URL` va `KV_REST_API_TOKEN` ni o'zi qo'shadi.
5. **Deployments** → oxirgisi → `...` → **Redeploy**.

Kodda hech narsa o'zgartirish shart emas — `api/_store.js` bu
o'zgaruvchilarni o'zi topib oladi.

### Tekshirish

Sayt tomonidan: `sayt-manzili/api/world` ni oching va `"storage"`
maydoniga qarang — `"kv"` bo'lsa ulangan, `"file"` bo'lsa hali yo'q.

Kompyuterdan:

```powershell
npm run kv
```

Bu buyruq bazaga yozib, o'qib, o'chirib ko'radi va natijani aytadi.
Lokalda sinash uchun `.env.example` faylini `.env` nomi bilan nusxalab,
Upstash sahifasidagi **REST API** bo'limidan olingan qiymatlarni qo'ying.
`.env` GitHub'ga tushmaydi.

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
| `api/_env.js` | Lokalda `.env` faylini o'qiydi |
| `scripts/kv-check.js` | `npm run kv` — bazani tekshirish |
