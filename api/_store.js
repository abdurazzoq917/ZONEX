const initialWorld = require("../world.json");

// Vercel serverless instance ichida umumiy world
const world =
  globalThis.__zonexWorld ||
  structuredClone(initialWorld);

globalThis.__zonexWorld = world;

// world.players doim mavjud bo‘lsin
if (!Array.isArray(world.players)) {
  world.players = [];
}

// Player topish yoki yaratish
function player(id, name) {
  id = String(id || "").trim();

  let item = world.players.find(
    (entry) => String(entry.id) === id
  );

  // Yangi player
  if (!item) {
    const hue =
      Math.abs(
        [...id].reduce(
          (sum, char) =>
            sum + char.charCodeAt(0),
          0
        ) * 47
      ) % 360;

    item = {
      id,
      name: String(name || "Noma'lum").slice(0, 30),

      color: `hsl(${hue} 72% 48%)`,

      area: 0,

      territories: [],

      // Odamning hozirgi joylashuvi
      location: null,

      // Oxirgi yangilangan vaqt
      lastSeen: Date.now()
    };

    world.players.push(item);
  }

  // Nikni yangilash
  if (name) {
    item.name = String(name)
      .trim()
      .slice(0, 30);
  }

  // Eski playerlarda yo‘q bo‘lsa
  if (!Array.isArray(item.territories)) {
    item.territories = [];
  }

  if (!item.color) {
    const hue =
      Math.abs(
        [...id].reduce(
          (sum, char) =>
            sum + char.charCodeAt(0),
          0
        ) * 47
      ) % 360;

    item.color =
      `hsl(${hue} 72% 48%)`;
  }

  if (!Number.isFinite(Number(item.area))) {
    item.area = 0;
  }

  return item;
}

// Player joylashuvini yangilash
function updateLocation(
  id,
  name,
  lat,
  lng
) {
  const item = player(id, name);

  item.location = {
    lat: Number(lat),
    lng: Number(lng),
    time: Date.now()
  };

  item.lastSeen = Date.now();

  return item;
}

// Player hudud maydonini qayta hisoblash
function updateArea(item) {
  item.area =
    item.territories.reduce(
      (sum, territory) =>
        sum +
        Number(
          territory.area || 0
        ),
      0
    );

  return item.area;
}

// Hudud qo‘shish
function addTerritory(
  id,
  name,
  territory
) {
  const item = player(id, name);

  item.territories.push(
    territory
  );

  updateArea(item);

  return item;
}

module.exports = {
  world,
  player,
  updateLocation,
  addTerritory,
  updateArea
};