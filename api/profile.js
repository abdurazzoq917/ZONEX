// api/profile.js
// ============================================================
// UY, XARITA VA MAXFIYLIK
//
//   GET  /api/profile?id=<men>
//        uy, xaritalar, daraja, maxfiylik — bir so'rovda
//
//   POST /api/profile { id, action, ... }
//
//     "home"    { lat, lng, name }  — uyni belgilash
//     "map"     { mapId }           — xaritani almashtirish
//     "privacy" { privacy }         — public | friends | private
//     "theme"   { theme }           — xarita ko'rinishi (Plus)
//     "frame"   { frame }           — profil ramkasi (Plus)
//
// UY MAJBURIY: u belgilanmaguncha klient o'yinni boshlamaydi
// (client.js -> ensureHome). Uydan shahar aniqlanadi va shahar
// reytingi shunga qarab tuziladi.
//
// Uyning aniq koordinatasi hech kimga ko'rsatilmaydi — u faqat
// o'zining javobida qaytadi (qarang: publicPlayer).
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  publicPlayer,
  cleanHome,
  level,
  maps,
  plus,
  cities,
  notify
} = require("./_store");

const { guard } = require("./_auth");

// Uyni shuncha vaqtdan keyin qayta belgilash mumkin.
//
// Bo'lmasa, odam har safar boshqa shaharga "ko'chib" reytingni
// aylantirib yurgan bo'lardi.
const HOME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function view(player, id) {
  const info = level.levelView(player);

  return {
    ok: true,

    player: publicPlayer(player, id),

    level: info,

    home: player.home,
    homeLocked:
      Boolean(player.home) &&
      Date.now() - Number(player.home.at || 0) < HOME_COOLDOWN_MS,
    homeCooldown: HOME_COOLDOWN_MS,

    city: player.city,
    cityName: cities.cityName(player.city),

    mapId: player.mapId,
    maps: maps.mapList(player, info.level),

    privacy: player.privacy,
    privacyAsked: Boolean(player.privacyAsked),

    plus: plus.plusView(player),

    time: Date.now()
  };
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    if (req.method === "GET") {
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

      return json(res, 200, view(check.player, id));
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();

    if (!id) return json(res, 400, { error: "ID kerak" });

    const players = await readPlayers();

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const player = check.player;

    switch (action) {
      // -----------------------------------------------------
      // UYNI BELGILASH
      // -----------------------------------------------------
      case "home": {
        const home = cleanHome({
          lat: body.lat,
          lng: body.lng,
          name: body.name,
          at: Date.now()
        });

        if (!home) {
          return json(res, 400, {
            error: "bad_home",
            message: "Uy joylashuvi noto'g'ri — xaritadan nuqta tanlang"
          });
        }

        // Bir marta belgilangandan keyin bir hafta o'zgarmaydi
        if (
          player.home &&
          Date.now() - Number(player.home.at || 0) < HOME_COOLDOWN_MS
        ) {
          const left = Math.ceil(
            (HOME_COOLDOWN_MS - (Date.now() - Number(player.home.at || 0))) /
              (24 * 60 * 60 * 1000)
          );

          return json(res, 400, {
            error: "home_locked",
            message:
              "Uyni haftada bir marta o'zgartirish mumkin — yana " +
              left +
              " kun kuting"
          });
        }

        player.home = home;
        player.city = cities.cityOf(player);

        notify.notify(player, {
          type: "home",
          title: "Uy belgilandi",
          body:
            (home.name ? home.name + " · " : "") +
            cities.cityName(player.city) +
            " — shahar reytingida shu shahar uchun o'ynaysiz"
        });

        await writePlayers([player]);

        return json(res, 200, {
          ...view(player, id),
          message: "Uy belgilandi — " + cities.cityName(player.city)
        });
      }

      // -----------------------------------------------------
      // XARITANI ALMASHTIRISH
      // -----------------------------------------------------
      case "map": {
        const want = String(body.mapId || "");

        const info = maps.mapById(want);

        if (!info) {
          return json(res, 404, { error: "Bunday xarita yo'q" });
        }

        // Yopiq xaritaga API orqali ham kirib bo'lmaydi
        if (!player.maps.includes(want)) {
          return json(res, 403, {
            error: "locked",
            need: info.level,
            message:
              info.name +
              " " +
              info.level +
              "-darajada ochiladi. Hozirgi darajangiz — " +
              player.level +
              "."
          });
        }

        player.mapId = want;

        await writePlayers([player]);

        return json(res, 200, {
          ...view(player, id),
          message: info.name + " tanlandi"
        });
      }

      // -----------------------------------------------------
      // MAXFIYLIK
      // -----------------------------------------------------
      case "privacy": {
        const want = String(body.privacy || "");

        if (!["public", "friends", "private"].includes(want)) {
          return json(res, 400, { error: "Noma'lum rejim" });
        }

        player.privacy = want;
        player.privacyAsked = true;

        await writePlayers([player]);

        const names = {
          public: "Hamma ko'radi (taxminiy joy)",
          friends: "Faqat do'stlar",
          private: "Hech kim ko'rmaydi"
        };

        return json(res, 200, {
          ...view(player, id),
          message: "Joylashuv: " + names[want]
        });
      }

      // -----------------------------------------------------
      // XARITA KO'RINISHI (Plus)
      // -----------------------------------------------------
      case "theme": {
        const want = String(body.theme || "default");

        const theme = plus.MAP_THEMES.find((item) => item.id === want);

        if (!theme) return json(res, 404, { error: "Bunday ko'rinish yo'q" });

        if (theme.plus && !plus.isPlus(player)) {
          return json(res, 403, {
            error: "plus_only",
            message: "Bu ko'rinish ZoneX Plus obunachilariga"
          });
        }

        player.plus.theme = want;

        await writePlayers([player]);

        return json(res, 200, {
          ...view(player, id),
          message: theme.name + " ko'rinishi yoqildi"
        });
      }

      // -----------------------------------------------------
      // PROFIL RAMKASI (Plus)
      // -----------------------------------------------------
      case "frame": {
        const want = String(body.frame || "");

        const frame = plus.FRAMES.find((item) => item.id === want);

        if (!frame) return json(res, 404, { error: "Bunday ramka yo'q" });

        if (frame.plus && !plus.isPlus(player)) {
          return json(res, 403, {
            error: "plus_only",
            message: "Bu ramka ZoneX Plus obunachilariga"
          });
        }

        player.plus.frame = want;

        await writePlayers([player]);

        return json(res, 200, {
          ...view(player, id),
          message: frame.name + " ramkasi qo'yildi"
        });
      }

      // -----------------------------------------------------
      default:
        return json(res, 400, { error: "Noma'lum amal" });
    }
  } catch (error) {
    console.error("PROFILE API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

module.exports = locked("players", handler);
