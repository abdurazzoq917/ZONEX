// api/_http.js
// ============================================================
// Kichik yordamchilar: CORS, JSON javob, body o'qish.
//
// Bir xil kod ham Vercel'da, ham local-server.js'da ishlaydi:
// shuning uchun res.status() emas, oddiy res.end() ishlatiladi.
// ============================================================

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // x-zonex-token — sessiya kaliti. U URL'da emas, sarlavhada
  // yuriladi: URL server jurnallariga yozilib qolishi mumkin.
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-zonex-token"
  );
}

function json(res, status, data) {
  cors(res);

  res.statusCode = status;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.end(JSON.stringify(data));

  return true;
}

function preflight(req, res) {
  if (req.method !== "OPTIONS") return false;

  cors(res);

  res.statusCode = 204;
  res.end();

  return true;
}

// 400 bilan qaytadigan xato (server xatosi emas, klient xatosi)
function badJson() {
  const error = new Error("JSON noto'g'ri");
  error.status = 400;
  return error;
}

async function readBody(req) {
  // Vercel body'ni o'zi tahlil qiladi va buzuq JSON kelsa
  // `req.body` GA MUROJAAT QILISHNING O'ZI xato tashlaydi.
  // O'sha xatoda `status` bo'lmagani uchun u 500 bo'lib
  // ko'rinardi — go'yo server yiqilgandek. Aslida bu klient
  // xatosi, ya'ni 400.
  let parsed;

  try {
    parsed = req.body;
  } catch {
    throw badJson();
  }

  if (parsed && typeof parsed === "object") {
    return parsed;
  }

  if (typeof parsed === "string") {
    try {
      return JSON.parse(parsed || "{}");
    } catch {
      throw badJson();
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 2 * 1024 * 1024) {
        const big = new Error("So'rov juda katta");
        big.status = 413;
        reject(big);
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(badJson());
      }
    });

    req.on("error", reject);
  });
}

module.exports = { cors, json, preflight, readBody };
