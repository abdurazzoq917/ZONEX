// api/world.js
// ============================================================
// GET /api/world
//
// Barcha o'yinchilar, ularning joylashuvi va hududlari.
// ============================================================

const { json, preflight } = require("./_http");
const { getWorld, RULES } = require("./_store");
const { mailReport } = require("./_mail");

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, { error: "Faqat GET so'rovi" });
  }

  try {
    // ?id=<qurilma> — o'ziga tegishli maxfiy maydonlar
    // (kelgan/yuborilgan do'stlik so'rovlari) ham qaytadi
    const params = new URLSearchParams(req.url.split("?")[1] || "");

    // ?map= — qaysi xaritadagi hududlar kerak. Yopiq xarita
    // so'ralsa server o'z xaritasini qaytaradi (getWorld).
    const world = await getWorld(
      String(params.get("id") || "").trim(),
      String(params.get("map") || "").trim()
    );

    return json(res, 200, {
      ok: true,
      players: world.players,
      mapId: world.mapId,
      storage: world.storage,
      storageInfo: world.storageInfo,

      // Email sozlanganmi — "kod kelmayapti" muammosini
      // tez topish uchun (maxfiy qiymat qaytmaydi)
      mailInfo: mailReport(),

      rules: RULES,
      time: world.time
    });
  } catch (error) {
    console.error("WORLD API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
