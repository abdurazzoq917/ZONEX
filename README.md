# ZONEX

Geolokatsiya asosidagi hudud egallash o'yini.

> **Ulanishlar (baza, Vercel, APK, admin) — [SETUP.md](SETUP.md).**
> Baza ulanmasa o'yin ko'p kishilik bo'lmaydi: Vercel'da fayl
> vaqtinchalik va hududlar yo'qoladi.


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
   - hududning yarmidan ko'pi (yoki butunlay) ichida qolsa, u butunlay
     sizga o'tadi va uning xaritasidan yo'qoladi;
   - qisman ustidan yursangiz, hududning **shakli haqiqatda kesiladi**:
     siz yurib o'tgan bo'lak eski egasidan olinadi, qolgani unda qoladi.
     O'rtasidan aylanib o'tsangiz — o'sha joyda teshik paydo bo'ladi;
   - o'zgarish darhol HAMMANING xaritasida ko'rinadi;
   - yeringizni qaytarib olish uchun o'sha joydan qayta aylaning.
7. **Yonma-yon hududlaringiz o'zi qo'shilib ketadi.** Yangi halqa eski
   hududingizga tegib tursa yoki 25 metrgacha yaqin bo'lsa — ikkalasi
   bitta hududga aylanadi. Kichigi kattasiga qo'shiladi: nomeri va
   yaratilgan sanasi kattanikidan qoladi, yurilgan masofalar esa
   qo'shiladi. Ustma-ust tushgan joy ikki marta sanalmaydi.

   Ikkisi tegib turmasa (masalan orasida yo'l bo'lsa), ular baribir
   BITTA hudud bo'ladi — ammo orasidagi yo'lak hech kimga tegishli
   bo'lmaydi: siz u yerdan yurmagansiz. Xaritada bitta nom ostidagi
   ikkita shakl bo'lib ko'rinadi.
8. Reytingda eng katta maydonga ega odam birinchi turadi. Ro'yxatdan
   o'tgan HAR BIR odam reytingda ko'rinadi — hali hudud egallamagan
   bo'lsa ham. 1-, 2- va 3-o'rinlar oltin, kumush va bronza bilan
   ajratib ko'rsatiladi.
9. **Tezlik cheklovi: 23 km/soat.** O'rtacha yoki bir lahzalik tezlik
   shundan oshsa — nuqtalar yozilmaydi va ogohlantirish chiqadi.
10. Xaritadagi odamning, uning hududining, reyting qatorining yoki jonli
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
| `/api/auth` | POST | Ro'yxat, kirish, chiqish, parolni tiklash |
| `/api/location` | POST | Jonli joylashuvni yuborish |
| `/api/territory` | POST | Hudud yopish, bosib olish |
| `/api/world` | GET | Barcha o'yinchilar va hududlar |
| `/api/friends` | POST | Do'stlik: so'rov, qabul, rad, o'chirish |
| `/api/messages` | GET/POST | Suhbatlar va xabar yozish |
| `/api/challenges` | GET/POST | Kunlik chelenj va mukofot olish |
| `/api/shop` | GET/POST | Naqishlar, pointni pulga aylantirish |
| `/api/notify` | GET/POST | Bildirishnomalar |
| `/api/profile` | GET/POST | Uy, xarita tanlash, maxfiylik, ramka |
| `/api/rank` | GET | Reytinglar (qamrov × davr) |
| `/api/clans` | GET/POST | Klanlar |
| `/api/plus` | GET/POST | ZoneX Plus obunasi |
| `/api/places` | GET/POST | Hamkor joylar (reklama) |
| `/api/admin` | GET | Admin panel statistikasi |

`/api/world` dan boshqa hammasi **token** talab qiladi — u
`x-zonex-token` sarlavhasida yuriladi. Tokenni `/api/auth` beradi
(kirish yoki ro'yxatdan o'tishda).

### `/api/auth` amallari

| `action` | Nima yuboriladi | Nima qaytadi |
| --- | --- | --- |
| `register` | `name`, `email`, `password` | `id`, `token`, `player` |
| `login` | `login` (username yoki email), `password` | `id`, `token`, `player` |
| `session` | `id`, `token` | Token hali amal qiladimi |
| `logout` | `id`, `token` | Shu qurilma tokenini o'chiradi |
| `forgot` | `login` | Emailga 6 xonali kod yuboradi |
| `verify` | `login`, `code` | Bir martalik `ticket` |
| `reset` | `login`, `ticket`, `password` | Yangi parol + yangi `token` |
| `change` | `id`, `token`, `oldPassword`, `password` | Yangi `token` |

## Sahifalar

| Manzil | Nima |
| --- | --- |
| `/` | **Yuklab olish sahifasi** — APK, tanishtiruv, QR kod |
| `/releases/zonex-latest.apk` | Android ilovasi |
| `/api/...` | Server (ilova shunga ulanadi) |

**Saytda o'yin YO'Q.** O'yin faqat Android ilovasida ishlaydi —
GPS fonda ishlashi, bildirishnomalar va avto-yangilanish uchun
native ilova kerak.

O'yin kodi (`app.html`, `client.js`, `game.js`, `hub.js`,
`styles.css`) repozitoriyda qoladi, chunki APK aynan ulardan
yig'iladi. Lekin `.vercelignore` orqali saytga yuklanmaydi —
`/app` degan sahifa yo'q, u ildizga qaytaradi.

Lokalda o'yinni sinash uchun: `npm start` → `localhost:4173/app`.

## Uy, daraja va xaritalar

### Uy (majburiy)

Ro'yxatdan o'tgach o'yinchi **uyini belgilaydi** — bu qadamni
o'tkazib bo'lmaydi. Uydan shahar aniqlanadi (`api/_cities.js`)
va shahar reytingi shunga qarab tuziladi. Uyni haftada bir
marta o'zgartirish mumkin.

Uyning ANIQ koordinatasi hech kimga ko'rsatilmaydi.

### XP va daraja

Daraja **faqat serverda** hisoblanadi (`api/_level.js`). Klient
XP yoki darajani o'zgartira olmaydi — u faqat serverdan kelgan
sonni ko'rsatadi.

XP manbalari: yurish (kuniga 1 500 XP gacha), yangi maydon,
begona hududni bosib olish, hududni kesish, kunlik chelenj va
do'st qo'shish.

Progressiya `PROGRESSION` obyektida turadi — balansni
o'zgartirish uchun faqat shu joyni tahrirlash kifoya:

| Daraja | Jami XP | Taxminan |
| --- | --- | --- |
| 5 | 6 700 | ~2 kun |
| 10 | 46 800 | ~2 hafta |
| 20 | 256 900 | ~2.5 oy |
| 30 | 710 400 | ~7 oy |

### Beshta xarita

| Xarita | Daraja | Eng kichik hudud | Himoya |
| --- | --- | --- | --- |
| Beginner Zone | 1 | 40 m² | ×1.5 |
| City Zone | 5 | 50 m² | ×1 |
| Regional Zone | 10 | 120 m² | ×1 |
| National Zone | 20 | 250 m² | ×0.8 |
| World Zone | 30 | 400 m² | ×0.7 |

Har bir xaritaning hududlari **alohida** saqlanadi: hudud
yozuvida `mapId` turadi va hamma joyda shu bo'yicha
filtrlanadi. Yopiq xaritaga API orqali ham kirib bo'lmaydi —
server so'ralgan xaritani o'yinchining ro'yxati bilan
solishtiradi.

XP, daraja, do'stlar, point va akkaunt esa umumiy.

## Hudud himoyasi va jang

O'yin halqasi:

```
yurish → egallash → himoya → himoya tugadi → jang → yangi ega
```

Egallangan hudud ma'lum vaqtga himoyalanadi. Muddatni **faqat
server** biladi (`territory.defendedUntil`), klient uni
o'zgartira olmaydi.

| Hudud darajasi | Himoya | Qancha yurish kerak |
| --- | --- | --- |
| L1 | 2 soat | — |
| L2 | 4 soat | ~2 marta |
| L3 | 8 soat | ~4 marta |
| L4 | 12 soat | ~10 marta |
| L5 | 24 soat | ~24 marta |

Holatlar: `DEFENDED` → `VULNERABLE` → `CONTESTED` → `CAPTURED`.

Himoyadagi yer hujumchining hududiga **qo'shilmaydi** ham —
u o'yib tashlanadi. Aks holda himoyaning ma'nosi qolmasdi.

**Yangi o'yinchi himoyasi:** ro'yxatdan o'tgandan keyin 3 kun
davomida hududlarga umuman tegib bo'lmaydi.

ZoneX Plus himoyani UZAYTIRMAYDI — bu ataylab shunday.

## Anti-cheat

Qoida: **serverga ishon, klientga emas**. Klient yuborgan hech
bir son o'z holicha ishonchli emas.

| Tekshiruv | Nimaga qaraydi |
| --- | --- |
| Sakrash (teleport) | Ikki nuqta orasi 400 m dan uzoq |
| Soxta GPS | Yo'l juda "silliq" — dastur chizgan |
| O'rtacha tezlik | 23 km/soat dan tez |
| Eng yuqori tezlik | Transportda harakat |
| Shahar almashishi | Oxirgi joydan 140 km/soat dan tez yetib kelish |
| Vaqt | Hudud 8 sekunddan tez yopilgan |

## Maxfiylik

Uch rejim: `public` (hamma), `friends` (faqat do'stlar),
`private` (hech kim).

Rejimdan qat'i nazar **ANIQ GPS nuqta hech qachon berilmaydi**:
u har doim 70–160 metrga surib ko'rsatiladi. Siljish o'yinchi
ID'sidan hisoblanadi va o'zgarmaydi — aks holda ko'p o'lchovni
o'rtalab haqiqiy nuqtani topish mumkin bo'lardi.

## Reytinglar va klanlar

Reyting **to'rtta qamrov × to'rtta davr**:

- qamrov: global, shahar, do'stlar, klanlar
- davr: kunlik, haftalik, oylik, umumiy

Davr almashganda hisoblagich nolga tushadi (`api/_stats.js`),
shuning uchun har hafta reyting yangilanadi.

Shaharlar reytingi ham bor: Toshkent vs Samarqand vs Buxoro.

Klan ochish uchun 3-daraja kerak, bitta klanda 30 tagacha a'zo.
Klan XP'si a'zolarnikidan yig'iladi.

## ZoneX Plus va reklama

**ZoneX Plus — oyiga 19 990 so'm.** Beradi: reklamasiz
foydalanish, maxsus profil ramkasi, qo'shimcha statistika,
maxsus nishonlar, profilni bezash va qo'shimcha xarita
ko'rinishlari.

**Bermaydi (ataylab):** hudud himoyasi uzaymaydi, XP
tezlashmaydi, yopiq xaritalar ochilmaydi. Ya'ni Plus — ko'rinish
va qulaylik, o'yindagi kuch emas.

Obunachida chapdagi `ZONEX` yozuvi `ZONEX PLUS` bo'ladi.

**Hamkor joylar** — loyihani moliyalashtirishning ikkinchi yo'li.
Biznes o'z joyini xaritaga qo'yadi, o'yinchi yonidan o'tganda
taklifni ko'radi:

```
📍 Coffee X — ZoneX hamkori
   Bugun kofega 20% chegirma
```

Plus obunachilariga reklama ko'rsatilmaydi.

Reklama uchun murojaat: Telegram **@Abduumalikov_7**

## Admin panel

Menyudagi «Admin panel» (faqat adminda ko'rinadi):

- nechta foydalanuvchi ro'yxatdan o'tgan va hozir nechtasi onlayn
- bugun / hafta / oy ichida nechtasi qo'shilgan va nechtasi faol
- uy belgilaganlar, email biriktirganlar, banlanganlar, Plus egalari
- jami hudud, maydon, yurilgan yo'l, XP va point
- xaritalar va shaharlar bo'yicha taqsimot
- kutilayotgan to'lovlar — bir bosishda tasdiqlash yoki rad etish
- hamkor joylar va ular necha marta ko'rsatilgani

`.env` da `ADMIN_KEY` bo'lsa, panel birinchi ochilganda o'sha
maxfiy so'zni so'raydi va uni qurilmada saqlaydi.

## Kunlik chelenj va point

Har kuni (O'zbekiston vaqti bo'yicha yarim tunda) o'yinchiga
**uchta vazifa** beriladi: bittasi yengil, bittasi o'rtacha,
bittasi og'ir. Vazifalar hech qayerda saqlanmaydi — ular kun
sanasi va akkaunt raqamidan hisoblanadi, shuning uchun har kuni
va har bir odamda boshqacha bo'ladi (`api/_daily.js`).

Bajarilgani uchun **point** beriladi. Uchalasi ham olinsa —
ketma-ket kunlar (streak) uchun qo'shimcha bonus.

Hisoblagichlar o'yinning o'zidan to'ldiriladi:

| Turi | Qayerda ortadi |
| --- | --- |
| `distance` | Hudud yopilganda — o'sha aylanish uzunligi |
| `area` | Hudud yopilganda — yangi maydon |
| `zones` | Har bir yopilgan hudud |
| `capture` | Begonadan bosib olingan hudud |
| `friends` | Yangi do'st qo'shilganda |
| `chat` | Yozilgan har bir xabar |
| `login` | Kun boshlanganda o'zi bajariladi |

### Naqishlar (skin)

Naqish — hududning ustiga qo'yiladigan bezak. Xaritada
hududingiz oddiy rang o'rniga naqsh bilan chiziladi va **uni
hamma ko'radi**. Katalog `api/_skins.js` da:

| Daraja | Qanday olinadi | Narxi |
| --- | --- | --- |
| **Epik** | Point bilan | 2 500 – 4 500 point |
| **Mifik** | Point bilan | 9 000 – 18 000 point |
| **Legendar** | Faqat pulga (ataylab arzon) | 7 900 – 14 900 so'm |

Narx va daraja faqat serverda turadi — brauzerdan
o'zgartirib bo'lmaydi.

### Pointni pulga aylantirish

1 point = **5 so'm**, eng kami **5 000 point** (25 000 so'm).

So'rov yuborilganda pointlar **darhol yechiladi** (ikki marta
yuborib bo'lmasin), so'rov esa `pending` bo'lib turadi.
Admin tasdiqlaydi yoki rad etadi — rad etilsa pointlar
o'zi qaytariladi.

Admin buyurtmalarni `POST /api/shop` orqali boshqaradi:

```json
{ "id": "<admin id>", "action": "admin", "do": "list", "key": "<ADMIN_KEY>" }
{ "id": "<admin id>", "action": "admin", "do": "approve",
  "target": "<o'yinchi id>", "orderId": "<so'rov id>", "key": "<ADMIN_KEY>" }
```

`do` uchun: `list` (kutayotganlari), `approve`, `reject`.
Legendar naqish buyurtmasi tasdiqlansa — naqish o'zi ochiladi.

## Bildirishnomalar

Server o'yinchi yozuviga bildirishnoma qo'yadi
(`api/_notify.js`), ilova esa har 20 soniyada `/api/notify` ni
tekshiradi va **yangisini telefon ekraniga chiqaradi**
(Android'da `@capacitor/local-notifications`, brauzerda
`Notification` API).

Qachon keladi:

- hududingizni birov bosib oldi yoki kesdi;
- do'stlik so'rovi keldi / so'rovingiz qabul qilindi;
- yangi xabar keldi;
- chelenj mukofoti yoki do'kondagi buyurtma holati o'zgardi.

Android'da buning uchun `POST_NOTIFICATIONS` ruxsati kerak —
ilova birinchi ochilganda o'zi so'raydi.

## QR kod

Menyudagi "QR kod" bandi bosilganda
`https://zonex-project.vercel.app` ga olib boradigan QR kod
butun ekranga chiqadi. (Ilgari ekranning o'ng pastida ham
suzuvchi tugma bor edi — u olib tashlandi.)

QR kod telefonning **o'zida** chiziladi (`qr.js`) — internetdagi
rasm xizmati ishlatilmaydi, shuning uchun ilova oflayn ochilganda
ham ko'rinadi.

## Fayllar

| Fayl | Nima uchun |
| --- | --- |
| `index.html` | Sahifa tuzilishi |
| `styles.css` | Dizayn |
| `client.js` | Xarita, GPS, tezlik nazorati, jonli odamlar |
| `game.js` | Menyu, chelenj, do'kon, bildirishnoma, QR oynasi |
| `hub.js` | Uy, xaritalar, daraja, reyting, klan, Plus, reklama, admin |
| `app.html` | O'yin sahifasi (`/app`) |
| `index.html` | Yuklab olish sahifasi (`/`) |
| `api/_level.js` | XP va daraja (progressiya shu yerda sozlanadi) |
| `api/_maps.js` | Beshta xarita va ular qaysi darajada ochilishi |
| `api/_defense.js` | Hudud darajasi va himoya muddati |
| `api/_plus.js` | ZoneX Plus obunasi, ramkalar, xarita ko'rinishlari |
| `api/_places.js` | Hamkor joylar (reklama) |
| `api/_stats.js` | Kunlik / haftalik / oylik hisoblagichlar |
| `api/_cities.js` | Koordinatadan shaharni aniqlash |
| `api/_clan.js` | Klan modeli |
| `qr.js` | QR kod yasovchi (oflayn ishlaydi, kutubxonasiz) |
| `api/_daily.js` | Kunlik chelenj: vazifalar, hisoblagich, mukofot |
| `api/_skins.js` | Naqishlar katalogi va narxlari |
| `api/_notify.js` | Bildirishnomalar ro'yxati |
| `api/_store.js` | Ma'lumotlar ombori, ranglar, geometriya, qoidalar |
| `api/_auth.js` | Parol (scrypt), sessiya tokenlari, tiklash kodi |
| `api/_mail.js` | Gmail SMTP orqali xat yuborish |
| `scripts/reset-db.js` | `npm run reset-db` — bazani tozalash |
| `api/_http.js` | CORS va JSON yordamchilari |
| `local-server.js` | Lokal server (`api/` fayllarining aynan o'zini ishlatadi) |
| `api/_env.js` | Lokalda `.env` faylini o'qiydi |
| `scripts/kv-check.js` | `npm run kv` — bazani tekshirish |
