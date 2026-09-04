// api/moderate.js
// ============================================================
// POST /api/moderate { id, key, target, days, reason }
//
// Faqat ADMIN uchun. Admin username bo'yicha aniqlanadi
// (.env dagi ADMIN_USERNAME, sukut bo'yicha "abdumalikov").
//
//   days:  3 | 9 | 15   — shuncha kunlik ban
//          -1           — umrbod ban
//           0           — bandan chiqarish
//
// .env da ADMIN_KEY qo'yilgan bo'lsa, `key` ham to'g'ri
// kelishi shart.
// ============================================================

const { json, preflight, readBody } = require("../_http");
const { locked } = require("../_lock");

const {
  readPlayers,
  writePlayers,
  adminAllowed,
  applyBan,
  banInfo,
  publicList,
  RULES
} = require("../_store");

const { guard } = require("../_auth");

async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const target = String(body.target || "").trim();

    if (!id || !target) {
      return json(res, 400, { error: "ID va target kerak" });
    }

    const players = await readPlayers();

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const admin = check.player;

    if (!adminAllowed(admin, body.key)) {
      return json(res, 403, {
        error: "not_admin",
        message: "Bu amal faqat admin uchun"
      });
    }

    const person = players[target];

    if (!person) {
      return json(res, 404, { error: "Bunday odam topilmadi" });
    }

    if (String(person.id) === String(admin.id)) {
      return json(res, 400, {
        error: "self",
        message: "O'zingizga ban bera olmaysiz"
      });
    }

    if (person.role === "admin") {
      return json(res, 400, {
        error: "admin_target",
        message: "Adminni banlab bo'lmaydi"
      });
    }

    const days = Number(body.days);

    if (!RULES.BAN_DAYS.includes(days) && days !== 0) {
      return json(res, 400, {
        error: "bad_days",
        message:
          "Muddat: " + RULES.BAN_DAYS.join(", ") + " kun yoki 0 (ochish)"
      });
    }

    applyBan(person, days, body.reason || "Admin qarori");

    await writePlayers(person);

    return json(res, 200, {
      ok: true,

      message: days
        ? days === -1
          ? "@" + person.name + " umrbod banlandi"
          : "@" + person.name + " " + days + " kunga banlandi"
        : "@" + person.name + " bandan chiqarildi",

      target: {
        id: person.id,
        name: person.name,
        ban: banInfo(person)
      },

      players: publicList(players, id),
      time: Date.now()
    });
  } catch (error) {
    console.error("MODERATE API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};

// Bazani o'zgartiradigan so'rovlar birin-ketin bajariladi
module.exports = locked("players", handler);
