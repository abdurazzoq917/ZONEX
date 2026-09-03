// local-server.js
// ============================================================
// Lokal server (npm start).
//
// Vercel'dagi api/*.js fayllarning AYNAN o'zini ishlatadi,
// shuning uchun lokalda ishlagan narsa saytda ham ishlaydi.
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;

const routes = {
  "/api/world": require("./api/world"),
  "/api/auth": require("./api/auth"),
  "/api/location": require("./api/location"),
  "/api/territory": require("./api/territory"),
  "/api/avatar": require("./api/avatar"),
  "/api/moderate": require("./api/moderate"),
  "/api/friends": require("./api/friends"),
  "/api/messages": require("./api/messages"),
  "/api/challenges": require("./api/challenges"),
  "/api/shop": require("./api/shop"),
  "/api/notify": require("./api/notify"),
  "/api/profile": require("./api/profile"),
  "/api/rank": require("./api/rank"),
  "/api/clans": require("./api/clans"),
  "/api/plus": require("./api/plus"),
  "/api/places": require("./api/places"),
  "/api/admin": require("./api/admin")
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".apk": "application/vnd.android.package-archive"
};

function serveFile(req, res) {
  let requested = req.url.split("?")[0];

  if (requested === "/") requested = "/index.html";

  // Vercel'dagi `cleanUrls` bilan bir xil bo'lsin: /app -> app.html
  if (requested === "/app") requested = "/app.html";

  let clean;

  try {
    clean = decodeURIComponent(requested);
  } catch {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  const filePath = path.resolve(ROOT, clean.replace(/^\/+/, ""));

  // Papkadan tashqariga chiqishni bloklaymiz
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Topilmadi");
    return;
  }

  res.statusCode = 200;

  res.setHeader(
    "Content-Type",
    types[path.extname(filePath).toLowerCase()] || "application/octet-stream"
  );

  res.setHeader("Cache-Control", "no-cache");

  res.end(fs.readFileSync(filePath));
}

async function handler(req, res) {
  const url = req.url.split("?")[0];

  const route = routes[url] || routes[url.replace(/\/$/, "")];

  if (route) {
    try {
      await route(req, res);
    } catch (error) {
      console.error("API xatosi:", error);

      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Serverda xatolik" }));
      }
    }

    return;
  }

  serveFile(req, res);
}

module.exports = handler;

// To'g'ridan-to'g'ri ishga tushirilsa — serverni ko'taramiz
if (require.main === module) {
  http.createServer(handler).listen(PORT, () => {
    console.log("ZONEX ishlamoqda: http://localhost:" + PORT);
    console.log(
      "Telefonda ochish uchun kompyuter IP manzilidan foydalaning."
    );
  });
}
