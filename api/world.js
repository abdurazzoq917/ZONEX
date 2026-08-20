// api/world.js
// ============================================================
// GET /api/world
//
// Barcha o'yinchilar, ularning joylashuvi va hududlari.
// ============================================================

const { json, preflight } = require("./_http");
const { getWorld, RULES } = require("./_store");

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, { error: "Faqat GET so'rovi" });
  }

  try {
    const world = await getWorld();

    return json(res, 200, {
      ok: true,
      players: world.players,
      storage: world.storage,
      rules: RULES,
      time: world.time
    });
  } catch (error) {
    console.error("WORLD API XATOSI:", error);

    return json(res, 500, {
      error: "Serverda xatolik",
      message: error && error.message
    });
  }
};
