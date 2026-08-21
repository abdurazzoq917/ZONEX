// api/messages.js
// ============================================================
// XABARLAR (CHAT) — faqat do'stlar orasida
//
//   GET  /api/messages?id=<men>&with=<u>   — suhbatni olish
//   POST /api/messages { id, to, text }    — xabar yozish
//
// Do'st bo'lmagan odamga xabar ketmaydi.
// Banlangan odam xabar yoza olmaydi.
// ============================================================

const { json, preflight, readBody } = require("./_http");

const {
  readPlayers,
  readChat,
  appendMessage,
  cleanMessage,
  isBanned,
  banInfo
} = require("./_store");

function makeMessageId() {
  return (
    "m-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    // -------------------------------------------------------
    // SUHBATNI O'QISH
    // -------------------------------------------------------

    if (req.method === "GET") {
      const params = new URLSearchParams(req.url.split("?")[1] || "");

      const id = String(params.get("id") || "").trim();
      const other = String(params.get("with") || "").trim();

      if (!id || !other) {
        return json(res, 400, { error: "id va with kerak" });
      }

      const players = await readPlayers();

      const me = players[id];

      if (!me) {
        return json(res, 400, { error: "Avval ro'yxatdan o'ting" });
      }

      if (!me.friends.includes(other)) {
        return json(res, 403, {
          error: "not_friends",
          message: "Xabar yozish uchun avval do'st bo'lishingiz kerak"
        });
      }

      return json(res, 200, {
        ok: true,
        messages: await readChat(id, other),
        time: Date.now()
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    // -------------------------------------------------------
    // XABAR YOZISH
    // -------------------------------------------------------

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const to = String(body.to || "").trim();

    const text = cleanMessage(body.text);

    if (!id || !to) {
      return json(res, 400, { error: "id va to kerak" });
    }

    if (!text) {
      return json(res, 400, {
        error: "empty",
        message: "Bo'sh xabar yuborilmaydi"
      });
    }

    const players = await readPlayers();

    const me = players[id];
    const other = players[to];

    if (!me) {
      return json(res, 400, { error: "Avval ro'yxatdan o'ting" });
    }

    if (!other) {
      return json(res, 404, { error: "Bunday odam topilmadi" });
    }

    if (isBanned(me)) {
      return json(res, 403, {
        error: "banned",
        message: "Siz banlangansiz — xabar yozib bo'lmaydi",
        ban: banInfo(me)
      });
    }

    if (!me.friends.includes(to) || !other.friends.includes(id)) {
      return json(res, 403, {
        error: "not_friends",
        message: "Xabar yozish uchun avval do'st bo'lishingiz kerak"
      });
    }

    const message = {
      id: makeMessageId(),
      from: String(id),
      to: String(to),
      text,
      time: Date.now()
    };

    const messages = await appendMessage(id, to, message);

    return json(res, 200, {
      ok: true,
      message,
      messages,
      time: Date.now()
    });
  } catch (error) {
    console.error("MESSAGES API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
