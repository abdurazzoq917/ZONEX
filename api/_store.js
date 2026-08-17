// api/_store.js
// ============================================================
// IZLA - UMUMIY STORE
// ============================================================
//
// Bu fayl:
// 1. Playerlarni boshqaradi
// 2. Locationni saqlaydi
// 3. Yurgan masofani saqlaydi
// 4. Hududlarni saqlaydi
// 5. location.js va territory.js uchun umumiy API beradi
// 6. Eski data.js bilan ham ishlaydi
//
// ============================================================

const {
  getPlayer,
  updateLocation,
  addDistance,
  addTerritory,
  getPlayers
} = require("./data");


// ============================================================
// WORLD
// ============================================================
//
// location.js va territory.js:
//     getWorld()
//     setWorld()
//
// funksiyalaridan foydalanadi.
//
// Asosiy player ma'lumotlari data.js orqali olinadi.
// ============================================================

const world = {

  get players() {
    return getPlayers();
  }

};


// ============================================================
// PLAYER TOPISH / YARATISH
// ============================================================

function player(id, name) {
  return getPlayer(
    String(id),
    String(name || "Noma'lum")
  );
}


// ============================================================
// WORLD OLISH
// ============================================================

function getWorld() {
  return world;
}


// ============================================================
// WORLD SAQLASH
// ============================================================
//
// data.js alohida funksiyalar orqali ma'lumotlarni saqlaydi.
//
// Agar keyinchalik data.js database bilan ishlasa,
// shu store avtomatik ravishda undan foydalanadi.
//
// ============================================================

async function setWorld(newWorld) {

  if (
    !newWorld ||
    typeof newWorld !== "object"
  ) {
    return false;
  }


  const players =
    Array.isArray(
      newWorld.players
    )
      ? newWorld.players
      : [];


  // ----------------------------------------------------------
  // Har bir playerni data.js orqali yangilaymiz
  // ----------------------------------------------------------

  for (
    const p of players
  ) {

    if (!p || !p.id) {
      continue;
    }


    const id =
      String(p.id);


    const name =
      String(
        p.name ||
        "Noma'lum"
      );


    // --------------------------------------------------------
    // Player mavjud bo'lmasa yaratamiz
    // --------------------------------------------------------

    const current =
      getPlayer(
        id,
        name
      );


    if (!current) {
      continue;
    }


    // --------------------------------------------------------
    // LOCATION
    // --------------------------------------------------------

    if (
      p.location &&
      Number.isFinite(
        Number(
          p.location.lat
        )
      ) &&
      Number.isFinite(
        Number(
          p.location.lng
        )
      )
    ) {

      updateLocation(
        id,
        name,
        Number(
          p.location.lat
        ),
        Number(
          p.location.lng
        )
      );

    }


    // --------------------------------------------------------
    // MASOFA
    // --------------------------------------------------------
    //
    // setWorld har safar totalDistance'ni qayta qo'shmasligi
    // kerak.
    //
    // Shuning uchun distance bu yerda faqat mavjud bo'lmasa
    // ishlatiladi.
    // --------------------------------------------------------

    if (
      Number.isFinite(
        Number(
          p.totalDistance
        )
      ) &&
      Number(
        p.totalDistance
      ) > 0
    ) {

      current.totalDistance =
        Number(
          p.totalDistance
        );

    }


    // --------------------------------------------------------
    // RANG
    // --------------------------------------------------------

    if (p.color) {
      current.color =
        String(
          p.color
        );
    }


    // --------------------------------------------------------
    // AREA
    // --------------------------------------------------------

    if (
      Number.isFinite(
        Number(
          p.area
        )
      )
    ) {

      current.area =
        Number(
          p.area
        );

    }


    // --------------------------------------------------------
    // TERRITORIES
    // --------------------------------------------------------

    if (
      Array.isArray(
        p.territories
      )
    ) {

      current.territories =
        p.territories;

    }


    // --------------------------------------------------------
    // VAQTLAR
    // --------------------------------------------------------

    if (
      Number.isFinite(
        Number(
          p.createdAt
        )
      )
    ) {

      current.createdAt =
        Number(
          p.createdAt
        );

    }


    if (
      Number.isFinite(
        Number(
          p.updatedAt
        )
      )
    ) {

      current.updatedAt =
        Number(
          p.updatedAt
        );

    }


    // --------------------------------------------------------
    // ONLINE
    // --------------------------------------------------------

    if (
      typeof p.online ===
      "boolean"
    ) {

      current.online =
        p.online;

    }

  }


  return true;
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

  // World
  world,

  getWorld,
  setWorld,

  // Player
  player,
  getPlayer,

  // Location
  updateLocation,

  // Distance
  addDistance,

  // Territory
  addTerritory,

  // Barcha playerlar
  getPlayers

};