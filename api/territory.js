// api/territory.js
// ============================================================
// POST /api/territory
//   { id, name, points, duration, distance }
//
// 1. Nuqtalarni tekshiradi
// 2. Tezlikni hisoblaydi (mashina/velosiped/samokat bo'lsa — rad etadi)
// 3. Maydonni serverda o'zi hisoblaydi
// 4. Ustiga tushgan BEGONA hududlarni kesib oladi
// 5. O'zining YONMA-YON hududlarini bitta qilib qo'shib yuboradi
// ============================================================

const { json, preflight, readBody } = require("./_http");

const {
  readPlayers,
  writePlayers,
  createPlayer,
  normalizeName,
  normalizeTerritory,
  isNameTaken,
  rebuildArea,
  cleanPoints,
  perimeterMeters,
  distanceMeters,
  publicPlayer,
  publicList,
  isBanned,
  banInfo,
  geo,
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

// ------------------------------------------------------------
// Hudud bilan tayyor shakl (geom) orasidagi eng qisqa masofa
// ------------------------------------------------------------
//
// "Yonma-yon"ligini shu aniqlaydi: hudud shakldan MERGE_GAP
// metrdan yaqin bo'lsa — ular bitta hudud bo'lishi kerak.
// ------------------------------------------------------------

function gapToGeom(territory, pieces) {
  let best = { gap: Infinity, from: null, to: null };

  pieces.forEach((piece) => {
    const found = geo.ringGap(territory.points, piece.points);

    if (found.gap < best.gap) best = found;
  });

  return best;
}

// ------------------------------------------------------------
// O'ZINING HUDUDLARINI QO'SHIB YUBORISH
// ------------------------------------------------------------
//
// Yangi halqa o'zining eski hududiga tegib tursa yoki yonidan
// o'tsa — ikkalasi BITTA hududga aylanadi. Kichigi kattasiga
// qo'shiladi: natijaviy hudud kattarog'ining nomerini (id) va
// yaratilgan sanasini oladi, yurilgan masofalar esa qo'shiladi.
//
// Ustma-ust tushgan joy ikki marta sanalmaydi — maydon
// birlashgan shakldan qayta hisoblanadi.
// ------------------------------------------------------------

function mergeOwn(player, claimGeom) {
  let combined = claimGeom;

  const merged = [];

  let pool = Array.isArray(player.territories)
    ? player.territories.slice()
    : [];

  // Zanjir bo'lib qo'shilishi mumkin (A yangi halqaga, B esa A ga
  // tegib tursa) — shuning uchun o'zgarish bo'lmaguncha aylanamiz.
  for (let pass = 0; pass < 8; pass++) {
    if (!pool.length) break;

    const pieces = geo.geomPieces(combined, 0);

    if (!pieces.length) break;

    const rest = [];

    let joined = false;

    const box = geo.boxOfRings(pieces.map((piece) => piece.points));

    pool.forEach((territory) => {
      // MERGE_GAP dan uzoqdagilar bilan ishlamaymiz
      if (
        !geo.boxesNear(geo.ringBox(territory.points), box, RULES.MERGE_GAP)
      ) {
        rest.push(territory);
        return;
      }

      const shape = geo.territoryGeom(territory);

      if (!shape.length) return; // buzuq yozuv — tashlab yuboramiz

      const overlaps =
        geo.geomArea(geo.intersection(shape, combined)) > 0;

      if (overlaps) {
        combined = geo.union(combined, shape);

        merged.push(territory);
        joined = true;

        return;
      }

      const near = gapToGeom(territory, pieces);

      if (near.gap <= RULES.MERGE_GAP && near.from && near.to) {
        combined = geo.union(combined, shape);

        // Orada qolgan yo'lakni ingichka bog'lovchi bilan yopamiz,
        // aks holda ikkita alohida bo'lak bo'lib qolaveradi.
        combined = geo.union(
          combined,
          geo.bridgeGeom(near.to, near.from, 5)
        );

        merged.push(territory);
        joined = true;

        return;
      }

      rest.push(territory);
    });

    pool = rest;

    if (!joined) break;
  }

  return { combined, merged, kept: pool };
}

// ------------------------------------------------------------
// BEGONA HUDUDLARNI BOSIB OLISH
// ------------------------------------------------------------
//
// Yangi halqa birovning hududining yarmidan ko'pini qoplasa —
// o'sha hudud butunlay qo'lga o'tadi.
//
// Kamrog'ini qoplasa — HUDUDNING O'ZI KESILADI: bosib olingan
// bo'lak eski egasidan olinib tashlanadi, qolgani unda qoladi.
// O'rtasidan aylanib o'tilsa — o'sha joyda teshik paydo bo'ladi.
// ------------------------------------------------------------

function captureFrom(other, claimGeom, claimBox, captured, trimmed) {
  if (!Array.isArray(other.territories) || !other.territories.length) {
    return false;
  }

  const kept = [];

  let touched = false;

  other.territories.forEach((territory) => {
    // Uzoqdagi hududlarni umuman hisoblab o'tirmaymiz
    if (!geo.boxesNear(geo.ringBox(territory.points), claimBox, 0)) {
      kept.push(territory);
      return;
    }

    const shape = geo.territoryGeom(territory);

    if (!shape.length) return;

    const shared = geo.geomArea(geo.intersection(shape, claimGeom));

    if (shared < 1) {
      kept.push(territory);
      return;
    }

    touched = true;

    const before = geo.geomArea(shape);

    const lost = {
      territoryId: territory.id || null,
      ownerId: other.id,
      ownerName: other.name,
      area: Math.round(before)
    };

    // Yarmidan ko'pi qamrab olindi — butunlay qo'ldan ketdi
    if (!(before > 0) || shared / before >= RULES.CAPTURE_RATIO) {
      captured.push(lost);
      return;
    }

    const rest = geo.geomPieces(
      geo.difference(shape, claimGeom),
      RULES.MIN_AREA
    );

    // Deyarli hech nima qolmadi
    if (!rest.length) {
      captured.push(lost);
      return;
    }

    // Kesilgandan keyin hudud bir necha bo'lakka bo'linib ketishi
    // mumkin. Eng kattasi eski nomerini saqlaydi.
    rest.forEach((piece, index) => {
      kept.push(
        normalizeTerritory(
          {
            ...territory,
            id: index === 0 ? territory.id : makeTerritoryId(),
            points: piece.points,
            holes: piece.holes
          },
          other
        )
      );
    });

    trimmed.push({
      territoryId: territory.id || null,
      ownerId: other.id,
      ownerName: other.name,
      area: Math.round(shared)
    });
  });

  if (touched) {
    other.territories = kept;
    rebuildArea(other);
  }

  return touched;
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

    if (!Number.isFinite(duration) || duration < 8) {
      return json(res, 400, {
        error: "too_fast",
        message: "Hudud juda tez yopildi — sekinroq yuring"
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
          " km/soat. Chegara — " + RULES.MAX_AVG_SPEED_KMH + " km/soat."
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
    //
    // O'z-o'zini kesib ketgan yo'l (sakkiz shakli) ham to'g'ri
    // hisoblanishi uchun halqa avval tozalanadi.
    // ---------------------------------------------------------

    const claimGeom = geo.normalizeGeom(geo.ringGeom(points));

    const area = Math.round(geo.geomArea(claimGeom));

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
    // BAN — banlangan odam hudud egallay olmaydi
    // ---------------------------------------------------------

    if (isBanned(player)) {
      return json(res, 403, {
        error: "banned",
        message: "Siz banlangansiz — hudud egallab bo'lmaydi",
        ban: banInfo(player)
      });
    }

    const claimBox = geo.ringBox(points);

    const captured = [];
    const trimmed = [];

    const changed = new Map();

    changed.set(String(player.id), player);

    // ---------------------------------------------------------
    // 1) BEGONALARNIKINI KESIB OLAMIZ
    // ---------------------------------------------------------

    Object.values(players).forEach((other) => {
      if (String(other.id) === String(player.id)) return;

      if (captureFrom(other, claimGeom, claimBox, captured, trimmed)) {
        changed.set(String(other.id), other);
      }
    });

    // ---------------------------------------------------------
    // 2) O'ZINIKINI QO'SHIB YUBORAMIZ
    // ---------------------------------------------------------

    const { combined, merged, kept } = mergeOwn(player, claimGeom);

    // Birlashgan hududlarning yurilgan yo'li va vaqti saqlanadi
    let totalDistance = Math.round(
      Number.isFinite(Number(body.distance)) && Number(body.distance) > 0
        ? Number(body.distance)
        : walked
    );

    let totalDuration = Math.round(duration);

    let createdAt = Date.now();

    // Eng katta hudud "uy egasi" bo'ladi — kichigi unga qo'shiladi
    let host = null;

    merged.forEach((territory) => {
      totalDistance += Math.round(Number(territory.distance) || 0);
      totalDuration += Math.round(Number(territory.duration) || 0);

      const born = Number(territory.createdAt) || 0;

      if (born && born < createdAt) createdAt = born;

      if (!host || Number(territory.area || 0) > Number(host.area || 0)) {
        host = territory;
      }
    });

    // Yangi halqa hammasidan katta bo'lsa — u yangi hudud bo'ladi
    if (host && Number(host.area || 0) < area) host = null;

    const pieces = geo.geomPieces(combined, RULES.MIN_AREA);

    if (!pieces.length) {
      return json(res, 400, {
        error: "too_small",
        message: "Hudud juda kichkina — kattaroq aylanma yasang"
      });
    }

    const fresh = pieces.map((piece, index) =>
      normalizeTerritory(
        {
          id:
            index === 0 && host && host.id ? host.id : makeTerritoryId(),

          points: piece.points,
          holes: piece.holes,

          // Shu hudud uchun jami yurilgan yo'l (metr).
          distance: index === 0 ? totalDistance : 0,
          duration: index === 0 ? totalDuration : 0,

          speed: Math.round(avgSpeed * 10) / 10,

          mergedCount: index === 0 ? merged.length : 0,
          capturedCount: index === 0 ? captured.length : 0,

          createdAt: index === 0 ? createdAt : Date.now()
        },
        player
      )
    );

    player.territories = kept.concat(fresh);

    rebuildArea(player);

    player.updatedAt = Date.now();

    await writePlayers(Array.from(changed.values()));

    const territory = fresh[0];

    const now = Date.now();

    const parts = [];

    if (captured.length) {
      parts.push(captured.length + " ta begona hudud bosib olindi");
    }

    if (trimmed.length) {
      parts.push(trimmed.length + " ta hududdan bo'lak olindi");
    }

    if (merged.length) {
      parts.push(merged.length + " ta hududingiz qo'shildi");
    }

    return json(res, 200, {
      ok: true,

      message: parts.length ? parts.join(", ") + "!" : "Yangi hudud egallandi!",

      player: publicPlayer(player, id),
      territory,
      captured,
      trimmed,
      merged: merged.length,

      players: publicList(players, id),

      time: now
    });
  } catch (error) {
    console.error("TERRITORY API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};
