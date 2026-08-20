// api/register.js
// ============================================================
// POST /api/register  { id, name }
//
// Bitta qurilma = bitta akkaunt.
//
//   - ID allaqachon ro'yxatdan o'tgan bo'lsa: eski akkaunt
//     qaytariladi (ism qayta so'ralmaydi).
//
//   - Ism boshqa odamda bo'lsa: 409 "name_taken".
// ============================================================

const { json, preflight, readBody } = require("./_http");

const {
  readPlayers,
  writePlayers,
  createPlayer,
  normalizeName,
  isNameTaken
} = require("./_store");

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const name = normalizeName(body.name);

    if (!id) {
      return json(res, 400, { error: "Qurilma ID kerak" });
    }

    const players = await readPlayers();

    // ---------------------------------------------------------
    // Eski akkaunt — ism qayta so'ralmaydi
    // ---------------------------------------------------------

    const existing = players[id];

    if (existing) {
      return json(res, 200, {
        ok: true,
        existing: true,
        player: existing
      });
    }

    // ---------------------------------------------------------
    // Yangi akkaunt
    // ---------------------------------------------------------

    if (!name || name.length < 2) {
      return json(res, 400, {
        error: "invalid_name",
        message: "Ism kamida 2 ta harf bo'lsin"
      });
    }

    if (isNameTaken(players, name, id)) {
      return json(res, 409, {
        error: "name_taken",
        message: "Bu ism band. Boshqa ism tanlang."
      });
    }

    const player = createPlayer(id, name);

    await writePlayers(player);

    return json(res, 200, {
      ok: true,
      existing: false,
      player
    });
  } catch (error) {
    console.error("REGISTER API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
