const {
  getWorld,
  setWorld
} = require("./_store");

// ============================================================
// IZLA - LOCATION API
// ============================================================
//
// Vazifalari:
//
// 1. Telefon GPS koordinatasini qabul qilish
// 2. Foydalanuvchini world.players ichida saqlash
// 3. Har bir ID uchun alohida rang berish
// 4. Yurgan masofani server tomonda hisoblash
// 5. totalDistance ni saqlab borish
// 6. Oxirgi joylashuvni saqlash
// 7. Barcha online playerlarni qaytarish
//
// MUHIM:
//
// Bir xil ID -> bir xil odam
// Bir xil ID -> bir xil rang
//
// Misol:
//
// Telefon A:
// id = abc123
// rang = ko'k
//
// Telefon B:
// id = xyz789
// rang = yashil
//
// ============================================================


// ============================================================
// CORS
// ============================================================

function cors(res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

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

function sendJson(
  res,
  status,
  data
) {
  cors(res);

  return res
    .status(status)
    .json(data);
}


// ============================================================
// PLAYER RANGI
// ============================================================
//
// ID ga qarab rang tanlanadi.
//
// Muhim:
// Bu random emas.
//
// Shuning uchun:
// bir xil ID = har doim bir xil rang
// ============================================================

function playerColor(id) {
  const colors = [
    "#2563EB", // ko'k
    "#16A34A", // yashil
    "#7C3AED", // binafsha
    "#EA580C", // to'q sariq
    "#0891B2", // havorang
    "#DB2777", // pushti
    "#65A30D", // yashil
    "#9333EA", // violet
    "#0284C7", // sky
    "#CA8A04", // sariq
    "#DC2626", // qizil
    "#0F766E", // teal
    "#4F46E5", // indigo
    "#C2410C", // orange
    "#15803D", // green
    "#7E22CE"  // purple
  ];

  const text = String(id);

  let hash = 0;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    hash =
      ((hash << 5) - hash) +
      text.charCodeAt(i);

    hash |= 0;
  }

  const index =
    Math.abs(hash) %
    colors.length;

  return colors[index];
}


// ============================================================
// IKKI NUQTA ORASIDAGI MASOFA
// ============================================================
//
// Haversine formulasi.
//
// Natija metrda qaytariladi.
// ============================================================

function distanceBetween(
  lat1,
  lng1,
  lat2,
  lng2
) {
  const R = 6371000;

  const toRad = value =>
    value *
    Math.PI /
    180;

  const dLat =
    toRad(
      lat2 - lat1
    );

  const dLng =
    toRad(
      lng2 - lng1
    );

  const a =
    Math.sin(dLat / 2) *
    Math.sin(dLat / 2) +
    Math.cos(
      toRad(lat1)
    ) *
    Math.cos(
      toRad(lat2)
    ) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}


// ============================================================
// WORLDNI NORMAL HOLATGA KELTIRISH
// ============================================================

function normalizeWorld(world) {
  if (
    !world ||
    typeof world !== "object"
  ) {
    world = {};
  }

  if (
    !Array.isArray(
      world.players
    )
  ) {
    world.players = [];
  }

  return world;
}


// ============================================================
// PLAYER TOPISH
// ============================================================

function findPlayer(
  world,
  id
) {
  return world.players.find(
    player =>
      String(player.id) ===
      String(id)
  );
}


// ============================================================
// PLAYER YARATISH
// ============================================================

function createPlayer(
  id,
  name
) {
  const now =
    Date.now();

  return {
    // Foydalanuvchi ID
    id: String(id),

    // Foydalanuvchi nomi
    name:
      String(
        name ||
        "Noma'lum"
      )
        .trim()
        .slice(0, 30),

    // ID asosidagi rang
    color:
      playerColor(id),

    // Oxirgi joylashuv
    location: null,

    // Umumiy yurgan masofa
    totalDistance: 0,

    // Hudud maydoni
    area: 0,

    // Hududlar
    territories: [],

    // Birinchi kirgan vaqt
    createdAt: now,

    // Oxirgi ko'rilgan vaqt
    updatedAt: now,

    // Online holati
    online: true
  };
}


// ============================================================
// ESKI PLAYERNI TUZATISH
// ============================================================
//
// Oldingi _store ichidagi playerlarda ayrim maydonlar
// bo'lmasligi mumkin.
//
// Ularni yo'qotmaymiz.
// Faqat yetishmayotganlarini qo'shamiz.
// ============================================================

function normalizePlayer(
  player,
  id,
  name
) {
  if (!player) {
    return createPlayer(
      id,
      name
    );
  }

  // ID
  player.id =
    String(
      player.id ||
      id
    );

  // Name
  if (name) {
    player.name =
      String(name)
        .trim()
        .slice(0, 30);
  } else if (
    !player.name
  ) {
    player.name =
      "Noma'lum";
  }

  // Rang
  //
  // Har doim ID bo'yicha
  // hisoblanadi.
  player.color =
    playerColor(
      player.id
    );

  // Location
  if (
    !player.location ||
    typeof player.location !==
      "object"
  ) {
    player.location = null;
  }

  // Masofa
  if (
    !Number.isFinite(
      Number(
        player.totalDistance
      )
    )
  ) {
    player.totalDistance = 0;
  }

  // Area
  if (
    !Number.isFinite(
      Number(
        player.area
      )
    )
  ) {
    player.area = 0;
  }

  // Territories
  if (
    !Array.isArray(
      player.territories
    )
  ) {
    player.territories = [];
  }

  // Vaqt
  if (
    !Number.isFinite(
      Number(
        player.createdAt
      )
    )
  ) {
    player.createdAt =
      Date.now();
  }

  if (
    !Number.isFinite(
      Number(
        player.updatedAt
      )
    )
  ) {
    player.updatedAt =
      Date.now();
  }

  player.online =
    true;

  return player;
}


// ============================================================
// MASOFA XATOLARINI OLDINI OLISH
// ============================================================
//
// GPS ba'zan birdaniga 500 metr yoki 2 km sakrashi mumkin.
//
// Shuning uchun juda katta sakrashni oddiy yurish deb
// hisoblamaymiz.
//
// 500 metr:
// odatiy GPS yangilanishi uchun yetarli.
// ============================================================

const MAX_REALISTIC_STEP = 500;


// ============================================================
// LOCATION API
// ============================================================

module.exports =
  async function handler(
    req,
    res
  ) {
    cors(res);

    // ========================================================
    // OPTIONS
    // ========================================================

    if (
      req.method ===
      "OPTIONS"
    ) {
      res.statusCode = 204;

      return res.end();
    }


    // ========================================================
    // FAQAT POST
    // ========================================================

    if (
      req.method !==
      "POST"
    ) {
      return sendJson(
        res,
        405,
        {
          error:
            "Faqat POST so'rovi ishlatiladi"
        }
      );
    }


    try {
      // ======================================================
      // BODY
      // ======================================================

      const body =
        req.body || {};


      // ======================================================
      // PLAYER ID
      // ======================================================

      const id =
        String(
          body.id || ""
        ).trim();


      // ======================================================
      // PLAYER NAME
      // ======================================================

      const name =
        String(
          body.name || ""
        ).trim();


      // ======================================================
      // LATITUDE
      // ======================================================

      const lat =
        Number(
          body.lat
        );


      // ======================================================
      // LONGITUDE
      // ======================================================

      const lng =
        Number(
          body.lng
        );


      // ======================================================
      // ID VA NAME TEKSHIRISH
      // ======================================================

      if (
        !id ||
        !name
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              "id va name kerak"
          }
        );
      }


      // ======================================================
      // GPS TEKSHIRISH
      // ======================================================

      if (
        !Number.isFinite(
          lat
        ) ||
        !Number.isFinite(
          lng
        )
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              "GPS koordinatalari noto'g'ri"
          }
        );
      }


      // ======================================================
      // GPS CHEGARASI
      // ======================================================

      if (
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return sendJson(
          res,
          400,
          {
            error:
              "GPS koordinatalari chegaradan tashqarida"
          }
        );
      }


      // ======================================================
      // WORLD
      // ======================================================

      let world =
        getWorld();

      world =
        normalizeWorld(
          world
        );


      // ======================================================
      // PLAYER
      // ======================================================

      let player =
        findPlayer(
          world,
          id
        );


      // ======================================================
      // YANGI PLAYER
      // ======================================================

      if (!player) {
        player =
          createPlayer(
            id,
            name
          );

        world.players.push(
          player
        );
      } else {
        player =
          normalizePlayer(
            player,
            id,
            name
          );
      }


      // ======================================================
      // OLD LOCATION
      // ======================================================

      const oldLocation =
        player.location;


      // ======================================================
      // YANGI MASOFA
      // ======================================================

      let calculatedDistance =
        0;


      // Agar old location mavjud bo'lsa
      // yangi nuqtaga masofa hisoblaymiz.
      if (
        oldLocation &&
        Number.isFinite(
          Number(
            oldLocation.lat
          )
        ) &&
        Number.isFinite(
          Number(
            oldLocation.lng
          )
        )
      ) {
        calculatedDistance =
          distanceBetween(
            Number(
              oldLocation.lat
            ),
            Number(
              oldLocation.lng
            ),
            lat,
            lng
          );

        // GPS sakrashlarini hisoblamaymiz
        if (
          calculatedDistance >
          MAX_REALISTIC_STEP
        ) {
          calculatedDistance = 0;
        }
      }


      // ======================================================
      // CLIENT YUBORGAN DISTANCE
      // ======================================================

      const clientDistance =
        Number(
          body.distance
        );


      // ======================================================
      // QAYSI MASOFANI ISHLATAMIZ?
      // ======================================================
      //
      // Asosiy hisob serverda.
      //
      // Client yuborgan distance faqat qo'shimcha sifatida
      // ishlatiladi.
      //
      // Shu sababli client tomonidan noto'g'ri katta masofa
      // yuborilsa, server uni to'g'ridan-to'g'ri qabul qilmaydi.
      // ======================================================

      let distanceToAdd =
        calculatedDistance;


      // Agar server eski locationni bilmasa,
      // client yuborgan kichik distance ishlatilishi mumkin.
      if (
        !oldLocation &&
        Number.isFinite(
          clientDistance
        ) &&
        clientDistance > 0 &&
        clientDistance <=
          MAX_REALISTIC_STEP
      ) {
        distanceToAdd =
          clientDistance;
      }


      // ======================================================
      // TOTAL DISTANCE
      // ======================================================

      const oldTotal =
        Number(
          player.totalDistance ||
          0
        );


      player.totalDistance =
        oldTotal +
        distanceToAdd;


      // ======================================================
      // YANGI LOCATION
      // ======================================================

      player.location = {
        lat,
        lng,

        // GPS aniqligi bo'lsa saqlaymiz
        accuracy:
          Number.isFinite(
            Number(
              body.accuracy
            )
          )
            ? Number(
                body.accuracy
              )
            : null,

        // Server vaqti
        updatedAt:
          Date.now()
      };


      // ======================================================
      // PLAYER STATUS
      // ======================================================

      player.online =
        true;

      player.updatedAt =
        Date.now();


      // ======================================================
      // RANGNI ID BO'YICHA QAYTA O'RNATISH
      // ======================================================

      player.color =
        playerColor(
          player.id
        );


      // ======================================================
      // ESKI HUDUDLAR RANGINI HAM MOSLAYMIZ
      // ======================================================

      if (
        Array.isArray(
          player.territories
        )
      ) {
        for (
          const territory of
          player.territories
        ) {
          territory.color =
            player.color;

          territory.ownerId =
            player.id;

          territory.ownerName =
            player.name;
        }
      }


      // ======================================================
      // WORLD SAQLASH
      // ======================================================

      await setWorld(
        world
      );


      // ======================================================
      // FAQAT KERAKLI PLAYERLAR
      // ======================================================
      //
      // Frontendga barcha playerlarni beramiz.
      // Shunda telefon A telefon B ni ko'ra oladi.
      //
      // Hududlar ham shu yerda qaytadi.
      // ======================================================

      const players =
        world.players.map(
          p => ({
            id:
              p.id,

            name:
              p.name,

            color:
              p.color,

            location:
              p.location,

            totalDistance:
              Number(
                p.totalDistance ||
                0
              ),

            area:
              Number(
                p.area ||
                0
              ),

            territories:
              Array.isArray(
                p.territories
              )
                ? p.territories
                : [],

            updatedAt:
              p.updatedAt,

            online:
              p.online !== false
          })
        );


      // ======================================================
      // JAVOB
      // ======================================================

      return sendJson(
        res,
        200,
        {
          ok: true,

          message:
            "Joylashuv muvaffaqiyatli saqlandi",

          // Hozirgi player
          player: {
            id:
              player.id,

            name:
              player.name,

            color:
              player.color,

            location:
              player.location,

            totalDistance:
              Number(
                player.totalDistance
              ),

            area:
              Number(
                player.area ||
                0
              ),

            updatedAt:
              player.updatedAt,

            online:
              true
          },

          // Bu request davomida qo'shilgan masofa
          distanceAdded:
            distanceToAdd,

          // Xarita uchun barcha odamlar
          players
        }
      );

    } catch (error) {
      // ======================================================
      // XATO
      // ======================================================

      console.error(
        "LOCATION API XATOSI:",
        error
      );

      return sendJson(
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