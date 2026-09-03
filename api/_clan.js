// api/_clan.js
// ============================================================
// KLANLAR (TEAM)
// ============================================================
//
// Klan — bir necha o'yinchining jamoasi. Jamoaning maydoni va
// XP'si a'zolarnikidan yig'iladi, shuning uchun klan reytingi
// o'zi hisoblanadi — alohida saqlash shart emas.
//
// Klan yozuvida faqat o'zgarmaydigan narsalar turadi:
// nomi, qisqartmasi, egasi, a'zolar ro'yxati va so'rovlar.
//
// Klanlar o'yinchi yozuvlaridan ALOHIDA, "zonex:clans"
// kalitida saqlanadi (qarang: _store.js -> readClans).
//
// O'yinchi tomonida faqat `player.clanId` turadi.
// ============================================================

// Bitta klandagi eng ko'p a'zo
const MAX_MEMBERS = 30;

// Klan ochish uchun kerakli daraja — bo'sh klanlar to'lib
// ketmasin
const MIN_LEVEL = 3;

const NAME_MIN = 3;
const NAME_MAX = 20;

const TAG_MIN = 2;
const TAG_MAX = 5;

const MAX_CLANS = 500;

const COLORS = [
  "#ef4444", "#f59e0b", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"
];

function makeClanId() {
  return (
    "cl-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

function tidy(value, max) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Klan nomi: harf, raqam, bo'shliq va bir nechta belgi
function nameError(raw) {
  const name = tidy(raw, NAME_MAX + 5);

  if (name.length < NAME_MIN) {
    return "Klan nomi kamida " + NAME_MIN + " ta belgidan iborat bo'lsin";
  }

  if (name.length > NAME_MAX) {
    return "Klan nomi " + NAME_MAX + " ta belgidan uzun bo'lmasin";
  }

  if (!/^[\p{L}\p{N} _.'-]+$/u.test(name)) {
    return "Nomda faqat harf, raqam va bo'shliq bo'lsin";
  }

  return "";
}

// Qisqartma: xaritada nom oldida turadi — [ZNX] Abu
function tagError(raw) {
  const tag = tidy(raw, TAG_MAX + 3).toUpperCase();

  if (tag.length < TAG_MIN || tag.length > TAG_MAX) {
    return "Qisqartma " + TAG_MIN + "–" + TAG_MAX + " ta belgi bo'lsin";
  }

  if (!/^[A-Z0-9]+$/.test(tag)) {
    return "Qisqartmada faqat lotin harflari va raqam bo'lsin";
  }

  return "";
}

function idList(value, max) {
  const seen = new Set();

  (Array.isArray(value) ? value : []).forEach((item) => {
    const id = String(item || "").trim();

    if (id) seen.add(id);
  });

  return Array.from(seen).slice(0, max || MAX_MEMBERS);
}

function normalizeClan(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "");
  const name = tidy(raw.name, NAME_MAX);
  const ownerId = String(raw.ownerId || "");

  if (!id || !name || !ownerId) return null;

  const color = String(raw.color || "");

  const members = idList(raw.members, MAX_MEMBERS);

  // Ega har doim a'zolar ichida bo'ladi
  if (!members.includes(ownerId)) members.unshift(ownerId);

  return {
    id,
    name,
    tag: tidy(raw.tag, TAG_MAX).toUpperCase(),
    about: tidy(raw.about, 120),
    color: COLORS.includes(color) ? color : COLORS[0],

    ownerId,
    members: members.slice(0, MAX_MEMBERS),

    // Klanga kirish so'rovlari
    requests: idList(raw.requests, 60),

    // Hamma kira oladimi yoki so'rov kerakmi
    open: raw.open !== false,

    createdAt: Number(raw.createdAt) || Date.now()
  };
}

function normalizeClanList(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeClan)
    .filter(Boolean)
    .slice(0, MAX_CLANS);
}

function clanById(clans, id) {
  const key = String(id || "");

  return clans.find((clan) => clan.id === key) || null;
}

function clanOf(clans, playerId) {
  const key = String(playerId || "");

  return clans.find((clan) => clan.members.includes(key)) || null;
}

function nameTaken(clans, name, ownId) {
  const key = tidy(name, NAME_MAX).toLowerCase();

  return clans.some(
    (clan) => clan.id !== String(ownId || "") && clan.name.toLowerCase() === key
  );
}

function tagTaken(clans, tag, ownId) {
  const key = tidy(tag, TAG_MAX).toUpperCase();

  return clans.some(
    (clan) => clan.id !== String(ownId || "") && clan.tag === key
  );
}

// ------------------------------------------------------------
// KLAN KO'RINISHI (a'zolar ma'lumoti bilan)
// ------------------------------------------------------------
//
// `players` — id bo'yicha o'yinchilar (readPlayers natijasi).
// Maydon va XP a'zolarnikidan yig'iladi.
// ------------------------------------------------------------

function clanView(clan, players, viewerId) {
  const members = clan.members
    .map((id) => players[id])
    .filter(Boolean)
    .map((player) => ({
      id: player.id,
      name: player.name,
      level: Number(player.level) || 1,
      xp: Number(player.xp) || 0,
      area: Number(player.area) || 0,
      avatarAt: Number(player.avatarAt) || 0,
      online: Boolean(player.online),
      owner: String(player.id) === clan.ownerId
    }))
    .sort((a, b) => b.xp - a.xp);

  const xp = members.reduce((sum, member) => sum + member.xp, 0);
  const area = members.reduce((sum, member) => sum + member.area, 0);

  const view = {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    about: clan.about,
    color: clan.color,
    open: clan.open,

    ownerId: clan.ownerId,
    count: members.length,
    max: MAX_MEMBERS,

    xp,
    area,
    members,

    createdAt: clan.createdAt
  };

  // So'rovlar ro'yxatini faqat ega ko'radi
  if (viewerId && String(viewerId) === clan.ownerId) {
    view.requests = clan.requests
      .map((id) => players[id])
      .filter(Boolean)
      .map((player) => ({
        id: player.id,
        name: player.name,
        level: Number(player.level) || 1,
        avatarAt: Number(player.avatarAt) || 0
      }));
  }

  return view;
}

// Reyting uchun qisqa ro'yxat
function clanBoard(clans, players) {
  return clans
    .map((clan) => {
      let xp = 0;
      let area = 0;
      let count = 0;

      clan.members.forEach((id) => {
        const player = players[id];

        if (!player) return;

        count += 1;
        xp += Number(player.xp) || 0;
        area += Number(player.area) || 0;
      });

      return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        color: clan.color,
        count,
        xp,
        area
      };
    })
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 50);
}

module.exports = {
  MAX_MEMBERS,
  MIN_LEVEL,
  NAME_MIN,
  NAME_MAX,
  TAG_MIN,
  TAG_MAX,
  COLORS,

  makeClanId,
  tidy,
  nameError,
  tagError,
  normalizeClan,
  normalizeClanList,
  clanById,
  clanOf,
  nameTaken,
  tagTaken,
  clanView,
  clanBoard
};
