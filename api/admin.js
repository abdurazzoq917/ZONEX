// api/admin.js
// ============================================================
// ADMIN PANEL
//
//   GET /api/admin?id=<admin>&key=<ADMIN_KEY>
//
// Bir so'rovda hamma raqam:
//
//   - nechta foydalanuvchi ro'yxatdan o'tgan
//   - hozir nechtasi onlayn
//   - bugun / hafta / oy ichida nechtasi qo'shilgan
//   - nechtasi faol (oxirgi hafta ichida o'ynagan)
//   - jami hudud, maydon, yurilgan masofa
//   - xaritalar bo'yicha taqsimot
//   - shaharlar bo'yicha taqsimot
//   - ZoneX Plus obunachilari
//   - kutilayotgan to'lovlar (Plus, naqish, point yechish)
//   - hamkor joylar va ular necha marta ko'rsatilgan
//
// Faqat admin ko'radi. ADMIN_KEY .env da qo'yilgan bo'lsa,
// u ham to'g'ri bo'lishi shart.
// ============================================================

const { json, preflight } = require("./_http");

const {
  readPlayers,
  readPlaces,
  readClans,
  adminAllowed,
  storageReport,
  cities,
  plus,
  maps,
  clans,
  RULES
} = require("./_store");

const { guard } = require("./_auth");

const DAY = 24 * 60 * 60 * 1000;

// Oxirgi qachon ko'ringan
function lastSeen(player) {
  return Math.max(
    Number(player.updatedAt) || 0,
    player.location ? Number(player.location.time || 0) : 0
  );
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, { error: "Faqat GET so'rovi" });
  }

  try {
    const params = new URLSearchParams(req.url.split("?")[1] || "");

    const id = String(params.get("id") || "").trim();

    const players = await readPlayers();

    const check = guard(players, id, req, null);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    if (!adminAllowed(check.player, params.get("key"))) {
      return json(res, 403, {
        error: "not_admin",
        message: "Bu sahifa faqat admin uchun"
      });
    }

    const all = Object.values(players);

    const now = Date.now();

    // ---------------------------------------------------------
    // ASOSIY RAQAMLAR
    // ---------------------------------------------------------

    const counts = {
      total: all.length,
      online: 0,
      today: 0,
      week: 0,
      month: 0,
      activeWeek: 0,
      activeMonth: 0,
      withHome: 0,
      withEmail: 0,
      banned: 0,
      plus: 0
    };

    const totals = {
      territories: 0,
      area: 0,
      distance: 0,
      xp: 0,
      points: 0,
      pointsEarned: 0
    };

    const byMap = {};
    const byCity = {};
    const byLevel = {};

    maps.MAP_IDS.forEach((mapId) => {
      byMap[mapId] = { players: 0, territories: 0, area: 0 };
    });

    // Kutilayotgan to'lovlar
    const pending = { plus: [], skins: [], cashouts: [] };

    all.forEach((player) => {
      const seen = lastSeen(player);

      if (player.online) counts.online += 1;

      const born = Number(player.createdAt) || 0;

      if (now - born < DAY) counts.today += 1;
      if (now - born < 7 * DAY) counts.week += 1;
      if (now - born < 30 * DAY) counts.month += 1;

      if (now - seen < 7 * DAY) counts.activeWeek += 1;
      if (now - seen < 30 * DAY) counts.activeMonth += 1;

      if (player.home) counts.withHome += 1;
      if (player.email) counts.withEmail += 1;
      if (Number(player.banUntil) !== 0) counts.banned += 1;
      if (plus.isPlus(player)) counts.plus += 1;

      totals.territories += player.territories.length;
      totals.area += Number(player.area) || 0;
      totals.distance += Number(player.totalDistance) || 0;
      totals.xp += Number(player.xp) || 0;
      totals.points += Number(player.points) || 0;
      totals.pointsEarned += Number(player.earned) || 0;

      // xarita bo'yicha
      const mapId = player.mapId || maps.DEFAULT_MAP;

      if (byMap[mapId]) byMap[mapId].players += 1;

      player.territories.forEach((territory) => {
        const tMap = maps.mapOf(territory);

        if (!byMap[tMap]) return;

        byMap[tMap].territories += 1;
        byMap[tMap].area += Number(territory.area) || 0;
      });

      // shahar bo'yicha
      const city = player.city || cities.OTHER.id;

      byCity[city] = (byCity[city] || 0) + 1;

      // daraja bo'yicha
      const bucket = Math.floor((Number(player.level) || 1) / 5) * 5;

      const label = bucket + "-" + (bucket + 4);

      byLevel[label] = (byLevel[label] || 0) + 1;

      // kutilayotgan to'lovlar
      player.plus.orders.forEach((order) => {
        if (order.status === "pending") {
          pending.plus.push({
            ...order,
            playerId: player.id,
            name: player.name
          });
        }
      });

      player.orders.forEach((order) => {
        if (order.status === "pending") {
          pending.skins.push({
            ...order,
            playerId: player.id,
            name: player.name
          });
        }
      });

      player.cashouts.forEach((order) => {
        if (order.status === "pending") {
          pending.cashouts.push({
            ...order,
            playerId: player.id,
            name: player.name
          });
        }
      });
    });

    // ---------------------------------------------------------
    // OXIRGI QO'SHILGANLAR VA ONLAYNLAR
    // ---------------------------------------------------------

    const short = (player) => ({
      id: player.id,
      name: player.name,
      level: Number(player.level) || 1,
      xp: Number(player.xp) || 0,
      area: Number(player.area) || 0,
      city: cities.cityName(player.city),
      plus: plus.isPlus(player),
      online: Boolean(player.online),
      createdAt: player.createdAt,
      lastSeen: lastSeen(player)
    });

    const newest = all
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 20)
      .map(short);

    const onlineNow = all
      .filter((player) => player.online)
      .sort((a, b) => lastSeen(b) - lastSeen(a))
      .slice(0, 50)
      .map(short);

    const top = all
      .slice()
      .sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0))
      .slice(0, 20)
      .map(short);

    // ---------------------------------------------------------
    // HAMKOR JOYLAR VA KLANLAR
    // ---------------------------------------------------------

    const placeList = await readPlaces();
    const clanList = await readClans();

    return json(res, 200, {
      ok: true,

      counts,
      totals,

      byMap: maps.MAPS.map((map) => ({
        id: map.id,
        name: map.name,
        level: map.level,
        ...byMap[map.id]
      })),

      byCity: Object.keys(byCity)
        .map((key) => ({
          id: key,
          name: cities.cityName(key),
          players: byCity[key]
        }))
        .sort((a, b) => b.players - a.players),

      byLevel: Object.keys(byLevel)
        .map((key) => ({ range: key, players: byLevel[key] }))
        .sort((a, b) => parseInt(a.range, 10) - parseInt(b.range, 10)),

      newest,
      onlineNow,
      top,

      pending,

      places: placeList.map((place) => ({
        id: place.id,
        name: place.name,
        kind: place.kind,
        offer: place.offer,
        lat: place.lat,
        lng: place.lng,
        radius: place.radius,
        active: place.active,
        until: place.until,
        views: place.views
      })),

      clans: clans.clanBoard(clanList, players),

      storage: storageReport(),
      rules: RULES,

      time: now
    });
  } catch (error) {
    console.error("ADMIN API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
