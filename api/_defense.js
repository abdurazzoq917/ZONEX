// api/_defense.js
// ============================================================
// HUDUD DARAJASI VA HIMOYASI
// ============================================================
//
// O'yin halqasi:
//
//   🚶 yurish → 🗺 egallash → 🛡 himoya → ⏳ himoya tugadi
//   → ⚔️ jang → 👑 yangi ega → (qaytadan)
//
// Hudud egallanganda ma'lum vaqtga HIMOYALANADI: shu vaqt
// ichida uni hech kim bosib ololmaydi va kesib ham ololmaydi.
// Vaqt tugagach hudud yana hujumga ochiladi.
//
// Himoya muddatini FAQAT SERVER hisoblaydi va u hudud
// yozuvidagi `defendedUntil` da (aniq vaqt) turadi. Klient uni
// o'zgartira olmaydi — u faqat qolgan vaqtni ko'rsatadi.
//
// Hudud darajasi (1..5) — o'sha hududga qancha mehnat
// qo'yilganidan kelib chiqadi: uni qayta-qayta aylanib
// yurgan sari daraja o'sadi va himoya uzayadi.
//
// MUHIM: Premium (ZoneX Plus) himoyani UZAYTIRMAYDI —
// aks holda o'yin "pulga sotib olinadigan" bo'lib qolardi.
// ============================================================

const HOUR = 60 * 60 * 1000;

// Daraja bo'yicha himoya muddati (soat)
const DEFENSE_HOURS = [2, 4, 8, 12, 24];

// Darajaga chiqish uchun kerakli "hissa" (m² · marta)
//
// Hududga har safar yurib kirilganda unga qo'shilgan maydon
// `effort` ga qo'shiladi. Shu son oshgani sari daraja ko'tariladi.
const LEVEL_STEPS = [0, 4000, 12000, 30000, 70000];

// Bitta aylanishdan qo'shiladigan eng ko'p "mehnat".
//
// Bu chegara bo'lmasa, bitta katta aylana bilan darhol
// 5-darajaga chiqib olish mumkin bo'lardi. Chegara bilan
// esa daraja ISHLATILISHDAN o'sadi:
//
//   2-daraja ~2 marta, 3-daraja ~4, 4-daraja ~10,
//   5-daraja ~24 marta yurishni talab qiladi.
const EFFORT_PER_CLAIM = 3000;

// Bitta aylanish shu hududga qancha mehnat qo'shadi
function effortForClaim(area) {
  return Math.min(EFFORT_PER_CLAIM, Math.max(0, Math.round(Number(area) || 0)));
}

const MAX_LEVEL = 5;

// "Yaqinda janga tushgan" deb hisoblanadigan vaqt
const CONTEST_MS = 30 * 60 * 1000;

// ------------------------------------------------------------
// DARAJA
// ------------------------------------------------------------

function levelFromEffort(effort) {
  const value = Math.max(0, Number(effort) || 0);

  let level = 1;

  for (let i = 1; i < LEVEL_STEPS.length; i++) {
    if (value >= LEVEL_STEPS[i]) level = i + 1;
  }

  return Math.min(MAX_LEVEL, level);
}

function defenseHours(level, mapBonus) {
  const index = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level))) - 1;

  const bonus = Number(mapBonus);

  return DEFENSE_HOURS[index] * (Number.isFinite(bonus) && bonus > 0 ? bonus : 1);
}

// ------------------------------------------------------------
// HUDUD YOZUVINI SHAKLGA SOLISH
// ------------------------------------------------------------
//
//   territory.effort        — jami qo'shilgan mehnat
//   territory.level         — 1..5
//   territory.defendedUntil — himoya shu vaqtgacha
//   territory.contestedAt   — oxirgi marta qachon hujum bo'lgan
//   territory.captures      — necha marta qo'ldan qo'lga o'tgan
// ------------------------------------------------------------

function normalizeTerritoryDefense(territory) {
  const effort = Number(territory.effort);

  // Eski (bu maydonsiz) hududlar 1-darajadan boshlaydi —
  // katta maydonli eski hudud darhol 5-darajaga chiqib
  // olmasin.
  territory.effort =
    Number.isFinite(effort) && effort > 0
      ? Math.round(effort)
      : effortForClaim(territory.area);

  territory.level = levelFromEffort(territory.effort);

  const until = Number(territory.defendedUntil);

  territory.defendedUntil = Number.isFinite(until) && until > 0 ? until : 0;

  const contested = Number(territory.contestedAt);

  territory.contestedAt =
    Number.isFinite(contested) && contested > 0 ? contested : 0;

  const captures = Number(territory.captures);

  territory.captures =
    Number.isFinite(captures) && captures > 0 ? Math.floor(captures) : 0;

  return territory;
}

// ------------------------------------------------------------
// HOLAT
// ------------------------------------------------------------
//
//   DEFENDED   — himoyada, tegib bo'lmaydi
//   CONTESTED  — himoya tugagan va yaqinda hujum bo'lgan
//   VULNERABLE — himoya tugagan, hujumga ochiq
// ------------------------------------------------------------

function stateOf(territory, now) {
  const time = Number(now) || Date.now();

  if (Number(territory.defendedUntil) > time) return "DEFENDED";

  if (time - Number(territory.contestedAt || 0) < CONTEST_MS) {
    return "CONTESTED";
  }

  return "VULNERABLE";
}

function isProtected(territory, now) {
  return Number(territory.defendedUntil || 0) > (Number(now) || Date.now());
}

// Klient ko'rsatadigan ma'lumot
function defenseView(territory, now) {
  const time = Number(now) || Date.now();

  return {
    level: territory.level || 1,
    state: stateOf(territory, time),
    until: Number(territory.defendedUntil) || 0,
    left: Math.max(0, Number(territory.defendedUntil || 0) - time),
    captures: Number(territory.captures) || 0
  };
}

// ------------------------------------------------------------
// HIMOYANI YANGILASH
// ------------------------------------------------------------
//
// Hudud egallanganda yoki qayta yurilganda chaqiriladi:
// mehnat qo'shiladi, daraja qayta hisoblanadi va himoya
// yangi darajaga mos ravishda uzaytiriladi.
//
// Qaytadi: { level, hours, until, levelUp }
// ------------------------------------------------------------

function refresh(territory, effortAdded, mapBonus, now) {
  const time = Number(now) || Date.now();

  normalizeTerritoryDefense(territory);

  const before = territory.level;

  territory.effort += Math.max(0, Math.round(Number(effortAdded) || 0));
  territory.level = levelFromEffort(territory.effort);

  const hours = defenseHours(territory.level, mapBonus);

  const until = time + hours * HOUR;

  // Himoya faqat UZAYADI — qayta yurish uni qisqartirmaydi
  territory.defendedUntil = Math.max(
    Number(territory.defendedUntil) || 0,
    until
  );

  return {
    level: territory.level,
    hours,
    until: territory.defendedUntil,
    levelUp: territory.level > before ? territory.level : 0
  };
}

// Hududga hujum bo'ldi (bosib olinmasa ham) — belgilab qo'yamiz
function markContested(territory, now) {
  territory.contestedAt = Number(now) || Date.now();
}

// Qolgan vaqtni "12:43:21" ko'rinishida
function clock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (value) => String(value).padStart(2, "0");

  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

module.exports = {
  HOUR,
  DEFENSE_HOURS,
  LEVEL_STEPS,
  EFFORT_PER_CLAIM,
  effortForClaim,
  MAX_LEVEL,
  CONTEST_MS,

  levelFromEffort,
  defenseHours,
  normalizeTerritoryDefense,
  stateOf,
  isProtected,
  defenseView,
  refresh,
  markContested,
  clock
};
