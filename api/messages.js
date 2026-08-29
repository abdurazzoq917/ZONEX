// api/messages.js
// ============================================================
// XABARLAR (CHAT) — faqat do'stlar orasida
//
//   GET  /api/messages?id=<men>&with=<u>   — suhbatni olish
//   GET  /api/messages?id=<men>&list=1     — do'stlar + oxirgi xabar
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

const { guard } = require("./_auth");

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

      // -----------------------------------------------------
      // DO'STLAR RO'YXATI + HAR BIRI BILAN OXIRGI XABAR
      // -----------------------------------------------------
      //
      // Bitta so'rov bilan "do'stlar / suhbatlar" ekranini
      // to'ldirish uchun kerak.
      // -----------------------------------------------------

      if (params.get("list")) {
        if (!id) {
          return json(res, 400, { error: "id kerak" });
        }

        const all = await readPlayers();

        // Suhbatlar — shaxsiy. Faqat ID bilan (tokensiz) birov
        // boshqa odamning yozishmalarini o'qiy olmasin.
        const listCheck = guard(all, id, req, null);

        if (!listCheck.ok) {
          return json(res, listCheck.status, {
            error: listCheck.error,
            message: listCheck.message
          });
        }

        const self = listCheck.player;

        const ids = Array.isArray(self.friends) ? self.friends : [];

        const friends = [];

        for (const friendId of ids) {
          const mate = all[friendId];

          if (!mate) continue;

          const chat = await readChat(id, friendId);

          const last = chat.length ? chat[chat.length - 1] : null;

          friends.push({
            id: mate.id,
            name: mate.name,
            color: mate.color,

            avatarAt: mate.avatarAt,
            hasAvatar: Boolean(mate.avatar),

            lastSeen: Number(mate.location && mate.location.time) || 0,

            last: last
              ? { from: last.from, text: last.text, time: last.time }
              : null
          });
        }

        // Oxirgi yozishilgan suhbat tepada tursin
        friends.sort(
          (a, b) =>
            Number((b.last && b.last.time) || 0) -
            Number((a.last && a.last.time) || 0)
        );

        return json(res, 200, {
          ok: true,
          friends,
          incoming: Array.isArray(self.incoming) ? self.incoming : [],
          time: Date.now()
        });
      }

      if (!id || !other) {
        return json(res, 400, { error: "id va with kerak" });
      }

      const players = await readPlayers();

      const readCheck = guard(players, id, req, null);

      if (!readCheck.ok) {
        return json(res, readCheck.status, {
          error: readCheck.error,
          message: readCheck.message
        });
      }

      const me = readCheck.player;

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

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const me = check.player;
    const other = players[to];

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
