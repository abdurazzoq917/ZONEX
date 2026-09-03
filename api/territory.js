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
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  normalizeTerritory,
  rebuildArea,
  cleanPoints,
  perimeterMeters,
  distanceMeters,
  publicPlayer,
  publicList,
  isBanned,
  banInfo,
  geo,
  daily,
  notify,
  level,
  maps,
  defense,
  stats,
  RULES
} = require("./_store");

const { guard } = require("./_auth");

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

function mergeOwn(player, claimGeom, mapId) {
  let combined = claimGeom;

  const merged = [];

  // Boshqa xaritalardagi hududlar bu yerda umuman qatnashmaydi —
  // ular o'z joyida turaveradi.
  const other = [];

  let pool = [];

  (Array.isArray(player.territories) ? player.territories : []).forEach(
    (territory) => {
      if (maps.mapOf(territory) === mapId) pool.push(territory);
      else other.push(territory);
    }
  );

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

      // Buzuq yozuv — qo'shmaymiz, lekin o'chirib ham yubormaymiz
      if (!shape.length) {
        rest.push(territory);
        return;
      }

      const overlaps =
        geo.geomArea(geo.intersection(shape, combined)) > 0;

      if (overlaps) {
        combined = geo.union(combined, shape);

        merged.push(territory);
        joined = true;

        return;
      }

      const near = gapToGeom(territory, pieces);

      if (near.gap <= RULES.MERGE_GAP) {
        // Orasidagi bo'sh yo'lak SIZNIKI EMAS — siz u yerdan
        // yurmagansiz. Shuning uchun hech narsa "to'ldirilmaydi":
        // ikkala shakl bitta hudud yozuvining ikki BO'LAGI bo'lib
        // qoladi (bitta nom, bitta maydon, bitta tarix).
        combined = geo.union(combined, shape);

        merged.push(territory);
        joined = true;

        return;
      }

      rest.push(territory);
    });

    pool = rest;

    if (!joined) break;
  }

  // `kept` ichida boshqa xaritalarniki ham bor — ular yo'qolmasin
  return { combined, merged, kept: other.concat(pool) };
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

function captureFrom(other, claimGeom, claimBox, captured, trimmed, ctx) {
  if (!Array.isArray(other.territories) || !other.territories.length) {
    return false;
  }

  const kept = [];

  let touched = false;

  const now = ctx.now;

  // Yangi o'yinchining hududiga umuman tegib bo'lmaydi
  const newbie = Number(other.newbieUntil || 0) > now;

  other.territories.forEach((territory) => {
    // Boshqa xaritadagi hudud — bunga aloqamiz yo'q
    if (maps.mapOf(territory) !== ctx.mapId) {
      kept.push(territory);
      return;
    }

    // Uzoqdagi hududlarni umuman hisoblab o'tirmaymiz
    if (!geo.boxesNear(geo.ringBox(territory.points), claimBox, 0)) {
      kept.push(territory);
      return;
    }

    // ---- HIMOYA ----
    //
    // Himoyadagi hudud (DEFENDED) tegilmaydi: na bosib olinadi,
    // na kesiladi. Bu vaqtni FAQAT server biladi.
    if (newbie || defense.isProtected(territory, now)) {
      // Ustidan o'tildi — "hujum bo'ldi" deb belgilab qo'yamiz
      const shape = geo.territoryGeom(territory);

      if (
        shape.length &&
        geo.geomArea(geo.intersection(shape, claimGeom)) > 1
      ) {
        defense.markContested(territory, now);

        // Himoyalangan yerni hujumchining hududidan KESIB
        // tashlaymiz. Bo'lmasa himoyaning ma'nosi qolmaydi:
        // hudud egasida turgani bilan, hujumchi o'sha joyni
        // baribir o'ziniki qilib olardi.
        ctx.shield.push(shape);

        ctx.blocked.push({
          territoryId: territory.id || null,
          ownerId: other.id,
          ownerName: other.name,
          newbie,
          until: Number(territory.defendedUntil) || 0,
          left: Math.max(0, Number(territory.defendedUntil || 0) - now)
        });

        touched = true;
      }

      kept.push(territory);
      return;
    }

    const shape = geo.territoryGeom(territory);

    // Shakli buzuq bo'lsa ham begonaning hududini o'chirib yubormaymiz
    if (!shape.length) {
      kept.push(territory);
      return;
    }

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
      area: Math.round(before),
      level: Number(territory.level) || 1
    };

    // Yarmidan ko'pi qamrab olindi — butunlay qo'ldan ketdi
    if (!(before > 0) || shared / before >= RULES.CAPTURE_RATIO) {
      captured.push(lost);
      return;
    }

    const rest = geo.shapeFromGeom(
      geo.difference(shape, claimGeom),
      RULES.MIN_AREA
    );

    // Deyarli hech nima qolmadi
    if (!rest) {
      captured.push(lost);
      return;
    }

    // Kesilgandan keyin hudud bir necha bo'lakka bo'linib
    // ketishi mumkin — ular o'sha hududning bo'laklari bo'lib
    // qoladi (nomeri va tarixi saqlanadi).
    kept.push(
      normalizeTerritory(
        {
          ...territory,
          points: rest.points,
          holes: rest.holes,
          parts: rest.parts
        },
        other
      )
    );

    defense.markContested(kept[kept.length - 1], now);

    trimmed.push({
      territoryId: territory.id || null,
      ownerId: other.id,
      ownerName: other.name,
      area: Math.round(shared),
      level: Number(territory.level) || 1
    });
  });

  if (touched) {
    other.territories = kept;
    rebuildArea(other);
  }

  return touched;
}

// ------------------------------------------------------------
// ANTI-CHEAT
// ------------------------------------------------------------
//
// Qoida: "SERVERGA ISHON, KLIENTGA EMAS". Klient yuborgan hech
// bir son o'z holicha ishonchli emas — hammasi shu yerda
// qaytadan tekshiriladi.
//
// Tekshiriladigan narsalar:
//
//   1) Sakrash (teleport)      — ikki nuqta orasi juda uzoq
//   2) Imkonsiz tezlik         — o'rtacha va eng yuqori tezlik
//   3) Shahar almashib qolishi — oxirgi ma'lum joydan juda uzoq
//   4) Soxta GPS belgilari     — juda "silliq" yo'l
//
// Har biri uchun tushunarli xato qaytadi.
// ------------------------------------------------------------

const CHEAT = {
  // Ikki ketma-ket nuqta orasidagi eng katta masofa (metr).
  // GPS uzilib qolsa ham odam bir zumda bunchalik yurolmaydi.
  MAX_JUMP_M: 400,

  // Oxirgi ma'lum joydan bu yergacha yetib kelish tezligi
  // (km/soat). Mashinada kelgan bo'lsa ham yetadi; bir zumda
  // boshqa shaharga "sakrash" esa o'tmaydi.
  MAX_TRAVEL_KMH: 140,

  // Oxirgi joylashuv shundan eski bo'lsa — solishtirmaymiz
  // (samolyotda uchgan bo'lishi mumkin)
  LOCATION_FRESH_MS: 60 * 60 * 1000,

  // Yo'l shunchalik "silliq" bo'lsa — bu dastur chizgan yo'l.
  // Haqiqiy GPS hech qachon bunchalik teng bo'lmaydi.
  SMOOTH_MIN_POINTS: 25,
  SMOOTH_SPREAD: 0.02
};

// Ketma-ket nuqtalar orasidagi masofalar
function stepsOf(points) {
  const list = [];

  for (let i = 1; i < points.length; i++) {
    list.push(distanceMeters(points[i - 1], points[i]));
  }

  return list;
}

// ------------------------------------------------------------
// 1-QISM: faqat yo'lning O'ZIGA qaraydigan tekshiruvlar
// ------------------------------------------------------------
//
// Bular o'yinchi yozuvini talab qilmaydi, shuning uchun eng
// birinchi bo'lib ishlaydi: sakrab yurilgan yo'lda "tezlik"
// haqida gapirishning ma'nosi yo'q.
// ------------------------------------------------------------

function checkShape(points) {
  const steps = stepsOf(points);

  // ---- 1) sakrash ----
  const jump = Math.max(0, ...steps);

  if (jump > CHEAT.MAX_JUMP_M) {
    return {
      error: "teleport",
      message:
        "Yo'lda " +
        Math.round(jump) +
        " metrlik sakrash bor — GPS uzilgan yoki soxta joylashuv " +
        "ishlatilgan. Qaytadan yuring."
    };
  }

  // ---- 2) juda silliq yo'l (dastur chizgan) ----
  if (steps.length >= CHEAT.SMOOTH_MIN_POINTS) {
    const average = steps.reduce((sum, step) => sum + step, 0) / steps.length;

    if (average > 1) {
      const spread =
        Math.sqrt(
          steps.reduce((sum, step) => sum + (step - average) ** 2, 0) /
            steps.length
        ) / average;

      if (spread < CHEAT.SMOOTH_SPREAD) {
        return {
          error: "fake_gps",
          message:
            "Yo'l juda bir tekis — soxta joylashuv aniqlandi. " +
            "Haqiqiy yurish yozilmadi."
        };
      }
    }
  }

  return null;
}

// ------------------------------------------------------------
// 2-QISM: o'yinchining oldingi holati bilan solishtirish
// ------------------------------------------------------------

function checkTravel(player, points) {
  // ---- oxirgi ma'lum joydan yetib kelish ----
  const last = player.location;

  const seen = last ? Number(last.time || last.updatedAt || 0) : 0;

  if (last && seen && Date.now() - seen < CHEAT.LOCATION_FRESH_MS) {
    const gap = distanceMeters([last.lat, last.lng], points[0]);

    // Aylanishning o'zi ham vaqt olgan — uni ham hisobga olamiz
    const seconds = Math.max(1, (Date.now() - seen) / 1000);

    const kmh = (gap / seconds) * 3.6;

    if (gap > 2000 && kmh > CHEAT.MAX_TRAVEL_KMH) {
      return {
        error: "teleport",
        message:
          "Oxirgi joylashuvingizdan bu yergacha " +
          Math.round(gap / 1000) +
          " km — bunchalik tez yetib bo'lmaydi. Soxta joylashuv " +
          "aniqlandi."
      };
    }
  }

  return null;
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();

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

    // ---------------------------------------------------------
    // ANTI-CHEAT (1-qism): yo'lning o'zi
    // ---------------------------------------------------------
    //
    // Sakrash va soxta GPS tezlikdan OLDIN tekshiriladi —
    // aks holda sakrab yurilgan yo'l "juda tez" deb, noto'g'ri
    // sabab bilan rad etilardi.
    // ---------------------------------------------------------

    const shapeCheat = checkShape(points);

    if (shapeCheat) return json(res, 400, shapeCheat);

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

    // ---------------------------------------------------------
    // O'YINCHI
    // ---------------------------------------------------------

    const players = await readPlayers();

    // Akkaunt bu yerda yaratilmaydi — /api/auth ning ishi.
    // Token birovning nomidan hudud egallashga yo'l qo'ymaydi.
    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const player = check.player;

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

    // ---------------------------------------------------------
    // XARITA
    // ---------------------------------------------------------
    //
    // Hudud QAYSI xaritada yozilishini server hal qiladi.
    // Klient yopiq xaritani so'rasa — o'z xaritasida qoladi.
    // ---------------------------------------------------------

    const wanted = String(body.mapId || "");

    const mapId = player.maps.includes(wanted) ? wanted : player.mapId;

    const mapInfo = maps.mapById(mapId) || maps.mapById(maps.DEFAULT_MAP);

    // Har bir xaritaning eng kichik hududi har xil
    const minArea = Math.max(RULES.MIN_AREA, Number(mapInfo.minArea) || 0);

    if (area < minArea) {
      return json(res, 400, {
        error: "too_small",
        minArea,
        message:
          mapInfo.name +
          " xaritasida eng kichik hudud — " +
          minArea +
          " m². Kattaroq aylanma yasang."
      });
    }

    // ---------------------------------------------------------
    // ANTI-CHEAT (2-qism): oldingi holat bilan solishtirish
    // ---------------------------------------------------------

    const travelCheat = checkTravel(player, points);

    if (travelCheat) {
      return json(res, 400, travelCheat);
    }

    const claimBox = geo.ringBox(points);

    const captured = [];
    const trimmed = [];

    // Himoyada bo'lgani uchun tegib bo'lmagan hududlar
    const blocked = [];

    const now = Date.now();

    const changed = new Map();

    changed.set(String(player.id), player);

    // ---------------------------------------------------------
    // 1) BEGONALARNIKINI KESIB OLAMIZ
    // ---------------------------------------------------------
    //
    // Himoyadagi (DEFENDED) va yangi o'yinchining hududlariga
    // tegilmaydi — ular `blocked` ga tushadi.
    // ---------------------------------------------------------

    // Himoyada bo'lgani uchun kesib olinadigan shakllar
    const shield = [];

    const ctx = { mapId, now, blocked, shield };

    Object.values(players).forEach((other) => {
      if (String(other.id) === String(player.id)) return;

      if (captureFrom(other, claimGeom, claimBox, captured, trimmed, ctx)) {
        changed.set(String(other.id), other);
      }
    });

    // ---------------------------------------------------------
    // 2) O'ZINIKINI QO'SHIB YUBORAMIZ
    // ---------------------------------------------------------

    const owned = mergeOwn(player, claimGeom, mapId);

    const merged = owned.merged;
    const kept = owned.kept;

    // Himoyadagi begona yerlar o'yib tashlanadi — o'sha joyda
    // hududingizda teshik qoladi. Himoya tugagach yana yurib
    // to'ldirsangiz bo'ladi.
    let combined = owned.combined;

    shield.forEach((shape) => {
      combined = geo.difference(combined, shape);
    });

    if (shield.length) combined = geo.normalizeGeom(combined);

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

    // Natija — BITTA hudud yozuvi. Ichida bir nechta alohida
    // bo'lak bo'lishi mumkin (yonma-yon, lekin tegib turmagan
    // hududlar qo'shilganda yoki sakkiz shaklidagi yo'lda).
    const shape = geo.shapeFromGeom(combined, minArea);

    if (!shape) {
      return json(res, 400, {
        error: shield.length ? "defended" : "too_small",
        blocked,
        message: shield.length
          ? "Bu yer hozir himoyada — himoya tugagach qaytib keling"
          : "Hudud juda kichkina — kattaroq aylanma yasang"
      });
    }

    // Qo'shilib ketgan hududlarning "mehnati" ham yig'iladi:
    // hudud darajasi shu songa qarab o'sadi.
    let effort = defense.effortForClaim(area);
    let captures = 0;

    merged.forEach((old) => {
      effort += Math.max(0, Number(old.effort) || 0);
      captures += Math.max(0, Number(old.captures) || 0);
    });

    const territory = normalizeTerritory(
      {
        id: host && host.id ? host.id : makeTerritoryId(),

        // Hudud qaysi xaritada yozilgani
        mapId,

        points: shape.points,
        holes: shape.holes,
        parts: shape.parts,

        // Shu hudud uchun jami yurilgan yo'l (metr).
        distance: totalDistance,
        duration: totalDuration,

        speed: Math.round(avgSpeed * 10) / 10,

        mergedCount: merged.length,
        capturedCount: captured.length,

        // Daraja va himoya (pastda yangilanadi)
        effort,
        captures: captures + captured.length,
        defendedUntil: host ? Number(host.defendedUntil) || 0 : 0,

        createdAt
      },
      player
    );

    // ---------------------------------------------------------
    // HIMOYA
    // ---------------------------------------------------------
    //
    // Hudud egallandi — endi u ma'lum vaqtga himoyalanadi.
    // Muddatni FAQAT server belgilaydi (qarang: _defense.js).
    // ---------------------------------------------------------

    const guardResult = defense.refresh(
      territory,
      0,
      mapInfo.defenseBonus,
      now
    );

    player.territories = kept.concat([territory]);

    rebuildArea(player);

    player.updatedAt = Date.now();

    // ---------------------------------------------------------
    // 3) HAR KUNLIK CHELENJ HISOBLAGICHLARI
    // ---------------------------------------------------------
    //
    // Faqat SHU aylanish hisobga olinadi — qo'shilib ketgan eski
    // hududlarning masofasi ikkinchi marta sanalmaydi.
    // ---------------------------------------------------------

    const walkDistance = Math.round(
      Number.isFinite(Number(body.distance)) && Number(body.distance) > 0
        ? Number(body.distance)
        : walked
    );

    daily.bump(player, "distance", walkDistance);
    daily.bump(player, "area", area);
    daily.bump(player, "zones", 1);
    daily.bump(player, "capture", captured.length);

    // ---------------------------------------------------------
    // XP
    // ---------------------------------------------------------
    //
    // XP ni FAQAT server beradi. Yurishdan olinadigan XP kunlik
    // chegara bilan cheklangan — bir kechada 30-darajaga chiqib
    // ketib bo'lmaydi.
    // ---------------------------------------------------------

    let gained = 0;

    gained += level.walkXp(player, walkDistance, daily.dayKey(now));
    gained += level.areaXp(area);
    gained += level.XP.DEFEND;

    captured.forEach((lost) => {
      gained += level.XP.CAPTURE * Math.max(1, Number(lost.level) || 1);
    });

    trimmed.forEach(() => {
      gained += level.XP.TRIM;
    });

    const beforeLevel = player.level;

    const xpResult = level.addXp(player, gained, "territory");

    // Daraja oshgan bo'lsa — yangi xarita ochilgan bo'lishi mumkin
    const unlocked = [];

    for (let n = beforeLevel + 1; n <= player.level; n++) {
      const found = maps.unlockedAt(n);

      if (found) unlocked.push({ id: found.id, name: found.name, level: n });
    }

    maps.normalizeMaps(player, player.level);

    if (xpResult.levelUp) {
      notify.notify(player, {
        type: "level",
        title: "Daraja " + player.level + "!",
        body:
          unlocked.length
            ? unlocked[unlocked.length - 1].name + " xaritasi ochildi"
            : "Tabriklaymiz — yangi darajaga chiqdingiz"
      });
    }

    unlocked.forEach((map) => {
      notify.notify(player, {
        type: "map",
        title: "Yangi xarita ochildi!",
        body: map.name + " — " + map.level + "-darajada ochiladi"
      });
    });

    // ---------------------------------------------------------
    // DAVRIY STATISTIKA (reyting uchun)
    // ---------------------------------------------------------

    stats.bumpAll(player, {
      xp: gained,
      area,
      distance: walkDistance,
      zones: 1,
      captures: captured.length
    });

    // ---------------------------------------------------------
    // 4) HUDUDI QO'LDAN KETGANLARGA BILDIRISHNOMA
    // ---------------------------------------------------------
    //
    // Bosib olingan hudud egasiga xabar boradi — ilova buni
    // telefonda bildirishnoma qilib ko'rsatadi.
    // ---------------------------------------------------------

    const hit = new Map();

    captured.forEach((lost) => {
      const row = hit.get(String(lost.ownerId)) || { taken: 0, cut: 0, area: 0 };

      row.taken += 1;
      row.area += Number(lost.area) || 0;

      hit.set(String(lost.ownerId), row);
    });

    trimmed.forEach((lost) => {
      const row = hit.get(String(lost.ownerId)) || { taken: 0, cut: 0, area: 0 };

      row.cut += 1;
      row.area += Number(lost.area) || 0;

      hit.set(String(lost.ownerId), row);
    });

    hit.forEach((row, ownerId) => {
      const victim = changed.get(ownerId);

      if (!victim) return;

      notify.notify(victim, {
        type: row.taken ? "capture" : "trim",
        from: player.id,
        fromName: player.name,

        title: row.taken
          ? "Hududingiz bosib olindi!"
          : "Hududingizdan bo'lak kesildi",

        body:
          "@" +
          player.name +
          " " +
          (row.taken
            ? row.taken + " ta hududingizni oldi"
            : row.cut + " ta hududingizni kesdi") +
          " (" +
          Math.round(row.area) +
          " m²)"
      });
    });

    await writePlayers(Array.from(changed.values()));

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

    if (blocked.length) {
      parts.push(blocked.length + " ta hudud himoyada edi");
    }

    return json(res, 200, {
      ok: true,

      message: parts.length ? parts.join(", ") + "!" : "Yangi hudud egallandi!",

      player: publicPlayer(player, id, { mapId }),
      territory: {
        ...territory,
        defense: defense.defenseView(territory, now)
      },

      captured,
      trimmed,
      blocked,
      merged: merged.length,

      mapId,

      // Himoya: daraja va necha soatga yopilgani
      guard: guardResult,

      // XP va daraja
      xp: {
        gained,
        total: player.xp,
        level: player.level,
        levelUp: xpResult.levelUp,
        unlocked,
        view: level.levelView(player)
      },

      players: publicList(players, id, { mapId }),

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

// Bazani o'zgartiradigan so'rovlar birin-ketin bajariladi
module.exports = locked("players", handler);
