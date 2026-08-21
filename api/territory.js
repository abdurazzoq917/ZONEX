// api/territory.js
// ============================================================
// POST /api/territory
//   { id, name, points, duration, distance }
//
// 1. Nuqtalarni tekshiradi
// 2. Tezlikni hisoblaydi (mashina/velosiped/samokat bo'lsa — rad etadi)
// 3. Maydonni serverda o'zi hisoblaydi
// 4. Ustiga tushgan begona hududlarni BOSIB OLADI
// ============================================================

const { json, preflight, readBody } = require("./_http");

const {
  readPlayers,
  writePlayers,
  createPlayer,
  normalizeName,
  isNameTaken,
  rebuildArea,
  cleanPoints,
  polygonArea,
  perimeterMeters,
  distanceMeters,
  coverageRatio,
  overlapArea,
  RULES
} = require("./_store");

function makeTerritoryId() {
  return (
    "t-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  );
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const name = normalizeName(body.name);

    if (!id) {
      return json(res, 400, { error: "Qurilma ID kerak" });
    }

    const points = cleanPoints(body.points);

    if (points.length < 4) {
      return json(res, 400, {
        error: "too_short",
        message: "Hudud yaratish uchun ko'proq yuring"
      });
    }

    // ---------------------------------------------------------
    // TEZLIK NAZORATI
    // ---------------------------------------------------------
    //
    // Yurilgan yo'l uzunligini serverning o'zi hisoblaydi,
    // vaqtni esa klient yuboradi. Shu ikkisidan o'rtacha
    // tezlik chiqadi.
    // ---------------------------------------------------------

    const duration = Number(body.duration); // sekund

    if (!Number.isFinite(duration) || duration < 20) {
      return json(res, 400, {
        error: "too_fast",
        message: "Hudud juda tez yopildi — piyoda yurib ko'ring"
      });
    }

    // Yopiq halqa: oxirgi nuqtadan boshiga qaytish ham qo'shiladi
    const walked =
      perimeterMeters(points) +
      distanceMeters(points[points.length - 1], points[0]);

    const avgSpeed = (walked / duration) * 3.6;

    if (avgSpeed > RULES.MAX_AVG_SPEED_KMH) {
      return json(res, 400, {
        error: "too_fast",
        speed: Math.round(avgSpeed * 10) / 10,
        limit: RULES.MAX_AVG_SPEED_KMH,
        message:
          "Tezligingiz " +
          (Math.round(avgSpeed * 10) / 10) +
          " km/soat. Hudud faqat piyoda yurganda egallanadi."
      });
    }

    const clientMaxSpeed = Number(body.maxSpeed);

    if (
      Number.isFinite(clientMaxSpeed) &&
      clientMaxSpeed > RULES.MAX_SPEED_KMH * 2
    ) {
      return json(res, 400, {
        error: "too_fast",
        speed: Math.round(clientMaxSpeed * 10) / 10,
        limit: RULES.MAX_SPEED_KMH,
        message: "Transportda harakat aniqlandi — hudud yozilmadi"
      });
    }

    // ---------------------------------------------------------
    // MAYDON (serverda hisoblanadi)
    // ---------------------------------------------------------

    const area = Math.round(polygonArea(points));

    if (area < RULES.MIN_AREA) {
      return json(res, 400, {
        error: "too_small",
        message: "Hudud juda kichkina — kattaroq aylanma yasang"
      });
    }

    // ---------------------------------------------------------
    // O'YINCHI
    // ---------------------------------------------------------

    const players = await readPlayers();

    let player = players[id];

    if (!player) {
      if (!name) {
        return json(res, 400, { error: "Avval ro'yxatdan o'ting" });
      }

      if (isNameTaken(players, name, id)) {
        return json(res, 409, {
          error: "name_taken",
          message: "Bu username band. Boshqasini tanlang."
        });
      }

      player = createPlayer(id, name);
      players[id] = player;
    }

    // ---------------------------------------------------------
    // TO'LIQ BOSIB OLISH
    // ---------------------------------------------------------
    //
    // Yangi hudud eski hududning yarmidan ko'pini qoplasa —
    // o'sha hudud butunlay egasidan olinadi. Atrofidan aylanib
    // o'tilsa (ichiga olinsa) qamrov 1 ga teng bo'ladi.
    //
    // O'zining eski hududi ham shu qoida bilan almashtiriladi
    // (bir joyni ikki marta aylanib maydonni ikkilantirib
    // bo'lmaydi).
    // ---------------------------------------------------------

    const captured = [];
    const changed = new Map();

    changed.set(String(player.id), player);

    Object.values(players).forEach((other) => {
      if (!Array.isArray(other.territories) || !other.territories.length) {
        return;
      }

      const kept = [];

      other.territories.forEach((territory) => {
        const ratio = coverageRatio(territory.points, points);

        if (ratio >= RULES.CAPTURE_RATIO) {
          if (String(other.id) !== String(player.id)) {
            captured.push({
              territoryId: territory.id || null,
              ownerId: other.id,
              ownerName: other.name,
              area: Number(territory.area) || 0
            });
          }

          return; // hududni tashlab yuboramiz — bosib olindi
        }

        kept.push(territory);
      });

      if (kept.length !== other.territories.length) {
        other.territories = kept;
        rebuildArea(other);
        changed.set(String(other.id), other);
      }
    });

    // ---------------------------------------------------------
    // QISMAN BOSIB OLISH
    // ---------------------------------------------------------
    //
    // Yangi aylana eski hududning bir qismini qamrab olgan
    // bo'lsa (to'liq bosib olishga yetmasa ham), o'sha qism
    // eski egasidan olinadi va yangi egaga o'tadi.
    //
    // Shu tufayli bir joy hech qachon ikki marta sanalmaydi va
    // "birovning yeridan yursang — o'sha joy senga o'tadi"
    // qoidasi ishlaydi.
    // ---------------------------------------------------------

    Object.values(players).forEach((other) => {
      if (!Array.isArray(other.territories) || !other.territories.length) {
        return;
      }

      const kept = [];

      let touched = false;

      other.territories.forEach((territory) => {
        const shared = overlapArea(points, territory.points);

        if (shared < 1) {
          kept.push(territory);
          return;
        }

        const left = Math.round((Number(territory.area) || 0) - shared);

        touched = true;

        // Deyarli hech nima qolmadi — hudud butunlay qo'ldan ketdi
        if (left < RULES.MIN_AREA) {
          if (String(other.id) !== String(player.id)) {
            captured.push({
              territoryId: territory.id || null,
              ownerId: other.id,
              ownerName: other.name,
              area: Number(territory.area) || 0
            });
          }

          return;
        }

        territory.area = left;

        kept.push(territory);
      });

      if (touched) {
        other.territories = kept;
        rebuildArea(other);
        changed.set(String(other.id), other);
      }
    });

    // ---------------------------------------------------------
    // YANGI HUDUD
    // ---------------------------------------------------------

    const territory = {
      id: makeTerritoryId(),
      ownerId: player.id,
      ownerName: player.name,
      color: player.color,
      points,
      area,
      duration: Math.round(duration),
      speed: Math.round(avgSpeed * 10) / 10,
      capturedCount: captured.length,
      createdAt: Date.now()
    };

    player.territories.push(territory);

    rebuildArea(player);

    player.updatedAt = Date.now();

    await writePlayers(Array.from(changed.values()));

    const now = Date.now();

    const list = Object.values(players).map((p) => ({
      ...p,
      online: Boolean(
        p.location && now - Number(p.location.time || 0) < RULES.ONLINE_MS
      )
    }));

    return json(res, 200, {
      ok: true,

      message: captured.length
        ? captured.length + " ta begona hudud bosib olindi!"
        : "Yangi hudud egallandi!",

      player,
      territory,
      captured,

      players: list.sort((a, b) => Number(b.area || 0) - Number(a.area || 0))
    });
  } catch (error) {
    console.error("TERRITORY API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
