// api/_places.js
// ============================================================
// HAMKOR JOYLAR (BIZNES REKLAMA)
// ============================================================
//
// ZONEX'ni moliyalashtirish yo'li: mahalliy bizneslar hamkor
// bo'ladi va o'z joyini xaritaga qo'yadi.
//
//   📍 "Coffee X — ZoneX hamkori"
//
// O'yinchi o'sha joyning yonidan o'tganda maxsus taklif
// ko'rsatiladi ("Bugun kofega 20% chegirma"). Biznes esa shu
// ko'rsatuv uchun to'laydi.
//
// Reklama uchun murojaat: Telegram @Abduumalikov_7
//
// ZoneX Plus obunachilariga reklama KO'RSATILMAYDI.
//
// Joylarni admin qo'shadi (POST /api/places). Ular o'yinchi
// yozuvlaridan alohida, "zonex:places" kalitida saqlanadi.
// ============================================================

// Reklama uchun aloqa — klient shu yerdan oladi
const CONTACT = {
  telegram: "@Abduumalikov_7",
  url: "https://t.me/Abduumalikov_7",
  title: "Reklama uchun murojaat",
  about:
    "Biznesingizni ZONEX xaritasiga qo'ying — yaqindan o'tgan " +
    "o'yinchilar taklifingizni ko'radi."
};

// O'yinchi shu masofaga yaqinlashsa taklif ko'rinadi (metr)
const NEAR_M = 250;

// Bitta taklif shuncha vaqtdan keyin qayta ko'rsatiladi (ms)
const REPEAT_MS = 6 * 60 * 60 * 1000;

// Bazada saqlanadigan eng ko'p joy
const MAX_PLACES = 300;

function makePlaceId() {
  return (
    "pl-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

function text(value, max) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Bitta joy yozuvini shaklga solamiz
function normalizePlace(raw) {
  if (!raw || typeof raw !== "object") return null;

  const lat = Number(raw.lat);
  const lng = Number(raw.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const name = text(raw.name, 40);

  if (!name) return null;

  const radius = Number(raw.radius);

  return {
    id: String(raw.id || makePlaceId()),

    name,
    kind: text(raw.kind, 20) || "biznes",

    // Xaritada ko'rinadigan matn
    offer: text(raw.offer, 90),
    about: text(raw.about, 160),

    // Bog'lanish (biznesning o'zi bergani)
    contact: text(raw.contact, 60),

    lat,
    lng,

    radius:
      Number.isFinite(radius) && radius > 0
        ? Math.min(2000, Math.max(50, Math.round(radius)))
        : NEAR_M,

    // Faolmi (to'lov tugasa admin o'chiradi)
    active: raw.active !== false,

    // Obuna muddati — o'tgach o'zi ko'rinmay qoladi
    until: Number(raw.until) || 0,

    createdAt: Number(raw.createdAt) || Date.now(),

    // Necha marta ko'rsatilgan — biznesga hisobot uchun
    views: Math.max(0, Math.floor(Number(raw.views) || 0))
  };
}

function normalizeList(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(normalizePlace)
    .filter(Boolean)
    .slice(0, MAX_PLACES);
}

// Joy hozir ko'rinadimi
function isLive(place, now) {
  const time = Number(now) || Date.now();

  if (!place.active) return false;

  return !place.until || place.until > time;
}

// ------------------------------------------------------------
// MASOFA
// ------------------------------------------------------------

function metersBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;

  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// O'yinchiga yaqin joylar (eng yaqinidan boshlab)
function nearby(places, lat, lng, now) {
  const a = Number(lat);
  const b = Number(lng);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];

  const time = Number(now) || Date.now();

  return places
    .filter((place) => isLive(place, time))
    .map((place) => ({
      place,
      meters: Math.round(metersBetween(a, b, place.lat, place.lng))
    }))
    .filter((row) => row.meters <= (Number(row.place.radius) || NEAR_M))
    .sort((x, y) => x.meters - y.meters)
    .slice(0, 5);
}

// Xaritada ko'rsatish uchun: kerak bo'lgan qismidagilar
function visible(places, box, now) {
  const time = Number(now) || Date.now();

  const live = places.filter((place) => isLive(place, time));

  if (!box) return live.slice(0, 120);

  return live
    .filter(
      (place) =>
        place.lat >= box.south &&
        place.lat <= box.north &&
        place.lng >= box.west &&
        place.lng <= box.east
    )
    .slice(0, 120);
}

module.exports = {
  CONTACT,
  NEAR_M,
  REPEAT_MS,
  MAX_PLACES,

  makePlaceId,
  normalizePlace,
  normalizeList,
  isLive,
  metersBetween,
  nearby,
  visible
};
