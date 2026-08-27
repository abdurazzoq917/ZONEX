// api/_lock.js
// ============================================================
// O'ZGARTIRUVCHI SO'ROVLARNI NAVBATGA QO'YISH
// ============================================================
//
// Muammo: har bir so'rov butun bazani o'qib, o'zgartirib, qayta
// yozadi. Ikki odam bir soniyada bir hududga da'vo qilsa,
// keyingi yozuv birinchisining natijasini bosib ketardi —
// bitta bosib olish yo'qolardi.
//
// Yechim: bazani o'zgartiradigan so'rovlar birin-ketin
// bajariladi (`withLock`). O'qish so'rovlari (GET) qulfga
// tegmaydi — ular sekinlashmaydi.
//
// Joylashuv (POST /api/location) ham qulfga TUSHMAYDI: u endi
// o'yinchi yozuviga emas, alohida "jonli" yozuvga yozadi.
// ============================================================

const { json } = require("./_http");
const { withLock } = require("./_store");

function locked(name, handler) {
  return function (req, res) {
    const method = String(req.method || "").toUpperCase();

    // O'qish va CORS tekshiruvi navbatsiz o'tadi
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return handler(req, res);
    }

    return Promise.resolve(withLock(name, () => handler(req, res))).catch(
      (error) => {
        if (res.writableEnded) return;

        const status = (error && error.status) || 500;

        return json(res, status, {
          error: status === 503 ? "busy" : "Serverda xatolik",
          message:
            status === 503
              ? "Server band — biroz kuting, o'zi qayta yuboriladi"
              : error && error.message
        });
      }
    );
  };
}

module.exports = { locked };
