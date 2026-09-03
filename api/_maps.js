// api/_maps.js
// ============================================================
// XARITALAR
// ============================================================
//
// O'yinda beshta xarita bor. Ular DARAJA bilan ochiladi —
// pul bilan emas. Ochilgan xarita doimiy ochiq qoladi.
//
// Har bir xaritaning hududlari ALOHIDA: "Beginner Zone" dagi
// hudud "City Zone" ga hech qanday ta'sir qilmaydi. Buning
// uchun har bir hudud yozuvida `mapId` turadi va hamma joyda
// shu bo'yicha filtrlanadi.
//
// Umumiy bo'ladigan narsalar: akkaunt, XP, daraja, do'stlar,
// yutuqlar, point. Ular xaritaga bog'liq emas.
//
// Yangi o'yinchi avtomatik "beginner" xaritasida boshlaydi.
// ============================================================

const MAPS = [
  {
    id: "beginner",
    name: "Beginner Zone",
    about: "Yangi o'yinchilar uchun — tinch boshlanish",
    level: 1,
    color: "#22c55e",
    icon: "○",

    // Bu xaritada hududlar tez ochiladi va himoya uzunroq —
    // yangi o'yinchi darhol veteranga yem bo'lmasin
    minArea: 40,
    defenseBonus: 1.5
  },
  {
    id: "city",
    name: "City Zone",
    about: "Shahar ichidagi asosiy kurash maydoni",
    level: 5,
    color: "#3b82f6",
    icon: "▣",
    minArea: 50,
    defenseBonus: 1
  },
  {
    id: "regional",
    name: "Regional Zone",
    about: "Viloyat darajasi — kattaroq hududlar",
    level: 10,
    color: "#a855f7",
    icon: "◈",
    minArea: 120,
    defenseBonus: 1
  },
  {
    id: "national",
    name: "National Zone",
    about: "Butun O'zbekiston bo'ylab",
    level: 20,
    color: "#f59e0b",
    icon: "★",
    minArea: 250,
    defenseBonus: 0.8
  },
  {
    id: "world",
    name: "World Zone",
    about: "Eng kuchlilar uchun — dunyo miqyosi",
    level: 30,
    color: "#ef4444",
    icon: "◉",
    minArea: 400,
    defenseBonus: 0.7
  }
];

const MAP_IDS = MAPS.map((map) => map.id);

const DEFAULT_MAP = "beginner";

function mapById(id) {
  return MAPS.find((map) => map.id === String(id || "")) || null;
}

// Shu darajada ochiq bo'lgan xaritalar
function unlockedFor(level) {
  const value = Math.max(1, Math.floor(Number(level) || 1));

  return MAPS.filter((map) => map.level <= value).map((map) => map.id);
}

// Aynan shu darajada YANGI ochilgan xarita (bo'lsa)
function unlockedAt(level) {
  return MAPS.find((map) => map.level === Math.floor(Number(level) || 0)) || null;
}

// ------------------------------------------------------------
// O'YINCHIDAGI YOZUV
// ------------------------------------------------------------
//
//   player.mapId — hozir o'ynayotgan xaritasi
//   player.maps  — ochilgan xaritalar ro'yxati
//
// Ro'yxat har o'qishda darajadan qayta hisoblanadi: shunda
// bazadagi eski yoki qo'lda o'zgartirilgan qiymat ahamiyatsiz
// bo'ladi — ochilgan xaritani faqat DARAJA belgilaydi.
// ------------------------------------------------------------

function normalizeMaps(player, level) {
  player.maps = unlockedFor(level);

  const want = String(player.mapId || "");

  player.mapId = player.maps.includes(want) ? want : DEFAULT_MAP;

  return player.maps;
}

// Klient uchun ro'yxat
function mapList(player, level) {
  const open = unlockedFor(level);

  return MAPS.map((map) => ({
    id: map.id,
    name: map.name,
    about: map.about,
    level: map.level,
    color: map.color,
    icon: map.icon,
    open: open.includes(map.id),
    active: player.mapId === map.id
  }));
}

// Hudud qaysi xaritaga tegishli. Eski (mapId siz) yozuvlar
// "beginner" da qoladi — ular yo'qolib ketmaydi.
function mapOf(territory) {
  const id = String((territory && territory.mapId) || "");

  return MAP_IDS.includes(id) ? id : DEFAULT_MAP;
}

// Faqat shu xaritadagi hududlar
function territoriesOn(player, mapId) {
  const want = MAP_IDS.includes(String(mapId)) ? String(mapId) : DEFAULT_MAP;

  return (Array.isArray(player.territories) ? player.territories : []).filter(
    (territory) => mapOf(territory) === want
  );
}

module.exports = {
  MAPS,
  MAP_IDS,
  DEFAULT_MAP,

  mapById,
  unlockedFor,
  unlockedAt,
  normalizeMaps,
  mapList,
  mapOf,
  territoriesOn
};
