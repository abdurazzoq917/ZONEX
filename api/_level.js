// api/_level.js
// ============================================================
// XP VA DARAJA (LEVEL)
// ============================================================
//
// Daraja bittagina joyda — SERVERDA hisoblanadi. Klient XP yoki
// darajani o'zgartira olmaydi: u faqat serverdan kelgan sonni
// ko'rsatadi.
//
// Progressiya "hardcode" emas: butun jadval shu faylning
// boshidagi PROGRESSION obyektida turadi. Balansni o'zgartirish
// uchun faqat shu yerni tahrirlash kifoya.
//
// XP qayerdan keladi:
//
//   yurish            — har 100 metrga 1 XP
//   yangi hudud       — maydonga qarab
//   begona hududni    — hududning darajasiga qarab
//     bosib olish
//   himoyani ushlash  — o'z hududini yangilaganda
//   kunlik chelenj    — mukofotning yarmi
//   missiya / yutuq   — o'z qiymati
//   do'st qo'shish    — 50 XP
//
// ============================================================

// ------------------------------------------------------------
// PROGRESSIYA
// ------------------------------------------------------------
//
// STEPS[i] — (i+1)-darajadan keyingisiga o'tish uchun kerakli XP.
//
// Boshida tez, keyin sekinlashadi. 10-darajadan keyin har bir
// qadam oldingisidan GROWTH baravar og'irlashadi.
// ------------------------------------------------------------

const PROGRESSION = {
  STEPS: [500, 1200, 2000, 3000, 4500, 6000, 7800, 9800, 12000, 14500],

  // 10-darajadan keyingi o'sish. Bu son o'yinning butun
  // uzunligini belgilaydi — 1.08 da Regional ~2 hafta,
  // National ~2.5 oy, World ~7 oyda ochiladi.
  GROWTH: 1.08,

  // Eng yuqori daraja
  MAX_LEVEL: 60
};

// ------------------------------------------------------------
// XP MANBALARI
// ------------------------------------------------------------

const XP = {
  // Har 100 metr yurishga
  PER_100M: 1,

  // Yangi hudud: har 500 m² ga 1 XP, lekin ko'pi bilan shuncha
  AREA_PER_XP: 500,
  AREA_MAX: 200,

  // Begona hududni bosib olish (hudud darajasiga ko'paytiriladi)
  CAPTURE: 200,

  // Begona hududdan bo'lak kesib olish
  TRIM: 40,

  // O'z hududini yangilab, himoyani uzaytirish
  DEFEND: 25,

  // Do'st qo'shilganda
  FRIEND: 50,

  // Bir kunda yurishdan olinadigan eng ko'p XP — bir kechada
  // 30-darajaga chiqib ketishning oldini oladi
  DAILY_WALK_CAP: 1500
};

// ------------------------------------------------------------
// DARAJA JADVALI
// ------------------------------------------------------------

// n-darajadan (n+1)-ga o'tish uchun kerakli XP
function stepFor(level) {
  const index = Math.max(1, Math.floor(level)) - 1;

  const steps = PROGRESSION.STEPS;

  if (index < steps.length) return steps[index];

  const extra = index - steps.length + 1;

  const value =
    steps[steps.length - 1] * Math.pow(PROGRESSION.GROWTH, extra);

  // Yumaloq son chiroyliroq ko'rinadi
  return Math.round(value / 100) * 100;
}

// Shu darajaga yetish uchun jami qancha XP kerak
function totalFor(level) {
  let sum = 0;

  for (let n = 1; n < Math.max(1, Math.floor(level)); n++) {
    sum += stepFor(n);
  }

  return sum;
}

// Jami XP dan darajani hisoblaydi
function levelOf(xp) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));

  let level = 1;
  let spent = 0;

  while (level < PROGRESSION.MAX_LEVEL) {
    const need = stepFor(level);

    if (spent + need > total) break;

    spent += need;
    level += 1;
  }

  return level;
}

// Klient uchun: daraja, shu darajadagi progress, keyingisiga qancha
function levelView(player) {
  const xp = Math.max(0, Math.floor(Number(player.xp) || 0));

  const level = levelOf(xp);

  const base = totalFor(level);

  const need = level >= PROGRESSION.MAX_LEVEL ? 0 : stepFor(level);

  const into = xp - base;

  return {
    level,
    xp,
    into,
    need,
    percent: need ? Math.min(100, Math.round((into / need) * 100)) : 100,
    max: PROGRESSION.MAX_LEVEL
  };
}

// ------------------------------------------------------------
// XP QO'SHISH
// ------------------------------------------------------------
//
// Qaytadi: { gained, level, levelUp, unlocked }
//
// levelUp — daraja oshgan bo'lsa yangi daraja, aks holda 0.
// Xarita ochilishini chaqiruvchi kod (_maps.js) hal qiladi.
// ------------------------------------------------------------

function addXp(player, amount, reason) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));

  if (!add) return { gained: 0, level: levelOf(player.xp), levelUp: 0 };

  const before = levelOf(player.xp);

  player.xp = Math.max(0, Math.floor(Number(player.xp) || 0)) + add;

  const after = levelOf(player.xp);

  player.level = after;

  return {
    gained: add,
    reason: String(reason || ""),
    level: after,
    levelUp: after > before ? after : 0
  };
}

// ------------------------------------------------------------
// YURISHDAN OLINADIGAN XP (kunlik chegara bilan)
// ------------------------------------------------------------
//
// player.walkXp = { day: "2026-09-03", used: 420 }
// ------------------------------------------------------------

function normalizeWalkXp(player, day) {
  const raw =
    player.walkXp && typeof player.walkXp === "object" ? player.walkXp : {};

  const target =
    player.walkXp && typeof player.walkXp === "object"
      ? player.walkXp
      : (player.walkXp = {});

  target.day = String(raw.day || "");
  target.used = Math.max(0, Math.floor(Number(raw.used) || 0));

  if (day && target.day !== day) {
    target.day = day;
    target.used = 0;
  }

  return target;
}

// Metrdan XP — kunlik chegaradan oshgani berilmaydi
function walkXp(player, meters, day) {
  const box = normalizeWalkXp(player, day);

  const want = Math.floor(
    (Math.max(0, Number(meters) || 0) / 100) * XP.PER_100M
  );

  const left = Math.max(0, XP.DAILY_WALK_CAP - box.used);

  const give = Math.min(want, left);

  box.used += give;

  return give;
}

// Maydondan XP
function areaXp(area) {
  return Math.min(
    XP.AREA_MAX,
    Math.floor(Math.max(0, Number(area) || 0) / XP.AREA_PER_XP)
  );
}

module.exports = {
  PROGRESSION,
  XP,

  stepFor,
  totalFor,
  levelOf,
  levelView,

  addXp,
  normalizeWalkXp,
  walkXp,
  areaXp
};
