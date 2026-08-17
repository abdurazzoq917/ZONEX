// api/territory.js
// ============================================================
// IZLA - HUDUD API
// ============================================================
//
// Vazifalari:
// 1. Foydalanuvchini topish yoki yaratish
// 2. Yangi hudud yaratish
// 3. Hudud nuqtalarini tekshirish
// 4. Hududlar kesishishini aniqlash
// 5. Boshqa o'yinchining hududini bosib olishni qayd qilish
// 6. Foydalanuvchining umumiy maydonini hisoblash
// 7. Ma'lumotlarni umumiy store orqali saqlash
//
// Muhim:
// Ma'lumotlar faqat shu faylda saqlanmaydi.
// api/_store.js orqali doimiy saqlash mexanizmi ishlaydi.
// ============================================================

const crypto = require("crypto");

// Umumiy ma'lumotlar ombori
const store = require("./_store");

// ============================================================
// CORS
// ============================================================

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

// ============================================================
// JSON JAVOB
// ============================================================

function json(res, status, data) {
  setCors(res);

  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  return res.end(
    JSON.stringify(data)
  );
}

// ============================================================
// REQUEST BODY O'QISH
// ============================================================

async function readBody(req) {
  // Vercel ba'zan body'ni oldindan parse qilib beradi
  if (
    req.body &&
    typeof req.body === "object"
  ) {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      // 2 MB dan katta requestni qabul qilmaymiz
      if (body.length > 2 * 1024 * 1024) {
        reject(
          new Error("So'rov juda katta")
        );

        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(
          body || "{}"
        );

        resolve(data);
      } catch (error) {
        reject(
          new Error(
            "JSON ma'lumot noto'g'ri"
          )
        );
      }
    });

    req.on("error", reject);
  });
}

// ============================================================
// O'YINCHI RANGI
// ============================================================

function playerColor(id) {
  let hash = 0;

  for (const char of String(id)) {
    hash =
      ((hash << 5) - hash) +
      char.charCodeAt(0);

    hash |= 0;
  }

  const hue =
    Math.abs(hash) % 360;

  return `hsl(${hue} 72% 48%)`;
}

// ============================================================
// NUQTA TEKSHIRISH
// ============================================================
//
// Nuqta:
// [latitude, longitude]
//
// latitude  = -90 ... 90
// longitude = -180 ... 180
// ============================================================

function validPoint(point) {
  if (!Array.isArray(point)) {
    return false;
  }

  if (point.length < 2) {
    return false;
  }

  const latitude =
    Number(point[0]);

  const longitude =
    Number(point[1]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return false;
  }

  if (
    latitude < -90 ||
    latitude > 90
  ) {
    return false;
  }

  if (
    longitude < -180 ||
    longitude > 180
  ) {
    return false;
  }

  return true;
}

// ============================================================
// POLYGON ICHIDAGI NUQTA
// ============================================================

function pointInPolygon(
  point,
  polygon
) {
  if (
    !Array.isArray(point) ||
    !Array.isArray(polygon) ||
    polygon.length < 3
  ) {
    return false;
  }

  // X = longitude
  const x = Number(point[1]);

  // Y = latitude
  const y = Number(point[0]);

  let inside = false;

  for (
    let i = 0,
      j = polygon.length - 1;
    i < polygon.length;
    j = i++
  ) {
    const xi =
      Number(polygon[i][1]);

    const yi =
      Number(polygon[i][0]);

    const xj =
      Number(polygon[j][1]);

    const yj =
      Number(polygon[j][0]);

    const kesishadi =
      ((yi > y) !== (yj > y)) &&
      (
        x <
        (
          (xj - xi) *
          (y - yi)
        ) /
        ((yj - yi) || Number.EPSILON) +
        xi
      );

    if (kesishadi) {
      inside = !inside;
    }
  }

  return inside;
}

// ============================================================
// CHIZIQLAR KESISHISHI
// ============================================================

function segmentsIntersect(
  a,
  b,
  c,
  d
) {
  if (
    !validPoint(a) ||
    !validPoint(b) ||
    !validPoint(c) ||
    !validPoint(d)
  ) {
    return false;
  }

  function cross(
    p1,
    p2,
    p3
  ) {
    return (
      (p2[1] - p1[1]) *
      (p3[0] - p1[0]) -
      (p2[0] - p1[0]) *
      (p3[1] - p1[1])
    );
  }

  const c1 =
    cross(a, b, c);

  const c2 =
    cross(a, b, d);

  const c3 =
    cross(c, d, a);

  const c4 =
    cross(c, d, b);

  // Oddiy holatda kesishish
  const first =
    (
      (c1 > 0 && c2 < 0) ||
      (c1 < 0 && c2 > 0)
    );

  const second =
    (
      (c3 > 0 && c4 < 0) ||
      (c3 < 0 && c4 > 0)
    );

  if (first && second) {
    return true;
  }

  // Chegara ustida yotish holatlari
  function onSegment(
    p,
    q,
    r
  ) {
    return (
      q[0] >= Math.min(
        p[0],
        r[0]
      ) &&
      q[0] <= Math.max(
        p[0],
        r[0]
      ) &&
      q[1] >= Math.min(
        p[1],
        r[1]
      ) &&
      q[1] <= Math.max(
        p[1],
        r[1]
      )
    );
  }

  const EPS = 1e-10;

  if (
    Math.abs(c1) < EPS &&
    onSegment(a, c, b)
  ) {
    return true;
  }

  if (
    Math.abs(c2) < EPS &&
    onSegment(a, d, b)
  ) {
    return true;
  }

  if (
    Math.abs(c3) < EPS &&
    onSegment(c, a, d)
  ) {
    return true;
  }

  if (
    Math.abs(c4) < EPS &&
    onSegment(c, b, d)
  ) {
    return true;
  }

  return false;
}

// ============================================================
// IKKI HUDUD KESISHISHINI TEKSHIRISH
// ============================================================

function polygonsOverlap(
  polyA,
  polyB
) {
  if (
    !Array.isArray(polyA) ||
    !Array.isArray(polyB)
  ) {
    return false;
  }

  if (
    polyA.length < 3 ||
    polyB.length < 3
  ) {
    return false;
  }

  // 1. Chegaralari kesishadimi?
  for (
    let i = 0;
    i < polyA.length;
    i++
  ) {
    const a1 =
      polyA[i];

    const a2 =
      polyA[
        (i + 1) %
        polyA.length
      ];

    for (
      let j = 0;
      j < polyB.length;
      j++
    ) {
      const b1 =
        polyB[j];

      const b2 =
        polyB[
          (j + 1) %
          polyB.length
        ];

      if (
        segmentsIntersect(
          a1,
          a2,
          b1,
          b2
        )
      ) {
        return true;
      }
    }
  }

  // 2. A polygonning birinchi nuqtasi B ichidami?
  if (
    pointInPolygon(
      polyA[0],
      polyB
    )
  ) {
    return true;
  }

  // 3. B polygonning birinchi nuqtasi A ichidami?
  if (
    pointInPolygon(
      polyB[0],
      polyA
    )
  ) {
    return true;
  }

  return false;
}

// ============================================================
// STORE'DAN WORLD OLISH
// ============================================================

function getWorld() {
  if (
    typeof store.getWorld ===
    "function"
  ) {
    return store.getWorld();
  }

  if (store.world) {
    return store.world;
  }

  if (
    global.__IZLA_WORLD__
  ) {
    return global.__IZLA_WORLD__;
  }

  // Agar hali world mavjud bo'lmasa
  global.__IZLA_WORLD__ = {
    players: []
  };

  return global.__IZLA_WORLD__;
}

// ============================================================
// WORLD SAQLASH
// ============================================================

async function saveWorld(
  world
) {
  if (
    typeof store.setWorld ===
    "function"
  ) {
    return await store.setWorld(
      world
    );
  }

  if (
    typeof store.saveWorld ===
    "function"
  ) {
    return await store.saveWorld(
      world
    );
  }

  if (
    typeof store.save ===
    "function"
  ) {
    return await store.save(
      world
    );
  }

  // Zaxira varianti
  store.world = world;

  global.__IZLA_WORLD__ =
    world;

  return true;
}

// ============================================================
// PLAYER TOPISH YOKI YARATISH
// ============================================================

function getPlayer(
  world,
  id,
  name
) {
  if (
    !Array.isArray(
      world.players
    )
  ) {
    world.players = [];
  }

  let player =
    world.players.find(
      p =>
        String(p.id) ===
        String(id)
    );

  // Agar player topilmasa
  // yangi player yaratamiz
  if (!player) {
    player = {
      id: String(id),

      name: String(
        name ||
        "Noma'lum"
      )
        .trim()
        .slice(0, 30),

      color:
        playerColor(id),

      // Umumiy egallangan maydon
      area: 0,

      // Barcha hududlar
      territories: [],

      // Oxirgi joylashuv
      location: null,

      // Umumiy yurgan masofa
      totalDistance: 0,

      // Oxirgi yangilanish
      updatedAt: Date.now(),

      // Player yaratilgan vaqt
      createdAt: Date.now()
    };

    world.players.push(
      player
    );
  }

  // Ismni yangilash
  if (name) {
    player.name =
      String(name)
        .trim()
        .slice(0, 30);
  }

  // Rang bo'lmasa yaratamiz
  if (!player.color) {
    player.color =
      playerColor(id);
  }

  // territories array bo'lmasa
  if (
    !Array.isArray(
      player.territories
    )
  ) {
    player.territories = [];
  }

  // area noto'g'ri bo'lsa
  if (
    !Number.isFinite(
      Number(player.area)
    )
  ) {
    player.area = 0;
  }

  // Masofa bo'lmasa
  if (
    !Number.isFinite(
      Number(
        player.totalDistance
      )
    )
  ) {
    player.totalDistance = 0;
  }

  return player;
}

// ============================================================
// PLAYER UMUMIY MAYDONINI HISOBLASH
// ============================================================

function rebuildArea(
  player
) {
  if (
    !Array.isArray(
      player.territories
    )
  ) {
    player.territories = [];
  }

  player.area =
    player.territories.reduce(
      (
        jami,
        territory
      ) => {
        const area =
          Number(
            territory.area || 0
          );

        if (
          !Number.isFinite(
            area
          )
        ) {
          return jami;
        }

        return jami + area;
      },
      0
    );
}

// ============================================================
// HUDUDNI O'CHIRISH
// ============================================================

function removeTerritory(
  player,
  territoryId
) {
  if (
    !Array.isArray(
      player.territories
    )
  ) {
    return false;
  }

  const oldLength =
    player.territories.length;

  player.territories =
    player.territories.filter(
      territory =>
        String(
          territory.id
        ) !==
        String(territoryId)
    );

  const removed =
    player.territories.length !==
    oldLength;

  if (removed) {
    rebuildArea(player);
  }

  return removed;
}

// ============================================================
// HUDUDNI TOPISH
// ============================================================

function findTerritory(
  world,
  territoryId
) {
  for (
    const player of
    world.players || []
  ) {
    for (
      const territory of
      player.territories || []
    ) {
      if (
        String(
          territory.id
        ) ===
        String(territoryId)
      ) {
        return {
          player,
          territory
        };
      }
    }
  }

  return null;
}

// ============================================================
// YANGI HUDUD ID
// ============================================================

function createTerritoryId() {
  if (
    crypto &&
    typeof crypto.randomUUID ===
    "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2)
  );
}

// ============================================================
// API HANDLER
// ============================================================

module.exports =
  async function handler(
    req,
    res
  ) {
    setCors(res);

    // --------------------------------------------------------
    // OPTIONS
    // --------------------------------------------------------

    if (
      req.method ===
      "OPTIONS"
    ) {
      res.statusCode = 204;
      return res.end();
    }

    // --------------------------------------------------------
    // FAQAT POST
    // --------------------------------------------------------

    if (
      req.method !==
      "POST"
    ) {
      return json(
        res,
        405,
        {
          error:
            "Faqat POST so'rovi ishlatiladi"
        }
      );
    }

    try {
      // ------------------------------------------------------
      // BODY
      // ------------------------------------------------------

      const body =
        await readBody(req);

      // ------------------------------------------------------
      // PLAYER MA'LUMOTLARI
      // ------------------------------------------------------

      const id =
        String(
          body.id || ""
        ).trim();

      const name =
        String(
          body.name || ""
        ).trim();

      // ------------------------------------------------------
      // NUQTALAR
      // ------------------------------------------------------

      let points =
        Array.isArray(
          body.points
        )
          ? body.points
          : [];

      // ------------------------------------------------------
      // MAYDON
      // ------------------------------------------------------

      const area =
        Number(
          body.area || 0
        );

      // ------------------------------------------------------
      // ID TEKSHIRISH
      // ------------------------------------------------------

      if (!id) {
        return json(
          res,
          400,
          {
            error:
              "Foydalanuvchi ID'si kerak"
          }
        );
      }

      // ------------------------------------------------------
      // NAME TEKSHIRISH
      // ------------------------------------------------------

      if (!name) {
        return json(
          res,
          400,
          {
            error:
              "Foydalanuvchi nomi kerak"
          }
        );
      }

      // ------------------------------------------------------
      // NUQTALAR SONI
      // ------------------------------------------------------

      if (
        points.length < 3
      ) {
        return json(
          res,
          400,
          {
            error:
              "Hudud yaratish uchun kamida 3 ta nuqta kerak"
          }
        );
      }

      // ------------------------------------------------------
      // NUQTALARNI TOZALASH
      // ------------------------------------------------------

      points =
        points
          .filter(
            validPoint
          )
          .slice(
            0,
            5000
          )
          .map(
            point => [
              Number(point[0]),
              Number(point[1])
            ]
          );

      // ------------------------------------------------------
      // QAYTA TEKSHIRISH
      // ------------------------------------------------------

      if (
        points.length < 3
      ) {
        return json(
          res,
          400,
          {
            error:
              "Hududning nuqtalari noto'g'ri"
          }
        );
      }

      // ------------------------------------------------------
      // AREA XAVFSIZ QIYMATI
      // ------------------------------------------------------

      const safeArea =
        Math.max(
          0,
          Math.min(
            Number.isFinite(
              area
            )
              ? area
              : 0,
            100000000
          )
        );

      // ------------------------------------------------------
      // WORLD
      // ------------------------------------------------------

      const world =
        getWorld();

      if (
        !Array.isArray(
          world.players
        )
      ) {
        world.players = [];
      }

      // ------------------------------------------------------
      // PLAYER
      // ------------------------------------------------------

      const player =
        getPlayer(
          world,
          id,
          name
        );

      // ------------------------------------------------------
      // YANGI HUDUD ID
      // ------------------------------------------------------

      const territoryId =
        createTerritoryId();

      // ------------------------------------------------------
      // BOSIB OLINGAN HUDUDLAR
      // ------------------------------------------------------

      const captured = [];

      // Boshqa playerlarning hududlarini ko'ramiz
      for (
        const otherPlayer of
        world.players
      ) {
        // O'z hududimizni tekshirmaymiz
        if (
          String(
            otherPlayer.id
          ) ===
          String(player.id)
        ) {
          continue;
        }

        if (
          !Array.isArray(
            otherPlayer.territories
          )
        ) {
          continue;
        }

        for (
          const oldTerritory of
          otherPlayer.territories
        ) {
          if (
            !Array.isArray(
              oldTerritory.points
            )
          ) {
            continue;
          }

          const overlap =
            polygonsOverlap(
              points,
              oldTerritory.points
            );

          if (!overlap) {
            continue;
          }

          captured.push({
            territoryId:
              oldTerritory.id ||
              null,

            ownerId:
              otherPlayer.id,

            ownerName:
              otherPlayer.name,

            area:
              Number(
                oldTerritory.area ||
                0
              )
          });
        }
      }

      // ------------------------------------------------------
      // YANGI HUDUD
      // ------------------------------------------------------

      const territory = {
        id:
          territoryId,

        ownerId:
          player.id,

        ownerName:
          player.name,

        color:
          player.color,

        // Polygon nuqtalari
        points,

        // Hudud maydoni
        area:
          safeArea,

        // Yaratilgan vaqt
        createdAt:
          Date.now(),

        // Qaysi hududlarni bosib oldi
        captured
      };

      // ------------------------------------------------------
      // HUDUDNI PLAYERGA QO'SHISH
      // ------------------------------------------------------

      player.territories.push(
        territory
      );

      // Umumiy maydonni qayta hisoblash
      rebuildArea(
        player
      );

      // ------------------------------------------------------
      // BOSIB OLINGAN HUDUDLARNI O'CHIRISH
      // ------------------------------------------------------
      //
      // Bu yerda haqiqiy capture ishlaydi.
      // Yangi hudud boshqa player hududiga tegsa,
      // eski hudud o'chiriladi.
      //

      for (
        const capturedTerritory
        of captured
      ) {
        if (
          !capturedTerritory
            .territoryId
        ) {
          continue;
        }

        const oldOwner =
          world.players.find(
            p =>
              String(p.id) ===
              String(
                capturedTerritory.ownerId
              )
          );

        if (!oldOwner) {
          continue;
        }

        removeTerritory(
          oldOwner,
          capturedTerritory.territoryId
        );
      }

      // ------------------------------------------------------
      // PLAYER MAYDONINI YANA HISOBLASH
      // ------------------------------------------------------

      rebuildArea(
        player
      );

      // ------------------------------------------------------
      // BARCHA PLAYERLAR MAYDONINI TEKSHIRISH
      // ------------------------------------------------------

      for (
        const p of
        world.players
      ) {
        rebuildArea(p);
      }

      // ------------------------------------------------------
      // YANGILANISH VAQTI
      // ------------------------------------------------------

      player.updatedAt =
        Date.now();

      // ------------------------------------------------------
      // SAQLASH
      // ------------------------------------------------------

      await saveWorld(
        world
      );

      // ------------------------------------------------------
      // JAVOB
      // ------------------------------------------------------

      return json(
        res,
        200,
        {
          ok: true,

          message:
            captured.length > 0
              ? "Yangi hudud yaratildi va kesishgan hududlar bosib olindi."
              : "Yangi hudud muvaffaqiyatli yaratildi.",

          player: {
            id:
              player.id,

            name:
              player.name,

            color:
              player.color,

            area:
              player.area,

            totalDistance:
              Number(
                player.totalDistance ||
                0
              )
          },

          territory,

          captured,

          // Frontend xaritani yangilashi uchun
          world
        }
      );

    } catch (error) {
      // ------------------------------------------------------
      // SERVER XATOSI
      // ------------------------------------------------------

      console.error(
        "TERRITORY API XATOSI:",
        error
      );

      return json(
        res,
        500,
        {
          error:
            "Serverda xatolik yuz berdi",

          message:
            error?.message ||
            "Noma'lum xatolik"
        }
      );
    }
  };