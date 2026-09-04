// api/rank.js
// ============================================================
// REYTINGLAR
//
//   GET /api/rank?id=<men>&scope=<qamrov>&period=<davr>
//
//   scope:  global | country | city | friends | clans
//   period: daily | weekly | monthly | total
//
// "1-o'rin, 2-o'rin" degan bitta ro'yxat o'rniga to'rtta
// qamrov × to'rtta davr bor. Shuning uchun har hafta reyting
// yangilanadi va odamlar qaytadi.
//
// Reyting XP bo'yicha tuziladi (o'sha davrda yig'ilgani).
// "total" davrida jami XP olinadi.
//
// Shaharlar reytingi ("Toshkent vs Samarqand") alohida
// qaytadi — u har doim jami bo'yicha hisoblanadi.
// ============================================================

const { json, preflight } = require("../_http");

const {
  readPlayers,
  readClans,
  stats,
  cities,
  clans,
  plus
} = require("../_store");

const { guard } = require("../_auth");

const SCOPES = ["global", "country", "city", "friends", "clans"];
const PERIODS = ["daily", "weekly", "monthly", "total"];

const LIMIT = 100;

// Bitta qatordagi ma'lumot
function rowOf(player, period) {
  const bucket = stats.bucketOf(player, period);

  return {
    id: player.id,
    name: player.name,
    color: player.color,
    level: Number(player.level) || 1,
    avatarAt: Number(player.avatarAt) || 0,
    online: Boolean(player.online),
    plus: plus.isPlus(player),
    frame: plus.isPlus(player) ? player.plus.frame : "",
    city: player.city || "",
    cityName: cities.cityName(player.city),
    clanId: player.clanId || "",

    // "total" davrida jami XP — bu o'yinchining butun tarixi
    xp: period === "total" ? Number(player.xp) || 0 : bucket.xp,
    area: period === "total" ? Number(player.area) || 0 : bucket.area,
    distance: bucket.distance,
    zones: bucket.zones,
    captures: bucket.captures
  };
}

// Shaharlar reytingi: har bir shaharning o'yinchilari yig'indisi
function cityBoard(list, period) {
  const table = new Map();

  list.forEach((player) => {
    const id = player.city || cities.OTHER.id;

    const bucket = stats.bucketOf(player, period);

    const row =
      table.get(id) || { id, name: cities.cityName(id), xp: 0, area: 0, players: 0 };

    row.players += 1;
    row.xp += period === "total" ? Number(player.xp) || 0 : bucket.xp;
    row.area += period === "total" ? Number(player.area) || 0 : bucket.area;

    table.set(id, row);
  });

  return Array.from(table.values())
    .filter((row) => row.players > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 30);
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "GET") {
    return json(res, 405, { error: "Faqat GET so'rovi" });
  }

  try {
    const params = new URLSearchParams(req.url.split("?")[1] || "");

    const id = String(params.get("id") || "").trim();

    const scope = SCOPES.includes(String(params.get("scope")))
      ? String(params.get("scope"))
      : "global";

    const period = PERIODS.includes(String(params.get("period")))
      ? String(params.get("period"))
      : "weekly";

    const players = await readPlayers();

    const check = guard(players, id, req, null);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const me = check.player;

    const all = Object.values(players);

    // ---- klanlar reytingi ----
    if (scope === "clans") {
      const list = await readClans();

      return json(res, 200, {
        ok: true,
        scope,
        period,
        clans: clans.clanBoard(list, players),
        myClanId: me.clanId || "",
        time: Date.now()
      });
    }

    // ---- o'yinchilar reytingi ----
    let pool = all;

    if (scope === "city") {
      const city = me.city || cities.OTHER.id;

      pool = all.filter((player) => (player.city || cities.OTHER.id) === city);
    }

    if (scope === "friends") {
      const friends = new Set(
        (Array.isArray(me.friends) ? me.friends : []).concat([me.id])
      );

      pool = all.filter((player) => friends.has(String(player.id)));
    }

    // "country" — hozircha hammasi O'zbekiston. Keyinchalik
    // davlat maydoni qo'shilsa shu yerda filtrlanadi.

    const rows = pool
      .map((player) => rowOf(player, period))
      .filter((row) => row.xp > 0 || row.area > 0)
      .sort((a, b) => b.xp - a.xp || b.area - a.area);

    const myIndex = rows.findIndex((row) => String(row.id) === String(me.id));

    return json(res, 200, {
      ok: true,

      scope,
      period,

      rows: rows.slice(0, LIMIT).map((row, index) => ({
        ...row,
        place: index + 1
      })),

      // O'zim ro'yxatning pastida qolsam ham o'z o'rnimni ko'ray
      me:
        myIndex >= 0
          ? { ...rows[myIndex], place: myIndex + 1 }
          : { ...rowOf(me, period), place: 0 },

      total: rows.length,

      // Shaharlar reytingi har doim birga qaytadi
      cities: cityBoard(all, period),

      myCity: me.city || "",
      myCityName: cities.cityName(me.city),

      time: Date.now()
    });
  } catch (error) {
    console.error("RANK API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
