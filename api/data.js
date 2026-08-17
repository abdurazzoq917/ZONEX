// ZONEX DOIMIY MA'LUMOTLAR
// Playerlar, masofa va hududlar shu obyekt orqali boshqariladi.

const STORAGE_KEY = "__zonexPermanentData";

function createStore() {
  if (!globalThis[STORAGE_KEY]) {
    globalThis[STORAGE_KEY] = {
      players: {}
    };
  }

  return globalThis[STORAGE_KEY];
}

const store = createStore();

function getPlayer(id, name = "Noma'lum") {
  id = String(id);

  if (!store.players[id]) {
    const hue =
      Math.abs(
        [...id].reduce(
          (sum, char) =>
            sum + char.charCodeAt(0),
          0
        ) * 47
      ) % 360;

    store.players[id] = {
      id,
      name: String(name).slice(0, 30),
      color: `hsl(${hue} 72% 48%)`,

      // DOIMIY STATISTIKA
      distance: 0,
      area: 0,

      // Barcha egallangan hududlar
      territories: [],

      // Oxirgi joylashuv
      location: null,

      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  if (name) {
    store.players[id].name =
      String(name).slice(0, 30);
  }

  store.players[id].updatedAt =
    Date.now();

  return store.players[id];
}

// Masofani saqlash
function addDistance(id, name, meters) {
  const user = getPlayer(id, name);

  const value = Number(meters);

  if (
    Number.isFinite(value) &&
    value > 0
  ) {
    user.distance += value;
  }

  user.updatedAt = Date.now();

  return user;
}

// GPS joylashuvini saqlash
function updateLocation(
  id,
  name,
  lat,
  lng
) {
  const user = getPlayer(id, name);

  user.location = {
    lat: Number(lat),
    lng: Number(lng),
    time: Date.now()
  };

  user.updatedAt = Date.now();

  return user;
}

// Yangi hududni saqlash
function addTerritory(
  id,
  name,
  points,
  area
) {
  const user = getPlayer(id, name);

  const safePoints =
    Array.isArray(points)
      ? points.slice(0, 5000)
      : [];

  const safeArea =
    Math.max(
      0,
      Math.min(
        Number(area) || 0,
        100000000
      )
    );

  user.territories.push({
    points: safePoints,
    area: safeArea,
    time: Date.now()
  });

  // Umumiy hududni qayta hisoblash
  user.area =
    user.territories.reduce(
      (sum, territory) =>
        sum +
        Number(territory.area || 0),
      0
    );

  user.updatedAt = Date.now();

  return user;
}

// Barcha odamlarni olish
function getPlayers() {
  return Object.values(
    store.players
  );
}

// Bitta odamni olish
function findPlayer(id) {
  return store.players[String(id)] || null;
}

module.exports = {
  store,
  getPlayer,
  addDistance,
  updateLocation,
  addTerritory,
  getPlayers,
  findPlayer
};