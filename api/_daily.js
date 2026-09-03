// api/_daily.js
// ============================================================
// HAR KUNLIK CHELENJ
// ============================================================
//
// Har kuni o'yinchiga UCHTA vazifa beriladi. Vazifalar
//
//   - har kuni boshqacha,
//   - har bir o'yinchiga boshqacha
//
// bo'lishi uchun ular kun sanasi va akkaunt raqamidan
// hisoblangan urug' (seed) bo'yicha tanlanadi. Ya'ni ular
// hech qayerda saqlanmaydi — bir xil kun + bir xil akkaunt
// HAR DOIM bir xil uchta vazifani beradi.
//
// Bajarilgani uchun POINT beriladi. Uchtasi ham bajarilsa —
// ketma-ket kunlar (streak) uchun qo'shimcha point.
//
// Kun O'zbekiston vaqti (UTC+5) bo'yicha yarim tunda almashadi.
// ============================================================

const DAY_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

// ------------------------------------------------------------
// VAZIFALAR RO'YXATI
// ------------------------------------------------------------
//
// type — qaysi hisoblagichga bog'langani:
//
//   distance — yurilgan masofa (metr)
//   area     — egallangan maydon (m2)
//   zones    — yopilgan hududlar soni
//   capture  — begonadan bosib olingan hududlar soni
//   friends  — qo'shilgan yangi do'stlar
//   chat     — yozilgan xabarlar
//   login    — ilovaga kirish (o'zi bajariladi)
// ------------------------------------------------------------

const TASKS = [
  // ---- yengil ----
  {
    key: "login",
    type: "login",
    target: 1,
    reward: 50,
    title: "Kirib chiqing",
    about: "Bugun ZONEX'ni ochdingiz"
  },
  {
    key: "walk_500",
    type: "distance",
    target: 500,
    reward: 80,
    title: "500 metr yuring",
    about: "Bir mahalla aylanasi"
  },
  {
    key: "chat_3",
    type: "chat",
    target: 3,
    reward: 70,
    title: "3 ta xabar yozing",
    about: "Do'stlaringiz bilan gaplashing"
  },
  {
    key: "zone_1",
    type: "zones",
    target: 1,
    reward: 100,
    title: "1 ta hudud yoping",
    about: "Yo'lingizni kesib o'ting"
  },

  // ---- o'rtacha ----
  {
    key: "walk_1500",
    type: "distance",
    target: 1500,
    reward: 180,
    title: "1.5 km yuring",
    about: "Yaxshigina sayr"
  },
  {
    key: "walk_3000",
    type: "distance",
    target: 3000,
    reward: 320,
    title: "3 km yuring",
    about: "Bugun oyoq ishlasin"
  },
  {
    key: "area_5k",
    type: "area",
    target: 5000,
    reward: 200,
    title: "5 000 m² egallang",
    about: "Kattaroq aylana yasang"
  },
  {
    key: "zone_2",
    type: "zones",
    target: 2,
    reward: 220,
    title: "2 ta hudud yoping",
    about: "Ikki marta halqa yasang"
  },
  {
    key: "friend_1",
    type: "friends",
    target: 1,
    reward: 150,
    title: "1 ta yangi do'st",
    about: "Qidiruvdan username toping"
  },
  {
    key: "chat_10",
    type: "chat",
    target: 10,
    reward: 160,
    title: "10 ta xabar yozing",
    about: "Suhbat qizisin"
  },

  // ---- og'ir ----
  {
    key: "walk_5000",
    type: "distance",
    target: 5000,
    reward: 550,
    title: "5 km yuring",
    about: "Bugungi eng katta vazifa"
  },
  {
    key: "area_20k",
    type: "area",
    target: 20000,
    reward: 500,
    title: "20 000 m² egallang",
    about: "Kvartal darajasidagi hudud"
  },
  {
    key: "capture_1",
    type: "capture",
    target: 1,
    reward: 400,
    title: "Begona hududni oling",
    about: "Birovning yeridan aylanib o'ting"
  },
  {
    key: "capture_3",
    type: "capture",
    target: 3,
    reward: 900,
    title: "3 ta begona hudud oling",
    about: "Bugun hujum kuni"
  },
  {
    key: "zone_4",
    type: "zones",
    target: 4,
    reward: 700,
    title: "4 ta hudud yoping",
    about: "To'xtovsiz yurish"
  }
];

const TASK_MAP = new Map(TASKS.map((task) => [task.key, task]));

// Uchta vazifa har xil og'irlikda bo'lsin: yengil + o'rtacha + og'ir
const EASY = TASKS.slice(0, 4).map((task) => task.key);
const MEDIUM = TASKS.slice(4, 10).map((task) => task.key);
const HARD = TASKS.slice(10).map((task) => task.key);

// Uchalasi bajarilganda beriladigan qo'shimcha
const STREAK_BONUS = 200;
const STREAK_BONUS_MAX = 1200;

// ------------------------------------------------------------
// KUN
// ------------------------------------------------------------

function dayKey(time) {
  const stamp = Number(time) || Date.now();

  return new Date(stamp + DAY_OFFSET_MS).toISOString().slice(0, 10);
}

// Kechagi kun (streak uzilganini bilish uchun)
function prevDay(day) {
  const parsed = Date.parse(String(day) + "T00:00:00Z");

  if (!Number.isFinite(parsed)) return "";

  return new Date(parsed - 86400000).toISOString().slice(0, 10);
}

// Ertangi kunga qancha qoldi (ms) — klientdagi sanoq uchun
function nextResetIn() {
  const now = Date.now();

  const local = new Date(now + DAY_OFFSET_MS);

  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1
  );

  return Math.max(0, midnight - DAY_OFFSET_MS - now);
}

// ------------------------------------------------------------
// URUG' (seed) — kun + akkaunt raqamidan
// ------------------------------------------------------------

function seedOf(text) {
  let hash = 2166136261;

  const value = String(text);

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash >>> 0;
}

function pick(list, seed) {
  return list[seed % list.length];
}

// Shu kun uchun uchta vazifa kaliti
function taskKeysFor(playerId, day) {
  const seed = seedOf(String(playerId) + "|" + String(day));

  return [pick(EASY, seed), pick(MEDIUM, seed >>> 7), pick(HARD, seed >>> 15)];
}

// ------------------------------------------------------------
// O'YINCHIDAGI YOZUV
// ------------------------------------------------------------
//
//   player.daily = {
//     day:      "2026-09-02",
//     streak:   4,
//     bonus:    false,          // kun bonusi olinganmi
//     progress: { distance: 1240, zones: 1, ... },
//     claimed:  ["walk_1500"]   // mukofoti olingan vazifalar
//   }
//
// Kun almashsa — hisoblagichlar nolga tushadi.
// ------------------------------------------------------------

function emptyProgress() {
  return {
    distance: 0,
    area: 0,
    zones: 0,
    capture: 0,
    friends: 0,
    chat: 0,
    login: 0
  };
}

function normalizeDaily(player) {
  const raw =
    player.daily && typeof player.daily === "object" ? player.daily : {};

  const progress = emptyProgress();

  const saved =
    raw.progress && typeof raw.progress === "object" ? raw.progress : {};

  Object.keys(progress).forEach((key) => {
    const value = Number(saved[key]);

    progress[key] = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  });

  const claimed = (Array.isArray(raw.claimed) ? raw.claimed : [])
    .map((key) => String(key))
    .filter((key) => TASK_MAP.has(key))
    .slice(0, 8);

  // MUHIM: yozuv O'RNIDA to'g'rilanadi, yangisi bilan
  // ALMASHTIRILMAYDI. Aks holda uni oldin olib qo'ygan kod
  // (masalan `claim` ichidagi havola) eskirib qoladi va
  // o'zgarishlar hech qayerga yozilmay yo'qoladi.
  const target =
    player.daily && typeof player.daily === "object"
      ? player.daily
      : (player.daily = {});

  target.day = String(raw.day || "");
  target.streak = Math.max(0, Math.floor(Number(raw.streak) || 0));
  target.bonus = Boolean(raw.bonus);
  target.progress = progress;
  target.claimed = claimed;

  return target;
}

// Kun almashgan bo'lsa — yangi kunni ochadi.
// Qaytadi: true — kun almashdi (yozuvni saqlash kerak).
function rollDay(player, time) {
  const daily = normalizeDaily(player);

  const today = dayKey(time);

  if (daily.day === today) return false;

  // Kecha uchtasini ham bajargan bo'lsa — streak davom etadi
  const kept = Boolean(daily.day) && daily.day === prevDay(today) && daily.bonus;

  daily.day = today;
  daily.streak = kept ? daily.streak : 0;
  daily.bonus = false;
  daily.progress = emptyProgress();
  daily.claimed = [];

  // "Kirib chiqing" vazifasi ilovani ochish bilan bajariladi
  daily.progress.login = 1;

  return true;
}

// ------------------------------------------------------------
// HISOBLAGICHNI OSHIRISH
// ------------------------------------------------------------
//
// territory.js / friends.js / messages.js shuni chaqiradi.
// ------------------------------------------------------------

function bump(player, type, amount) {
  rollDay(player, Date.now());

  const daily = player.daily;

  const key = String(type);

  if (!(key in daily.progress)) return;

  const add = Math.floor(Number(amount) || 0);

  if (add <= 0) return;

  daily.progress[key] += add;
}

// ------------------------------------------------------------
// BUGUNGI VAZIFALAR (klient uchun)
// ------------------------------------------------------------

function taskView(player, task) {
  const daily = player.daily;

  const progress = Math.min(
    Number(daily.progress[task.type] || 0),
    task.target
  );

  return {
    key: task.key,
    type: task.type,
    title: task.title,
    about: task.about,
    target: task.target,
    reward: task.reward,
    progress,
    done: progress >= task.target,
    claimed: daily.claimed.includes(task.key)
  };
}

function todayView(player) {
  rollDay(player, Date.now());

  const daily = player.daily;

  const tasks = taskKeysFor(player.id, daily.day)
    .map((key) => TASK_MAP.get(key))
    .filter(Boolean)
    .map((task) => taskView(player, task));

  const bonus = Math.min(STREAK_BONUS + daily.streak * 100, STREAK_BONUS_MAX);

  return {
    day: daily.day,
    streak: daily.streak,
    tasks,

    // Kun bonusi: uchtasi ham olinganda beriladi
    bonus: {
      reward: bonus,
      taken: daily.bonus,
      ready: tasks.length > 0 && tasks.every((task) => task.claimed)
    },

    resetIn: nextResetIn()
  };
}

// Nishonda ko'rsatiladigan son: olinmagan tayyor mukofotlar
function readyCount(player) {
  const view = todayView(player);

  let count = view.tasks.filter((task) => task.done && !task.claimed).length;

  if (view.bonus.ready && !view.bonus.taken) count += 1;

  return count;
}

// ------------------------------------------------------------
// MUKOFOTNI OLISH
// ------------------------------------------------------------
//
// Qaytadi: { ok, reward, error, message }
//
// Pointni bu funksiya O'ZI qo'shadi — shunda mukofot hisobi
// bitta joyda qoladi.
// ------------------------------------------------------------

function claim(player, key) {
  rollDay(player, Date.now());

  const daily = player.daily;

  // ---- kun bonusi ----
  if (String(key) === "bonus") {
    const view = todayView(player);

    if (!view.bonus.ready) {
      return {
        ok: false,
        error: "not_ready",
        message: "Avval uchala vazifani ham bajaring"
      };
    }

    if (daily.bonus) {
      return {
        ok: false,
        error: "taken",
        message: "Bugungi bonus allaqachon olingan"
      };
    }

    daily.bonus = true;
    daily.streak += 1;

    player.points = Math.max(0, Number(player.points) || 0) + view.bonus.reward;

    return { ok: true, reward: view.bonus.reward, bonus: true };
  }

  // ---- oddiy vazifa ----
  const allowed = taskKeysFor(player.id, daily.day);

  if (!allowed.includes(String(key))) {
    return {
      ok: false,
      error: "no_task",
      message: "Bunday vazifa bugun berilmagan"
    };
  }

  const task = TASK_MAP.get(String(key));

  if (!task) {
    return { ok: false, error: "no_task", message: "Vazifa topilmadi" };
  }

  if (daily.claimed.includes(task.key)) {
    return {
      ok: false,
      error: "taken",
      message: "Mukofot allaqachon olingan"
    };
  }

  if (Number(daily.progress[task.type] || 0) < task.target) {
    return {
      ok: false,
      error: "not_done",
      message: "Vazifa hali bajarilmagan"
    };
  }

  daily.claimed.push(task.key);

  player.points = Math.max(0, Number(player.points) || 0) + task.reward;

  return { ok: true, reward: task.reward };
}

module.exports = {
  TASKS,
  dayKey,
  normalizeDaily,
  rollDay,
  bump,
  todayView,
  readyCount,
  claim
};
