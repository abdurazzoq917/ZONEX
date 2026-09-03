# ZONEX — ulanishlar qo'llanmasi

**Jonli sayt:** https://zonex-project.vercel.app
**Baza:** Upstash Redis, ulangan (`/api/world` → `"storage": "kv"`)
**Ilova:** 1.4 (versionCode 5) — Vercel serveriga ulanadi

Bu yerda ZONEX'ni ishga tushirish uchun kerak bo'ladigan barcha
ulanishlar bor: baza, Vercel, APK va admin.

Har bir bo'limda **"kim qiladi"** yozilgan. `[SIZ]` — akkaunt ochish,
parol va to'lov talab qiladigan ishlar. `[KOD]` — allaqachon
yozilgan, hech narsa qilish shart emas.

---

## 1. Baza — eng muhim qadam

### Nega kerak

Vercel'da fayl tizimi **vaqtinchalik**. Baza ulanmagan bo'lsa kod
`/tmp/zonex-world.json` ga yozadi, bu esa:

- har bir funksiya nusxasining o'ziga xos papkasi — bir o'yinchi
  egallagan hududni boshqasi **ko'rmaydi**;
- nusxa bir necha daqiqa ishlamasa **o'chib ketadi** — hamma
  ma'lumot yo'qoladi.

Ya'ni **baza ulanmaguncha o'yin ko'p kishilik bo'lmaydi.**

### Nima ulanadi

Kod ikkita nom to'plamini biladi va o'zi tanlaydi:

```
KV_REST_API_URL          +  KV_REST_API_TOKEN
UPSTASH_REDIS_REST_URL   +  UPSTASH_REDIS_REST_TOKEN
```

Ikkalasidan biri bo'lsa yetadi. **Kodda hech narsa o'zgartirish
shart emas** — `api/_store.js` ularni o'zi topib oladi.

### Qadamlar `[SIZ]`

1. https://vercel.com → ZONEX loyihasi → **Storage** yorlig'i
2. **Upstash Redis** (Marketplace) → **Create**
3. Loyihaga ulang (Connect Project) — `KV_REST_API_URL` va
   `KV_REST_API_TOKEN` avtomatik qo'shiladi
4. **Deployments** → oxirgisi → **Redeploy**

> Upstash o'rniga to'g'ridan-to'g'ri https://upstash.com dan ham
> ochsangiz bo'ladi. U holda "REST API" bo'limidan URL va TOKEN ni
> nusxalab, Vercel → Settings → Environment Variables ga qo'lda
> qo'yasiz.

### Tekshirish

Saytda `/api/world` ni oching. Javobda:

```json
{ "storage": "kv" }     ← to'g'ri
{ "storage": "file" }   ← baza ulanmagan
```

Lokalda tekshirish uchun `.env` faylini yarating va `npm run kv`
ni ishga tushiring — u yozib, o'qib, o'chirib ko'radi.

```bash
copy .env.example .env      # keyin qiymatlarni qo'ying
npm run kv
```

### Diqqat: bepul tarif chegarasi

Klient har 3 sekundda so'rov yuboradi. Bu **bitta o'yinchi uchun
kuniga ~29 000 so'rov** degani. Upstash bepul tarifi buyruqlar soni
bo'yicha cheklangan — bir necha o'yinchi bilanoq tugashi mumkin.

Buni yengillashtirish uchun allaqachon qilingan ishlar:

- profil rasmi asosiy yo'ldan chiqarildi (so'rov hajmi ~95% kamaydi);
- joylashuv alohida yozuvda — hududga tegmaydi;
- o'qish so'rovlari qulfga tushmaydi.

Keyingi qadam (hali qilinmagan): butun dunyoni emas, faqat
xaritaning ko'rinib turgan qismini yuborish. Buning uchun spatial
indeks kerak — pastdagi "Postgres" bo'limiga qarang.

---

## 2. Vercel `[SIZ]` + `[KOD]`

Vercel GitHub'ga har push'da o'zi yangi versiyani chiqaradi.

`[KOD]` `.vercelignore` allaqachon yozilgan. Unda muhim bir qoida bor:

```
public/
```

Bunisiz Vercel `public/` papkasini saytning ildizi deb olardi, u
yerdagi `native-config.js` esa saytni **telefon uchun mo'ljallangan
LAN manziliga** ulab qo'yardi.

Yuklanmaydigan boshqa narsalar: `android/` (juda katta),
`world.json` (haqiqiy o'yinchi ma'lumotlari), `.env`.

### Muhit o'zgaruvchilari

| Nom | Majburiymi | Nima uchun |
|---|---|---|
| `KV_REST_API_URL` | ha | Baza manzili |
| `KV_REST_API_TOKEN` | ha | Baza kaliti |
| `ADMIN_USERNAME` | yo'q | Admin useri (standart: `abdumalikov`) |
| `ADMIN_KEY` | **ochiq saytda — ha** | Ban berish uchun maxfiy so'z |
| `MAIL_USER` | **ha** | Gmail manzili — parolni tiklash kodi shundan ketadi |
| `MAIL_PASS` | **ha** | Google "App password" (Gmail paroli EMAS) |
| `MAIL_FROM` | yo'q | Xat kimdan kelgani (standart: `ZONEX <MAIL_USER>`) |

> `ADMIN_KEY` bo'sh qolsa, `ADMIN_USERNAME` dagi username'ni olgan
> **har qanday odam admin bo'la oladi**. Sayt ochiq bo'lsa albatta
> to'ldiring.

---

## 3. Email — parolni tiklash `[SIZ]`

### Nega kerak

Odam parolini unutsa, emailiga 6 xonali kod boradi. Kodsiz parolni
tiklashning boshqa yo'li yo'q — shuning uchun bu **majburiy**.

### Google "App password" olish

Bu yerga Gmail parolingiz **yozilmaydi**. Google alohida, faqat shu
ilova uchun ishlaydigan 16 belgili parol beradi. Uni istalgan payt
bekor qilsangiz, Gmail hisobingizga hech qanday ta'sir qilmaydi.

1. https://myaccount.google.com/security → **2-Step Verification**
   ni yoqing. (Yoqilmagan bo'lsa, keyingi qadam ochilmaydi — bu
   Google qoidasi.)
2. https://myaccount.google.com/apppasswords → nom bering
   (masalan `ZONEX`) → **Create**
3. Chiqqan 16 belgili kodni ko'chiring — u faqat **bir marta**
   ko'rsatiladi.

### Vercel'ga qo'yish

Settings → Environment Variables → **Production**:

```
MAIL_USER = sizning@gmail.com
MAIL_PASS = abcd efgh ijkl mnop
```

Keyin **Deployments → oxirgisi → Redeploy**. (Redeploy qilmasangiz
eski nusxa eski o'zgaruvchilar bilan ishlab turaveradi.)

### Tekshirish

Saytda `/api/world` ni oching:

```json
{ "mailInfo": { "mode": "gmail" } }     ← to'g'ri
{ "mailInfo": { "mode": "off" } }       ← sozlanmagan
```

### Lokalda sinash

`.env` da `MAIL_USER`/`MAIL_PASS` bo'sh qolsa, kod **email o'rniga
terminalga** chiqadi:

```
[ZONEX] Email sozlanmagan — kod shu yerda:
        jasur@gmail.com  ->  194057
```

Ya'ni email sozlamasdan turib ham butun oqimni sinab ko'rasiz.

### Chegara

Gmail SMTP kuniga ~500 xat yuboradi. Bu kichik ilova uchun yetarli.
O'yinchilar ko'paysa — Resend yoki shunga o'xshash xizmatga o'tiladi
(faqat `api/_mail.js` o'zgaradi, qolgan kodga tegilmaydi).

---

## 4. Akkauntlar va bazani tozalash

### Nima o'zgardi

Ilgari akkaunt **qurilma ID** bo'yicha ochilardi: telefon almashsa
hamma narsa yo'qolardi va ID'ni bilgan odam boshqa birovning
nomidan ish qila olardi.

Endi:

- kirish **username + parol** bilan;
- har bir akkauntda **email** bor (parolni tiklash uchun);
- bitta akkauntga **bir nechta telefondan** kirish mumkin;
- har bir so'rovga **token** qo'shiladi (`x-zonex-token`
  sarlavhasi) — tokensiz hech kim birovning nomidan hudud
  egallay olmaydi, xabarlarini o'qiy olmaydi.

### Eski akkauntlarni o'chirish `[SIZ]`

Eski yozuvlarda parol ham, email ham yo'q — ular bilan hech kim
kira olmaydi, faqat usernameni band qilib turadi. Shuning uchun
baza bir marta tozalanadi:

```bash
node scripts/reset-db.js          # faqat KO'RSATADI, o'chirmaydi
node scripts/reset-db.js --yes    # haqiqatan o'chiradi
```

Skript `.env` dagi KV ma'lumotlaridan foydalanadi. KV ulanmagan
bo'lsa — lokal `world.json` ni tozalaydi va avval zaxira nusxa
qoldiradi.

> **Bu amalni orqaga qaytarib bo'lmaydi.** Avval `--yes` siz ishga
> tushiring va nechta yozuv o'chishini ko'ring.

---

## 5. Android ilova `[SIZ]`

APK qaysi serverga ulanishini bitta fayl belgilaydi:

```js
// public/native-config.js
window.ZONEX_API_BASE = "https://SIZNING-SAYTINGIZ.vercel.app";
```

Bu fayl `.gitignore` da (chunki har kimda har xil) va `build:native`
uni **qayta yozmaydi** — bir marta yaratadi, keyin qo'lda
tahrirlanadi.

Hozirgi qiymat — kompyuteringizning LAN manzili
(`http://192.168.0.21:4173`). Bu bilan **faqat bir xil Wi-Fi'dagi
telefonlar** o'ynay oladi va kompyuterda `npm start` ishlab turishi
kerak. Vercel manzilini qo'ysangiz ilova mobil internet orqali,
istalgan joydan ishlaydi.

### Qayta yig'ish

```bash
npm run build:native      # index.html, client.js, styles.css,
                          # qr.js, game.js -> public/
npx cap sync android
cd android && gradlew.bat assembleDebug
```

APK shu yerda paydo bo'ladi:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Avto-yangilanish

Ilova `version.json` ni o'qib, `versionCode` kattaroq bo'lsa yangi
APK'ni o'zi yuklab oladi. Yangi versiya chiqarganda **uchala joyni
ham** yangilash kerak:

1. `android/app/build.gradle` → `versionCode` va `versionName`
2. `version.json` → xuddi shu raqamlar
3. `releases/zonex-latest.apk` → yangi fayl

### Bildirishnomalar

Ilova hududingiz bosib olinganini, do'stlik so'rovini va yangi
xabarni telefon ekraniga chiqaradi. Buning uchun:

- manifestda `POST_NOTIFICATIONS` ruxsati bor (allaqachon
  qo'shilgan);
- ilova birinchi ochilganda Android ruxsat so'raydi — foydalanuvchi
  «Ruxsat berish» ni bosishi kerak;
- bildirishnoma ilova **ochiq yoki fonda turganda** keladi
  (har 20 soniyada server tekshiriladi). Yurish paytida ilova
  fonda ishlab turadi, shuning uchun o'sha payt ham keladi.

Ilova butunlay yopilgan bo'lsa bildirishnoma kelmaydi — buning
uchun Firebase (FCM) kerak bo'ladi, u alohida ish.

---

## 6. Point va pulni boshqarish `[SIZ]`

O'yinchilar pointni pulga aylantirish so'rovi yuboradi va legendar
naqishlarni pulga buyurtma qiladi. Ikkalasi ham **avtomatik
bajarilmaydi** — siz tasdiqlaysiz.

Kutayotgan so'rovlar ro'yxati:

```bash
curl -X POST https://SIZNING-SAYTINGIZ.vercel.app/api/shop   -H "Content-Type: application/json"   -H "x-zonex-token: <admin tokeni>"   -d '{"id":"<admin id>","action":"admin","do":"list","key":"<ADMIN_KEY>"}'
```

Tasdiqlash (yoki `"do":"reject"` — rad etish):

```bash
curl -X POST https://SIZNING-SAYTINGIZ.vercel.app/api/shop   -H "Content-Type: application/json"   -H "x-zonex-token: <admin tokeni>"   -d '{"id":"<admin id>","action":"admin","do":"approve",
       "target":"<o'''yinchi id>","orderId":"<so'''rov id>",
       "key":"<ADMIN_KEY>"}'
```

Nima bo'ladi:

| Amal | Natija |
| --- | --- |
| To'lov so'rovi tasdiqlandi | Siz pulni o'zingiz o'tkazasiz, o'yinchiga xabar boradi |
| To'lov so'rovi rad etildi | Pointlar o'yinchiga **qaytariladi** |
| Naqish buyurtmasi tasdiqlandi | Legendar naqish ochiladi va o'zi qo'yiladi |

Narxlarni o'zgartirish: `api/_skins.js` — `POINT_UZS` (1 point necha
so'm), `CASHOUT_MIN` (eng kam point) va har bir naqishning `points`
yoki `price` qiymati.

---

## 7. Play Market `[SIZ]`

**Bepul emas.** Google Play Console dasturchi akkaunti bir martalik
**$25** to'lovni talab qiladi. Ustiga yangi shaxsiy akkauntlar uchun
20 ta tester bilan 14 kunlik yopiq test majburiy.

Bepul muqobillar (ro'yxatdan o'tish tekin): **RuStore**,
**Huawei AppGallery**, **Amazon Appstore**.

Yoki hozirgidek APK'ni to'g'ridan-to'g'ri tarqatish — ilovada
avto-yangilanish allaqachon bor.

> Play Market'ga chiqarilganda `assembleDebug` emas, imzolangan
> **release** build kerak bo'ladi, va release konfiguratsiyasi faqat
> HTTPS ga ruxsat beradi (`network_security_config.xml`) — ya'ni
> `ZONEX_API_BASE` albatta `https://` bilan boshlanishi shart.

---

## 8. Keyingi bosqich: Postgres + PostGIS

Bu hali **qilinmagan**, lekin o'ylab qo'yilgan yo'l.

Hozirgi `api/_geo.js` (hududlarni kesish/birlashtirish) va
`api/_lock.js` (navbat) — qo'lda yozilgan yechimlar. PostGIS ularni
butunlay almashtiradi:

| Hozir | PostGIS |
|---|---|
| `geo.union` | `ST_Union` |
| `geo.difference` | `ST_Difference` |
| `geo.intersection` | `ST_Intersection` |
| `geo.geomArea` (taxminiy) | `ST_Area(geography)` — geodezik, aniq |
| `geo.ringGap` | `ST_Distance(geography)` |
| `geo.boxesNear` | GiST indeks — `ST_DWithin` |
| `withLock` | `SELECT … FOR UPDATE` tranzaksiya |
| ko'p bo'lakli `parts` | `MULTIPOLYGON` — tabiiy tur |

Eng katta yutuq: spatial indeks bilan **"xaritaning shu qismidagi
hududlar"** so'rovi mumkin bo'ladi — butun dunyoni yuborish
kerak emas.

**Neon** (Vercel Marketplace, scale-to-zero) yoki **Supabase**
(ustiga Realtime — 3 sekundlik polling butunlay yo'qoladi).

Ulash uchun `DATABASE_URL` kerak bo'ladi.

---

## Qisqacha ro'yxat

- [x] Upstash Redis ulandi — `/api/world` da `"storage": "kv"`
- [x] `ADMIN_KEY` qo'yildi — Production'da `Secret` turida.
      Qiymati lokal `.env` faylingizda. Admin funksiyasini
      birinchi marta ishlatganda ilova uni bir marta so'raydi.
- [x] `public/native-config.js` → `https://zonex-project.vercel.app`
- [x] APK 1.4 yig'ildi, `version.json` va `releases/` yangilandi
- [x] `MAIL_USER` / `MAIL_PASS` qo'yildi — `/api/world` da
      `"mailInfo": { "mode": "gmail" }`
- [x] Eski (parolsiz) akkauntlar o'chirildi — baza bo'sh,
      `abdumalikov` nomi bo'sh turibdi
- [ ] Emailga kod kelishi sinab ko'rilmadi — buni faqat haqiqiy
      xat yuborib bilsa bo'ladi (saytdan «Parolni unutdingizmi?»)

### Keyingi safar

- Butun dunyoni emas, faqat xaritaning ko'rinib turgan qismini
  yuborish (Upstash bepul tarifi cheklangan — 7-bo'limga qarang)
- Postgres + PostGIS ga o'tish
