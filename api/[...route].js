// api/[...route].js
// ============================================================
// YAGONA KIRISH NUQTASI — BARCHA /api/* SO'ROVLARI SHU YERDAN
// ============================================================
//
// Vercel Hobby rejasida bitta deploy'ga 12 tadan ortiq
// funksiya sig'maydi. Ilgari har bir endpoint alohida fayl —
// alohida funksiya edi (17 ta), shuning uchun deploy
// bajarilmay, sayt eski versiyada qolib ketardi.
//
// Endi funksiya BITTA. Yo'nalishni URL'ning o'zidan olamiz,
// so'ng `_routes/` ichidagi tegishli handlerga uzatamiz.
// Handlerlar o'zgarmadi va query satri ham buzilmaydi —
// ular `req.url.split("?")[1]` bilan ishlaydi.
// ============================================================

const routes = require("./_routes");

module.exports = async function (req, res) {
  // "/api/shop?id=7" -> "shop".  Katta-kichik harf farq qilmaydi,
  // oxiridagi "/" va cleanUrls qo'shishi mumkin bo'lgan ".js" ham
  // hisobga olinadi.
  const path = String(req.url || "").split("?")[0];
  const name = path
    .replace(/^\/+api\/+/, "")
    .replace(/\.js$/i, "")
    .replace(/\/+$/, "")
    .split("/")[0]
    .toLowerCase();

  const handler = Object.prototype.hasOwnProperty.call(routes, name)
    ? routes[name]
    : null;

  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        ok: false,
        error: "not_found",
        message: `Bunday endpoint yo'q: /api/${name}`,
      })
    );
    return;
  }

  return handler(req, res);
};
