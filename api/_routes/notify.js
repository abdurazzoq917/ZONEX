// api/notify.js
// ============================================================
// BILDIRISHNOMALAR
//
//   GET  /api/notify?id=<men>              — ro'yxat
//   POST /api/notify { id, action, notifId }
//
//     action "read"    — bittasini o'qilgan qilish
//     action "readAll" — hammasini o'qilgan qilish
//
// Bildirishnoma o'zi shu yerda YARATILMAYDI — uni hududni
// bosib olish (territory.js), do'stlik (friends.js) va xabar
// (messages.js) qo'shadi.
//
// Telefonga chiqadigan bildirishnomani ilova o'zi chiqaradi:
// klient shu ro'yxatni kuzatib turadi va yangi yozuv paydo
// bo'lsa mahalliy (local) bildirishnoma beradi.
// ============================================================

const { json, preflight, readBody } = require("../_http");
const { locked } = require("../_lock");

const { readPlayers, writePlayers, notify } = require("../_store");

const { guard } = require("../_auth");

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    // ---------------------------------------------------------
    // RO'YXAT
    // ---------------------------------------------------------

    if (req.method === "GET") {
      const params = new URLSearchParams(req.url.split("?")[1] || "");

      const id = String(params.get("id") || "").trim();

      const players = await readPlayers();

      const check = guard(players, id, req, null);

      if (!check.ok) {
        return json(res, check.status, {
          error: check.error,
          message: check.message
        });
      }

      const player = check.player;

      return json(res, 200, {
        ok: true,
        items: player.notifs,
        unread: notify.unreadCount(player),
        time: Date.now()
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    // ---------------------------------------------------------
    // O'QILGAN QILISH
    // ---------------------------------------------------------

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const action = String(body.action || "read").trim();

    const players = await readPlayers();

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const player = check.player;

    const changed = notify.markRead(
      player,
      action === "readAll" ? "" : String(body.notifId || "")
    );

    if (changed) await writePlayers([player]);

    return json(res, 200, {
      ok: true,
      items: player.notifs,
      unread: notify.unreadCount(player),
      time: Date.now()
    });
  } catch (error) {
    console.error("NOTIFY API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

module.exports = locked("players", handler);
