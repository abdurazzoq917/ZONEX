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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      throw new Error("JSON noto'g'ri");
    }
  }

  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("So'rov juda katta"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("JSON noto'g'ri"));
      }
    });

    req.on("error", reject);
  });
}

module.exports = { cors, json, preflight, readBody };
