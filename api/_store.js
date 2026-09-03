// api/_store.js
// ============================================================
// ZONEX — MA'LUMOTLAR OMBORI (STORE)
// ============================================================
//
// Bitta manba (single source of truth).
//
// Saqlash joyi avtomatik tanlanadi:
//
//   1) Upstash / Vercel KV  — env o'zgaruvchilari bo'lsa
//      (KV_REST_API_URL + KV_REST_API_TOKEN yoki
//       UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
//
//   2) Fayl — lokal serverda world.json,
//      Vercel'da /tmp/zonex-world.json
//
// MUHIM: Vercel'da fayl vaqtinchalik. Hududlar butunlay
// yo'qolmasligi uchun KV (Upstash Redis) ulash kerak.
// ============================================================

// Lokalda .env faylini o'qiydi (Vercel'da hech narsa qilmaydi)
require("./_env");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const geo = require("./_geo");
const auth = require("./_auth");
const daily = require("./_daily");
const notify = require("./_notify");
const skins = require("./_skins");
const level = require("./_level");
const maps = require("./_maps");
const defense = require("./_defense");
const plus = require("./_plus");
const stats = require("./_stats");
const cities = require("./_cities");
const places = require("./_places");
const clans = require("./_clan");

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  "";

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  "";

const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

const IDS_KEY = "zonex:ids";
const PLAYER_KEY = (id) => "zonex:player:" + id;

// "Jonli" yozuv — joylashuv va jami yurgan masofa.
//
// Bu ma'lumot har 3 sekundda yangilanadi, o'yinchi yozuvi esa
// juda kam o'zgaradi (hudud, do'stlik, rasm). Ilgari ikkalasi
// bitta yozuvda edi va joylashuv yangilanishi ayni damda
// egallangan hududni O'CHIRIB yuborishi mumkin edi. Endi ular
// alohida kalitlarda — bir-biriga tegmaydi.
const LIVE_KEY = (id) => "zonex:live:" + id;

// Profil rasmi ham ALOHIDA kalitda.
//
// Rasm o'yinchi yozuvining ~98% ini egallaydi, lekin u faqat
// profil ochilganda kerak. Ilgari u o'yinchi yozuvi ichida edi
// va HAR BIR /api/world so'rovida (har 3 sekundda) bazadan
// o'qilardi — keyin javobdan olib tashlanardi. Ya'ni bekorga.
//
// Endi o'yinchi yozuvida faqat `avatarAt` (versiya raqami)
// qoladi, rasmning o'zi esa shu kalitda yotadi.
const AVATAR_KEY = (id) => "zonex:avatar:" + id;

const LOCK_KEY = (name) => "zonex:lock:" + name;

// Klanlar va hamkor joylar — o'yinchi yozuvlaridan alohida.
// Ular kam o'zgaradi va soni oz, shuning uchun bitta ro'yxat
// sifatida saqlanadi.
const CLANS_KEY = "zonex:clans";
const PLACES_KEY = "zonex:places";

const FILE_PATH = process.env.VERCEL
  ? path.join("/tmp", "zonex-world.json")
  : path.join(__dirname, "..", "world.json");

// ============================================================
// O'YIN QOIDALARI
// ============================================================

const RULES = {
  // Yurish tezligi chegarasi (km/soat).
  // Bundan tez bo'lsa — transport deb hisoblanadi.
  MAX_SPEED_KMH: 23,

  // Butun aylanish bo'yicha o'rtacha tezlik chegarasi (km/soat).
  MAX_AVG_SPEED_KMH: 23,

  // Eng kichik hudud (m2).
  MIN_AREA: 50,

  // Odam "onlayn" hisoblanadigan vaqt (ms).
  ONLINE_MS: 120000,

  // Hudud bosib olinishi uchun kerakli qamrov (0..1).
  //
  // Yangi aylana eski hududning yarmini qoplasa — o'sha hudud
  // yangi egasiga o'tadi. To'liq aylanib o'tilsa (ichiga olinsa)
  // qamrov 1 ga teng bo'ladi va hudud albatta qo'lga o'tadi.
  CAPTURE_RATIO: 0.5,

  // Yonma-yon hududlar shu masofadan yaqin bo'lsa (metr) —
  // bitta hududga qo'shilib ketadi. Ikkita halqa aynan tegib
  // turmasa ham (orasida tor yo'lak qolsa ham) birlashadi.
  MERGE_GAP: 25,

  // Username uzunligi
  NAME_MIN: 3,
  NAME_MAX: 16,

  // Profil rasmi eng ko'pi bilan shuncha belgi (base64 bilan).
  // ~256x256 JPEG odatda 40 000 belgidan kam bo'ladi.
  AVATAR_MAX: 260000,

  // Bitta suhbatda saqlanadigan xabarlar soni
  CHAT_MAX: 300,

  // Bitta xabarning uzunligi
  MESSAGE_MAX: 500,

  // Ban muddatlari (kun). 0 — bandan chiqarish, -1 — umrbod.
  BAN_DAYS: [3, 9, 15, -1],

  // 18+ rasm aniqlanganda beriladigan ban (kun)
  NSFW_BAN_DAYS: 3
};

// ============================================================
// ADMIN
// ============================================================
//
// Admin username bo'yicha aniqlanadi. Uni .env dagi
// ADMIN_USERNAME orqali o'zgartirsa bo'ladi.
//
// ADMIN_KEY berilgan bo'lsa — admin harakatlari uchun o'sha
// maxfiy so'z ham talab qilinadi (id'ni soxtalashtirishga
// qarshi).
// ============================================================

const ADMIN_USERNAME = String(
  process.env.ADMIN_USERNAME || "abdumalikov"
)
  .trim()
  .toLowerCase();

const ADMIN_KEY = String(process.env.ADMIN_KEY || "");

const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================================
// YANGI O'YINCHI HIMOYASI
// ============================================================
//
// Ro'yxatdan o'tgandan keyin shuncha vaqt davomida hududlari
// hech kim tomonidan bosib olinmaydi. Shunda yangi odam
// birinchi kunidayoq veteranga yem bo'lmaydi.
//
// Bu himoya "beginner" xaritasida ham, boshqasida ham ishlaydi.
// ============================================================

const NEWBIE_MS = 3 * DAY_MS;

// ============================================================
// RANG — qurilma ID bo'yicha, har kimga har xil
// ============================================================
//
// Oltin burchak (137.508) ishlatiladi: ketma-ket kelgan
// ID'lar ham bir-biridan uzoq rang oladi.
// ============================================================

function hashId(text) {
  let hash = 2166136261;

  const value = String(text);

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash | 0);
}

function playerColor(id) {
  const hash = hashId(id);

  const hue = Math.round((hash * 137.508) % 360);

  // Juda ochiq yoki juda xira bo'lib ketmasligi uchun tor oraliq
  const saturation = 62 + (hash % 4) * 6;
  const lightness = 42 + ((hash >> 3) % 3) * 5;

  return "hsl(" + hue + " " + saturation + "% " + lightness + "%)";
}

// ============================================================
// GEOMETRIYA
// ============================================================

function distanceMeters(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;

  const dLat = (Number(b[0]) - Number(a[0])) * rad;
  const dLng = (Number(b[1]) - Number(a[1])) * rad;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(Number(a[0]) * rad) *
      Math.cos(Number(b[0]) * rad) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;

  const midLat =
    ((points.reduce((sum, p) => sum + Number(p[0]), 0) / points.length) *
      Math.PI) /
    180;

  const kx = 111320 * Math.cos(midLat);
  const ky = 110540;

  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    sum +=
      Number(a[1]) * kx * (Number(b[0]) * ky) -
      Number(b[1]) * kx * (Number(a[0]) * ky);
  }

  return Math.abs(sum / 2);
}

function perimeterMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let total = 0;

  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(points[i - 1], points[i]);
  }

  return total;
}

function centroid(points) {
  let lat = 0;
  let lng = 0;

  points.forEach((p) => {
    lat += Number(p[0]);
    lng += Number(p[1]);
  });

  return [lat / points.length, lng / points.length];
}

function pointInPolygon(point, polygon) {
  if (!Array.isArray(point) || !Array.isArray(polygon)) return false;
  if (polygon.length < 3) return false;

  const x = Number(point[1]);
  const y = Number(point[0]);

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i][1]);
    const yi = Number(polygon[i][0]);
    const xj = Number(polygon[j][1]);
    const yj = Number(polygon[j][0]);

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

// Ko'p nuqtali halqani tekislaymiz — tekshiruvlar tez ishlashi uchun
function simplifyPoints(points, max) {
  if (!Array.isArray(points)) return [];

  const limit = Math.max(8, Number(max) || 120);

  if (points.length <= limit) return points;

  const step = points.length / limit;
  const out = [];

  for (let i = 0; i < limit; i++) {
    out.push(points[Math.floor(i * step)]);
  }

  return out;
}

function bboxOf(points) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  points.forEach((p) => {
    const lat = Number(p[0]);
    const lng = Number(p[1]);

    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  return { minLat, maxLat, minLng, maxLng };
}

// Eski hududning qancha qismi yangi hudud ichida qolgani (0..1)
//
// Faqat burchak nuqtalari emas, hududning ichki maydoni ham
// tekshiriladi: shuning uchun kichkina hududni atrofidan
// aylanib o'tish ham "bosib olish" deb hisoblanadi.
function coverageRatio(target, polygon) {
  if (!Array.isArray(target) || target.length < 3) return 0;
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;

  const ring = simplifyPoints(target, 160);
  const clip = simplifyPoints(polygon, 200);

  let inside = 0;

  ring.forEach((p) => {
    if (pointInPolygon(p, clip)) inside++;
  });

  const ratio = inside / ring.length;

  // Hammasi ichida — to'liq aylanib o'tilgan
  if (inside === ring.length) return 1;

  // Markazi ham ichida bo'lsa — bosib olingan deb hisoblaymiz
  if (ratio > 0.3 && pointInPolygon(centroid(ring), clip)) {
    return Math.max(ratio, RULES.CAPTURE_RATIO);
  }

  return ratio;
}

// Ikki hudud ustma-ust tushgan joyning taxminiy maydoni (m2).
//
// Kesishmani aniq hisoblash o'rniga to'rli (grid) namuna olinadi —
// bu yetarlicha aniq va juda tez ishlaydi.
function overlapArea(a, b) {
  if (!Array.isArray(a) || a.length < 3) return 0;
  if (!Array.isArray(b) || b.length < 3) return 0;

  const ringA = simplifyPoints(a, 160);
  const ringB = simplifyPoints(b, 160);

  const boxA = bboxOf(ringA);
  const boxB = bboxOf(ringB);

  const minLat = Math.max(boxA.minLat, boxB.minLat);
  const maxLat = Math.min(boxA.maxLat, boxB.maxLat);
  const minLng = Math.max(boxA.minLng, boxB.minLng);
  const maxLng = Math.min(boxA.maxLng, boxB.maxLng);

  if (!(maxLat > minLat) || !(maxLng > minLng)) return 0;

  const N = 40;

  let hits = 0;

  for (let i = 0; i < N; i++) {
    const lat = minLat + ((i + 0.5) / N) * (maxLat - minLat);

    for (let j = 0; j < N; j++) {
      const lng = minLng + ((j + 0.5) / N) * (maxLng - minLng);

      if (
        pointInPolygon([lat, lng], ringA) &&
        pointInPolygon([lat, lng], ringB)
      ) {
        hits++;
      }
    }
  }

  if (!hits) return 0;

  const midLat = (((minLat + maxLat) / 2) * Math.PI) / 180;

  const cellW = ((maxLng - minLng) / N) * 111320 * Math.cos(midLat);
  const cellH = ((maxLat - minLat) / N) * 110540;

  return hits * Math.abs(cellW) * cellH;
}

// Koordinata haqiqiy sonmi?
//
// MUHIM: Number(null), Number(""), Number(false), Number([])
// hammasi 0 beradi. Shunday qiymat o'tib ketsa, nuqta Afrika
// yaqinidagi [0, 0] ga tushib, hudud butun yer yuzini qamrab
// oladi. Shuning uchun tur (type) ham tekshiriladi.
function coordinate(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return NaN;
}

function validPoint(point) {
  if (!Array.isArray(point) || point.length < 2) return false;

  const lat = coordinate(point[0]);
  const lng = coordinate(point[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;

  return true;
}

function cleanPoints(points) {
  if (!Array.isArray(points)) return [];

  return points
    .filter(validPoint)
    .slice(0, 3000)
    .map((p) => [coordinate(p[0]), coordinate(p[1])]);
}

// ============================================================
// PLAYER MODELI
// ============================================================

// ============================================================
// USERNAME
// ============================================================
//
// Ism emas — username. Faqat harf, raqam, "_" va "."
// Bitta usernameni ikki kishi ola olmaydi (katta-kichik
// harf farq qilmaydi: "Ali" va "ali" — bitta username).
// ============================================================

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/^@+/, "")
    // Bo'sh joy o'rniga pastki chiziq
    .replace(/\s+/g, "_")
    // Faqat xavfsiz belgilar qoladi (XSS'ga qarshi qo'sh himoya)
    .replace(/[^A-Za-z0-9._]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+/, "")
    .slice(0, RULES.NAME_MAX);
}

// Username to'g'rimi? Xato bo'lsa — sababi qaytadi.
function usernameError(raw) {
  const clean = normalizeName(raw);

  if (clean.length < RULES.NAME_MIN) {
    return (
      "Username kamida " + RULES.NAME_MIN + " ta belgidan iborat bo'lsin"
    );
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(clean)) {
    return "Username harf yoki raqam bilan boshlansin";
  }

  return "";
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

// ============================================================
// ADMIN / BAN / DO'STLIK YORDAMCHILARI
// ============================================================

function isAdminName(name) {
  return nameKey(name) === ADMIN_USERNAME;
}

// Admin harakatiga ruxsat bormi?
//
// ADMIN_KEY qo'yilgan bo'lsa — maxfiy so'z ham to'g'ri bo'lishi kerak.
function adminAllowed(player, key) {
  if (!player || !isAdminName(player.name)) return false;

  if (!ADMIN_KEY) return true;

  return String(key || "") === ADMIN_KEY;
}

function isBanned(player) {
  if (!player) return false;

  const until = Number(player.banUntil || 0);

  if (until === -1) return true;

  return until > Date.now();
}

// Ban haqida qisqa ma'lumot (klient shuni ko'rsatadi)
function banInfo(player) {
  if (!isBanned(player)) return null;

  const until = Number(player.banUntil || 0);

  return {
    until,
    forever: until === -1,
    reason: String(player.banReason || ""),
    at: Number(player.banAt || 0)
  };
}

// days: -1 umrbod, 0 bandan chiqarish
function applyBan(player, days, reason) {
  const count = Number(days);

  if (count === 0) {
    player.banUntil = 0;
    player.banReason = "";
    player.banAt = 0;

    return player;
  }

  player.banUntil = count === -1 ? -1 : Date.now() + count * DAY_MS;
  player.banReason = String(reason || "").slice(0, 120);
  player.banAt = Date.now();

  return player;
}

function idList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  value.forEach((item) => {
    const id = String(item || "").trim();

    if (id) seen.add(id);
  });

  return Array.from(seen).slice(0, 500);
}

// Akkaunt raqami. Ilgari bu QURILMA ID edi — endi u serverda
// yaratiladi, chunki bitta akkauntga bir nechta telefondan
// kirish mumkin va akkaunt qurilmaga bog'lanmagan.
function newPlayerId() {
  return "p-" + crypto.randomUUID();
}

function createPlayer(id, name) {
  const now = Date.now();

  const clean =
    normalizeName(name) || "player_" + hashId(id).toString(36).slice(0, 5);

  return {
    id: String(id),
    name: clean,
    color: playerColor(id),
    location: null,
    area: 0,
    territories: [],
    totalDistance: 0,

    // ---- akkaunt (maxfiy — publicPlayer bularni bermaydi) ----
    //
    // pass     — { salt, hash }: parolning o'zi saqlanmaydi
    // email    — parolni tiklash uchun
    // sessions — kirgan qurilmalar tokenlarining izlari
    email: "",
    emailAt: 0,
    pass: null,
    sessions: [],
    reset: null,
    loginGate: null,

    // profil (rasmning o'zi alohida kalitda — bu yerda versiya)
    avatarAt: 0,

    // moderatsiya
    role: isAdminName(clean) ? "admin" : "user",
    banUntil: 0,
    banReason: "",
    banAt: 0,
    nsfwHits: 0,

    // do'stlik
    friends: [],
    incoming: [],
    outgoing: [],

    // ---- point / naqish / chelenj ----
    //
    // points  — chelenj uchun to'plangan ochko
    // skins   — sotib olingan naqishlar ro'yxati (id)
    // skin    — hozir hududlarga qo'yilgan naqish
    // daily   — bugungi chelenj holati (qarang: _daily.js)
    // notifs  — bildirishnomalar (qarang: _notify.js)
    // orders  — legendar naqish uchun pul buyurtmalari
    // cashout — pointni pulga aylantirish so'rovlari
    points: 0,
    earned: 0,
    skins: [],
    skin: "",
    daily: null,
    notifs: [],
    orders: [],
    cashouts: [],

    // ---- daraja, xarita, uy, obuna ----
    //
    // xp / level  — SERVER hisoblaydi (qarang: _level.js)
    // mapId/maps  — qaysi xaritada o'ynayapti va qaysilari ochiq
    // home        — o'yinchi belgilagan uy (majburiy)
    // plus        — ZoneX Plus obunasi
    // privacy     — joylashuvni kim ko'radi
    // clanId      — qaysi klanda
    // stats       — kunlik/haftalik/oylik natijalar (reyting uchun)
    // newbieUntil — yangi o'yinchi himoyasi shu vaqtgacha
    xp: 0,
    level: 1,
    mapId: "beginner",
    maps: ["beginner"],
    walkXp: null,

    home: null,
    city: "",

    plus: {
      until: 0,
      since: 0,
      months: 0,
      frame: "",
      theme: "default",
      orders: []
    },
    privacy: "public",

    clanId: "",
    badges: [],
    stats: null,
    privacyAsked: false,

    newbieUntil: now + NEWBIE_MS,

    createdAt: now,
    updatedAt: now
  };
}

// ============================================================
// HUDUD YOZUVI
// ============================================================
//
// Hudud tashqi chiziq (`points`) va ixtiyoriy ravishda ichidan
// o'yib olingan joylardan (`holes`) iborat. Teshik boshqa odam
// hududingizning o'rtasini aylanib olganda paydo bo'ladi.
//
// Maydon HAR DOIM shakldan qayta hisoblanadi — shu tufayli
// raqam bilan xarita bir-biriga mos keladi.
// ============================================================

function cleanHoles(holes) {
  return (Array.isArray(holes) ? holes : [])
    .map((hole) => geo.tidyRing(hole))
    .filter((hole) => geo.isRing(hole));
}

function normalizeTerritory(territory, player) {
  const points = geo.tidyRing(territory.points);
  const holes = cleanHoles(territory.holes);

  // Qo'shimcha bo'laklar — yonma-yon, lekin tegib turmagan
  // hududlar qo'shilganda paydo bo'ladi.
  const parts = (Array.isArray(territory.parts) ? territory.parts : [])
    .map((part) => {
      if (!part) return null;

      const ring = geo.tidyRing(part.points);

      if (!geo.isRing(ring)) return null;

      return { points: ring, holes: cleanHoles(part.holes) };
    })
    .filter(Boolean);

  let area = geo.shapeArea(points, holes);

  parts.forEach((part) => {
    area += geo.shapeArea(part.points, part.holes);
  });

  const out = {
    ...territory,
    points,
    ownerId: player.id,
    ownerName: player.name,
    color: player.color,
    area: Math.round(area),

    // Hudud qaysi xaritaga tegishli. Eski (bu maydonsiz)
    // yozuvlar "beginner" da qoladi — ular yo'qolmaydi.
    mapId: maps.mapOf(territory)
  };

  // Daraja va himoya muddati (qarang: _defense.js)
  defense.normalizeTerritoryDefense(out);

  if (holes.length) {
    out.holes = holes;
  } else {
    delete out.holes;
  }

  if (parts.length) {
    // Teshigi yo'q bo'laklarda ortiqcha maydon saqlanmasin
    out.parts = parts.map((part) =>
      part.holes.length ? part : { points: part.points }
    );
  } else {
    delete out.parts;
  }

  return out;
}

// ============================================================
// POINT / NAQISH / CHELENJ / BILDIRISHNOMA
// ============================================================
//
// Bularning barchasi o'yinchi yozuvining ichida yotadi.
// Eski (bu maydonlar yo'q) yozuvlar ham bemalol ochiladi —
// hammasi shu yerda bo'sh qiymat bilan to'ldiriladi.
// ============================================================

function orderList(value, kind) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const out = {
        id: String(item.id || ""),
        status: ["pending", "done", "rejected"].includes(String(item.status))
          ? String(item.status)
          : "pending",
        time: Number(item.time) || 0,
        note: String(item.note || "").slice(0, 120)
      };

      if (kind === "order") {
        out.skinId = String(item.skinId || "");
        out.price = Math.max(0, Math.floor(Number(item.price) || 0));
      } else {
        out.points = Math.max(0, Math.floor(Number(item.points) || 0));
        out.amount = Math.max(0, Math.floor(Number(item.amount) || 0));
        out.method = String(item.method || "").slice(0, 20);
        out.account = String(item.account || "").slice(0, 40);
      }

      return out;
    })
    .filter((item) => item.id)
    .sort((a, b) => b.time - a.time)
    .slice(0, 40);
}

function normalizeGame(player) {
  const points = Number(player.points);

  player.points =
    Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;

  const earned = Number(player.earned);

  player.earned =
    Number.isFinite(earned) && earned > 0 ? Math.floor(earned) : player.points;

  // Sotib olingan naqishlar — faqat katalogda BOR bo'lganlari
  player.skins = Array.from(
    new Set(
      (Array.isArray(player.skins) ? player.skins : [])
        .map((id) => String(id || ""))
        .filter((id) => skins.skinById(id))
    )
  ).slice(0, 60);

  // Qo'yilgan naqish — faqat o'ziniki bo'lsa turadi
  const active = String(player.skin || "");

  player.skin = player.skins.includes(active) ? active : "";

  daily.normalizeDaily(player);
  notify.normalizeNotifs(player);

  player.orders = orderList(player.orders, "order");
  player.cashouts = orderList(player.cashouts, "cashout");

  // ---- XP va daraja ----
  //
  // Daraja HAR DOIM XP dan qayta hisoblanadi. Shuning uchun
  // bazadagi `level` qiymati buzilgan yoki qo'lda yozilgan
  // bo'lsa ham hech narsa o'zgarmaydi.
  const xp = Number(player.xp);

  player.xp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  player.level = level.levelOf(player.xp);

  level.normalizeWalkXp(player, "");

  // ---- xaritalar ----
  //
  // Ochilgan xaritalar ham darajadan hisoblanadi — yopiq
  // xaritaga API orqali "kirib olish" ishlamaydi.
  maps.normalizeMaps(player, player.level);

  // ---- uy ----
  player.home = cleanHome(player.home);

  // ---- maxfiylik ----
  const privacy = String(player.privacy || "");

  player.privacy = ["public", "friends", "private"].includes(privacy)
    ? privacy
    : "public";

  // ---- shahar (reyting uchun) ----
  player.city = cities.cityOf(player) || String(player.city || "");

  // ---- obuna ----
  plus.normalizePlus(player);

  // ---- klan ----
  player.clanId = String(player.clanId || "").slice(0, 40);

  // ---- nishonlar ----
  player.badges = Array.from(
    new Set(
      (Array.isArray(player.badges) ? player.badges : [])
        .map((badge) => String(badge || "").slice(0, 24))
        .filter(Boolean)
    )
  ).slice(0, 40);

  // ---- davriy statistika ----
  stats.normalizeStats(player, Date.now());

  // ---- yangi o'yinchi himoyasi ----
  const newbie = Number(player.newbieUntil);

  // 0 — "himoya tugagan" degani va u SHU HOLICHA qoladi.
  // Faqat maydon umuman yo'q bo'lsa (eski yozuv) yangidan
  // hisoblanadi.
  player.newbieUntil = Number.isFinite(newbie)
    ? Math.max(0, newbie)
    : (Number(player.createdAt) || Date.now()) + NEWBIE_MS;

  return player;
}

// ------------------------------------------------------------
// UY
// ------------------------------------------------------------
//
// O'yinchi o'z uyini belgilaydi — bu MAJBURIY qadam. Uy
// shahridan reyting uchun shahar aniqlanadi va xaritada
// boshlang'ich nuqta bo'lib turadi.
//
// Uyning ANIQ koordinatasi hech qachon boshqalarga
// ko'rsatilmaydi (qarang: publicPlayer).
// ------------------------------------------------------------

function cleanHome(raw) {
  if (!raw || typeof raw !== "object") return null;

  const lat = Number(raw.lat);
  const lng = Number(raw.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    lat,
    lng,
    name: String(raw.name || "").replace(/\s+/g, " ").trim().slice(0, 40),
    at: Number(raw.at) || Date.now()
  };
}

function normalizePlayer(player, id) {
  if (!player || typeof player !== "object") {
    return createPlayer(id, "");
  }

  player.id = String(player.id || id);

  player.name =
    normalizeName(player.name) ||
    "player_" + hashId(player.id).toString(36).slice(0, 5);

  // Rang har doim ID'dan hisoblanadi — hech kimda qizil qotib qolmaydi
  player.color = playerColor(player.id);

  if (!Array.isArray(player.territories)) {
    player.territories = [];
  }

  player.territories = player.territories
    .filter((t) => t && Array.isArray(t.points) && t.points.length >= 3)
    .map((t) => normalizeTerritory(t, player));

  if (!Number.isFinite(Number(player.totalDistance))) {
    player.totalDistance = 0;
  }

  if (
    !player.location ||
    !Number.isFinite(Number(player.location.lat)) ||
    !Number.isFinite(Number(player.location.lng))
  ) {
    player.location = null;
  } else {
    const stamp =
      Number(player.location.time || player.location.updatedAt) || 0;

    player.location = {
      lat: Number(player.location.lat),
      lng: Number(player.location.lng),
      accuracy: Number(player.location.accuracy) || null,
      // Klient `time` maydonini o'qiydi — ikkalasini ham beramiz
      time: stamp,
      updatedAt: stamp
    };
  }

  player.area = player.territories.reduce(
    (sum, t) => sum + (Number(t.area) || 0),
    0
  );

  player.online = Boolean(
    player.location &&
      Date.now() - Number(player.location.time || 0) < RULES.ONLINE_MS
  );

  // ---- profil rasmi ----
  //
  // Bu yerda faqat VERSIYA bor. Rasmning o'zi alohida kalitda
  // yotadi va /api/avatar orqali bir marta olinadi.
  //
  // Eski yozuvlarda rasm ichida qolgan bo'lishi mumkin — u
  // birinchi yozuvda o'z kalitiga ko'chiriladi (writePlayers).
  player.avatarAt = Number(player.avatarAt) || 0;

  if (typeof player.avatar !== "string" || !player.avatar) {
    delete player.avatar;
  } else if (!player.avatarAt) {
    player.avatarAt = Number(player.createdAt) || Date.now();
  }

  // ---- moderatsiya ----
  player.role = isAdminName(player.name) ? "admin" : "user";

  const until = Number(player.banUntil);

  player.banUntil = until === -1 || until > 0 ? until : 0;

  // Muddati o'tgan ban o'zi ochiladi
  if (player.banUntil > 0 && player.banUntil <= Date.now()) {
    player.banUntil = 0;
    player.banReason = "";
  }

  player.banReason = String(player.banReason || "").slice(0, 120);
  player.banAt = Number(player.banAt) || 0;
  player.nsfwHits = Number(player.nsfwHits) || 0;

  // ---- akkaunt (parol, email, sessiyalar) ----
  auth.normalizeAuth(player);

  // ---- do'stlik ----
  player.friends = idList(player.friends);
  player.incoming = idList(player.incoming);
  player.outgoing = idList(player.outgoing);

  // ---- point / naqish / chelenj / bildirishnoma ----
  normalizeGame(player);

  if (!Number.isFinite(Number(player.createdAt))) {
    player.createdAt = Date.now();
  }

  if (!Number.isFinite(Number(player.updatedAt))) {
    player.updatedAt = Date.now();
  }

  return player;
}

// Rasm ma'lumoti juda katta — har 3 sekundda hammaga
// yuborilmaydi. Uning o'rniga faqat `avatarAt` (versiya)
// beriladi, rasmni klient /api/avatar dan bir marta oladi.

// ------------------------------------------------------------
// JOYLASHUVNI XIRALASHTIRISH
// ------------------------------------------------------------
//
// Boshqa o'yinchiga o'yinchining ANIQ GPS nuqtasi hech qachon
// berilmaydi — u har doim bir necha o'n metrga surib
// ko'rsatiladi.
//
// Siljish o'yinchi ID'sidan hisoblanadi va O'ZGARMAYDI. Agar u
// har safar boshqacha bo'lganda, ko'p o'lchovni o'rtalab olib
// haqiqiy nuqtani topish mumkin bo'lardi.
// ------------------------------------------------------------

function fuzzLocation(location, meters) {
  if (!location) return null;

  const hash = hashId(String(location.seed || ""));

  const angle = ((hash % 3600) / 10) * (Math.PI / 180);

  // 0.45R .. 1.0R oralig'ida siljitamiz
  const distance = meters * (0.45 + ((hash >> 11) % 56) / 100);

  const dLat = (distance * Math.cos(angle)) / 111320;

  const cos = Math.cos((Number(location.lat) * Math.PI) / 180);

  const dLng =
    (distance * Math.sin(angle)) / (111320 * (Math.abs(cos) > 0.01 ? cos : 0.01));

  return {
    lat: Math.round((Number(location.lat) + dLat) * 1e5) / 1e5,
    lng: Math.round((Number(location.lng) + dLng) * 1e5) / 1e5,
    accuracy: Math.max(Number(location.accuracy) || 0, meters),
    time: location.time,
    updatedAt: location.updatedAt,

    // Klient buni bilib turadi — "taxminiy joylashuv" deb
    // ko'rsatishi mumkin
    fuzzy: true
  };
}

// Viewer shu o'yinchining joylashuvini ko'ra oladimi va
// qanchalik aniq
function locationFor(player, viewerId, isSelf) {
  if (isSelf) return player.location;

  if (!player.location) return null;

  const isFriend =
    viewerId && Array.isArray(player.friends) &&
    player.friends.includes(String(viewerId));

  if (player.privacy === "private") return null;

  if (player.privacy === "friends" && !isFriend) return null;

  const seeded = { ...player.location, seed: player.id };

  // Do'stlar yaqinroq ko'radi, begonalar uzoqroq
  return fuzzLocation(seeded, isFriend ? 70 : 160);
}

// ============================================================
// OCHIQ (PUBLIC) KO'RINISH
// ============================================================
//
// MUHIM: bu yer OQ RO'YXAT — pastda sanalgan maydonlargina
// tashqariga chiqadi. Parol (`pass`), sessiya tokenlari
// (`sessions`), tiklash kodi (`reset`), email manzili va UY
// koordinatasi bu ro'yxatda YO'Q, shuning uchun ular hech
// qachon begonaga tushmaydi. Yangi maxfiy maydon qo'shsangiz —
// bu ro'yxatga QO'SHMANG.
//
// options.mapId berilsa — hududlar faqat o'sha xaritadan
// qaytadi (xaritalar bir-biriga aralashmasin).
// ============================================================

function publicPlayer(player, viewerId, options) {
  const isSelf = Boolean(viewerId && String(player.id) === String(viewerId));

  // Yangi yaratilgan (hali normalizePlayer'dan o'tmagan) yozuv
  // ham bemalol chiqsin — obuna maydoni bo'sh bo'lishi mumkin.
  plus.normalizePlus(player);

  const opts = options || {};

  const now = Date.now();

  // Hududlar — faqat so'ralgan xaritadan
  const list = opts.mapId
    ? maps.territoriesOn(player, opts.mapId)
    : player.territories;

  const area = list.reduce((sum, t) => sum + (Number(t.area) || 0), 0);

  const view = level.levelView(player);

  const out = {
    id: player.id,
    name: player.name,
    color: player.color,

    location: locationFor(player, viewerId, isSelf),

    area,

    // Hududlar himoya holati bilan birga ketadi — klient
    // ustidagi soatni shundan chizadi
    territories: list.map((territory) => ({
      ...territory,
      defense: defense.defenseView(territory, now)
    })),

    totalDistance: player.totalDistance,

    avatarAt: player.avatarAt,
    hasAvatar: Number(player.avatarAt) > 0,

    role: player.role,
    ban: banInfo(player),

    friends: player.friends,

    // Qo'yilgan naqish — buni HAMMA ko'radi, chunki hudud
    // xaritada o'sha naqish bilan chiziladi
    skin: player.skin || "",

    // Daraja va XP ochiq: reyting va profil uchun kerak
    level: view.level,
    xp: view.xp,
    levelInto: view.into,
    levelNeed: view.need,
    levelPercent: view.percent,

    // ZoneX Plus nishoni va ramkasi ham ochiq — u ko'rinish
    plus: plus.isPlus(player),
    frame: plus.isPlus(player) ? player.plus.frame : "",
    badges: player.badges,

    clanId: player.clanId || "",
    city: player.city || "",

    // Yangi o'yinchi himoyasi — hujum qilib bo'lmasligini
    // klient oldindan aytib turishi uchun
    newbie: Number(player.newbieUntil) > now,

    online: player.online,
    createdAt: player.createdAt,
    updatedAt: player.updatedAt
  };

  if (isSelf) {
    out.incoming = player.incoming;
    out.outgoing = player.outgoing;
    out.nsfwHits = player.nsfwHits;

    // ---- point / naqish / chelenj / bildirishnoma ----
    //
    // Faqat o'ziga: boshqalar necha pointi borligini bilmaydi.
    out.points = player.points;
    out.earned = player.earned;
    out.skins = player.skins;
    out.notifUnread = notify.unreadCount(player);
    out.dailyReady = daily.readyCount(player);

    // ---- xarita, uy, maxfiylik, obuna ----
    out.mapId = player.mapId;
    out.maps = player.maps;
    out.home = player.home;
    out.privacy = player.privacy;
    out.privacyAsked = Boolean(player.privacyAsked);
    out.newbieUntil = player.newbieUntil;

    out.plusInfo = {
      active: plus.isPlus(player),
      until: player.plus.until,
      daysLeft: plus.daysLeft(player),
      frame: player.plus.frame,
      theme: player.plus.theme
    };

    out.stats = player.stats;

    // O'ziga: email BOR-yo'qligi va yashirilgan ko'rinishi.
    // To'liq manzil qaytmaydi — u faqat bazada qoladi.
    out.hasEmail = Boolean(player.email);
    out.emailMasked = auth.maskEmail(player.email);
    out.devices = Array.isArray(player.sessions) ? player.sessions.length : 0;
  } else {
    // Boshqalar uchun: menga so'rov yuborganmi / yubordimmi —
    // buni klient o'z yozuvidan biladi
    out.incoming = [];
    out.outgoing = [];
  }

  return out;
}

function publicList(players, viewerId, options) {
  const list = Array.isArray(players) ? players : Object.values(players);

  const now = Date.now();

  return list
    .map((player) => {
      const copy = publicPlayer(player, viewerId, options);

      copy.online = Boolean(
        player.location &&
          now - Number(player.location.time || 0) < RULES.ONLINE_MS
      );

      return copy;
    })
    .sort((a, b) => Number(b.area || 0) - Number(a.area || 0));
}

function rebuildArea(player) {
  player.area = player.territories.reduce(
    (sum, t) => sum + (Number(t.area) || 0),
    0
  );

  return player.area;
}

// ============================================================
// REDIS (Upstash REST) DRAYVERI
// ============================================================

async function redisPipeline(commands) {
  const response = await fetch(REDIS_URL + "/pipeline", {
    method: "POST",

    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json"
    },

    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    throw new Error("Redis xatosi: " + response.status);
  }

  const data = await response.json();

  const rows = Array.isArray(data) ? data : [data];

  // ---------------------------------------------------------
  // MUHIM: Upstash buyruq xatosini HTTP 200 ICHIDA qaytaradi:
  //
  //   [ { "error": "ERR max daily request limit exceeded" } ]
  //
  // Ilgari bu xato e'tiborsiz qolardi va `row.result` undefined
  // bo'lib qaytardi. Ya'ni yozish amali muvaffaqiyatli
  // ko'rinardi, aslida esa hech narsa saqlanmagan bo'lardi —
  // ma'lumot jimgina yo'qolardi.
  //
  // Endi xato ochiq qaytadi: klient hududni saqlab turadi va
  // o'zi qayta yuboradi.
  // ---------------------------------------------------------

  const failed = rows.find((row) => row && row.error);

  if (failed) {
    const error = new Error("Redis buyrug'i rad etildi: " + failed.error);

    error.status = 503;

    throw error;
  }

  return rows.map((row) => row.result);
}

function parseRow(raw) {
  if (!raw) return null;

  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null; // buzilgan yozuvni tashlab ketamiz
  }
}

async function redisReadAll() {
  const [ids] = await redisPipeline([["SMEMBERS", IDS_KEY]]);

  if (!Array.isArray(ids) || !ids.length) return {};

  // Ikkala MGET bitta HTTP so'rovda ketadi — qo'shimcha kechikish yo'q
  const [rows, liveRows] = await redisPipeline([
    ["MGET"].concat(ids.map((id) => PLAYER_KEY(id))),
    ["MGET"].concat(ids.map((id) => LIVE_KEY(id)))
  ]);

  const players = {};

  ids.forEach((id, index) => {
    const player = parseRow(rows && rows[index]);

    if (!player || !player.id) return;

    applyLive(player, parseRow(liveRows && liveRows[index]));

    players[String(player.id)] = player;
  });

  return players;
}

async function redisWriteLive(id, live) {
  await redisPipeline([["SET", LIVE_KEY(id), JSON.stringify(live)]]);
}

async function redisWrite(players) {
  const commands = [];

  players.forEach((player) => {
    commands.push(["SET", PLAYER_KEY(player.id), JSON.stringify(player)]);
    commands.push(["SADD", IDS_KEY, String(player.id)]);
  });

  if (!commands.length) return;

  await redisPipeline(commands);
}

// ============================================================
// FAYL DRAYVERI
// ============================================================

// Butun faylni o'qiymiz: { players: [...], chats: { ... } }
function fileReadRaw() {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};

    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8") || "{}") || {};
  } catch (error) {
    console.error("world faylini o'qib bo'lmadi:", error.message);
    return {};
  }
}

function fileWriteRaw(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("world faylini saqlab bo'lmadi:", error.message);
  }
}

// ============================================================
// "JONLI" YOZUV (joylashuv + jami yurgan masofa)
// ============================================================
//
// O'yinchi yozuvida ham eski nusxasi qolib ketaveradi — u
// zaxira bo'lib xizmat qiladi. O'qishda esa HAR DOIM jonli
// yozuv ustun turadi, chunki u yangiroq.
// ============================================================

function applyLive(player, live) {
  if (!player || !live) return player;

  if (
    Number.isFinite(Number(live.lat)) &&
    Number.isFinite(Number(live.lng))
  ) {
    player.location = {
      lat: Number(live.lat),
      lng: Number(live.lng),
      accuracy: Number.isFinite(Number(live.accuracy))
        ? Number(live.accuracy)
        : null,
      time: Number(live.time) || 0,
      updatedAt: Number(live.time) || 0
    };
  }

  if (Number.isFinite(Number(live.totalDistance))) {
    player.totalDistance = Number(live.totalDistance);
  }

  return player;
}

function liveOf(player) {
  const location = player && player.location ? player.location : null;

  return {
    lat: location ? location.lat : null,
    lng: location ? location.lng : null,
    accuracy: location ? location.accuracy : null,
    time: location ? Number(location.time) || 0 : 0,
    totalDistance: Number(player && player.totalDistance) || 0
  };
}

function fileReadAll() {
  const raw = fileReadRaw();

  const live = raw.live && typeof raw.live === "object" ? raw.live : {};

  const players = {};

  // Eski format: { players: [ ... ] }
  if (Array.isArray(raw.players)) {
    raw.players.forEach((p) => {
      if (p && p.id) players[String(p.id)] = p;
    });
  } else if (raw.players && typeof raw.players === "object") {
    Object.assign(players, raw.players);
  }

  Object.keys(players).forEach((id) => {
    applyLive(players[id], live[id]);
  });

  return players;
}

function fileWriteLive(id, live) {
  const raw = fileReadRaw();

  if (!raw.live || typeof raw.live !== "object") raw.live = {};

  raw.live[String(id)] = live;

  fileWriteRaw(raw);
}

function fileWriteAll(players) {
  const raw = fileReadRaw();

  raw.players = Object.values(players);

  fileWriteRaw(raw);
}

// ============================================================
// UMUMIY API
// ============================================================

async function readPlayers() {
  const players = USE_REDIS ? await redisReadAll() : fileReadAll();

  Object.keys(players).forEach((id) => {
    players[id] = normalizePlayer(players[id], id);
  });

  return players;
}

// Faqat o'zgargan o'yinchilarni yozamiz — boshqalarnikini o'chirmaydi
async function writePlayers(changed) {
  const list = Array.isArray(changed) ? changed : [changed];

  const clean = list.filter(Boolean);

  if (!clean.length) return;

  clean.forEach((player) => {
    player.updatedAt = Date.now();
  });

  // Eski yozuvlarda rasm ichida qolgan bo'lsa — o'z kalitiga
  // ko'chiramiz va o'yinchi yozuvidan olib tashlaymiz.
  for (const player of clean) {
    if (typeof player.avatar === "string" && player.avatar) {
      await writeAvatar(player.id, player.avatar, player.avatarAt);
    }

    delete player.avatar;
  }

  if (USE_REDIS) {
    await redisWrite(clean);
    return;
  }

  const all = fileReadAll();

  clean.forEach((player) => {
    all[String(player.id)] = player;
  });

  fileWriteAll(all);
}

// ============================================================
// PROFIL RASMI — alohida kalitda
// ============================================================

async function redisGet(key) {
  const [raw] = await redisPipeline([["GET", key]]);

  return raw;
}

// Rasmni o'qish. Eski (ko'chirilmagan) yozuvlar uchun
// o'yinchi yozuvining ichiga ham qaraydi.
async function readAvatar(id) {
  const key = String(id);

  if (USE_REDIS) {
    const own = parseRow(await redisGet(AVATAR_KEY(key)));

    if (own && typeof own.avatar === "string") return own;

    const player = parseRow(await redisGet(PLAYER_KEY(key)));

    if (player && typeof player.avatar === "string" && player.avatar) {
      return { avatar: player.avatar, avatarAt: Number(player.avatarAt) || 0 };
    }

    return { avatar: "", avatarAt: 0 };
  }

  const raw = fileReadRaw();

  const own = raw.avatars && raw.avatars[key];

  if (own && typeof own.avatar === "string") return own;

  const all = Array.isArray(raw.players)
    ? raw.players.find((p) => p && String(p.id) === key)
    : raw.players && raw.players[key];

  if (all && typeof all.avatar === "string" && all.avatar) {
    return { avatar: all.avatar, avatarAt: Number(all.avatarAt) || 0 };
  }

  return { avatar: "", avatarAt: 0 };
}

async function writeAvatar(id, avatar, avatarAt) {
  const key = String(id);

  const record = {
    avatar: String(avatar || ""),
    avatarAt: Number(avatarAt) || 0
  };

  if (USE_REDIS) {
    await redisPipeline([["SET", AVATAR_KEY(key), JSON.stringify(record)]]);
    return record;
  }

  const raw = fileReadRaw();

  if (!raw.avatars || typeof raw.avatars !== "object") raw.avatars = {};

  raw.avatars[key] = record;

  fileWriteRaw(raw);

  return record;
}

// Joylashuvni yozadi. O'YINCHI YOZUVIGA UMUMAN TEGMAYDI —
// shuning uchun ayni damda egallanayotgan hududni o'chira olmaydi.
async function writeLive(player) {
  if (!player || player.id == null) return;

  const live = liveOf(player);

  if (USE_REDIS) {
    await redisWriteLive(String(player.id), live);
    return;
  }

  fileWriteLive(String(player.id), live);
}

// ============================================================
// QULF (LOCK) — bir vaqtda kelgan o'zgarishlar uchun
// ============================================================
//
// Har bir so'rov butun bazani o'qib, o'zgartirib, qayta yozadi.
// Ikki odam bir soniyada bir hududga da'vo qilsa, keyingi yozuv
// birinchisini bosib ketishi mumkin edi — bitta bosib olish
// yo'qolardi.
//
// Endi hududni o'zgartiradigan amallar navbatga qo'yiladi:
//
//   - Redis bo'lsa: umumiy (barcha serverlar uchun) qulf,
//     o'zi ochiladigan muddat bilan — server o'lib qolsa ham
//     qulf abadiy qotib qolmaydi;
//   - fayl bo'lsa: bitta jarayon ichidagi navbat yetarli.
//
// Qulf ololmasak — 503 qaytadi va klient hududni saqlab turib
// o'zi qayta yuboradi (flushPending).
// ============================================================

const LOCK_TTL_MS = 8000;
const LOCK_TRIES = 40;
const LOCK_WAIT_MS = 70;

let localQueue = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Qulfni faqat EGASI ochadi (muddati o'tib boshqa birov olgan
// bo'lsa, uni ochib yubormaymiz).
const UNLOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then " +
  "return redis.call('del', KEYS[1]) else return 0 end";

async function redisAcquire(key, token) {
  const [result] = await redisPipeline([
    ["SET", key, token, "NX", "PX", String(LOCK_TTL_MS)]
  ]);

  return result === "OK";
}

// Qulfni ochish EVAL orqali bo'lishi kerak — u atomik.
//
// Ammo EVAL biror sababdan ishlamasa (plan cheklovi, eski server),
// qulf ochilmay qolar va HAR BIR da'vo qulf muddati tugashini
// kutib o'tirardi — sekin, keyin esa 503. Shuning uchun zaxira
// yo'l bor: kalit hali ham BIZNIKI bo'lsa, oddiy DEL bilan
// ochamiz. Bu atomik emas, lekin qulfsiz qolishdan yaxshiroq.
async function redisRelease(key, token) {
  try {
    await redisPipeline([["EVAL", UNLOCK_SCRIPT, "1", key, token]]);
    return;
  } catch {
    /* pastdagi zaxira yo'l bilan urinamiz */
  }

  try {
    const [current] = await redisPipeline([["GET", key]]);

    if (current === token) {
      await redisPipeline([["DEL", key]]);
    }
  } catch {
    /* muddati o'zi tugaydi */
  }
}

async function withLock(name, fn) {
  if (!USE_REDIS) {
    // Bitta jarayon — oddiy navbat yetarli
    const run = localQueue.then(() => fn());

    localQueue = run.then(
      () => undefined,
      () => undefined
    );

    return run;
  }

  const key = LOCK_KEY(name);

  const token =
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

  for (let i = 0; i < LOCK_TRIES; i++) {
    let taken = false;

    try {
      taken = await redisAcquire(key, token);
    } catch (error) {
      // Redis javob bermayapti — qulfsiz davom etgandan ko'ra
      // ochiq xato qaytargan yaxshi
      error.status = 503;
      throw error;
    }

    if (taken) {
      try {
        return await fn();
      } finally {
        await redisRelease(key, token);
      }
    }

    await sleep(LOCK_WAIT_MS);
  }

  const busy = new Error("Server band — birozdan keyin qayta urinamiz");

  busy.status = 503;

  throw busy;
}

// ============================================================
// TASHXIS — KV nega ulanmadi?
// ============================================================
//
// Vercel'da muhit o'zgaruvchilarini ko'rib bo'lmaydi, shuning
// uchun /api/world javobida QAYSI NOMLAR topilgani aytiladi.
//
// Faqat NOMLAR — qiymatlar (token) hech qachon qaytmaydi.
// Ro'yxat qat'iy: begona o'zgaruvchi nomi sizib chiqmaydi.
// ============================================================

const KV_ENV_NAMES = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN"
];

function storageReport() {
  const found = KV_ENV_NAMES.filter((name) =>
    String(process.env[name] || "").trim()
  );

  const report = {
    mode: USE_REDIS ? "kv" : "file",
    envFound: found
  };

  if (USE_REDIS) return report;

  if (!found.length) {
    report.reason =
      "KV o'zgaruvchilari topilmadi. Vercel: Settings > Environment " +
      "Variables > Production, keyin ALBATTA Redeploy qiling.";
  } else {
    report.reason =
      "Juftlik to'liq emas — URL va TOKEN ikkalasi ham kerak. " +
      "Topilgani: " + found.join(", ");
  }

  return report;
}

// ============================================================
// KLANLAR VA HAMKOR JOYLAR
// ============================================================
//
// Ikkalasi ham bitta ro'yxat bo'lib saqlanadi: Redis'da bitta
// kalitda, faylda esa `clans` / `places` bo'limida.
//
// Ular kam o'zgaradi (klan ochish, joy qo'shish), shuning uchun
// alohida indeks yoki kalit ajratish shart emas.
// ============================================================

async function readBlob(key, fileKey) {
  if (USE_REDIS) {
    const [raw] = await redisPipeline([["GET", key]]);

    return parseRow(raw) || [];
  }

  const data = fileReadRaw();

  return Array.isArray(data[fileKey]) ? data[fileKey] : [];
}

async function writeBlob(key, fileKey, list) {
  if (USE_REDIS) {
    await redisPipeline([["SET", key, JSON.stringify(list)]]);
    return;
  }

  const data = fileReadRaw();

  data[fileKey] = list;

  fileWriteRaw(data);
}

async function readClans() {
  return clans.normalizeClanList(await readBlob(CLANS_KEY, "clans"));
}

async function writeClans(list) {
  await writeBlob(CLANS_KEY, "clans", clans.normalizeClanList(list));
}

async function readPlaces() {
  return places.normalizeList(await readBlob(PLACES_KEY, "places"));
}

async function writePlaces(list) {
  await writeBlob(PLACES_KEY, "places", places.normalizeList(list));
}

// Dunyoni QAYSI xaritadan olish kerak?
//
// Klient so'ragan xarita o'yinchi uchun ochiq bo'lmasa —
// uning o'z xaritasi qaytadi. Ya'ni yopiq xaritani API orqali
// "so'rab olish" ishlamaydi.
function mapForViewer(players, viewerId, wanted) {
  const me = players[String(viewerId || "")];

  if (!me) return maps.DEFAULT_MAP;

  const want = String(wanted || "");

  if (want && me.maps.includes(want)) return want;

  return me.mapId || maps.DEFAULT_MAP;
}

async function getWorld(viewerId, wantedMap) {
  const players = await readPlayers();

  const mapId = mapForViewer(players, viewerId, wantedMap);

  return {
    players: publicList(players, viewerId, { mapId }),
    mapId,
    storage: USE_REDIS ? "kv" : "file",
    storageInfo: storageReport(),
    time: Date.now()
  };
}

// ============================================================
// SUHBAT (CHAT)
// ============================================================
//
// Xabarlar o'yinchilardan alohida saqlanadi, chunki ular
// tez o'sadi va har bir so'rovda kerak emas.
// ============================================================

function chatKey(a, b) {
  return [String(a), String(b)].sort().join("|");
}

function cleanMessage(text) {
  return String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RULES.MESSAGE_MAX);
}

async function readChat(a, b) {
  const key = chatKey(a, b);

  if (USE_REDIS) {
    const [raw] = await redisPipeline([["GET", "zonex:chat:" + key]]);

    if (!raw) return [];

    try {
      const list = typeof raw === "string" ? JSON.parse(raw) : raw;

      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  const file = fileReadRaw();

  const list = file.chats && file.chats[key];

  return Array.isArray(list) ? list : [];
}

async function appendMessage(a, b, message) {
  const key = chatKey(a, b);

  const list = (await readChat(a, b)).concat([message]).slice(-RULES.CHAT_MAX);

  if (USE_REDIS) {
    await redisPipeline([["SET", "zonex:chat:" + key, JSON.stringify(list)]]);

    return list;
  }

  const file = fileReadRaw();

  if (!file.chats || typeof file.chats !== "object") file.chats = {};

  file.chats[key] = list;

  fileWriteRaw(file);

  return list;
}

// ============================================================
// AKKAUNTNI O'CHIRISH
// ============================================================
//
// O'yinchi yozuvi, joylashuvi va profil rasmi bilan birga
// o'chadi. Yozishmalar tegilmaydi — ular juft kalitda yotadi
// va ikkinchi tarafga ham tegishli.
// ============================================================

async function deletePlayers(ids) {
  const list = (Array.isArray(ids) ? ids : [ids])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  if (!list.length) return 0;

  if (USE_REDIS) {
    const commands = [];

    list.forEach((id) => {
      commands.push(["DEL", PLAYER_KEY(id)]);
      commands.push(["DEL", LIVE_KEY(id)]);
      commands.push(["DEL", AVATAR_KEY(id)]);
      commands.push(["SREM", IDS_KEY, id]);
    });

    await redisPipeline(commands);

    return list.length;
  }

  const raw = fileReadRaw();

  const gone = new Set(list);

  if (Array.isArray(raw.players)) {
    raw.players = raw.players.filter((p) => p && !gone.has(String(p.id)));
  }

  ["avatars", "live"].forEach((box) => {
    if (raw[box] && typeof raw[box] === "object") {
      list.forEach((id) => delete raw[box][id]);
    }
  });

  fileWriteRaw(raw);

  return list.length;
}

// Ism band emasmi? (o'zinikidan boshqa odamda bormi)
function isNameTaken(players, name, ownId) {
  const key = nameKey(name);

  if (!key) return false;

  return Object.values(players).some(
    (player) =>
      String(player.id) !== String(ownId) && nameKey(player.name) === key
  );
}

// Username bo'yicha topish (kirish uchun)
function findByName(players, name) {
  const key = nameKey(name);

  if (!key) return null;

  return (
    Object.values(players).find((player) => nameKey(player.name) === key) ||
    null
  );
}

// Email bo'yicha topish (parolni tiklashda username ham,
// email ham qabul qilinadi)
function findByEmail(players, email) {
  const key = auth.normalizeEmail(email);

  if (!key) return null;

  return (
    Object.values(players).find(
      (player) => auth.normalizeEmail(player.email) === key
    ) || null
  );
}

// Bitta emailga bitta akkaunt — aks holda parolni tiklash
// oynasida qaysi akkaunt ekani chalkashib ketadi.
function isEmailTaken(players, email, ownId) {
  const key = auth.normalizeEmail(email);

  if (!key) return false;

  return Object.values(players).some(
    (player) =>
      String(player.id) !== String(ownId) &&
      auth.normalizeEmail(player.email) === key
  );
}

module.exports = {
  RULES,
  ADMIN_USERNAME,

  // saqlash
  readPlayers,
  writePlayers,
  storageReport,

  writeLive,
  deletePlayers,
  readAvatar,
  writeAvatar,
  withLock,
  getWorld,

  // suhbat
  readChat,
  appendMessage,
  cleanMessage,
  chatKey,

  // model
  createPlayer,
  normalizePlayer,
  normalizeTerritory,
  publicPlayer,
  publicList,
  rebuildArea,
  normalizeName,
  usernameError,
  nameKey,
  isNameTaken,
  playerColor,
  newPlayerId,

  // akkaunt qidirish
  findByName,
  findByEmail,
  isEmailTaken,

  // point / naqish / chelenj / bildirishnoma
  normalizeGame,
  daily,
  notify,
  skins,

  // daraja, xarita, himoya, obuna, statistika, shahar
  level,
  maps,
  defense,
  plus,
  stats,
  cities,
  places,
  clans,

  // klanlar va hamkor joylar ombori
  readClans,
  writeClans,
  readPlaces,
  writePlaces,

  cleanHome,
  fuzzLocation,
  NEWBIE_MS,

  // moderatsiya / do'stlik
  isAdminName,
  adminAllowed,
  isBanned,
  banInfo,
  applyBan,
  idList,

  // geometriya
  distanceMeters,
  perimeterMeters,
  polygonArea,
  pointInPolygon,
  coverageRatio,
  overlapArea,
  simplifyPoints,
  centroid,
  cleanPoints,
  validPoint,

  // aniq geometriya (union / difference / intersection)
  geo,

  USE_REDIS
};
