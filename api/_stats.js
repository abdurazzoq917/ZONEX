// api/_stats.js
// ============================================================
// DAVRIY STATISTIKA (kunlik / haftalik / oylik / umumiy)
// ============================================================
//
// Reyting "kim ko'p XP yig'di" bo'yicha tuziladi. Buning uchun
// har bir o'yinchida to'rtta hisoblagich yuriladi:
//
//   player.stats = {
//     day: "2026-09-03", week: "2026-W36", month: "2026-09",
//     daily:   { xp, area, distance, captures, zones },
//     weekly:  { ... },
//     monthly: { ... },
//     total:   { ... }
//   }
//
// Davr almashsa — o'sha hisoblagich nolga tushadi. Shuning
// uchun "har hafta reyting yangilanadi" va odamlar qaytadi.
//
// Kun O'zbekiston vaqti (UTC+5) bo'yicha almashadi — kunlik
// chelenj bilan bir xil.
// ============================================================

const DAY_OFFSET_MS = 5 * 60 * 60 * 1000;

const FIELDS = ["xp", "area", "distance", "captures", "zones"];

const PERIODS = ["daily", "weekly", "monthly", "total"];

function shifted(time) {
  return new Date((Number(time) || Date.now()) + DAY_OFFSET_MS);
}

function dayKey(time) {
  return shifted(time).toISOString().slice(0, 10);
}

function monthKey(time) {
  return shifted(time).toISOString().slice(0, 7);
}

// ISO hafta: "2026-W36". Yil oxiri/boshida ham to'g'ri ishlaydi.
function weekKey(time) {
  const date = shifted(time);

  // Payshanbaga surib olamiz — ISO haftaning yili shu kunga qarab
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

  const weekday = (thursday.getUTCDay() + 6) % 7; // dushanba = 0

  thursday.setUTCDate(thursday.getUTCDate() - weekday + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));

  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;

  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);

  const week =
    1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));

  return (
    thursday.getUTCFullYear() + "-W" + String(week).padStart(2, "0")
  );
}

function emptyBucket() {
  const bucket = {};

  FIELDS.forEach((field) => {
    bucket[field] = 0;
  });

  return bucket;
}

function cleanBucket(raw) {
  const bucket = emptyBucket();

  if (!raw || typeof raw !== "object") return bucket;

  FIELDS.forEach((field) => {
    const value = Number(raw[field]);

    bucket[field] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  });

  return bucket;
}

// ------------------------------------------------------------
// SHAKLGA SOLISH + DAVRNI ALMASHTIRISH
// ------------------------------------------------------------

function normalizeStats(player, time) {
  const raw =
    player.stats && typeof player.stats === "object" ? player.stats : {};

  const target =
    player.stats && typeof player.stats === "object"
      ? player.stats
      : (player.stats = {});

  const now = Number(time) || Date.now();

  const day = dayKey(now);
  const week = weekKey(now);
  const month = monthKey(now);

  const savedDay = String(raw.day || "");
  const savedWeek = String(raw.week || "");
  const savedMonth = String(raw.month || "");

  target.daily = savedDay === day ? cleanBucket(raw.daily) : emptyBucket();
  target.weekly = savedWeek === week ? cleanBucket(raw.weekly) : emptyBucket();
  target.monthly =
    savedMonth === month ? cleanBucket(raw.monthly) : emptyBucket();

  target.total = cleanBucket(raw.total);

  target.day = day;
  target.week = week;
  target.month = month;

  return target;
}

// ------------------------------------------------------------
// QO'SHISH
// ------------------------------------------------------------
//
// bump(player, "xp", 120) — to'rtala davrga ham qo'shadi.
// ------------------------------------------------------------

function bump(player, field, amount) {
  const stats = normalizeStats(player, Date.now());

  if (FIELDS.indexOf(String(field)) < 0) return;

  const add = Math.floor(Number(amount) || 0);

  if (add <= 0) return;

  PERIODS.forEach((period) => {
    stats[period][field] += add;
  });
}

// Bir nechta qiymatni birdan: bumpAll(player, { xp: 10, area: 500 })
function bumpAll(player, values) {
  Object.keys(values || {}).forEach((field) => {
    bump(player, field, values[field]);
  });
}

function bucketOf(player, period) {
  const stats = normalizeStats(player, Date.now());

  const key = PERIODS.indexOf(String(period)) >= 0 ? String(period) : "total";

  return stats[key];
}

module.exports = {
  FIELDS,
  PERIODS,
  dayKey,
  weekKey,
  monthKey,
  normalizeStats,
  bump,
  bumpAll,
  bucketOf
};
