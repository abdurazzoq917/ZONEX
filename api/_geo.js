// api/_geo.js
// ============================================================
// ZONEX — HUDUD GEOMETRIYASI
// ============================================================
//
// Bu yerda hududlar ustida HAQIQIY amallar bajariladi:
//
//   birlashtirish (union)  — yonma-yon hududlar bitta bo'ladi
//   ayirish     (difference) — bosib olingan qism egasidan ketadi
//   kesishma    (intersection) — qancha joy bosib olingani
//
// Ilgari bular taxminiy (nuqta sanash / to'r bo'yicha) edi:
// shuning uchun birovning yeridan yursang uning hududi
// XARITADA O'ZGARMASDI — faqat raqami kamayardi. Endi
// shaklning o'zi kesiladi va hamma buni ko'radi.
//
// Hudud modeli:
//
//   {
//     points: [[lat, lng], ...]      // tashqi chiziq
//     holes:  [[[lat, lng], ...]]    // ichidan o'yib olingan joylar
//     area:   12345                  // m2 (teshiklar ayrilgan)
//   }
//
// `holes` bo'lmasligi mumkin — eski hududlar shunday.
// ============================================================

const polygonClipping = require("polygon-clipping");

// polygon-clipping graduslar bilan ishlaganda juda kichik
// sonlar tufayli adashishi mumkin. Shuning uchun koordinatalar
// kattalashtirilib beriladi (1 birlik ~ 11 sm) va javob
// qaytganda yana graduslarga qaytariladi.
const SCALE = 1e6;

const EARTH_R = 6371000;

// ============================================================
// KICHIK YORDAMCHILAR
// ============================================================

function isRing(ring) {
  return Array.isArray(ring) && ring.length >= 3;
}

function samePoint(a, b) {
  return Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]);
}

// Ketma-ket takrorlangan nuqtalar va yopuvchi nuqta olib tashlanadi
function tidyRing(ring) {
  if (!Array.isArray(ring)) return [];

  const out = [];

  ring.forEach((p) => {
    if (!Array.isArray(p) || p.length < 2) return;

    const lat = Number(p[0]);
    const lng = Number(p[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (out.length && samePoint(out[out.length - 1], [lat, lng])) return;

    out.push([lat, lng]);
  });

  while (out.length > 1 && samePoint(out[0], out[out.length - 1])) {
    out.pop();
  }

  return out;
}

function scaleRing(ring) {
  return ring.map((p) => [Number(p[0]) * SCALE, Number(p[1]) * SCALE]);
}

function unscaleRing(ring) {
  const out = [];

  ring.forEach((p) => {
    out.push([p[0] / SCALE, p[1] / SCALE]);
  });

  while (out.length > 1 && samePoint(out[0], out[out.length - 1])) {
    out.pop();
  }

  return out;
}

// ============================================================
// MAYDON (m2)
// ============================================================
//
// Kichik masofalarda yer sirtini tekislik deb hisoblash
// yetarlicha aniq: xato 1% dan kam.
// ============================================================

function ringArea(points) {
  if (!isRing(points)) return 0;

  const midLat =
    ((points.reduce((sum, p) => sum + Number(p[0]), 0) / points.length) *
      Math.PI) /
    180;

  const kx = 111320 * Math.cos(midLat);
  const ky = 110540;

  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    sum +=
      Number(a[1]) * kx * (Number(b[0]) * ky) -
      Number(b[1]) * kx * (Number(a[0]) * ky);
  }

  return Math.abs(sum / 2);
}

// Teshiklari ayrilgan haqiqiy maydon
function shapeArea(points, holes) {
  let area = ringArea(points);

  if (Array.isArray(holes)) {
    holes.forEach((hole) => {
      area -= ringArea(hole);
    });
  }

  return Math.max(0, area);
}

// ============================================================
// GEOM (polygon-clipping formati) BILAN ISHLASH
// ============================================================
//
// geom — MultiPolygon: [ [ tashqi, teshik, teshik ], ... ]
// ============================================================

function ringGeom(points) {
  const ring = tidyRing(points);

  if (!isRing(ring)) return [];

  return [[scaleRing(ring)]];
}

function territoryGeom(territory) {
  if (!territory) return [];

  const outer = tidyRing(territory.points);

  if (!isRing(outer)) return [];

  const poly = [scaleRing(outer)];

  if (Array.isArray(territory.holes)) {
    territory.holes.forEach((hole) => {
      const clean = tidyRing(hole);

      if (isRing(clean)) poly.push(scaleRing(clean));
    });
  }

  return [poly];
}

// polygon-clipping ba'zan buzuq (o'z-o'zini kesib ketgan)
// halqalarda xato beradi — o'yin shu tufayli to'xtab qolmasin.
function union(a, b) {
  if (!a.length) return b;
  if (!b.length) return a;

  try {
    return polygonClipping.union(a, b);
  } catch {
    return a.concat(b);
  }
}

function difference(a, b) {
  if (!a.length || !b.length) return a;

  try {
    return polygonClipping.difference(a, b);
  } catch {
    return a;
  }
}

function intersection(a, b) {
  if (!a.length || !b.length) return [];

  try {
    return polygonClipping.intersection(a, b);
  } catch {
    return [];
  }
}

// O'z-o'zini kesib ketgan halqani to'g'ri shaklga keltiradi
// (sakkiz shaklidagi yo'l ham to'g'ri maydon beradi).
function normalizeGeom(geom) {
  if (!geom.length) return [];

  try {
    return polygonClipping.union(geom, []);
  } catch {
    return geom;
  }
}

function geomArea(geom) {
  if (!Array.isArray(geom)) return 0;

  let total = 0;

  geom.forEach((poly) => {
    if (!Array.isArray(poly) || !poly.length) return;

    const outer = unscaleRing(poly[0]);

    total += ringArea(outer);

    for (let i = 1; i < poly.length; i++) {
      total -= ringArea(unscaleRing(poly[i]));
    }
  });

  return Math.max(0, total);
}

// geom -> hudud bo'laklari (kattadan kichikka)
function geomPieces(geom, minArea) {
  if (!Array.isArray(geom)) return [];

  const limit = Number(minArea) || 0;

  const pieces = [];

  geom.forEach((poly) => {
    if (!Array.isArray(poly) || !poly.length) return;

    const points = unscaleRing(poly[0]);

    if (!isRing(points)) return;

    const holes = [];

    for (let i = 1; i < poly.length; i++) {
      const hole = unscaleRing(poly[i]);

      // Juda kichik teshiklar (GPS titrashi) hisobga olinmaydi
      if (isRing(hole) && ringArea(hole) >= 5) holes.push(hole);
    }

    const area = shapeArea(points, holes);

    if (area < limit) return;

    pieces.push({ points, holes, area });
  });

  return pieces.sort((a, b) => b.area - a.area);
}

// ============================================================
// BBOX — tez saralash uchun
// ============================================================
//
// Ikki hudud bir-biridan uzoq bo'lsa, og'ir kesishma amalini
// umuman bajarmaymiz: avval to'rtburchak chegaralari
// solishtiriladi. Bu o'yinchilar ko'payganda serverni
// sekinlashishdan saqlaydi.
// ============================================================

function ringBox(points) {
  if (!isRing(points)) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  points.forEach((p) => {
    const lat = Number(p[0]);
    const lng = Number(p[1]);

    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  });

  return { minLat, maxLat, minLng, maxLng };
}

// Bir nechta halqani qamrab oluvchi chegara
function boxOfRings(rings) {
  let box = null;

  rings.forEach((ring) => {
    const found = ringBox(ring);

    if (!found) return;

    if (!box) {
      box = found;
      return;
    }

    box.minLat = Math.min(box.minLat, found.minLat);
    box.maxLat = Math.max(box.maxLat, found.maxLat);
    box.minLng = Math.min(box.minLng, found.minLng);
    box.maxLng = Math.max(box.maxLng, found.maxLng);
  });

  return box;
}

// Chegaralar `pad` metr kengaytirilganda kesishadimi?
function boxesNear(a, b, pad) {
  if (!a || !b) return false;

  const meters = Number(pad) || 0;

  const dLat = meters / 110540;

  const midLat = ((a.minLat + a.maxLat) / 2) * (Math.PI / 180);

  const dLng = meters / (111320 * Math.cos(midLat) || 1);

  return (
    a.minLat - dLat <= b.maxLat &&
    a.maxLat + dLat >= b.minLat &&
    a.minLng - dLng <= b.maxLng &&
    a.maxLng + dLng >= b.minLng
  );
}

// ============================================================
// MASOFA — "yonma-yon"ligini bilish uchun
// ============================================================

function distanceMeters(a, b) {
  const rad = Math.PI / 180;

  const dLat = (Number(b[0]) - Number(a[0])) * rad;
  const dLng = (Number(b[1]) - Number(a[1])) * rad;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(Number(a[0]) * rad) *
      Math.cos(Number(b[0]) * rad) *
      Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Nuqtadan kesmagacha bo'lgan masofa (metr) va o'sha eng yaqin nuqta
function closestOnSegment(p, a, b) {
  const midLat = ((Number(p[0]) + Number(a[0])) / 2) * (Math.PI / 180);

  const kx = 111320 * Math.cos(midLat) || 1;
  const ky = 110540;

  const px = Number(p[1]) * kx;
  const py = Number(p[0]) * ky;
  const ax = Number(a[1]) * kx;
  const ay = Number(a[0]) * ky;
  const bx = Number(b[1]) * kx;
  const by = Number(b[0]) * ky;

  const dx = bx - ax;
  const dy = by - ay;

  const len = dx * dx + dy * dy;

  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;

  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;

  return {
    dist: Math.hypot(px - cx, py - cy),
    point: [cy / ky, cx / kx]
  };
}

// Halqa nuqtalarini ikkinchi halqaning KESMALARIGA solishtirish
function scanRings(from, to, best, flip) {
  for (let i = 0; i < from.length; i++) {
    const p = from[i];

    for (let j = 0; j < to.length; j++) {
      const c = to[j];
      const d = to[(j + 1) % to.length];

      const near = closestOnSegment(p, c, d);

      if (near.dist < best.gap) {
        best.gap = near.dist;

        // `from` — har doim birinchi halqadagi nuqta bo'lib qolsin
        best.from = flip ? near.point : p;
        best.to = flip ? p : near.point;
      }
    }
  }

  return best;
}

// Ikki halqa orasidagi eng qisqa masofa va o'sha ikki nuqta.
//
// MUHIM: ikkala tomonni ham tekshiramiz. Faqat bitta tomonni
// tekshirsak, burchagi bilan emas, YONI bilan qaragan hududlar
// bir-biridan uzoq ko'rinib qoladi va qo'shilmaydi.
function ringGap(a, b) {
  const ringA = tidyRing(a);
  const ringB = tidyRing(b);

  if (!isRing(ringA) || !isRing(ringB)) {
    return { gap: Infinity, from: null, to: null };
  }

  const best = { gap: Infinity, from: null, to: null };

  scanRings(ringA, ringB, best, false);
  scanRings(ringB, ringA, best, true);

  return best;
}

// ============================================================
// KO'PRIK — biroz uzoqroq turgan ikki hududni ulash uchun
// ============================================================
//
// Ikki hudud tegib turmasa ham (masalan orasida 10 metrlik
// yo'lak bo'lsa) ular "yonma-yon" hisoblanadi va bitta
// hududga aylanadi. Buning uchun ular orasiga ingichka
// bog'lovchi shakl qo'yiladi.
// ============================================================

function bridgeGeom(from, to, width) {
  if (!from || !to) return [];

  const midLat = ((Number(from[0]) + Number(to[0])) / 2 * Math.PI) / 180;

  const kx = 111320 * Math.cos(midLat) || 1;
  const ky = 110540;

  const dx = (Number(to[1]) - Number(from[1])) * kx;
  const dy = (Number(to[0]) - Number(from[0])) * ky;

  const len = Math.hypot(dx, dy);

  if (!len) return [];

  const half = Math.max(2, Number(width) || 6) / 2;

  // Ko'prik ikkala hudud ICHIGA biroz kirib borsin — aks holda
  // faqat chetiga tegib, birlashish hosil bo'lmaydi.
  const grow = 3;

  const ux = dx / len;
  const uy = dy / len;

  // perpendikulyar
  const nx = -uy;
  const ny = ux;

  const startX = Number(from[1]) * kx - ux * grow;
  const startY = Number(from[0]) * ky - uy * grow;

  const endX = Number(to[1]) * kx + ux * grow;
  const endY = Number(to[0]) * ky + uy * grow;

  const corners = [
    [startX + nx * half, startY + ny * half],
    [endX + nx * half, endY + ny * half],
    [endX - nx * half, endY - ny * half],
    [startX - nx * half, startY - ny * half]
  ];

  const ring = corners.map((c) => [c[1] / ky, c[0] / kx]);

  return ringGeom(ring);
}

module.exports = {
  SCALE,

  isRing,
  tidyRing,

  ringArea,
  shapeArea,

  ringGeom,
  territoryGeom,

  union,
  difference,
  intersection,
  normalizeGeom,

  geomArea,
  geomPieces,

  ringBox,
  boxOfRings,
  boxesNear,

  distanceMeters,
  closestOnSegment,
  ringGap,
  bridgeGeom
};
