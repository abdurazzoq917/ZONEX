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
4. **Yo'lingiz o'zini kesib o'tsa** (A nuqta B nuqta bilan kesishsa) —
   o'sha halqa darhol sizniki bo'ladi va maydoni m² hisobingizga qo'shiladi.
   Yurish esa TO'XTAMAYDI: bitta yurishda bir nechta hudud yopish mumkin.
   Yurishni faqat o'zingiz "YURISHNI YAKUNLASH" tugmasi bilan tugatasiz —
   dastur uni o'zi yopib qo'ymaydi.
   Yopilgan hudud xaritada **qoladi** — u yerning egasi siz bo'lasiz va
   ustida username'ingiz yozilib turadi.
   Internet uzilsa ham hudud telefonda saqlanib turadi va aloqa tiklanganda
   o'zi serverga yuboriladi.
5. Hududlar serverda saqlanadi — chiqib qayta kirsangiz ham joyida qoladi.
6. Boshqa odamning hududini aylanib o'tsangiz — **bosib olasiz**:
   - hududning yarmidan ko'pi (yoki butunlay) ichida qolsa, u sizga o'tadi;
   - qisman ustidan yursangiz, faqat siz yurib o'tgan qism sizga o'tadi va
     eski egasining maydonidan chiqariladi (bir joy ikki marta sanalmaydi);
   - yeringizni qaytarib olish uchun o'sha joydan qayta aylaning.
7. Reytingda eng katta maydonga ega odam birinchi turadi. Ro'yxatdan
   o'tgan HAR BIR odam reytingda ko'rinadi — hali hudud egallamagan
   bo'lsa ham. 1-, 2- va 3-o'rinlar oltin, kumush va bronza bilan
   ajratib ko'rsatiladi.
8. **Tezlik cheklovi: 23 km/soat.** O'rtacha yoki bir lahzalik tezlik
   shundan oshsa — nuqtalar yozilmaydi va ogohlantirish chiqadi.
9. Xaritadagi odamning, uning hududining, reyting qatorining yoki jonli
   ro'yxatdagi nomining ustiga bossangiz — **profili** ochiladi: jami
   necha m² hududi bor va har bir kesishishda necha km yurgani ko'rinadi.
10. **Eng katta hududga ega odam** username'i ustida 👑 toj turadi —
    xaritada, reytingda, jonli ro'yxatda va profilda.
11. **Profil rasmi:** o'z profilingizni ochib 📷 tugmasi orqali xohlagan
    rasmni qo'yasiz. Rasm 256×256 gacha kichraytiriladi.
12. **Do'stlik va xabar:** boshqa odamning profilida "DO'STLIKKA QO'SHISH"
    bor. U qabul qilgandan **keyingina** "XABAR YOZISH" ochiladi.
13. **Qidiruv:** yuqoridagi 🔍 tugmasi. Username yozsangiz o'sha odam
    qayerlarni bosib olgani chiqadi — eng katta hududi birinchi turadi va
    "ENG KATTA" deb belgilanadi. Bosilsa xarita o'sha yerga uchadi.

## Admin

Admin **username bo'yicha** aniqlanadi. Sukut bo'yicha `abdumalikov`
(katta-kichik harf farq qilmaydi). Uning username'i oldida yashil
`(admin)` yozuvi turadi.

Admin har qanday odamning profilini ochib **3 / 9 / 15 kunlik yoki
umrbod ban** bera oladi hamda **bandan chiqara** oladi. Banlangan odam:

- hudud egallay olmaydi;
- xabar yoza olmaydi;
- bani profilida ko'rinib turadi (necha kun qolgani bilan).

### Muhim: adminni himoyalash

Ilovada parol yo'q — kimlik faqat qurilma ID orqali aniqlanadi.
Shuning uchun `.env` (yoki Vercel muhit o'zgaruvchilariga) quyidagini
qo'ying:

```
ADMIN_USERNAME=abdumalikov
ADMIN_KEY=uzun-maxfiy-soz
```

`ADMIN_KEY` qo'yilgan bo'lsa, ban berishda brauzer bir marta o'sha
maxfiy so'zni so'raydi. **Qo'yilmasa** — `abdumalikov` username'ini
birinchi olgan odam admin bo'lib qoladi.

## 18+ rasm tekshiruvi

Rasm **brauzerda** tekshiriladi:

1. Asosiy usul — `nsfwjs` modeli (CDN'dan bir marta yuklanadi).
   Ishonch yuqori bo'lsa rasm qo'yilmaydi va odamga **3 kunlik ban**
   yoziladi.
2. Model yuklanmasa (internet yo'q, CDN bloklangan) — teri rangi
   ulushi bo'yicha zaxira tekshiruv ishlaydi. Bunda **ban berilmaydi**,
   faqat rasm qabul qilinmaydi — oddiy selfi'ni xato banlab
   qo'ymaslik uchun.

Bu tekshiruv **100% aniq emas** va uni chetlab o'tish mumkin (kod
brauzerda ishlaydi). Shuning uchun admin qo'lda ban bera oladi va
bandan chiqara oladi. Jiddiy loyihada rasmni serverda, tashqi
moderatsiya xizmati orqali tekshirish kerak.

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
