// api/location.js
// ============================================================
// POST /api/location  { id, name, lat, lng, accuracy }
//
// Jonli joylashuvni yangilaydi va butun dunyoni qaytaradi,
// shuning uchun odamlar bir-birini deyarli darhol ko'radi.
// ============================================================

const { json, preflight, readBody } = require("./_http");

const {
  readPlayers,
  writePlayers,
  createPlayer,
  normalizeName,
  isNameTaken,
  distanceMeters,
  RULES
} = require("./_store");

// Ikki GPS nuqtasi orasidagi eng katta ishonchli qadam (metr)
const MAX_STEP = 500;

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const name = normalizeName(body.name);

    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!id) {
      return json(res, 400, { error: "Qurilma ID kerak" });
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json(res, 400, { error: "GPS koordinatalari noto'g'ri" });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(res, 400, {
        error: "GPS koordinatalari chegaradan tashqarida"
      });
    }

    const players = await readPlayers();

    let player = players[id];

    if (!player) {
      if (!name) {
        return json(res, 400, { error: "Avval ro'yxatdan o'ting" });
      }

      if (isNameTaken(players, name, id)) {
        return json(res, 409, {
          error: "name_taken",
          message: "Bu ism band. Boshqa ism tanlang."
        });
      }

      player = createPlayer(id, name);
      players[id] = player;
    }

    // ---------------------------------------------------------
    // Yurgan masofa (faqat ishonchli qadamlar)
    // ---------------------------------------------------------

    const previous = player.location;

    if (previous) {
      const step = distanceMeters(
        [previous.lat, previous.lng],
        [lat, lng]
      );

      if (step > 0 && step <= MAX_STEP) {
        player.totalDistance = Number(player.totalDistance || 0) + step;
      }
    }

    const now = Date.now();

    player.location = {
      lat,
      lng,
      accuracy: Number.isFinite(Number(body.accuracy))
        ? Number(body.accuracy)
        : null,
      time: now,
      updatedAt: now
    };

    player.online = true;
    player.updatedAt = now;

    await writePlayers(player);

    // ---------------------------------------------------------
    // Javob: butun dunyo
    // ---------------------------------------------------------

    const list = Object.values(players).map((p) => ({
      ...p,
      online: Boolean(
        p.location && now - Number(p.location.time || 0) < RULES.ONLINE_MS
      )
    }));

    return json(res, 200, {
      ok: true,
      player,
      players: list.sort((a, b) => Number(b.area || 0) - Number(a.area || 0)),
      time: now
    });
  } catch (error) {
    console.error("LOCATION API XATOSI:", error);

    return json(res, 500, {
      error: "Serverda xatolik",
      message: error && error.message
    });
  }
};
