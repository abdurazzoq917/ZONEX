// api/_skins.js
// ============================================================
// NAQISHLAR (SKIN) KATALOGI
// ============================================================
//
// Naqish — hududning ustiga qo'yiladigan bezak. Xaritada
// hududingiz oddiy rang o'rniga naqsh bilan chiziladi va uni
// hamma ko'radi.
//
// Uch daraja bor:
//
//   epic       (epik)      — POINT bilan olinadi
//   mythic     (mifik)     — POINT bilan olinadi (qimmatroq)
//   legendary  (legendar)  — faqat PUL bilan olinadi, lekin
//                            narxi ataylab ARZON qo'yilgan
//
// `pattern` — klient uchun chizma tavsifi. Klient (qarang:
// game.js -> patternSvg) shu tavsifdan SVG naqsh yasaydi va
// Leaflet ko'pburchagining ichiga to'ldiradi.
//
// MUHIM: narx va daraja FAQAT shu yerda turadi — klient uni
// /api/shop dan o'qiydi, shuning uchun brauzerdan narxni
// o'zgartirib bo'lmaydi.
// ============================================================

// Bir point necha so'm turadi (pulga aylantirishda)
const POINT_UZS = 5;

// Shundan kam pointni pulga aylantirib bo'lmaydi
const CASHOUT_MIN = 5000;

const SKINS = [
  // ---------------------------------------------------------
  // EPIK — point bilan
  // ---------------------------------------------------------
  {
    id: "neon-grid",
    name: "Neon to'r",
    rarity: "epic",
    points: 2500,
    about: "Shahar ko'chalariday to'g'ri chiziqlar",
    pattern: { kind: "grid", ink: "#22d3ee", back: "#0e7490", scale: 14 }
  },
  {
    id: "sun-stripes",
    name: "Quyosh yo'llari",
    rarity: "epic",
    points: 3000,
    about: "Qiya oltin yo'l-yo'l",
    pattern: { kind: "stripes", ink: "#f59e0b", back: "#b45309", scale: 12 }
  },
  {
    id: "mint-dots",
    name: "Yalpiz nuqta",
    rarity: "epic",
    points: 3200,
    about: "Mayda nuqtalardan iborat toza naqsh",
    pattern: { kind: "dots", ink: "#34d399", back: "#047857", scale: 12 }
  },
  {
    id: "violet-waves",
    name: "Binafsha to'lqin",
    rarity: "epic",
    points: 3800,
    about: "Suv yuzasidagi to'lqinlar",
    pattern: { kind: "waves", ink: "#c084fc", back: "#6d28d9", scale: 16 }
  },
  {
    id: "steel-chevron",
    name: "Po'lat burchak",
    rarity: "epic",
    points: 4500,
    about: "Oldinga qaragan o'tkir burchaklar",
    pattern: { kind: "chevron", ink: "#94a3b8", back: "#334155", scale: 14 }
  },

  // ---------------------------------------------------------
  // MIFIK — point bilan, ancha qimmat
  // ---------------------------------------------------------
  {
    id: "honey-hex",
    name: "Asal uyasi",
    rarity: "mythic",
    points: 9000,
    about: "Oltin rangli olti burchaklar",
    pattern: { kind: "hex", ink: "#fbbf24", back: "#92400e", scale: 18 }
  },
  {
    id: "star-field",
    name: "Yulduzlar maydoni",
    rarity: "mythic",
    points: 12000,
    about: "Tunggi osmon — hududingiz ustida",
    pattern: { kind: "stars", ink: "#e0e7ff", back: "#1e1b4b", scale: 20 }
  },
  {
    id: "dragon-scale",
    name: "Ajdar tangasi",
    rarity: "mythic",
    points: 15000,
    about: "Bir-birining ustiga tushgan tangalar",
    pattern: { kind: "scales", ink: "#10b981", back: "#064e3b", scale: 16 }
  },
  {
    id: "circuit",
    name: "Zanjir sxema",
    rarity: "mythic",
    points: 18000,
    about: "Elektron plataning chiziqlari",
    pattern: { kind: "circuit", ink: "#4ade80", back: "#052e16", scale: 20 }
  },

  // ---------------------------------------------------------
  // LEGENDAR — faqat PUL bilan, narxi arzon
  // ---------------------------------------------------------
  {
    id: "phoenix-flame",
    name: "Feniks olovi",
    rarity: "legendary",
    price: 7900,
    about: "Yonib turgan alanga — uzoqdan ko'rinadi",
    pattern: { kind: "flame", ink: "#fb923c", back: "#7f1d1d", scale: 18 }
  },
  {
    id: "royal-diamond",
    name: "Shoh olmosi",
    rarity: "legendary",
    price: 9900,
    about: "Qirol xazinasidan olingan olmoslar",
    pattern: { kind: "diamond", ink: "#38bdf8", back: "#0c4a6e", scale: 16 }
  },
  {
    id: "gold-crown",
    name: "Oltin toj",
    rarity: "legendary",
    price: 12900,
    about: "Hududingiz ustida tojlar qatori",
    pattern: { kind: "crown", ink: "#fde047", back: "#78350f", scale: 20 }
  },
  {
    id: "cosmos",
    name: "Koinot",
    rarity: "legendary",
    price: 14900,
    about: "Galaktika chang'i va yulduz portlashlari",
    pattern: { kind: "cosmos", ink: "#a78bfa", back: "#0b1020", scale: 22 }
  }
];

const SKIN_MAP = new Map(SKINS.map((skin) => [skin.id, skin]));

function skinById(id) {
  return SKIN_MAP.get(String(id || "")) || null;
}

// Naqish pulga sotiladimi (legendar) yoki pointgami
function isMoneySkin(skin) {
  return Boolean(skin && skin.rarity === "legendary");
}

// So'mni chiroyli ko'rsatish: 12900 -> "12 900"
function moneyText(value) {
  return String(Math.round(Number(value) || 0)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    " "
  );
}

module.exports = {
  SKINS,
  POINT_UZS,
  CASHOUT_MIN,
  skinById,
  isMoneySkin,
  moneyText
};
