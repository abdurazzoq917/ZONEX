const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DB = path.join(ROOT, "world.json");

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
};

let world = { players: [] };

try {
  if (fs.existsSync(DB)) {
    world = JSON.parse(fs.readFileSync(DB, "utf8"));

    if (!world || !Array.isArray(world.players)) {
      world = { players: [] };
    }
  }
} catch (error) {
  console.error("world.json o'qishda xato:", error);
  world = { players: [] };
}

function player(id, name) {
  let p = world.players.find((x) => x.id === id);

  if (!p) {
    const hue =
      Math.abs(
        [...String(id)].reduce(
          (sum, char) => sum + char.charCodeAt(0),
          0
        ) * 47
      ) % 360;

    p = {
      id: String(id),
      name: String(name || "Player").slice(0, 20),
      color: `hsl(${hue} 72% 48%)`,
      area: 0,
      territories: [],
    };

    world.players.push(p);
  }

  p.name = String(name || p.name).slice(0, 20);

  return p;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.end(JSON.stringify(data));
}

function saveWorld() {
  /*
   * Vercel filesystem doimiy database emas.
   * Shuning uchun xato chiqmasligi uchun yozishni
   * imkon bo'lsa bajaradi, bo'lmasa davom etadi.
   */
  try {
    fs.writeFileSync(DB, JSON.stringify(world, null, 2));
  } catch (error) {
    console.error("world.json saqlanmadi:", error.message);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;

      if (data.length > 1024 * 1024) {
        reject(new Error("Request juda katta"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON noto'g'ri"));
      }
    });

    req.on("error", reject);
  });
}

function serveFile(req, res) {
  let requested = req.url.split("?")[0];

  if (requested === "/") {
    requested = "/index.html";
  }

  let cleanPath;

  try {
    cleanPath = decodeURIComponent(requested);
  } catch {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  cleanPath = cleanPath.replace(/^\/+/, "");

  const filePath = path.resolve(ROOT, cleanPath);

  /*
   * Papkadan tashqaridagi fayllarga kirishni bloklaymiz.
   */
  if (
    filePath !== ROOT &&
    !filePath.startsWith(ROOT + path.sep)
  ) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Topilmadi");
    return;
  }

  if (fs.statSync(filePath).isDirectory()) {
    res.statusCode = 404;
    res.end("Topilmadi");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    types[ext] || "application/octet-stream"
  );
  res.setHeader("Cache-Control", "no-cache");

  res.end(fs.readFileSync(filePath));
}

async function handler(req, res) {
  /*
   * CORS / OPTIONS
   */
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS"
    );
    res.end();
    return;
  }

  /*
   * GET /api/world
   */
  if (
    req.method === "GET" &&
    req.url.split("?")[0] === "/api/world"
  ) {
    res.setHeader("Cache-Control", "no-store");
    json(res, 200, world);
    return;
  }

  /*
   * POST /api/location
   */
  if (
    req.method === "POST" &&
    req.url.split("?")[0] === "/api/location"
  ) {
    try {
      const body = await readBody(req);

      if (
        !body.id ||
        !body.name ||
        !Number.isFinite(Number(body.lat)) ||
        !Number.isFinite(Number(body.lng))
      ) {
        json(res, 400, {
          error: "invalid",
        });
        return;
      }

      const p = player(
        String(body.id),
        String(body.name)
      );

      p.location = {
        lat: Number(body.lat),
        lng: Number(body.lng),
        time: Date.now(),
      };

      saveWorld();

      json(res, 200, {
        ok: true,
      });

      return;
    } catch (error) {
      console.error(error);

      json(res, 400, {
        error: "bad json",
      });

      return;
    }
  }

  /*
   * POST /api/territory
   */
  if (
    req.method === "POST" &&
    req.url.split("?")[0] === "/api/territory"
  ) {
    try {
      const body = await readBody(req);

      if (
        !body.id ||
        !body.name ||
        !Array.isArray(body.points) ||
        body.points.length < 3
      ) {
        json(res, 400, {
          error: "invalid",
        });
        return;
      }

      const p = player(
        String(body.id),
        String(body.name)
      );

      const area = Number(body.area) || 0;

      const safeArea = Math.max(
        0,
        Math.min(area, 100000000)
      );

      p.territories.push({
        points: body.points.slice(0, 5000),
        area: safeArea,
        time: Date.now(),
      });

      p.area = p.territories.reduce(
        (sum, territory) =>
          sum + Number(territory.area || 0),
        0
      );

      saveWorld();

      json(res, 200, {
        ok: true,
        area: p.area,
      });

      return;
    } catch (error) {
      console.error(error);

      json(res, 400, {
        error: "bad json",
      });

      return;
    }
  }

  /*
   * Boshqa barcha URL'lar:
   * index.html, app.js, styles.css va hokazo.
   */
  serveFile(req, res);
}

module.exports = handler;