// api/territory.js

const crypto = require("crypto");

// Umumiy store
const store = require("./_store");

// CORS
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// JSON javob
function json(res, status, data) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(data));
}

// Request body o‘qish
async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

// Rang yaratish
function playerColor(id) {
  let hash = 0;

  for (const char of String(id)) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;

  return `hsl(${hue} 72% 48%)`;
}

// Nuqta to‘g‘ri ekanligini tekshirish
function validPoint(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1])) &&
    Number(point[0]) >= -90 &&
    Number(point[0]) <= 90 &&
    Number(point[1]) >= -180 &&
    Number(point[1]) <= 180
  );
}

// Polygon ichidagi nuqta
function pointInPolygon(point, polygon) {
  const x = Number(point[1]);
  const y = Number(point[0]);

  let inside = false;

  for (
    let i = 0, j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const xi = Number(polygon[i][1]);
    const yi = Number(polygon[i][0]);

    const xj = Number(polygon[j][1]);
    const yj = Number(polygon[j][0]);

    const intersect =
      ((yi > y) !== (yj > y)) &&
      (
        x <
        ((xj - xi) * (y - yi)) /
        ((yj - yi) || Number.EPSILON) +
        xi
      );

    if (intersect) inside = !inside;
  }

  return inside;
}

// Ikki chiziq kesishadimi?
function segmentsIntersect(a, b, c, d) {
  function cross(p1, p2, p3) {
    return (
      (p2[1] - p1[1]) * (p3[0] - p1[0]) -
      (p2[0] - p1[0]) * (p3[1] - p1[1])
    );
  }

  const c1 = cross(a, b, c);
  const c2 = cross(a, b, d);
  const c3 = cross(c, d, a);
  const c4 = cross(c, d, b);

  return (
    ((c1 > 0 && c2 < 0) || (c1 < 0 && c2 > 0)) &&
    ((c3 > 0 && c4 < 0) || (c3 < 0 && c4 > 0))
  );
}

// Ikki hudud kesishganini aniqlash
function polygonsOverlap(polyA, polyB) {
  if (!Array.isArray(polyA) || !Array.isArray(polyB)) {
    return false;
  }

  if (polyA.length < 3 || polyB.length < 3) {
    return false;
  }

  // Chegaralar kesishishi
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  // Bittasining ichida ikkinchisi
  if (pointInPolygon(polyA[0], polyB)) {
    return true;
  }

  if (pointInPolygon(polyB[0], polyA)) {
    return true;
  }

  return false;
}

// Store'dan world olish
function getWorld() {
  if (typeof store.getWorld === "function") {
    return store.getWorld();
  }

  if (store.world) {
    return store.world;
  }

  if (global.__IZLA_WORLD__) {
    return global.__IZLA_WORLD__;
  }

  global.__IZLA_WORLD__ = {
    players: []
  };

  return global.__IZLA_WORLD__;
}

// World saqlash
async function saveWorld(world) {
  if (typeof store.setWorld === "function") {
    return await store.setWorld(world);
  }

  if (typeof store.saveWorld === "function") {
    return await store.saveWorld(world);
  }

  if (typeof store.save === "function") {
    return await store.save(world);
  }

  store.world = world;
  global.__IZLA_WORLD__ = world;

  return true;
}

// Player topish yoki yaratish
function getPlayer(world, id, name) {
  if (!Array.isArray(world.players)) {
    world.players = [];
  }

  let player = world.players.find(
    p => String(p.id) === String(id)
  );

  if (!player) {
    player = {
      id: String(id),
      name: String(name || "Noma'lum").slice(0, 30),
      color: playerColor(id),
      area: 0,
      territories: [],
      location: null
    };

    world.players.push(player);
  }

  player.name = String(name || player.name || "Noma'lum")
    .trim()
    .slice(0, 30);

  if (!player.color) {
    player.color = playerColor(id);
  }

  if (!Array.isArray(player.territories)) {
    player.territories = [];
  }

  if (!Number.isFinite(Number(player.area))) {
    player.area = 0;
  }

  return player;
}

// Barcha hududlar ro‘yxatini yangilash
function rebuildArea(player) {
  player.area = player.territories.reduce(
    (sum, territory) =>
      sum + Number(territory.area || 0),
    0
  );
}

// API
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      error: "Faqat POST ishlatiladi"
    });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();

    let points = Array.isArray(body.points)
      ? body.points
      : [];

    const area = Number(body.area || 0);

    // Tekshiruv
    if (!id) {
      return json(res, 400, {
        error: "id kerak"
      });
    }

    if (!name) {
      return json(res, 400, {
        error: "name kerak"
      });
    }

    if (points.length < 3) {
      return json(res, 400, {
        error: "Kamida 3 ta nuqta kerak"
      });
    }

    // Noto‘g‘ri nuqtalarni olib tashlash
    points = points
      .filter(validPoint)
      .slice(0, 5000)
      .map(p => [
        Number(p[0]),
        Number(p[1])
      ]);

    if (points.length < 3) {
      return json(res, 400, {
        error: "Hudud nuqtalari noto‘g‘ri"
      });
    }

    const safeArea = Math.max(
      0,
      Math.min(
        Number.isFinite(area) ? area : 0,
        100000000
      )
    );

    const world = getWorld();

    const player = getPlayer(
      world,
      id,
      name
    );

    // Yangi hudud ID
    const territoryId =
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    // Boshqa odamlarning hududlari bilan kesishganini aniqlash
    const captured = [];

    for (const otherPlayer of world.players) {
      if (
        String(otherPlayer.id) === String(player.id)
      ) {
        continue;
      }

      if (!Array.isArray(otherPlayer.territories)) {
        continue;
      }

      for (const oldTerritory of otherPlayer.territories) {
        if (
          Array.isArray(oldTerritory.points) &&
          polygonsOverlap(
            points,
            oldTerritory.points
          )
        ) {
          captured.push({
            territoryId:
              oldTerritory.id || null,
            ownerId:
              otherPlayer.id,
            ownerName:
              otherPlayer.name
          });
        }
      }
    }

    // Yangi hudud
    const territory = {
      id: territoryId,
      ownerId: player.id,
      ownerName: player.name,
      color: player.color,

      points,

      area: safeArea,

      createdAt: Date.now(),

      // Qaysi hududlar bilan kesishgan
      captured
    };

    // O‘z hududiga qo‘shamiz
    player.territories.push(territory);

    rebuildArea(player);

    // Muhim:
    // Eski hududlarni o‘chirib yubormaymiz.
    // Shuning uchun xaritada odamlar bir-birining
    // hududlarini ko‘ra oladi.
    //
    // Keyinchalik client.js orqali
    // kesishgan joyni yangi egaga tegishli
    // qilib ko‘rsatamiz.

    await saveWorld(world);

    return json(res, 200, {
      ok: true,

      message:
        captured.length > 0
          ? "Hudud boshqa hudud bilan kesishdi va bosib olish qayd qilindi."
          : "Yangi hudud yaratildi.",

      player: {
        id: player.id,
        name: player.name,
        color: player.color,
        area: player.area
      },

      territory,

      captured,

      world
    });

  } catch (error) {
    console.error(
      "TERRITORY API ERROR:",
      error
    );

    return json(res, 500, {
      error: "Server xatosi",
      message:
        error?.message ||
        "Noma'lum xatolik"
    });
  }
};