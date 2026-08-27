// api/friends.js
// ============================================================
// POST /api/friends { id, action, target }
//
//   action: "request" — do'stlikka so'rov yuborish
//           "accept"  — kelgan so'rovni qabul qilish
//           "decline" — kelgan so'rovni rad etish
//           "cancel"  — o'zi yuborgan so'rovni bekor qilish
//           "remove"  — do'stlikdan chiqarish
//
// Xabar (chat) yozish faqat DO'ST bo'lgandan keyin ochiladi.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  isBanned,
  banInfo,
  publicList
} = require("./_store");

function drop(list, value) {
  return (Array.isArray(list) ? list : []).filter(
    (item) => String(item) !== String(value)
  );
}

function add(list, value) {
  const clean = drop(list, value);

  clean.push(String(value));

  return clean;
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const target = String(body.target || "").trim();

    const action = String(body.action || "").trim();

    if (!id || !target) {
      return json(res, 400, { error: "ID va target kerak" });
    }

    if (id === target) {
      return json(res, 400, {
        error: "self",
        message: "O'zingizni do'st qilib bo'lmaydi"
      });
    }

    const players = await readPlayers();

    const me = players[id];
    const other = players[target];

    if (!me) {
      return json(res, 400, { error: "Avval ro'yxatdan o'ting" });
    }

    if (!other) {
      return json(res, 404, { error: "Bunday odam topilmadi" });
    }

    if (isBanned(me)) {
      return json(res, 403, {
        error: "banned",
        message: "Siz banlangansiz",
        ban: banInfo(me)
      });
    }

    switch (action) {
      // -----------------------------------------------------
      case "request": {
        if (me.friends.includes(target)) {
          return json(res, 200, { ok: true, state: "friends" });
        }

        // U menga allaqachon so'rov yuborgan bo'lsa — darhol do'st
        if (me.incoming.includes(target)) {
          me.incoming = drop(me.incoming, target);
          other.outgoing = drop(other.outgoing, id);

          me.friends = add(me.friends, target);
          other.friends = add(other.friends, id);

          await writePlayers([me, other]);

          return json(res, 200, {
            ok: true,
            state: "friends",
            message: "@" + other.name + " endi do'stingiz",
            players: publicList(players, id),
            time: Date.now()
          });
        }

        me.outgoing = add(me.outgoing, target);
        other.incoming = add(other.incoming, id);

        await writePlayers([me, other]);

        return json(res, 200, {
          ok: true,
          state: "sent",
          message: "@" + other.name + " ga so'rov yuborildi",
          players: publicList(players, id),
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      case "accept": {
        if (!me.incoming.includes(target)) {
          return json(res, 400, {
            error: "no_request",
            message: "Bunday so'rov yo'q"
          });
        }

        me.incoming = drop(me.incoming, target);
        other.outgoing = drop(other.outgoing, id);

        me.friends = add(me.friends, target);
        other.friends = add(other.friends, id);

        await writePlayers([me, other]);

        return json(res, 200, {
          ok: true,
          state: "friends",
          message: "@" + other.name + " endi do'stingiz",
          players: publicList(players, id),
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      case "decline": {
        me.incoming = drop(me.incoming, target);
        other.outgoing = drop(other.outgoing, id);

        await writePlayers([me, other]);

        return json(res, 200, {
          ok: true,
          state: "none",
          players: publicList(players, id),
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      case "cancel": {
        me.outgoing = drop(me.outgoing, target);
        other.incoming = drop(other.incoming, id);

        await writePlayers([me, other]);

        return json(res, 200, {
          ok: true,
          state: "none",
          players: publicList(players, id),
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      case "remove": {
        me.friends = drop(me.friends, target);
        other.friends = drop(other.friends, id);

        await writePlayers([me, other]);

        return json(res, 200, {
          ok: true,
          state: "none",
          message: "@" + other.name + " do'stlardan chiqarildi",
          players: publicList(players, id),
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      default:
        return json(res, 400, { error: "Noma'lum amal" });
    }
  } catch (error) {
    console.error("FRIENDS API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};

// Bazani o'zgartiradigan so'rovlar birin-ketin bajariladi
module.exports = locked("players", handler);
