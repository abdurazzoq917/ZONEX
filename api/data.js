// ============================================================
// IZLA / ZONEX - DATA STORE
// ============================================================
//
// Playerlar
// GPS
// Yurgan masofa
// Hududlar
// Ranglar
//
// location.js
// territory.js
// _store.js
//
// bilan birga ishlaydi.
// ============================================================

const STORAGE_KEY =
  "__zonexPermanentData";


// ============================================================
// ASOSIY STORE
// ============================================================

function createStore() {
  if (
    !globalThis[STORAGE_KEY] ||
    typeof globalThis[STORAGE_KEY] !==
      "object"
  ) {
    globalThis[STORAGE_KEY] = {
      players: {}
    };
  }

  if (
    !globalThis[STORAGE_KEY].players ||
    typeof globalThis[STORAGE_KEY].players !==
      "object"
  ) {
    globalThis[STORAGE_KEY].players = {};
  }

  return globalThis[STORAGE_KEY];
}


const store =
  createStore();


// ============================================================
// PLAYER RANGI
// ============================================================
//
// Rang ID asosida olinadi.
//
// Bir xil ID:
//     har doim bir xil rang
//
// Har xil ID:
//     imkon qadar har xil rang
// ============================================================

function playerColor(id) {
  const colors = [
    "#2563EB",
    "#16A34A",
    "#7C3AED",
    "#EA580C",
    "#0891B2",
    "#DB2777",
    "#65A30D",
    "#9333EA",
    "#0284C7",
    "#CA8A04",
    "#DC2626",
    "#0F766E",
    "#4F46E5",
    "#C2410C",
    "#15803D",
    "#7E22CE"
  ];

  const text =
    String(id);

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

  return (
    colors[
      Math.abs(hash) %
      colors.length
    ]
  );
}


// ============================================================
// PLAYERNI NORMAL HOLATGA KELTIRISH
// ============================================================

function normalizePlayer(
  user,
  id,
  name
) {
  user.id =
    String(
      user.id || id
    );

  if (name) {
    user.name =
      String(name)
        .trim()
        .slice(0, 30);
  }

  if (!user.name) {
    user.name =
      "Noma'lum";
  }

  // Rangni ID bo'yicha
  user.color =
    playerColor(
      user.id
    );


  // Eski distance
  if (
    !Number.isFinite(
      Number(
        user.distance
      )
    )
  ) {
    user.distance = 0;
  }


  // Yangi totalDistance
  if (
    !Number.isFinite(
      Number(
        user.totalDistance
      )
    )
  ) {
    user.totalDistance =
      user.distance;
  }


  // Eski distance va totalDistance
  // bir-biriga mos bo'ladi
  if (
    Number(user.distance) >
    Number(user.totalDistance)
  ) {
    user.totalDistance =
      Number(user.distance);
  }


  // Area
  if (
    !Number.isFinite(
      Number(
        user.area
      )
    )
  ) {
    user.area = 0;
  }


  // Territories
  if (
    !Array.isArray(
      user.territories
    )
  ) {
    user.territories = [];
  }


  // Location
  if (
    user.location === undefined
  ) {
    user.location = null;
  }


  // Time
  if (
    !Number.isFinite(
      Number(
        user.createdAt
      )
    )
  ) {
    user.createdAt =
      Date.now();
  }


  if (
    !Number.isFinite(
      Number(
        user.updatedAt
      )
    )
  ) {
    user.updatedAt =
      Date.now();
  }


  return user;
}


// ============================================================
// PLAYER OLISH / YARATISH
// ============================================================

function getPlayer(
  id,
  name = "Noma'lum"
) {
  id =
    String(id)
      .trim();

  if (!id) {
    throw new Error(
      "Player ID kerak"
    );
  }


  // ----------------------------------------------------------
  // Yangi player
  // ----------------------------------------------------------

  if (
    !store.players[id]
  ) {
    const now =
      Date.now();

    store.players[id] = {

      id,

      name:
        String(
          name ||
          "Noma'lum"
        )
          .trim()
          .slice(0, 30),

      // ID bo'yicha rang
      color:
        playerColor(id),

      // Eski nom
      distance: 0,

      // Yangi nom
      totalDistance: 0,

      // Umumiy hudud
      area: 0,

      // Hududlar
      territories: [],

      // GPS
      location: null,

      // Online
      online: true,

      // Vaqt
      createdAt: now,
      updatedAt: now
    };
  }


  // ----------------------------------------------------------
  // Eski playerni tuzatish
  // ----------------------------------------------------------

  normalizePlayer(
    store.players[id],
    id,
    name
  );


  // ----------------------------------------------------------
  // Yangilangan vaqt
  // ----------------------------------------------------------

  store.players[id].updatedAt =
    Date.now();


  return store.players[id];
}


// ============================================================
// MASOFA QO'SHISH
// ============================================================

function addDistance(
  id,
  name,
  meters
) {
  const user =
    getPlayer(
      id,
      name
    );


  const value =
    Number(meters);


  if (
    Number.isFinite(value) &&
    value > 0
  ) {

    // Juda katta noto'g'ri qiymatni
    // qabul qilmaymiz
    const safeValue =
      Math.min(
        value,
        500
      );


    user.distance +=
      safeValue;


    user.totalDistance =
      user.distance;
  }


  user.updatedAt =
    Date.now();


  return user;
}


// ============================================================
// GPS LOCATION
// ============================================================

function updateLocation(
  id,
  name,
  lat,
  lng
) {
  const user =
    getPlayer(
      id,
      name
    );


  const latitude =
    Number(lat);

  const longitude =
    Number(lng);


  if (
    !Number.isFinite(
      latitude
    ) ||
    !Number.isFinite(
      longitude
    )
  ) {
    throw new Error(
      "GPS koordinatalari noto'g'ri"
    );
  }


  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      "GPS koordinatalari chegaradan tashqarida"
    );
  }


  user.location = {

    lat:
      latitude,

    lng:
      longitude,

    time:
      Date.now()
  };


  user.online =
    true;


  user.updatedAt =
    Date.now();


  return user;
}


// ============================================================
// TERRITORY QO'SHISH
// ============================================================

function addTerritory(
  id,
  name,
  points,
  area
) {
  const user =
    getPlayer(
      id,
      name
    );


  const safePoints =
    Array.isArray(points)
      ? points
          .slice(0, 5000)
          .map(
            point => [
              Number(point[0]),
              Number(point[1])
            ]
          )
      : [];


  const numericArea =
    Number(area);


  const safeArea =
    Math.max(
      0,
      Math.min(
        Number.isFinite(
          numericArea
        )
          ? numericArea
          : 0,
        100000000
      )
    );


  // Territory ID
  const territoryId =
    `territory-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;


  const territory = {

    id:
      territoryId,

    ownerId:
      user.id,

    ownerName:
      user.name,

    color:
      user.color,

    points:
      safePoints,

    area:
      safeArea,

    createdAt:
      Date.now(),

    time:
      Date.now()
  };


  user.territories.push(
    territory
  );


  // ----------------------------------------------------------
  // Umumiy area
  // ----------------------------------------------------------

  rebuildArea(
    user
  );


  user.updatedAt =
    Date.now();


  return user;
}


// ============================================================
// AREA QAYTA HISOBLASH
// ============================================================

function rebuildArea(
  user
) {
  if (
    !Array.isArray(
      user.territories
    )
  ) {
    user.territories = [];
  }


  user.area =
    user.territories.reduce(
      (
        total,
        territory
      ) => {

        const area =
          Number(
            territory.area ||
            0
          );

        if (
          !Number.isFinite(
            area
          )
        ) {
          return total;
        }

        return (
          total +
          area
        );
      },
      0
    );


  return user.area;
}


// ============================================================
// HUDUDNI O'CHIRISH
// ============================================================

function removeTerritory(
  playerId,
  territoryId
) {
  const user =
    findPlayer(
      playerId
    );


  if (!user) {
    return false;
  }


  const oldLength =
    user.territories.length;


  user.territories =
    user.territories.filter(
      territory =>
        String(
          territory.id
        ) !==
        String(
          territoryId
        )
    );


  const removed =
    user.territories.length !==
    oldLength;


  if (removed) {
    rebuildArea(
      user
    );

    user.updatedAt =
      Date.now();
  }


  return removed;
}


// ============================================================
// BARCHA PLAYERLAR
// ============================================================

function getPlayers() {

  return Object.values(
    store.players
  ).map(
    user => {

      normalizePlayer(
        user,
        user.id,
        user.name
      );

      return user;
    }
  );

}


// ============================================================
// BITTA PLAYERNI TOPISH
// ============================================================

function findPlayer(
  id
) {
  return (
    store.players[
      String(id)
    ] ||
    null
  );
}


// ============================================================
// PLAYERNI O'CHIRISH
// ============================================================

function deletePlayer(
  id
) {
  const key =
    String(id);

  if (
    !store.players[key]
  ) {
    return false;
  }

  delete store.players[key];

  return true;
}


// ============================================================
// WORLD
// ============================================================

function getWorld() {

  return {
    players:
      getPlayers()
  };

}


// ============================================================
// WORLDNI SAQLASH
// ============================================================
//
// Hozirgi data.js global memorydan foydalanadi.
//
// Keyinchalik database qo'shsak,
// shu joyni database bilan almashtirish mumkin.
// ============================================================

function setWorld(
  world
) {

  if (
    !world ||
    !Array.isArray(
      world.players
    )
  ) {
    return false;
  }


  for (
    const incoming
    of world.players
  ) {

    if (
      !incoming ||
      !incoming.id
    ) {
      continue;
    }


    const user =
      getPlayer(
        incoming.id,
        incoming.name
      );


    // Rang
    user.color =
      playerColor(
        user.id
      );


    // Location
    if (
      incoming.location
    ) {

      user.location =
        incoming.location;

    }


    // Distance
    if (
      Number.isFinite(
        Number(
          incoming.totalDistance
        )
      )
    ) {

      user.totalDistance =
        Number(
          incoming.totalDistance
        );

      user.distance =
        user.totalDistance;

    }


    // Eski distance
    else if (
      Number.isFinite(
        Number(
          incoming.distance
        )
      )
    ) {

      user.distance =
        Number(
          incoming.distance
        );

      user.totalDistance =
        user.distance;

    }


    // Area
    if (
      Number.isFinite(
        Number(
          incoming.area
        )
      )
    ) {

      user.area =
        Number(
          incoming.area
        );

    }


    // Territories
    if (
      Array.isArray(
        incoming.territories
      )
    ) {

      user.territories =
        incoming.territories;

    }


    // Online
    if (
      typeof incoming.online ===
      "boolean"
    ) {

      user.online =
        incoming.online;

    }


    user.updatedAt =
      Date.now();
  }


  return true;
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {

  // Asosiy store
  store,

  // Player
  getPlayer,
  findPlayer,
  deletePlayer,

  // Location
  updateLocation,

  // Distance
  addDistance,

  // Territory
  addTerritory,
  removeTerritory,

  // Players
  getPlayers,

  // Area
  rebuildArea,

  // World
  getWorld,
  setWorld
};