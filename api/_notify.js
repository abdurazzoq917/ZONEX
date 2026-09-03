// api/_notify.js
// ============================================================
// BILDIRISHNOMALAR
// ============================================================
//
// Har bir o'yinchining yozuvida oxirgi bildirishnomalar turadi:
//
//   player.notifs = [
//     { id, type, title, body, time, read, from, fromName }
//   ]
//
// Klient ularni /api/notify dan o'qiydi. Yangi (o'qilmagan)
// bildirishnoma paydo bo'lsa, telefonga ilova o'zi mahalliy
// bildirishnoma chiqaradi (client: game.js -> pushNotice).
//
// Turlari:
//
//   capture     — hududingizni birov bosib oldi
//   trim        — hududingizdan bo'lak kesib olindi
//   friend_req  — do'stlik so'rovi keldi
//   friend_ok   — so'rovingiz qabul qilindi
//   chat        — yangi xabar
//   reward      — point berildi
//   shop        — do'kondagi buyurtma holati o'zgardi
// ============================================================

const NOTIF_MAX = 60;

function makeId() {
  return (
    "n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7)
  );
}

function normalizeNotifs(player) {
  const raw = Array.isArray(player.notifs) ? player.notifs : [];

  const clean = raw
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || makeId()),
      type: String(item.type || "info").slice(0, 20),
      title: String(item.title || "").slice(0, 80),
      body: String(item.body || "").slice(0, 200),
      time: Number(item.time) || 0,
      read: Boolean(item.read),
      from: String(item.from || ""),
      fromName: String(item.fromName || "").slice(0, 24)
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, NOTIF_MAX);

  // Ro'yxat O'RNIDA yangilanadi — uni oldin olib qo'ygan kod
  // eski massivda qolib ketmasin
  if (!Array.isArray(player.notifs)) player.notifs = [];

  player.notifs.length = 0;
  player.notifs.push(...clean);

  return player.notifs;
}

// ------------------------------------------------------------
// QO'SHISH
// ------------------------------------------------------------
//
// `dedupe` berilgan bo'lsa — oxirgi 30 soniyada shu turdagi va
// shu odamdan kelgan bildirishnoma bo'lsa, yangisi qo'shilmaydi
// (masalan ketma-ket kelgan xabarlar bittaga yig'iladi).
// ------------------------------------------------------------

function notify(player, notice) {
  if (!player || !notice) return null;

  normalizeNotifs(player);

  const now = Date.now();

  if (notice.dedupe) {
    const recent = player.notifs.find(
      (item) =>
        item.type === notice.type &&
        item.from === String(notice.from || "") &&
        !item.read &&
        now - item.time < 30000
    );

    if (recent) {
      recent.time = now;
      recent.title = String(notice.title || recent.title).slice(0, 80);
      recent.body = String(notice.body || recent.body).slice(0, 200);

      return recent;
    }
  }

  const item = {
    id: makeId(),
    type: String(notice.type || "info").slice(0, 20),
    title: String(notice.title || "").slice(0, 80),
    body: String(notice.body || "").slice(0, 200),
    time: now,
    read: false,
    from: String(notice.from || ""),
    fromName: String(notice.fromName || "").slice(0, 24)
  };

  player.notifs.unshift(item);

  if (player.notifs.length > NOTIF_MAX) {
    player.notifs.length = NOTIF_MAX;
  }

  return item;
}

function unreadCount(player) {
  return normalizeNotifs(player).filter((item) => !item.read).length;
}

function markRead(player, id) {
  const list = normalizeNotifs(player);

  let changed = false;

  list.forEach((item) => {
    if (item.read) return;

    if (!id || String(item.id) === String(id)) {
      item.read = true;
      changed = true;
    }
  });

  return changed;
}

module.exports = {
  NOTIF_MAX,
  normalizeNotifs,
  notify,
  unreadCount,
  markRead
};
