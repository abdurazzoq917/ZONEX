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

const FILE_PATH = process.env.VERCEL
  ? path.join("/tmp", "zonex-world.json")
  : path.join(__dirname, "..", "world.json");

// ============================================================
// O'YIN QOIDALARI
// ============================================================

const RULES = {
  // Yurish tezligi chegarasi (km/soat).
  // Bundan tez bo'lsa — mashina / velosiped / samokat deb hisoblanadi.
  MAX_SPEED_KMH: 12,

  // Butun aylanish bo'yicha o'rtacha tezlik chegarasi (km/soat).
  MAX_AVG_SPEED_KMH: 10,

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

  // Username uzunligi
  NAME_MIN: 3,
  NAME_MAX: 16
};

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

function validPoint(point) {
  if (!Array.isArray(point) || point.length < 2) return false;

  const lat = Number(point[0]);
  const lng = Number(point[1]);

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
    .map((p) => [Number(p[0]), Number(p[1])]);
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

function createPlayer(id, name) {
  const now = Date.now();

  return {
    id: String(id),
    name: normalizeName(name) || "player_" + hashId(id).toString(36).slice(0, 5),
    color: playerColor(id),
    location: null,
    area: 0,
    territories: [],
    totalDistance: 0,
    createdAt: now,
    updatedAt: now
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
    .map((t) => ({
      ...t,
      ownerId: player.id,
      ownerName: player.name,
      color: player.color,
      area: Number(t.area) || 0
    }));

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

  if (!Number.isFinite(Number(player.createdAt))) {
    player.createdAt = Date.now();
  }

  if (!Number.isFinite(Number(player.updatedAt))) {
    player.updatedAt = Date.now();
  }

  return player;
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

  return (Array.isArray(data) ? data : [data]).map((row) => row.result);
}

async function redisReadAll() {
  const [ids] = await redisPipeline([["SMEMBERS", IDS_KEY]]);

  if (!Array.isArray(ids) || !ids.length) return {};

  const [rows] = await redisPipeline([
    ["MGET"].concat(ids.map((id) => PLAYER_KEY(id)))
  ]);

  const players = {};

  ids.forEach((id, index) => {
    const raw = rows && rows[index];

    if (!raw) return;

    try {
      const player = typeof raw === "string" ? JSON.parse(raw) : raw;

      if (player && player.id) {
        players[String(player.id)] = player;
      }
    } catch {
      /* buzilgan yozuvni tashlab ketamiz */
    }
  });

  return players;
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

function fileReadAll() {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};

    const raw = JSON.parse(fs.readFileSync(FILE_PATH, "utf8") || "{}");

    if (!raw) return {};

    // Eski format: { players: [ ... ] }
    if (Array.isArray(raw.players)) {
      const players = {};

      raw.players.forEach((p) => {
        if (p && p.id) players[String(p.id)] = p;
      });

      return players;
    }

    if (raw.players && typeof raw.players === "object") {
      return raw.players;
    }

    return {};
  } catch (error) {
    console.error("world faylini o'qib bo'lmadi:", error.message);
    return {};
  }
}

function fileWriteAll(players) {
  try {
    fs.writeFileSync(
      FILE_PATH,
      JSON.stringify({ players: Object.values(players) }, null, 2)
    );
  } catch (error) {
    console.error("world faylini saqlab bo'lmadi:", error.message);
  }
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

async function getWorld() {
  const players = await readPlayers();

  return {
    players: Object.values(players).sort(
      (a, b) => Number(b.area || 0) - Number(a.area || 0)
    ),
    storage: USE_REDIS ? "kv" : "file",
    time: Date.now()
  };
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

module.exports = {
  RULES,

  // saqlash
  readPlayers,
  writePlayers,
  getWorld,

  // model
  createPlayer,
  normalizePlayer,
  rebuildArea,
  normalizeName,
  usernameError,
  nameKey,
  isNameTaken,
  playerColor,

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

  USE_REDIS
};
