// api/_plus.js
// ============================================================
// ZONEX PLUS — oylik obuna
// ============================================================
//
// Narxi: oyiga 19 990 so'm.
//
// Nima beradi:
//
//   - reklamasiz foydalanish
//   - maxsus profil ramkasi (oltin/neon)
//   - qo'shimcha statistika (haftalik, oylik, tarix)
//   - maxsus nishonlar (badge)
//   - profilni bezash (ramka + fon)
//   - qo'shimcha xarita ko'rinishlari (tungi, sun'iy yo'ldosh,
//     sodda)
//
// NIMA BERMAYDI (ataylab):
//
//   - hudud himoyasini uzaytirmaydi
//   - XP yoki daraja tezlatmaydi
//   - yopiq xaritalarni ochmaydi
//
// Ya'ni Plus — KO'RINISH va QULAYLIK, o'yindagi kuch emas.
// Aks holda o'yin "pulga sotib olinadigan" bo'lib qolardi.
//
// To'lov avtomatik emas: o'yinchi so'rov yuboradi, admin
// tasdiqlaydi (api/plus.js), shundan keyin obuna 30 kunga
// yoqiladi.
// ============================================================

const PRICE_UZS = 19990;

const DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------
// IMKONIYATLAR
// ------------------------------------------------------------

const PERKS = [
  {
    id: "noads",
    icon: "✦",
    title: "Reklamasiz",
    about: "Hamkor takliflari va reklama bannerlari ko'rinmaydi"
  },
  {
    id: "frame",
    icon: "◈",
    title: "Maxsus ramka",
    about: "Profil rasmingiz atrofida oltin yoki neon ramka"
  },
  {
    id: "stats",
    icon: "▤",
    title: "Qo'shimcha statistika",
    about: "Haftalik, oylik va umumiy natijalar, tarix bilan"
  },
  {
    id: "badge",
    icon: "★",
    title: "Maxsus nishonlar",
    about: "Faqat Plus egalarida bo'ladigan nishonlar"
  },
  {
    id: "theme",
    icon: "❖",
    title: "Profilni bezash",
    about: "Ramka va fon rangini o'zingiz tanlaysiz"
  },
  {
    id: "maptheme",
    icon: "◍",
    title: "Xarita ko'rinishlari",
    about: "Tungi, sun'iy yo'ldosh va sodda xarita"
  }
];

// Plus egalari uchun ochiladigan xarita ko'rinishlari.
//
// MUHIM: bu XARITA EMAS (Beginner/City/... bilan aralashtirmang) —
// bu shunchaki xaritaning ko'rinishi, o'yinga ta'sir qilmaydi.
const MAP_THEMES = [
  {
    id: "default",
    name: "Odatiy",
    plus: false,
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "saturate(.45) contrast(.95) brightness(1.06)"
  },
  {
    id: "night",
    name: "Tungi",
    plus: true,
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "invert(1) hue-rotate(180deg) saturate(.5) brightness(.85)"
  },
  {
    id: "clean",
    name: "Sodda",
    plus: true,
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "grayscale(1) contrast(.9) brightness(1.1)"
  },
  {
    id: "warm",
    name: "Iliq",
    plus: true,
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "sepia(.45) saturate(1.1) brightness(1.02)"
  }
];

// Profil ramkalari
const FRAMES = [
  { id: "", name: "Oddiy", plus: false, css: "" },
  { id: "gold", name: "Oltin", plus: true, css: "gold" },
  { id: "neon", name: "Neon", plus: true, css: "neon" },
  { id: "fire", name: "Olov", plus: true, css: "fire" },
  { id: "ice", name: "Muz", plus: true, css: "ice" }
];

// ------------------------------------------------------------
// O'YINCHIDAGI YOZUV
// ------------------------------------------------------------
//
//   player.plus = {
//     until:   0,          // obuna shu vaqtgacha
//     since:   0,          // birinchi marta qachon olingan
//     months:  0,          // jami necha oy
//     frame:   "gold",     // tanlangan ramka
//     theme:   "night",    // tanlangan xarita ko'rinishi
//     orders:  [ { id, price, status, time } ]
//   }
// ------------------------------------------------------------

function normalizePlus(player) {
  const raw = player.plus && typeof player.plus === "object" ? player.plus : {};

  const target =
    player.plus && typeof player.plus === "object"
      ? player.plus
      : (player.plus = {});

  const until = Number(raw.until);

  target.until = Number.isFinite(until) && until > 0 ? until : 0;

  const since = Number(raw.since);

  target.since = Number.isFinite(since) && since > 0 ? since : 0;

  const months = Number(raw.months);

  target.months = Number.isFinite(months) && months > 0 ? Math.floor(months) : 0;

  const frame = String(raw.frame || "");

  target.frame = FRAMES.some((item) => item.id === frame) ? frame : "";

  const theme = String(raw.theme || "");

  target.theme = MAP_THEMES.some((item) => item.id === theme)
    ? theme
    : "default";

  target.orders = (Array.isArray(raw.orders) ? raw.orders : [])
    .filter((order) => order && typeof order === "object")
    .map((order) => ({
      id: String(order.id || ""),
      price: Math.max(0, Math.floor(Number(order.price) || 0)),
      months: Math.max(1, Math.floor(Number(order.months) || 1)),
      status: ["pending", "done", "rejected"].includes(String(order.status))
        ? String(order.status)
        : "pending",
      time: Number(order.time) || 0,
      note: String(order.note || "").slice(0, 120)
    }))
    .filter((order) => order.id)
    .sort((a, b) => b.time - a.time)
    .slice(0, 24);

  // Obuna tugagan bo'lsa — bezaklar ham o'chadi
  if (!isPlus(player)) {
    target.frame = "";
    target.theme = "default";
  }

  return target;
}

function isPlus(player) {
  return Boolean(
    player && player.plus && Number(player.plus.until) > Date.now()
  );
}

function daysLeft(player) {
  if (!isPlus(player)) return 0;

  return Math.ceil((Number(player.plus.until) - Date.now()) / DAY_MS);
}

// Obunani yoqish / uzaytirish
function grant(player, months) {
  normalizePlus(player);

  const count = Math.max(1, Math.floor(Number(months) || 1));

  const now = Date.now();

  const from = Math.max(now, Number(player.plus.until) || 0);

  player.plus.until = from + count * DAYS * DAY_MS;
  player.plus.months += count;

  if (!player.plus.since) player.plus.since = now;

  return player.plus.until;
}

// Klient uchun
function plusView(player) {
  normalizePlus(player);

  const active = isPlus(player);

  return {
    active,
    until: player.plus.until,
    daysLeft: daysLeft(player),
    months: player.plus.months,
    frame: player.plus.frame,
    theme: player.plus.theme,

    price: PRICE_UZS,
    days: DAYS,

    perks: PERKS,
    frames: FRAMES,
    themes: MAP_THEMES,

    orders: player.plus.orders
  };
}

module.exports = {
  PRICE_UZS,
  DAYS,
  PERKS,
  MAP_THEMES,
  FRAMES,

  normalizePlus,
  isPlus,
  daysLeft,
  grant,
  plusView
};
