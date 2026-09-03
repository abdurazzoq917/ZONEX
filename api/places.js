// api/places.js
// ============================================================
// HAMKOR JOYLAR (BIZNES REKLAMA)
//
//   GET  /api/places?id=<men>&lat=&lng=
//        xaritada ko'rinadigan joylar + hozir yaqinda
//        turganlari (taklif ko'rsatish uchun)
//
//   POST /api/places { id, action, ... }
//
//     "view"   { placeId }   — taklif ko'rsatildi (hisobga olish)
//     "add"    { ... }       — admin: yangi hamkor qo'shish
//     "update" { placeId, ... }
//     "remove" { placeId }
//     "list"   {}            — admin: hammasi, ko'rsatishlar bilan
//
// ZoneX Plus obunachilariga reklama KO'RSATILMAYDI — javobda
// `ads: false` qaytadi va ro'yxat bo'sh bo'ladi.
//
// Reklama uchun murojaat: Telegram @Abduumalikov_7
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  readPlaces,
  writePlaces,
  adminAllowed,
  places,
  plus
} = require("./_store");

const { guard } = require("./_auth");

function boxFrom(params) {
  const south = Number(params.get("south"));
  const north = Number(params.get("north"));
  const west = Number(params.get("west"));
  const east = Number(params.get("east"));

  if (
    !Number.isFinite(south) ||
    !Number.isFinite(north) ||
    !Number.isFinite(west) ||
    !Number.isFinite(east)
  ) {
    return null;
  }

  return { south, north, west, east };
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    // ---------------------------------------------------------
    // O'QISH
    // ---------------------------------------------------------

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

      const player = check.player;

      // Plus obunachisi reklama ko'rmaydi
      if (plus.isPlus(player)) {
        return json(res, 200, {
          ok: true,
          ads: false,
          places: [],
          near: [],
          contact: places.CONTACT,
          time: Date.now()
        });
      }

      const list = await readPlaces();

      const now = Date.now();

      // Faqat ekranda ko'rinadigan qismi yuboriladi — butun
      // ro'yxatni tashish shart emas
      const shown = places.visible(list, boxFrom(params), now);

      const near = places.nearby(
        list,
        params.get("lat"),
        params.get("lng"),
        now
      );

      return json(res, 200, {
        ok: true,
        ads: true,

        places: shown.map((place) => ({
          id: place.id,
          name: place.name,
          kind: place.kind,
          offer: place.offer,
          about: place.about,
          contact: place.contact,
          lat: place.lat,
          lng: place.lng,
          radius: place.radius
        })),

        near: near.map((row) => ({
          id: row.place.id,
          name: row.place.name,
          kind: row.place.kind,
          offer: row.place.offer,
          about: row.place.about,
          contact: row.place.contact,
          meters: row.meters
        })),

        contact: places.CONTACT,
        repeatMs: places.REPEAT_MS,

        time: now
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    // ---------------------------------------------------------
    // O'ZGARTIRISH
    // ---------------------------------------------------------

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

    const list = await readPlaces();

    // ---- taklif ko'rsatildi: biznesga hisobot uchun ----
    if (action === "view") {
      const place = list.find((item) => item.id === String(body.placeId || ""));

      if (!place) return json(res, 404, { error: "Joy topilmadi" });

      place.views += 1;

      await writePlaces(list);

      return json(res, 200, { ok: true, views: place.views });
    }

    // ---- qolgani faqat admin uchun ----
    if (!adminAllowed(player, body.key)) {
      return json(res, 403, {
        error: "not_admin",
        message: "Bu amal faqat admin uchun"
      });
    }

    switch (action) {
      case "list":
        return json(res, 200, {
          ok: true,
          places: list,
          contact: places.CONTACT,
          time: Date.now()
        });

      case "add": {
        if (list.length >= places.MAX_PLACES) {
          return json(res, 400, {
            error: "full",
            message: "Joylar chegarasi to'ldi"
          });
        }

        const place = places.normalizePlace({
          ...body,
          id: places.makePlaceId(),
          createdAt: Date.now(),
          views: 0
        });

        if (!place) {
          return json(res, 400, {
            error: "bad_place",
            message: "Nom va koordinata to'g'ri kiritilmagan"
          });
        }

        list.push(place);

        await writePlaces(list);

        return json(res, 200, {
          ok: true,
          place,
          places: list,
          message: place.name + " qo'shildi"
        });
      }

      case "update": {
        const index = list.findIndex(
          (item) => item.id === String(body.placeId || "")
        );

        if (index < 0) return json(res, 404, { error: "Joy topilmadi" });

        const updated = places.normalizePlace({ ...list[index], ...body, id: list[index].id });

        if (!updated) {
          return json(res, 400, { error: "bad_place", message: "Ma'lumot noto'g'ri" });
        }

        list[index] = updated;

        await writePlaces(list);

        return json(res, 200, {
          ok: true,
          place: updated,
          places: list,
          message: "Saqlandi"
        });
      }

      case "remove": {
        const index = list.findIndex(
          (item) => item.id === String(body.placeId || "")
        );

        if (index < 0) return json(res, 404, { error: "Joy topilmadi" });

        const [gone] = list.splice(index, 1);

        await writePlaces(list);

        return json(res, 200, {
          ok: true,
          places: list,
          message: gone.name + " o'chirildi"
        });
      }

      default:
        return json(res, 400, { error: "Noma'lum amal" });
    }
  } catch (error) {
    console.error("PLACES API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

module.exports = locked("players", handler);
