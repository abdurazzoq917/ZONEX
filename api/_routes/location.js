// api/location.js
// ============================================================
// POST /api/location  { id, lat, lng, accuracy }
// Sarlavha: x-zonex-token
//
// Jonli joylashuvni yangilaydi va butun dunyoni qaytaradi,
// shuning uchun odamlar bir-birini deyarli darhol ko'radi.
// ============================================================

const { json, preflight, readBody } = require("../_http");

const {
  readPlayers,
  writeLive,
  distanceMeters,
  publicPlayer,
  publicList
} = require("../_store");

const { guard } = require("../_auth");

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
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return json(res, 400, { error: "GPS koordinatalari noto'g'ri" });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return json(res, 400, {
        error: "GPS koordinatalari chegaradan tashqarida"
      });
    }

    const players = await readPlayers();

    // Akkaunt shu yerda YARATILMAYDI — u faqat /api/auth orqali
    // (parol va email bilan) tug'iladi. Bu yerda esa token
    // tekshiriladi: birovning ID'sini bilgan odam uning
    // joylashuvini soxtalashtira olmasin.
    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const player = check.player;

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

    // MUHIM: bu yerda writePlayers CHAQIRILMAYDI.
    //
    // Joylashuv har 3 sekundda keladi. Agar u butun o'yinchi
    // yozuvini qayta yozsa, ayni damda boshqa so'rov egallagan
    // hudud yo'qolib ketishi mumkin. Shuning uchun joylashuv
    // o'zining alohida yozuviga tushadi.
    await writeLive(player);

    // ---------------------------------------------------------
    // Javob: butun dunyo
    // ---------------------------------------------------------

    return json(res, 200, {
      ok: true,
      player: publicPlayer(player, id),
      players: publicList(players, id),
      time: now
    });
  } catch (error) {
    console.error("LOCATION API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
