// client.js
// ============================================================
// ZONEX — brauzer qismi
// ============================================================
//
//  - Username faqat BIR MARTA so'raladi (bittasini ikki kishi
//    ola olmaydi)
//  - Bitta qurilma = bitta akkaunt
//  - Odamlar bir-birini jonli ko'radi va xarita yangilanganda
//    yo'qolib qolmaydi
//  - Yo'l o'zini kesib o'tsa (A nuqta B nuqta bilan kesishsa)
//    o'sha halqa darhol odamning yeri bo'ladi va SAQLANIB
//    qoladi — yurish esa to'xtamaydi
//  - Yurishni faqat odam o'zi tugatadi (avto yopilmaydi)
//  - Begona hududdan aylanib o'tsang — o'sha yer senga o'tadi
//  - 23 km/soatdan tez harakatda hudud yozilmaydi
// ============================================================

const $ = (s) => document.querySelector(s);

// ============================================================
// SOZLAMALAR
// ============================================================

const CONFIG = {
  // Yurish chegarasi (km/soat).
  // Bundan tez — transport hisoblanadi, hudud yozilmaydi.
  MAX_SPEED_KMH: 23,

  // Butun aylanish bo'yicha o'rtacha tezlik (km/soat)
  MAX_AVG_SPEED_KMH: 23,

  // GPS aniqligi shundan yomon bo'lsa — nuqta hisobga olinmaydi
  MAX_ACCURACY: 60,

  // Ikki nuqta orasidagi eng kichik masofa (metr)
  MIN_STEP: 4,

  // Transportda ketib qolgan bo'lsa, shu masofadan keyin
  // yurish qaytadan boshlanadi (metr)
  RESET_JUMP: 90,

  // Boshlang'ich nuqtaga qaytish radiusi (metr)
  CLOSE_RADIUS: 20,

  // Serverga joylashuv yuborish oralig'i (ms)
  SEND_MS: 3000,

  // Dunyoni yangilash oralig'i (ms)
  POLL_MS: 3000,

  // Odam onlayn hisoblanadigan vaqt (ms)
  ONLINE_MS: 120000,

  // Xarita eng ko'p yaqinlashish darajasi.
  // OSM plitkalari 19 gacha bor: undan keyin plitka cho'ziladi,
  // shuning uchun xarita OQARIB qolmaydi.
  MAX_ZOOM: 21,
  TILE_ZOOM: 19,

  // Server hali tasdiqlamagan hududni shuncha vaqt lokal
  // saqlab turamiz (ms) — 12 soat
  PENDING_TTL: 12 * 60 * 60 * 1000
};

// Username qoidasi
const NAME_MIN = 3;
const NAME_MAX = 16;

// Admin username — server bilan bir xil
// (o'zgartirilsa: .env dagi ADMIN_USERNAME)
const ADMIN_NAME = "abdumalikov";

// ============================================================
// QURILMA ID — bitta qurilma, bitta akkaunt
// ============================================================
//
// localStorage tozalansa ham cookie'dan tiklanadi.
// ============================================================

function readCookie(key) {
  const found = document.cookie
    .split(";")
    .map((row) => row.trim())
    .find((row) => row.startsWith(key + "="));

  return found ? decodeURIComponent(found.slice(key.length + 1)) : "";
}

function writeCookie(key, value) {
  const tenYears = 60 * 60 * 24 * 365 * 10;

  document.cookie =
    key +
    "=" +
    encodeURIComponent(value) +
    ";max-age=" +
    tenYears +
    ";path=/;SameSite=Lax";
}

function loadStored(key) {
  try {
    return localStorage.getItem(key) || readCookie(key) || "";
  } catch {
    return readCookie(key);
  }
}

function saveStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private rejim */
  }

  writeCookie(key, value);
}

// Katta ma'lumot (hudud nuqtalari) — faqat localStorage'ga.
// Cookie'ning hajmi kichik, u yerga sig'maydi.
function loadBig(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function saveBig(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* joy yetmadi */
  }
}

function deviceId() {
  let id = loadStored("zonexId");

  if (!id) {
    id =
      crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);

    saveStored("zonexId", id);
  }

  return id;
}

// ============================================================
// HOLAT
// ============================================================

const state = {
  id: deviceId(),
  name: loadStored("zonexName"),
  color: loadStored("zonexColor") || "",

  map: null,
  marker: null,
  accuracyRing: null,

  watchId: null,
  lastFix: null,
  lastSent: 0,
  speed: 0,

  // yurish
  active: false,
  started: 0,
  points: [],
  distance: 0,
  maxSpeed: 0,
  tooFast: false,
  line: null,
  preview: null,
  timer: null,

  // hozirgi halqa (oxirgi kesishishdan beri)
  loopStarted: 0,
  loopDistance: 0,
  loops: 0,

  // dunyo
  players: [],
  playerMap: new Map(),
  zoneLayers: new Map(),
  markers: new Map(),
  worldTimer: null,
  liveOpen: false,
  worldTime: 0,

  // ochiq profil (boshqa odamniki ham bo'lishi mumkin)
  profileId: "",

  // eng katta hududga ega odam — uning nomi ustida toj turadi
  kingId: "",

  // profil rasmlari keshi: id -> { v, src }
  avatars: new Map(),
  avatarLoading: new Set(),
  avatarBusy: false,

  // 18+ tekshiruv modeli (faqat kerak bo'lganda yuklanadi)
  nsfwModel: null,
  nsfwLoading: null,

  // suhbat
  chatWith: "",
  chatTimer: null,
  chatMessages: [],

  // do'stlar / suhbatlar ro'yxati
  friendsOpen: false,
  chatList: [],
  chatListTimer: null,
  chatListBusy: false,

  // qaysi suhbatni qachon o'qiganman: { id: vaqt }
  seen: {},

  // qidiruv
  searchOpen: false,
  searchText: "",

  // admin maxfiy so'zi (server ADMIN_KEY talab qilsa)
  adminKey: loadStored("zonexAdminKey"),

  // server hali tasdiqlamagan (yoki yubarilmagan) hududlarim
  pending: [],
  sending: false
};

// ============================================================
// YORDAMCHILAR
// ============================================================

function toast(message) {
  const box = $("#toast");

  if (!box) return;

  box.textContent = message;
  box.classList.add("show");

  clearTimeout(box._timer);

  box._timer = setTimeout(() => box.classList.remove("show"), 3200);
}

function esc(value) {
  return String(value == null ? "" : value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#039;"
      }[c])
  );
}

// ------------------------------------------------------------
// ADMIN NISHONI
// ------------------------------------------------------------
//
// Admin username'i oldida yashil (admin) yozuvi turadi:
//
//     (admin) @Abdumalikov
// ------------------------------------------------------------

function isAdmin(player) {
  if (!player) return false;

  if (player.role === "admin") return true;

  return String(player.name || "").trim().toLowerCase() === ADMIN_NAME;
}

// (admin) @username — kerak bo'lsa oxiriga qo'shimcha matn
function nameHtml(player, suffix) {
  return (
    (isAdmin(player) ? '<b class="admin-tag">(admin)</b> ' : "") +
    "@" +
    esc(player && player.name) +
    (suffix || "")
  );
}

function hav(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;

  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function polygonArea(points) {
  if (points.length < 3) return 0;

  const midLat =
    ((points.reduce((sum, p) => sum + p[0], 0) / points.length) * Math.PI) /
    180;

  const kx = 111320 * Math.cos(midLat);
  const ky = 110540;

  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    sum += a[1] * kx * (b[0] * ky) - b[1] * kx * (a[0] * ky);
  }

  return Math.abs(sum / 2);
}

// ------------------------------------------------------------
// A NUQTA — B NUQTA KESISHISHI
// ------------------------------------------------------------
//
// Ikki kesma kesishsa — kesishgan nuqtani qaytaradi.
// Kesishmasa — null.
// ------------------------------------------------------------

function segmentsCross(a, b, c, d) {
  const x1 = a[1];
  const y1 = a[0];
  const x2 = b[1];
  const y2 = b[0];
  const x3 = c[1];
  const y3 = c[0];
  const x4 = d[1];
  const y4 = d[0];

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Parallel yoki bir chiziqda
  if (Math.abs(den) < 1e-14) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return [y1 + t * (y2 - y1), x1 + t * (x2 - x1)];
}

// ------------------------------------------------------------
// HALQA IZLASH
// ------------------------------------------------------------
//
// Oxirgi qadam eski yo'lni kesib o'tdimi? Kesib o'tgan bo'lsa —
// o'sha yerda YOPIQ HALQA hosil bo'ladi va u odamning yeri
// bo'ladi.
// ------------------------------------------------------------

function findLoop(points) {
  const n = points.length;

  if (n < 5) return null;

  const c = points[n - 2];
  const d = points[n - 1];

  // n-3 — oxirgi kesma bilan umumiy nuqtasi bor, u hisobga olinmaydi
  for (let i = 0; i < n - 3; i++) {
    const cross = segmentsCross(points[i], points[i + 1], c, d);

    if (!cross) continue;

    const ring = [cross].concat(points.slice(i + 1, n - 1));

    if (ring.length < 3) continue;

    return { ring, index: i, cross };
  }

  return null;
}

// Rang — server bilan bir xil formula (qurilma ID bo'yicha)
function colorFromId(id) {
  let hash = 2166136261;

  const text = String(id);

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  hash = Math.abs(hash | 0);

  const hue = Math.round((hash * 137.508) % 360);
  const sat = 62 + (hash % 4) * 6;
  const light = 42 + ((hash >> 3) % 3) * 5;

  return "hsl(" + hue + " " + sat + "% " + light + "%)";
}

function applyColor(color) {
  const next = color || state.color || colorFromId(state.id);

  state.color = next;

  saveStored("zonexColor", next);

  const avatar = $("#profileBtn");

  if (avatar) avatar.style.background = next;

  if (state.marker) {
    state.marker.setStyle({ fillColor: next });
  }
}

// ============================================================
// USERNAME
// ============================================================

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+/, "")
    .slice(0, NAME_MAX);
}

function usernameProblem(value) {
  const clean = cleanUsername(value);

  if (clean.length < NAME_MIN) {
    return "Username kamida " + NAME_MIN + " ta belgidan iborat bo'lsin";
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._]*$/.test(clean)) {
    return "Username harf yoki raqam bilan boshlansin";
  }

  return "";
}

// ============================================================
// LOKAL HUDUDLAR (server tasdiqlagunicha yo'qolmaydi)
// ============================================================

function loadPending() {
  try {
    const list = JSON.parse(loadBig("zonexMine") || "[]");

    if (!Array.isArray(list)) return [];

    const now = Date.now();

    return list.filter(
      (t) =>
        t &&
        Array.isArray(t.points) &&
        t.points.length >= 3 &&
        now - Number(t.createdAt || 0) < CONFIG.PENDING_TTL
    );
  } catch {
    return [];
  }
}

function savePending() {
  saveBig("zonexMine", JSON.stringify(state.pending.slice(-40)));
}

// ============================================================
// XARITA
// ============================================================

function initMap(center) {
  if (state.map) return;

  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: true,
    maxZoom: CONFIG.MAX_ZOOM
  }).setView(center || [41.3111, 69.2797], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    // maxNativeZoom — plitkalar shu darajagacha mavjud.
    // Undan yaqinroq kelinsa, plitka cho'ziladi (oqarib qolmaydi).
    maxZoom: CONFIG.MAX_ZOOM,
    maxNativeZoom: CONFIG.TILE_ZOOM,
    keepBuffer: 4,
    attribution: "© OpenStreetMap"
  }).addTo(state.map);
}

// ============================================================
// DUNYONI CHIZISH
// ============================================================

function playerIcon(player) {
  return L.divIcon({
    className: "zonex-player-marker",

    html:
      '<div class="zx-player">' +
      // Toj nomning USTIDA turadi
      (isKing(player) ? '<b class="zx-crown">👑</b>' : "") +
      avatarHtml(player, "zx-face") +
      '<span class="zx-name">' +
      nameHtml(player) +
      "</span>" +
      "</div>",

    iconSize: [1, 1],
    iconAnchor: [0, 0]
  });
}

function playerMarker(player) {
  const lat = Number(player.location.lat);
  const lng = Number(player.location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const marker = L.marker([lat, lng], {
    icon: playerIcon(player),
    interactive: true
  }).addTo(state.map);

  // Odamning ustiga bosilsa — uning profili ochiladi
  marker.on("click", () => openProfile(player.id));

  return marker;
}

// ------------------------------------------------------------
// HUDUDLAR
// ------------------------------------------------------------
//
// Har bir hudud xaritaga BIR MARTA qo'yiladi va o'chirilmaydi.
// Faqat haqiqatan yo'qolganlari (bosib olinganlari) olib
// tashlanadi — shuning uchun har 3 sekundda miltillamaydi va
// yopilgan hudud yo'qolib qolmaydi.
// ------------------------------------------------------------

function zoneStamp(territory, player, isMe) {
  return (
    String(territory.points.length) +
    ":" +
    player.name +
    ":" +
    (player.color || "") +
    ":" +
    (isMe ? "1" : "0")
  );
}

// Hududning ustidagi yozuv o'zgardimi (user, masofa, rasm, toj)
function zoneLabelStamp(territory, player) {
  return (
    String(player.name) +
    "|" +
    String(Math.round(zoneDistance(territory))) +
    "|" +
    String(Math.round(Number(territory.area) || 0)) +
    "|" +
    String(player.avatarAt || 0) +
    "|" +
    (avatarOf(player) ? "1" : "0") +
    "|" +
    (isKing(player) ? "k" : "-")
  );
}

// Hudud uchun yurilgan masofa. Eski hududlarda saqlanmagan
// bo'lsa — halqaning o'z uzunligi olinadi.
function zoneDistance(territory) {
  const saved = Number(territory.distance);

  if (Number.isFinite(saved) && saved > 0) return saved;

  return Array.isArray(territory.points) && territory.points.length > 2
    ? perimeter(territory.points)
    : 0;
}

// 940 m / 1.54 km
function distanceText(meters) {
  const value = Number(meters) || 0;

  if (value <= 0) return "0 m";

  if (value < 1000) return Math.round(value) + " m";

  return (value / 1000).toFixed(2) + " km";
}

// ------------------------------------------------------------
// Hudud ustida turadigan yozuv:
//
//    [rasm] @username
//           1.54 km
//
// Yuqorida — egasining useri, pastda — o'sha hududni yopish
// uchun yurilgan masofa (yurish yakunlanganda saqlanadi).
// ------------------------------------------------------------

function zoneLabelHtml(territory, player) {
  const color = player.color || colorFromId(player.id);

  const src = avatarOf(player);

  const badge = src
    ? '<i class="zone-av" style="background-image:url(&quot;' +
      esc(src) +
      '&quot;)"></i>'
    : '<i class="zone-av letter" style="background:' +
      esc(color) +
      '">' +
      esc(initials(player)) +
      "</i>";

  return (
    '<span class="zone-label">' +
    '<b class="zone-name">' +
    badge +
    nameHtml(player) +
    crownHtml(player) +
    "</b>" +
    '<i class="zone-dist">' +
    esc(distanceText(zoneDistance(territory))) +
    "</i>" +
    "</span>"
  );
}

function drawZone(key, territory, player, isMe) {
  const color = player.color || colorFromId(player.id);

  const polygon = L.polygon(territory.points, {
    color,
    fillColor: color,
    fillOpacity: isMe ? 0.32 : 0.2,
    weight: isMe ? 3 : 2
  }).addTo(state.map);

  // Hududning ustida egasining useri va yurgan masofasi turadi
  polygon.bindTooltip(zoneLabelHtml(territory, player), {
    permanent: true,
    direction: "center",
    className: "owner-label"
  });

  // Hudud bosilsa — egasining profili ochiladi
  polygon.on("click", (event) => {
    if (event.originalEvent) L.DomEvent.stopPropagation(event);

    openProfile(player.id);
  });

  state.zoneLayers.set(key, {
    layer: polygon,
    player,
    territory,
    isMe,
    stamp: zoneStamp(territory, player, isMe),
    labelStamp: zoneLabelStamp(territory, player)
  });
}

function renderZones(list) {
  const alive = new Set();

  list.forEach((entry) => {
    const player = entry.player;
    const isMe = String(player.id) === String(state.id);

    entry.territories.forEach((territory) => {
      if (!Array.isArray(territory.points) || territory.points.length < 3) {
        return;
      }

      const key = String(player.id) + "|" + String(territory.id || "");

      alive.add(key);

      const existing = state.zoneLayers.get(key);
      const stamp = zoneStamp(territory, player, isMe);

      if (existing) {
        // Faqat rang / egasi o'zgargan bo'lsa qayta chizamiz
        if (existing.stamp === stamp) {
          // Shakl o'sha — faqat ustidagi yozuvni yangilaymiz
          existing.player = player;
          existing.territory = territory;

          updateZoneLabel(existing);

          return;
        }

        existing.layer.remove();
        state.zoneLayers.delete(key);
      }

      drawZone(key, territory, player, isMe);
    });
  });

  // Bosib olingan (endi yo'q) hududlarni olib tashlaymiz
  state.zoneLayers.forEach((value, key) => {
    if (alive.has(key)) return;

    try {
      value.layer.remove();
    } catch {
      /* allaqachon olib tashlangan */
    }

    state.zoneLayers.delete(key);
  });
}

// Hudud ustidagi yozuvni (user + masofa) joyida yangilaydi
function updateZoneLabel(entry) {
  if (!entry || !entry.player || !entry.territory) return;

  const labelStamp = zoneLabelStamp(entry.territory, entry.player);

  if (entry.labelStamp === labelStamp) return;

  entry.labelStamp = labelStamp;

  try {
    entry.layer.setTooltipContent(
      zoneLabelHtml(entry.territory, entry.player)
    );
  } catch {
    /* hudud olib tashlangan */
  }
}

// Rasm yoki toj kelgach hududlar ustidagi yozuvlar yangilanadi
function refreshZoneLabels() {
  state.zoneLayers.forEach((entry) => updateZoneLabel(entry));
}

// Odamlar markeri joyida siljitiladi, qayta yaratilmaydi
// Marker qachon qayta chizilishi kerakligini bildiruvchi belgi
function markerStamp(player) {
  return (
    String(player.name) +
    "|" +
    String(player.color || "") +
    "|" +
    String(player.avatarAt || 0) +
    "|" +
    (avatarOf(player) ? "1" : "0") +
    "|" +
    (isKing(player) ? "k" : "-")
  );
}

// Rasm yoki toj o'zgarganda markerlarni yangilaymiz
function refreshMarkerIcons() {
  state.markers.forEach((value, id) => {
    const player = state.playerMap.get(String(id));

    if (!player) return;

    const stamp = markerStamp(player);

    if (value.stamp === stamp) return;

    try {
      value.marker.setIcon(playerIcon(player));
      value.stamp = stamp;
    } catch {
      /* marker olib tashlangan */
    }
  });
}

function renderMarkers() {
  const now = Date.now();

  const alive = new Set();

  state.players.forEach((player) => {
    if (String(player.id) === String(state.id)) return;
    if (!player.location) return;

    const seen = Number(player.location.time || 0);

    if (!seen || now - seen > CONFIG.ONLINE_MS) return;

    const id = String(player.id);

    alive.add(id);

    const position = [
      Number(player.location.lat),
      Number(player.location.lng)
    ];

    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) {
      alive.delete(id);
      return;
    }

    const existing = state.markers.get(id);

    const stamp = markerStamp(player);

    if (existing) {
      existing.marker.setLatLng(position);

      // Ism, rang, rasm yoki toj o'zgargandagina qayta chizamiz
      if (existing.stamp !== stamp) {
        existing.marker.setIcon(playerIcon(player));
        existing.stamp = stamp;
      }

      return;
    }

    const marker = playerMarker(player);

    if (marker) {
      state.markers.set(id, { marker, stamp });
    }
  });

  // Faqat haqiqatan chiqib ketganlarni olib tashlaymiz
  state.markers.forEach((value, id) => {
    if (alive.has(id)) return;

    try {
      value.marker.remove();
    } catch {
      /* allaqachon olib tashlangan */
    }

    state.markers.delete(id);
  });
}

// ------------------------------------------------------------
// Serverdan kelgan ro'yxatni eskisi bilan qo'shib yuboramiz.
//
// Bitta so'rov kechikib, odamning joylashuvi eski bo'lib
// kelsa ham, u xaritadan YO'QOLMAYDI.
// ------------------------------------------------------------

function mergePlayers(incoming) {
  // Eskilarni SAQLAB qolamiz: bitta so'rov to'liq kelmasa ham
  // odamlar va hududlar xaritadan yo'qolmaydi.
  const next = new Map(state.playerMap);

  incoming.forEach((player) => {
    if (!player || player.id == null) return;

    const id = String(player.id);

    const old = state.playerMap.get(id);

    const merged = Object.assign({}, player);

    merged.color = player.color || colorFromId(id);

    const oldTime =
      old && old.location ? Number(old.location.time || 0) : 0;

    const newTime = player.location ? Number(player.location.time || 0) : 0;

    if (oldTime > newTime) {
      merged.location = old.location;
    }

    next.set(id, merged);
  });

  state.playerMap = next;

  return Array.from(next.values());
}

// Mening hududlarim: server + hali tasdiqlanmagan lokal
function myTerritories(me) {
  const server = me && Array.isArray(me.territories) ? me.territories : [];

  const ids = new Set(server.map((t) => String(t.id)));

  const before = state.pending.length;

  // Server tasdiqladi — lokal nusxa endi kerak emas
  state.pending = state.pending.filter((t) => !ids.has(String(t.id)));

  if (state.pending.length !== before) savePending();

  return server.concat(state.pending);
}

// Serverdan kelgan javobni qo'llaymiz.
//
// Kechikib kelgan ESKI javob yangisining ustiga yozilmasin —
// aks holda bosib olingan hudud qaytib paydo bo'ladi.
function applyWorld(data) {
  if (!data || !Array.isArray(data.players)) return;

  const stamp = Number(data.time || 0);

  if (stamp && state.worldTime && stamp < state.worldTime) return;

  if (stamp) state.worldTime = stamp;

  renderWorld(data.players);
}

function renderWorld(players) {
  if (!state.map) initMap();

  state.players = mergePlayers(Array.isArray(players) ? players : []);

  let me = state.players.find((p) => String(p.id) === String(state.id));

  // Server hali meni ko'rmagan bo'lsa ham o'zimni ro'yxatga qo'shamiz
  if (!me && state.name) {
    me = {
      id: state.id,
      name: state.name,
      color: state.color || colorFromId(state.id),
      territories: [],
      area: 0,
      location: null
    };

    state.players.push(me);
  }

  const mine = myTerritories(me);

  const list = state.players.map((player) => ({
    player,

    territories:
      String(player.id) === String(state.id)
        ? mine
        : player.territories || []
  }));

  // Reyting va "mening hududim" uchun maydonni shu ro'yxatdan olamiz
  list.forEach((entry) => {
    entry.area = entry.territories.reduce(
      (sum, t) => sum + (Number(t.area) || 0),
      0
    );

    entry.player.area = entry.area;
  });

  // Toj kimda — shu yerda aniqlanadi
  updateKing();

  renderZones(list);
  renderMarkers();

  updateMyCard(me, mine);
  renderBoard();
  renderLive();
  refreshProfile();
  renderSearch();
  renderFriends();
}

function updateMyCard(me, mine) {
  const territories = mine || [];

  const area = territories.reduce((sum, t) => sum + (Number(t.area) || 0), 0);

  const rounded = Math.round(
    area || (me ? Number(me.area || 0) : Number(loadStored("zonexArea")) || 0)
  );

  if ($("#totalArea")) {
    $("#totalArea").textContent = rounded.toLocaleString();
  }

  if (String(rounded) !== loadStored("zonexArea")) {
    saveStored("zonexArea", String(rounded));
  }

  // Yurish paytida bu joyda hozirgi aylana ko'rsatiladi
  if ($("#areaStatus") && !state.active) {
    $("#areaStatus").textContent = territories.length
      ? territories.length + " ta hudud sizniki"
      : "Birinchi hududingizni egallang";
  }

  if (me && me.color) applyColor(me.color);

  setAvatar();

  if ($("#levelBadge")) {
    $("#levelBadge").textContent = String(
      Math.max(1, Math.floor(rounded / 5000) + 1)
    );
  }
}

// ============================================================
// SERVER
// ============================================================

async function api(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    /* javob JSON emas */
  }

  return { ok: response.ok, status: response.status, data };
}

async function fetchWorld() {
  try {
    // ?id= — o'zimga kelgan do'stlik so'rovlari ham qaytadi
    const { ok, data } = await api(
      "/api/world?t=" + Date.now() + "&id=" + encodeURIComponent(state.id)
    );

    if (ok) applyWorld(data);
  } catch {
    // Internet uzildi — xaritadagi hech narsa o'chirilmaydi
  }

  flushPending();
}

function startPolling() {
  fetchWorld();

  clearInterval(state.worldTimer);

  state.worldTimer = setInterval(fetchWorld, CONFIG.POLL_MS);

  // O'qilmagan xabar nishoni — panel yopiq bo'lsa ham yangilanadi
  loadChatList();

  clearInterval(state.chatListTimer);

  state.chatListTimer = setInterval(loadChatList, 25000);
}

async function sendLocation(point, accuracy) {
  if (!state.name) return;

  if (Date.now() - state.lastSent < CONFIG.SEND_MS) return;

  state.lastSent = Date.now();

  try {
    const { ok, data } = await api("/api/location", {
      id: state.id,
      name: state.name,
      lat: point[0],
      lng: point[1],
      accuracy
    });

    if (ok) applyWorld(data);
  } catch {
    /* keyingi urinishda ketadi */
  }
}

// ============================================================
// GPS
// ============================================================

function showSpeed(kmh) {
  if ($("#speed")) {
    $("#speed").innerHTML = kmh.toFixed(1) + " <small>km/soat</small>";
  }
}

function speedWarning(show, kmh) {
  const box = $("#speedWarn");

  if (!box) return;

  if (show) {
    box.textContent =
      "Juda tez (" +
      kmh.toFixed(0) +
      " km/soat) — hudud yozilmayapti. Chegara " +
      CONFIG.MAX_SPEED_KMH +
      " km/soat.";

    box.classList.add("show");
  } else {
    box.classList.remove("show");
  }
}

function onPosition(pos) {
  const point = [Number(pos.coords.latitude), Number(pos.coords.longitude)];
  const accuracy = Number(pos.coords.accuracy) || 999;
  const stamp = Number(pos.timestamp) || Date.now();

  if (!state.map) initMap(point);

  // ---- o'z markerimiz ----
  if (!state.marker) {
    state.marker = L.circleMarker(point, {
      radius: 9,
      color: "#ffffff",
      weight: 4,
      fillColor: state.color || colorFromId(state.id),
      fillOpacity: 1
    }).addTo(state.map);

    state.accuracyRing = L.circle(point, {
      radius: accuracy,
      color: state.color || colorFromId(state.id),
      weight: 1,
      fillOpacity: 0.06
    }).addTo(state.map);

    state.map.setView(point, 17);
  } else {
    state.marker.setLatLng(point);

    if (state.accuracyRing) {
      state.accuracyRing.setLatLng(point).setRadius(accuracy);
    }
  }

  // ---- tezlik ----
  let kmh = 0;

  if (state.lastFix) {
    const seconds = (stamp - state.lastFix.time) / 1000;
    const meters = hav(state.lastFix.point, point);

    if (seconds > 0.5) {
      kmh = (meters / seconds) * 3.6;
    }
  }

  // GPS sakrashi bo'lmasin
  if (kmh > 200) kmh = state.speed;

  // Silliqlash
  state.speed = state.lastFix ? state.speed * 0.4 + kmh * 0.6 : kmh;

  state.lastFix = { point, time: stamp, accuracy };

  showSpeed(state.speed);

  sendLocation(point, accuracy);

  if (state.active) {
    walkPoint(point, accuracy);
  }
}

function geoError(error) {
  if (!state.map) initMap();

  if (error && error.code === 1) {
    toast("Joylashuvga ruxsat berilmadi");

    $("#locationModal")?.classList.add("active");
  } else {
    toast("Joylashuv aniqlanmadi — GPS'ni tekshiring");
  }
}

function startWatching() {
  if (!navigator.geolocation) {
    toast("Bu brauzerda joylashuv ishlamaydi");
    return;
  }

  if (state.watchId !== null) return;

  state.watchId = navigator.geolocation.watchPosition(onPosition, geoError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 20000
  });
}

function requestLocation() {
  if (!navigator.geolocation) {
    toast("Bu brauzerda joylashuv ishlamaydi");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $("#locationModal")?.classList.remove("active");

      onPosition(pos);
      startWatching();

      toast("Joylashuv aniqlandi ✓");
    },

    geoError,

    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

// Ruxsat allaqachon berilgan bo'lsa — hech narsa so'ramaymiz
async function ensureLocation() {
  if (!navigator.geolocation) return;

  try {
    if (navigator.permissions && navigator.permissions.query) {
      const status = await navigator.permissions.query({
        name: "geolocation"
      });

      if (status.state === "granted") {
        startWatching();
        return;
      }
    }
  } catch {
    /* permissions API yo'q */
  }

  $("#locationModal")?.classList.add("active");
}

// ============================================================
// YURISH
// ============================================================

function walkPoint(point, accuracy) {
  // Aniqligi yomon nuqta hududni buzadi
  if (accuracy > CONFIG.MAX_ACCURACY) return;

  // ---- TEZLIK CHEKLOVI ----
  if (state.speed > CONFIG.MAX_SPEED_KMH) {
    state.maxSpeed = Math.max(state.maxSpeed, state.speed);
    state.tooFast = true;

    speedWarning(true, state.speed);

    return; // transportda — nuqta yozilmaydi
  }

  // ---- Tezlikdan qaytdi ----
  if (state.tooFast) {
    state.tooFast = false;

    speedWarning(false, 0);

    const last = state.points.at(-1);

    if (last && hav(last, point) > CONFIG.RESET_JUMP) {
      // Transportda uzoqqa ketib qolgan — yurish qaytadan
      resetTrack();

      toast("Tez harakat aniqlandi — hudud qaytadan boshlandi");
    }
  }

  const previous = state.points.at(-1);

  if (previous && hav(previous, point) < CONFIG.MIN_STEP) return;

  if (previous) {
    const step = hav(previous, point);

    state.distance += step;
    state.loopDistance += step;
  }

  state.points.push(point);

  // ---- A nuqta B nuqta bilan kesishdimi? ----
  //
  // Kesishgan bo'lsa — o'sha halqa odamning yeri bo'ladi,
  // lekin YURISH TO'XTAMAYDI. Yurishni faqat odam o'zi
  // tugatadi.
  checkLoop(point);

  drawTrack();
  updateStats();
}

// ------------------------------------------------------------
// KESISHISH TEKSHIRUVI
// ------------------------------------------------------------

function checkLoop(point) {
  let found = findLoop(state.points);

  // Kesishmagan bo'lsa — boshlang'ich nuqtaga qaytish ham
  // halqa deb hisoblanadi (GPS aniq kesishmasligi mumkin)
  if (
    !found &&
    state.points.length > 8 &&
    hav(state.points[0], point) < CONFIG.CLOSE_RADIUS
  ) {
    found = {
      ring: state.points.slice(),
      index: 0,
      cross: state.points[0]
    };
  }

  if (!found) return;

  const ring = found.ring;

  const area = Math.round(polygonArea(ring));

  // Juda kichkina halqa (GPS titrashi) — kesib tashlaymiz,
  // yurish davom etadi
  if (area < 50 || ring.length < 4) {
    state.points = state.points
      .slice(0, found.index + 1)
      .concat([found.cross, point]);

    return;
  }

  const duration = Math.max(
    1,
    Math.round((Date.now() - (state.loopStarted || state.started)) / 1000)
  );

  const walked = Math.round(state.loopDistance || perimeter(ring));

  // Yangi halqa kesishgan nuqtadan boshlanadi
  state.points = [found.cross, point];

  state.loopStarted = Date.now();
  state.loopDistance = hav(found.cross, point);
  state.loops += 1;

  claimArea(ring, walked, duration);
}

function perimeter(ring) {
  let total = 0;

  for (let i = 1; i < ring.length; i++) {
    total += hav(ring[i - 1], ring[i]);
  }

  return total + hav(ring[ring.length - 1], ring[0]);
}

function drawTrack() {
  const color = state.color || colorFromId(state.id);

  if (!state.line) {
    state.line = L.polyline(state.points, {
      color,
      weight: 5,
      opacity: 0.95,
      lineJoin: "round"
    }).addTo(state.map);
  } else {
    state.line.setLatLngs(state.points);
  }

  if (state.preview) state.preview.remove();

  if (state.points.length > 2) {
    state.preview = L.polygon(state.points, {
      color,
      weight: 1,
      dashArray: "5 7",
      fillColor: color,
      fillOpacity: 0.12
    }).addTo(state.map);
  }
}

function resetTrack() {
  state.points = [];
  state.distance = 0;
  state.started = Date.now();

  state.loopStarted = Date.now();
  state.loopDistance = 0;

  if (state.line) state.line.remove();
  if (state.preview) state.preview.remove();

  state.line = null;
  state.preview = null;
}

function clearTrack() {
  if (state.line) {
    state.line.remove();
    state.line = null;
  }

  if (state.preview) {
    state.preview.remove();
    state.preview = null;
  }

  state.points = [];
  state.distance = 0;
  state.loopDistance = 0;
}

function updateStats() {
  if ($("#distance")) {
    $("#distance").innerHTML =
      (state.distance / 1000).toFixed(2) + " <small>km</small>";
  }

  const seconds = state.active
    ? Math.floor((Date.now() - state.started) / 1000)
    : 0;

  if ($("#timer")) {
    $("#timer").textContent =
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");
  }

  // Yopilishga yaqin bo'lsa — taxminiy maydon
  if (state.active && state.points.length > 2 && $("#areaStatus")) {
    const area = Math.round(polygonArea(state.points));

    $("#areaStatus").textContent =
      (state.loops ? state.loops + " ta hudud yopildi · " : "") +
      "hozirgi aylana ~" +
      area.toLocaleString() +
      " m²";
  }
}

function startWalk() {
  if (!state.name) {
    $("#welcomeModal")?.classList.add("active");
    return;
  }

  if (state.watchId === null) {
    requestLocation();
  }

  state.active = true;
  state.maxSpeed = 0;
  state.tooFast = false;
  state.loops = 0;

  resetTrack();

  $("#startBtn")?.classList.add("running");

  if ($("#startText")) $("#startText").textContent = "YURISHNI YAKUNLASH";

  if ($("#hint")) {
    $("#hint").textContent =
      "Yo'lingizni kesib o'ting — o'sha joy sizniki bo'ladi";
  }

  clearInterval(state.timer);
  state.timer = setInterval(updateStats, 1000);

  toast("Yurish boshlandi — yo'lingizni kesib halqa yasang!");
}

// ------------------------------------------------------------
// Yopilgan hudud DARHOL xaritaga yoziladi va lokal saqlanadi.
// Server javobi kechiksa yoki internet uzilsa ham u yerdan
// yo'qolmaydi — keyin o'zi qayta yuboriladi.
// ------------------------------------------------------------

function localTerritoryId() {
  return "local-" + Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2, 7);
}

function addPending(entry) {
  state.pending.push(entry);
  savePending();
}

async function pushTerritory(entry) {
  const { ok, status, data } = await api("/api/territory", {
    id: state.id,
    name: state.name,
    points: entry.points,
    duration: entry.duration,
    distance: entry.distance,
    maxSpeed: entry.maxSpeed
  });

  if (ok) {
    // Server o'z ID'sini berdi — lokal nusxa endi shu ID bilan yuradi
    if (data.territory) {
      entry.id = data.territory.id;
      entry.area = Number(data.territory.area) || entry.area;
    }

    entry.sent = true;

    savePending();

    return { ok: true, data };
  }

  // Server rad etdi (qoidaga to'g'ri kelmadi) — lokal nusxa o'chiriladi
  if (status >= 400 && status < 500) {
    state.pending = state.pending.filter((t) => t !== entry);
    savePending();

    return { ok: false, data, rejected: true };
  }

  return { ok: false, data, rejected: false };
}

// Yuborilmay qolgan hududlarni jimgina qayta yuboradi
async function flushPending() {
  if (state.sending || !state.name) return;

  const waiting = state.pending.filter(
    (t) => !t.sent && Number(t.tries || 0) < 12
  );

  if (!waiting.length) return;

  state.sending = true;

  for (const entry of waiting) {
    entry.tries = Number(entry.tries || 0) + 1;

    try {
      const result = await pushTerritory(entry);

      if (result.ok) applyWorld(result.data);
    } catch {
      /* internet yo'q — keyingi safar */
    }
  }

  savePending();

  state.sending = false;
}

// ------------------------------------------------------------
// HALQANI EGALLASH
// ------------------------------------------------------------
//
// Yopilgan halqa DARHOL odamning yeri bo'ladi: xaritada
// ko'rinadi, lokal saqlanadi va serverga yuboriladi. Internet
// uzilsa ham yo'qolmaydi — keyin o'zi qayta ketadi.
// ------------------------------------------------------------

async function claimArea(ring, walked, duration) {
  const area = Math.round(polygonArea(ring));

  const avgSpeed = duration > 0 ? (walked / duration) * 3.6 : 0;

  if (avgSpeed > CONFIG.MAX_AVG_SPEED_KMH) {
    toast(
      "O'rtacha tezlik " +
        avgSpeed.toFixed(1) +
        " km/soat — chegara " +
        CONFIG.MAX_AVG_SPEED_KMH +
        " km/soat"
    );

    return;
  }

  const entry = {
    id: localTerritoryId(),
    points: ring.slice(),
    area,
    duration,
    distance: Math.round(walked),
    maxSpeed: Math.round(state.maxSpeed * 10) / 10,
    createdAt: Date.now(),
    sent: false,
    tries: 1
  };

  addPending(entry);

  // Xaritada darhol ko'rinsin (server javobini kutmasdan)
  renderWorld(state.players);

  let result;

  try {
    result = await pushTerritory(entry);
  } catch {
    toast("Internet yo'q — hudud saqlanib turibdi, o'zi yuboriladi");
    return;
  }

  if (!result.ok) {
    if (result.rejected) {
      toast(result.data.message || "Hudud saqlanmadi");
      renderWorld(state.players);
    } else {
      toast("Server javob bermadi — hudud keyinroq yuboriladi");
    }

    return;
  }

  const data = result.data;

  applyWorld(data);

  const saved = data.territory ? Number(data.territory.area || 0) : area;

  const km = (walked / 1000).toFixed(2);

  if (data.captured && data.captured.length) {
    const names = data.captured.map((c) => "@" + c.ownerName).join(", ");

    toast(
      "+" +
        saved.toLocaleString() +
        " m² (" +
        km +
        " km) · " +
        names +
        " hududi bosib olindi!"
    );
  } else {
    toast("+" + saved.toLocaleString() + " m² · " + km + " km — sizniki!");
  }
}

// ------------------------------------------------------------
// YURISHNI TUGATISH — faqat odam o'zi bosganda
// ------------------------------------------------------------

async function finishWalk() {
  if (!state.active) return;

  state.active = false;

  clearInterval(state.timer);

  speedWarning(false, 0);

  $("#startBtn")?.classList.remove("running");

  if ($("#startText")) $("#startText").textContent = "YURISHNI BOSHLASH";

  if ($("#hint")) {
    $("#hint").textContent =
      "Yo'lingizni kesib o'ting — o'sha joy sizniki bo'ladi";
  }

  const ring = state.points.slice();

  const duration = Math.max(
    1,
    Math.round((Date.now() - (state.loopStarted || state.started)) / 1000)
  );

  const walked = state.loopDistance;

  const loops = state.loops;

  clearTrack();

  // Oxirgi yo'l ham yopiq bo'lsa — u ham hudud bo'ladi
  const gap = ring.length > 3 ? hav(ring[0], ring[ring.length - 1]) : Infinity;

  if (ring.length >= 4 && gap <= 40 && polygonArea(ring) >= 50) {
    await claimArea(ring, walked || perimeter(ring), duration);
  } else if (!loops) {
    toast("Hudud yopilmadi — yo'lingizni kesib o'ting yoki boshiga qayting");
  } else {
    toast(loops + " ta hudud egallandi. Yurish tugadi.");
  }

  fetchWorld();
}

// ============================================================
// REYTING — eng katta maydon birinchi
// ============================================================

const MEDALS = ["🥇", "🥈", "🥉"];

function renderBoard() {
  if (!$("#leaderRows")) return;

  // Ro'yxatdan o'tgan HAR BIR odam reytingda bo'ladi —
  // hali hudud egallamagan bo'lsa ham.
  const rows = state.players
    .filter((p) => p && p.name)
    .sort((a, b) => {
      const diff = Number(b.area || 0) - Number(a.area || 0);

      if (diff) return diff;

      // Maydonlari teng — avval ro'yxatdan o'tgani yuqorida
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    });

  if (!rows.length) {
    $("#leaderRows").innerHTML =
      '<div class="live-empty">Hozircha hech kim yo\'q</div>';

    return;
  }

  $("#leaderRows").innerHTML = rows
    .map((player, index) => {
      const isMe = String(player.id) === String(state.id);

      const rankClass = index < 3 ? " rank-" + (index + 1) : "";

      const badge = index < 3 ? MEDALS[index] : String(index + 1);

      return (
        '<button class="leader-row' +
        (isMe ? " me" : "") +
        rankClass +
        '" type="button" data-player-id="' +
        esc(player.id) +
        '">' +
        '<b class="rank">' +
        badge +
        "</b>" +
        avatarHtml(player, "sm") +
        "<span>" +
        crownHtml(player) +
        nameHtml(player, isMe ? " (Siz)" : "") +
        "</span>" +
        "<strong>" +
        Math.round(Number(player.area || 0)).toLocaleString() +
        " m²</strong>" +
        "</button>"
      );
    })
    .join("");
}

// ============================================================
// PROFIL RASMI
// ============================================================
//
// Rasm katta bo'lgani uchun /api/world unga tegmaydi: u yerda
// faqat `avatarAt` (versiya) yuradi. Rasmning o'zi shu yerdan
// bir marta olinadi va keshda saqlanadi.
// ============================================================

function avatarOf(player) {
  if (!player || !player.id) return "";

  const id = String(player.id);

  const version = Number(player.avatarAt || 0);

  const cached = state.avatars.get(id);

  if (cached && cached.v === version) return cached.src;

  // Rasm yo'q — keshni tozalaymiz
  if (!version || player.hasAvatar === false) {
    if (cached) state.avatars.delete(id);

    return "";
  }

  loadAvatar(id, version);

  return cached ? cached.src : "";
}

async function loadAvatar(id, version) {
  const mark = id + ":" + version;

  if (state.avatarLoading.has(mark)) return;

  state.avatarLoading.add(mark);

  try {
    const { ok, data } = await api(
      "/api/avatar?id=" + encodeURIComponent(id) + "&v=" + version
    );

    if (ok && data.avatar) {
      state.avatars.set(id, { v: Number(data.avatarAt) || version, src: data.avatar });

      // Rasm kelgach ro'yxatlar qayta chizilsin
      renderBoard();
      renderLive();
      refreshProfile();
      refreshMarkerIcons();
      refreshZoneLabels();
    }
  } catch {
    /* keyingi safar */
  }

  state.avatarLoading.delete(mark);
}

function initials(player) {
  const name = String((player && player.name) || "Z");

  return name[0].toUpperCase();
}

// Dumaloq rasm yoki harf
function avatarHtml(player, extraClass) {
  const src = avatarOf(player);

  const cls = "zx-av" + (extraClass ? " " + extraClass : "");

  if (src) {
    return (
      '<span class="' +
      cls +
      '" style="background-image:url(&quot;' +
      esc(src) +
      '&quot;)"></span>'
    );
  }

  return (
    '<span class="' +
    cls +
    ' letter" style="background:' +
    esc((player && player.color) || colorFromId(player && player.id)) +
    '">' +
    esc(initials(player)) +
    "</span>"
  );
}

// ============================================================
// TOJ — eng katta hududga ega odam
// ============================================================

function isKing(player) {
  return Boolean(
    player && state.kingId && String(player.id) === String(state.kingId)
  );
}

function crownHtml(player) {
  return isKing(player) ? '<b class="crown" title="Eng katta hudud">👑</b>' : "";
}

function updateKing() {
  let best = null;

  state.players.forEach((player) => {
    if (!player || !player.name) return;

    if (Number(player.area || 0) <= 0) return;

    if (!best || Number(player.area || 0) > Number(best.area || 0)) {
      best = player;
    }
  });

  const next = best ? String(best.id) : "";

  if (next === state.kingId) return false;

  state.kingId = next;

  return true;
}

// ============================================================
// 18+ RASM TEKSHIRUVI
// ============================================================
//
// MUHIM: bu tekshiruv BRAUZERDA ishlaydi va 100% aniq emas.
//
//   1) Asosiy usul — nsfwjs modeli (internetdan bir marta
//      yuklanadi). Ishonch yuqori bo'lsa: rasm qo'yilmaydi va
//      odamga 3 kunlik ban yoziladi.
//
//   2) Model yuklanmasa — teri rangi ulushi bo'yicha juda
//      ehtiyotkor zaxira tekshiruv ishlaydi. Bunda ban
//      berilmaydi, faqat rasm qabul qilinmaydi (selfi'ni
//      xato banlab qo'ymaslik uchun).
//
// Admin har doim bandan chiqarib yuborishi mumkin.
// ============================================================

const NSFW = {
  // Model javobiga ishonch chegaralari
  PORN: 0.6,
  HENTAI: 0.6,
  SEXY: 0.85,

  // Zaxira usul: teri rangi ulushi
  SKIN: 0.8
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");

    tag.src = src;
    tag.async = true;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error("yuklanmadi: " + src));

    document.head.appendChild(tag);
  });
}

async function nsfwModel() {
  if (state.nsfwModel) return state.nsfwModel;

  if (state.nsfwLoading) return state.nsfwLoading;

  state.nsfwLoading = (async () => {
    if (!window.tf) {
      await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
    }

    if (!window.nsfwjs) {
      await loadScript("https://cdn.jsdelivr.net/npm/nsfwjs");
    }

    if (!window.nsfwjs || !window.nsfwjs.load) {
      throw new Error("nsfwjs yuklanmadi");
    }

    state.nsfwModel = await window.nsfwjs.load();

    return state.nsfwModel;
  })();

  try {
    return await state.nsfwLoading;
  } finally {
    state.nsfwLoading = null;
  }
}

// Zaxira usul: teri rangidagi piksellar ulushi
function skinRatio(canvas) {
  const ctx = canvas.getContext("2d");

  let pixels;

  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return 0;
  }

  let skin = 0;
  let total = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const alpha = pixels[i + 3];

    if (alpha < 128) continue;

    total++;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

    const looksSkin =
      r > 95 &&
      g > 40 &&
      b > 20 &&
      max - min > 15 &&
      Math.abs(r - g) > 15 &&
      r > g &&
      r > b &&
      cb >= 77 &&
      cb <= 127 &&
      cr >= 133 &&
      cr <= 173;

    if (looksSkin) skin++;
  }

  return total ? skin / total : 0;
}

// { nsfw, score, checked } — checked=false bo'lsa model yuklanmagan
async function checkImage(image, canvas) {
  try {
    const model = await nsfwModel();

    const list = await model.classify(image);

    const score = {};

    list.forEach((row) => {
      score[String(row.className).toLowerCase()] = Number(row.probability) || 0;
    });

    const porn = score.porn || 0;
    const hentai = score.hentai || 0;
    const sexy = score.sexy || 0;

    const nsfw =
      porn >= NSFW.PORN || hentai >= NSFW.HENTAI || sexy >= NSFW.SEXY;

    return {
      nsfw,
      checked: true,
      score: Math.round(Math.max(porn, hentai, sexy) * 100) / 100
    };
  } catch {
    // Model yuklanmadi — ehtiyotkor zaxira tekshiruv
    const ratio = skinRatio(canvas);

    return {
      nsfw: ratio >= NSFW.SKIN,
      checked: false,
      score: Math.round(ratio * 100) / 100
    };
  }
}

// ------------------------------------------------------------
// RASMNI TANLASH VA YUBORISH
// ------------------------------------------------------------

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Rasm ochilmadi"));
      image.src = String(reader.result);
    };

    reader.onerror = () => reject(new Error("Fayl o'qilmadi"));

    reader.readAsDataURL(file);
  });
}

// Kvadrat qilib kichraytiramiz — server va tarmoq uchun yengil
function squareCanvas(image, size) {
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  const side = Math.min(image.naturalWidth, image.naturalHeight);

  ctx.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );

  return canvas;
}

async function uploadAvatar(file) {
  if (!file || state.avatarBusy) return;

  if (!state.name) {
    toast("Avval username tanlang");
    return;
  }

  if (!/^image\//.test(file.type)) {
    toast("Faqat rasm fayli tanlang");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    toast("Rasm juda katta (8 MB dan kichik bo'lsin)");
    return;
  }

  state.avatarBusy = true;

  toast("Rasm tekshirilmoqda…");

  try {
    const image = await readImage(file);

    // Tekshiruv uchun kattaroq, saqlash uchun kichikroq nusxa
    const checkCanvas = squareCanvas(image, 224);
    const saveCanvas = squareCanvas(image, 256);

    const verdict = await checkImage(checkCanvas, checkCanvas);

    if (verdict.nsfw && !verdict.checked) {
      toast("Bu rasm qabul qilinmadi — boshqa rasm tanlang");
      state.avatarBusy = false;
      return;
    }

    const dataUrl = saveCanvas.toDataURL("image/jpeg", 0.78);

    const { ok, status, data } = await api("/api/avatar", {
      id: state.id,
      name: state.name,
      avatar: dataUrl,
      nsfw: verdict.nsfw,
      score: verdict.score
    });

    if (!ok) {
      if (status === 403 && data.error === "nsfw") {
        toast(data.message || "18+ rasm — ban yozildi");
      } else {
        toast(data.message || "Rasm saqlanmadi");
      }

      state.avatarBusy = false;

      fetchWorld();

      return;
    }

    // Darhol ko'rinsin
    state.avatars.set(String(state.id), {
      v: Number(data.avatarAt) || Date.now(),
      src: dataUrl
    });

    toast(
      verdict.checked
        ? "Profil rasmi qo'yildi ✓"
        : "Rasm qo'yildi (tekshiruv modeli yuklanmadi)"
    );

    fetchWorld();
    refreshProfile();
    refreshMarkerIcons();
  } catch (error) {
    toast((error && error.message) || "Rasm qo'yilmadi");
  }

  state.avatarBusy = false;
}

async function removeAvatar() {
  if (state.avatarBusy) return;

  state.avatarBusy = true;

  try {
    await api("/api/avatar", { id: state.id, avatar: "" });

    state.avatars.delete(String(state.id));

    toast("Profil rasmi olib tashlandi");

    fetchWorld();
    refreshProfile();
    refreshMarkerIcons();
  } catch {
    toast("Rasm olib tashlanmadi");
  }

  state.avatarBusy = false;
}

// ============================================================
// PROFIL — o'zingizniki ham, boshqa odamniki ham
// ============================================================
//
// Xaritadagi odam, uning hududi, reyting qatori yoki jonli
// ro'yxat bosilganda ochiladi.
//
// Ichida: qancha m² hududi bor va bitta kesishishda
// (bitta halqada) qancha km yurgani.
// ============================================================

function playerById(id) {
  return state.players.find((p) => String(p.id) === String(id)) || null;
}

// O'zimniki bo'lsa — hali serverga yetib bormaganlari ham qo'shiladi
function territoriesOf(player) {
  if (!player) return [];

  if (String(player.id) === String(state.id)) {
    return myTerritories(player);
  }

  return Array.isArray(player.territories) ? player.territories : [];
}

function loopRow(territory) {
  const area = Math.round(Number(territory.area) || 0);

  const meters = Number(territory.distance) || 0;

  const km = meters ? (meters / 1000).toFixed(2) + " km" : "— km";

  const minutes = Number(territory.duration)
    ? Math.round(Number(territory.duration) / 60) + " daq"
    : "";

  return (
    '<div class="loop-row">' +
    "<strong>" +
    area.toLocaleString() +
    " m²</strong>" +
    "<span>" +
    km +
    (minutes ? " · " + minutes : "") +
    "</span>" +
    "</div>"
  );
}

function openProfile(id) {
  const player = playerById(id);

  if (!player) return;

  state.profileId = String(player.id);

  const modal = $("#profileModal");

  if (!modal) return;

  // Jonli yangilanganda ro'yxat boshiga sakramasin
  const scroll = $("#profileBody") ? $("#profileBody").scrollTop : 0;

  const isMe = String(player.id) === String(state.id);

  const color = player.color || colorFromId(player.id);

  const zones = territoriesOf(player)
    .slice()
    .sort((a, b) => Number(b.area || 0) - Number(a.area || 0));

  const area = zones.reduce((sum, t) => sum + (Number(t.area) || 0), 0);

  const walked = zones.reduce((sum, t) => sum + (Number(t.distance) || 0), 0);

  const best = zones.length ? Number(zones[0].area) || 0 : 0;

  const now = Date.now();

  const online = Boolean(
    player.location && now - Number(player.location.time || 0) < CONFIG.ONLINE_MS
  );

  const rank =
    state.players
      .filter((p) => p && p.name)
      .sort((a, b) => Number(b.area || 0) - Number(a.area || 0))
      .findIndex((p) => String(p.id) === String(player.id)) + 1;

  $("#profileBody").innerHTML =
    '<div class="profile-top">' +
    '<div class="profile-face">' +
    (isKing(player) ? '<b class="crown big">👑</b>' : "") +
    avatarHtml(player, "lg") +
    (isMe
      ? '<button class="face-edit" id="avatarBtn" type="button" ' +
        'aria-label="Rasm qo\'yish">📷</button>'
      : "") +
    "</div>" +
    "<div class='profile-id'>" +
    "<strong>" +
    nameHtml(player, isMe ? " (Siz)" : "") +
    "</strong>" +
    '<small class="' +
    (online ? "on" : "off") +
    '">' +
    (online ? "hozir onlayn" : "oflayn") +
    (rank ? " · reytingda " + rank + "-o'rin" : "") +
    "</small>" +
    "</div>" +
    "</div>" +
    banHtml(player) +
    (isMe && avatarOf(player)
      ? '<button class="text-btn" id="avatarClear" type="button">' +
        "Rasmni olib tashlash</button>"
      : "") +
    '<div class="profile-hero">' +
    "<span>JAMI HUDUDI</span>" +
    "<strong>" +
    Math.round(area).toLocaleString() +
    " <i>m²</i></strong>" +
    "</div>" +
    '<div class="profile-stats">' +
    "<div><span>HUDUDLAR</span><strong>" +
    zones.length +
    "</strong></div>" +
    "<div><span>ENG KATTA</span><strong>" +
    Math.round(best).toLocaleString() +
    "</strong></div>" +
    "<div><span>JAMI YURGAN</span><strong>" +
    (walked / 1000).toFixed(2) +
    " km</strong></div>" +
    "</div>" +
    friendHtml(player) +
    adminHtml(player) +
    '<p class="profile-title">HAR BIR KESISHISH</p>' +
    (zones.length
      ? '<div class="loop-list">' + zones.map(loopRow).join("") + "</div>"
      : '<div class="live-empty">Hali hudud egallamagan</div>') +
    (zones.length
      ? '<button class="ghost-btn" id="profileBest">ENG KATTA HUDUDINI KO\'RISH</button>'
      : "") +
    (player.location
      ? '<button class="ghost-btn" id="profileLocate">XARITADA KO\'RSATISH</button>'
      : "");

  if (scroll) $("#profileBody").scrollTop = scroll;

  modal.classList.add("active");

  bindProfileButtons(player, zones);
}

// ------------------------------------------------------------
// PROFILDAGI QISMLAR
// ------------------------------------------------------------

function banDaysLeft(ban) {
  if (!ban || ban.forever) return 0;

  return Math.max(1, Math.ceil((Number(ban.until) - Date.now()) / 86400000));
}

function banHtml(player) {
  const ban = player.ban;

  if (!ban) return "";

  return (
    '<div class="ban-box">' +
    "<strong>⛔ BANLANGAN</strong>" +
    "<span>" +
    (ban.forever
      ? "Umrbod"
      : banDaysLeft(ban) + " kun qoldi (" + banDate(ban.until) + ")") +
    (ban.reason ? " · " + esc(ban.reason) : "") +
    "</span>" +
    "</div>"
  );
}

function banDate(stamp) {
  const date = new Date(Number(stamp) || 0);

  return (
    String(date.getDate()).padStart(2, "0") +
    "." +
    String(date.getMonth() + 1).padStart(2, "0") +
    "." +
    date.getFullYear()
  );
}

// Do'stlik holati: "me" | "friends" | "sent" | "incoming" | "none"
function friendState(player) {
  if (String(player.id) === String(state.id)) return "me";

  const me = playerById(state.id);

  const other = String(player.id);

  if (me && Array.isArray(me.friends) && me.friends.includes(other)) {
    return "friends";
  }

  if (me && Array.isArray(me.outgoing) && me.outgoing.includes(other)) {
    return "sent";
  }

  if (me && Array.isArray(me.incoming) && me.incoming.includes(other)) {
    return "incoming";
  }

  return "none";
}

function friendHtml(player) {
  const status = friendState(player);

  if (status === "me") return "";

  if (status === "friends") {
    return (
      '<div class="btn-row">' +
      '<button class="primary sm" id="chatBtn" type="button">XABAR YOZISH</button>' +
      '<button class="ghost-btn sm" id="unfriendBtn" type="button">DO\'STLIKDAN CHIQARISH</button>' +
      "</div>"
    );
  }

  if (status === "sent") {
    return (
      '<div class="btn-row">' +
      '<button class="ghost-btn sm" id="cancelFriendBtn" type="button">SO\'ROV YUBORILDI · BEKOR QILISH</button>' +
      "</div>"
    );
  }

  if (status === "incoming") {
    return (
      '<p class="profile-title">SIZGA DO\'STLIK SO\'ROVI YUBORDI</p>' +
      '<div class="btn-row">' +
      '<button class="primary sm" id="acceptFriendBtn" type="button">QABUL QILISH</button>' +
      '<button class="ghost-btn sm" id="declineFriendBtn" type="button">RAD ETISH</button>' +
      "</div>"
    );
  }

  return (
    '<div class="btn-row">' +
    '<button class="primary sm" id="addFriendBtn" type="button">DO\'STLIKKA QO\'SHISH</button>' +
    "</div>"
  );
}

// Admin panel — faqat admin ko'radi
function adminHtml(player) {
  const me = playerById(state.id);

  if (!isAdmin(me)) return "";

  if (String(player.id) === String(state.id)) return "";

  if (isAdmin(player)) return "";

  return (
    '<div class="admin-box">' +
    '<p class="admin-title"><b class="admin-tag">(admin)</b> BAN BERISH</p>' +
    '<div class="ban-row">' +
    '<button class="ban-btn" data-ban="3" type="button">3 kun</button>' +
    '<button class="ban-btn" data-ban="9" type="button">9 kun</button>' +
    '<button class="ban-btn" data-ban="15" type="button">15 kun</button>' +
    '<button class="ban-btn forever" data-ban="-1" type="button">Umrbod</button>' +
    "</div>" +
    (player.ban
      ? '<button class="ghost-btn sm full" data-ban="0" type="button">BANDAN CHIQARISH</button>'
      : "") +
    "</div>"
  );
}

// ------------------------------------------------------------
// PROFIL TUGMALARI
// ------------------------------------------------------------

function bindProfileButtons(player, zones) {
  const modal = $("#profileModal");

  $("#avatarBtn")?.addEventListener("click", () => $("#avatarInput")?.click());

  $("#avatarClear")?.addEventListener("click", removeAvatar);

  $("#profileLocate")?.addEventListener("click", () => {
    if (!player.location || !state.map) return;

    state.map.flyTo(
      [Number(player.location.lat), Number(player.location.lng)],
      17,
      { duration: 1 }
    );

    modal?.classList.remove("active");
  });

  $("#profileBest")?.addEventListener("click", () => {
    if (!zones.length) return;

    showTerritory(zones[0]);

    modal?.classList.remove("active");
  });

  // ---- do'stlik ----
  $("#addFriendBtn")?.addEventListener("click", () =>
    friendAction("request", player.id)
  );

  $("#cancelFriendBtn")?.addEventListener("click", () =>
    friendAction("cancel", player.id)
  );

  $("#acceptFriendBtn")?.addEventListener("click", () =>
    friendAction("accept", player.id)
  );

  $("#declineFriendBtn")?.addEventListener("click", () =>
    friendAction("decline", player.id)
  );

  $("#unfriendBtn")?.addEventListener("click", () =>
    friendAction("remove", player.id)
  );

  $("#chatBtn")?.addEventListener("click", () => openChat(player.id));

  // ---- admin ----
  $("#profileBody")
    ?.querySelectorAll("[data-ban]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        banPlayer(player, Number(button.dataset.ban))
      );
    });
}

// Hududni xaritada ko'rsatamiz
function showTerritory(territory) {
  if (!state.map || !territory || !Array.isArray(territory.points)) return;

  try {
    state.map.fitBounds(L.polygon(territory.points).getBounds(), {
      padding: [50, 50],
      maxZoom: 18
    });
  } catch {
    /* nuqtalar buzilgan */
  }
}

// ============================================================
// DO'STLIK
// ============================================================

async function friendAction(action, target) {
  if (!state.name) {
    toast("Avval username tanlang");
    return;
  }

  try {
    const { ok, data } = await api("/api/friends", {
      id: state.id,
      action,
      target: String(target)
    });

    if (!ok) {
      toast(data.message || "Amal bajarilmadi");
      return;
    }

    if (data.message) toast(data.message);

    applyWorld(data);

    refreshProfile();
  } catch {
    toast("Server bilan aloqa yo'q");
  }
}

// ============================================================
// ADMIN — BAN
// ============================================================

async function banPlayer(player, days) {
  const me = playerById(state.id);

  if (!isAdmin(me)) {
    toast("Bu amal faqat admin uchun");
    return;
  }

  const label =
    days === 0
      ? "bandan chiqarish"
      : days === -1
      ? "UMRBOD ban"
      : days + " kunlik ban";

  if (!window.confirm("@" + player.name + " — " + label + ". Davom etamizmi?")) {
    return;
  }

  try {
    const { ok, status, data } = await api("/api/moderate", {
      id: state.id,
      key: state.adminKey,
      target: String(player.id),
      days
    });

    // Server maxfiy so'z talab qilmoqda
    if (!ok && status === 403) {
      const key = window.prompt("Admin maxfiy so'zini kiriting (ADMIN_KEY):");

      if (!key) return;

      state.adminKey = key;

      saveStored("zonexAdminKey", key);

      return banPlayer(player, days);
    }

    if (!ok) {
      toast(data.message || "Ban berilmadi");
      return;
    }

    toast(data.message || "Bajarildi");

    applyWorld(data);

    refreshProfile();
  } catch {
    toast("Server bilan aloqa yo'q");
  }
}

// ============================================================
// XABARLAR (CHAT) — faqat do'stlar orasida
// ============================================================

function openChat(id) {
  const person = playerById(id);

  if (!person) return;

  if (friendState(person) !== "friends") {
    toast("Avval do'st bo'lishingiz kerak");
    return;
  }

  state.chatWith = String(id);
  state.chatMessages = [];

  $("#profileModal")?.classList.remove("active");

  const head = $("#chatHead");

  if (head) {
    head.innerHTML =
      avatarHtml(person, "sm") +
      "<span>" +
      crownHtml(person) +
      nameHtml(person) +
      "</span>";
  }

  $("#chatBox").innerHTML = '<div class="live-empty">Yuklanmoqda…</div>';

  $("#chatModal")?.classList.add("active");

  $("#chatInput")?.focus();

  loadChat();

  clearInterval(state.chatTimer);

  state.chatTimer = setInterval(loadChat, 3000);
}

function closeChat() {
  // Ro'yxatdagi "oxirgi xabar" yangilansin
  loadChatList();

  state.chatWith = "";

  clearInterval(state.chatTimer);

  state.chatTimer = null;

  $("#chatModal")?.classList.remove("active");
}

async function loadChat() {
  if (!state.chatWith) return;

  try {
    const { ok, data } = await api(
      "/api/messages?id=" +
        encodeURIComponent(state.id) +
        "&with=" +
        encodeURIComponent(state.chatWith)
    );

    if (!ok || !Array.isArray(data.messages)) return;

    const newest = data.messages[data.messages.length - 1];

    if (newest) markChatSeen(state.chatWith, newest.time);

    // Yangi xabar kelmagan bo'lsa — qayta chizmaymiz
    if (data.messages.length === state.chatMessages.length) return;

    state.chatMessages = data.messages;

    renderChat();
  } catch {
    /* internet yo'q */
  }
}

function renderChat() {
  const box = $("#chatBox");

  if (!box) return;

  if (!state.chatMessages.length) {
    box.innerHTML =
      '<div class="live-empty">Hali xabar yo\'q — birinchi bo\'lib yozing</div>';

    return;
  }

  box.innerHTML = state.chatMessages
    .map((message) => {
      const mine = String(message.from) === String(state.id);

      return (
        '<div class="msg' +
        (mine ? " mine" : "") +
        '">' +
        "<p>" +
        esc(message.text) +
        "</p>" +
        "<small>" +
        clockOf(message.time) +
        "</small>" +
        "</div>"
      );
    })
    .join("");

  box.scrollTop = box.scrollHeight;
}

function clockOf(stamp) {
  const date = new Date(Number(stamp) || 0);

  return (
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}

async function sendMessage() {
  const input = $("#chatInput");

  const text = String(input?.value || "").trim();

  if (!text || !state.chatWith) return;

  input.value = "";

  try {
    const { ok, data } = await api("/api/messages", {
      id: state.id,
      to: state.chatWith,
      text
    });

    if (!ok) {
      toast(data.message || "Xabar ketmadi");
      input.value = text;
      return;
    }

    state.chatMessages = Array.isArray(data.messages) ? data.messages : [];

    renderChat();
  } catch {
    toast("Internet yo'q — xabar ketmadi");
    input.value = text;
  }
}

// ============================================================
// QIDIRUV — username bo'yicha
// ============================================================
//
// Topilgan odamning qayerlarni bosib olgani ko'rinadi:
// eng katta hududi birinchi turadi.
// ============================================================

function searchResults(text) {
  const query = String(text || "").trim().toLowerCase().replace(/^@+/, "");

  if (!query) return [];

  return state.players
    .filter(
      (player) =>
        player &&
        player.name &&
        String(player.name).toLowerCase().includes(query)
    )
    .sort((a, b) => Number(b.area || 0) - Number(a.area || 0))
    .slice(0, 12);
}

function renderSearch() {
  const box = $("#searchResults");

  if (!box || !state.searchOpen) return;

  if (!state.searchText.trim()) {
    box.innerHTML =
      '<div class="live-empty">Username yozing — masalan, jasur</div>';

    return;
  }

  const found = searchResults(state.searchText);

  if (!found.length) {
    box.innerHTML = '<div class="live-empty">Bunday username topilmadi</div>';

    return;
  }

  box.innerHTML = found
    .map((player) => {
      const zones = territoriesOf(player)
        .slice()
        .sort((a, b) => Number(b.area || 0) - Number(a.area || 0));

      const rows = zones
        .slice(0, 5)
        .map((territory, index) => {
          const meters = Number(territory.distance) || 0;

          return (
            '<button class="found-zone' +
            (index === 0 ? " best" : "") +
            '" type="button" data-zone-owner="' +
            esc(player.id) +
            '" data-zone-id="' +
            esc(territory.id || "") +
            '">' +
            (index === 0 ? '<b class="best-tag">ENG KATTA</b>' : "") +
            "<strong>" +
            Math.round(Number(territory.area) || 0).toLocaleString() +
            " m²</strong>" +
            "<span>" +
            (meters ? (meters / 1000).toFixed(2) + " km" : "— km") +
            "</span>" +
            "</button>"
          );
        })
        .join("");

      return (
        '<div class="found">' +
        '<button class="found-head" type="button" data-player-id="' +
        esc(player.id) +
        '">' +
        avatarHtml(player, "md") +
        '<span class="found-info">' +
        "<strong>" +
        crownHtml(player) +
        nameHtml(player) +
        "</strong>" +
        "<small>" +
        Math.round(Number(player.area || 0)).toLocaleString() +
        " m² · " +
        zones.length +
        " ta hudud</small>" +
        "</span><b>›</b></button>" +
        (rows
          ? '<div class="found-zones">' + rows + "</div>"
          : '<div class="live-empty sm">Hali hudud egallamagan</div>') +
        "</div>"
      );
    })
    .join("");
}

function openSearch() {
  state.searchOpen = true;

  $("#searchPanel")?.classList.add("open");

  renderSearch();

  $("#searchInput")?.focus();
}

function closeSearch() {
  state.searchOpen = false;

  $("#searchPanel")?.classList.remove("open");
}

function closeProfile() {
  state.profileId = "";
  $("#profileModal")?.classList.remove("active");
}

// Profil ochiq turganda ma'lumot jonli yangilanib tursin
function refreshProfile() {
  if (!state.profileId) return;

  if (!$("#profileModal")?.classList.contains("active")) return;

  openProfile(state.profileId);
}

// ============================================================
// JONLI ODAMLAR
// ============================================================

function onlinePlayers() {
  const now = Date.now();

  return state.players
    .filter(
      (p) => p.location && now - Number(p.location.time || 0) < CONFIG.ONLINE_MS
    )
    .sort((a, b) => Number(b.area || 0) - Number(a.area || 0));
}

function renderLive() {
  const list = onlinePlayers();

  const pill = $("#liveBtn")?.querySelector("span");

  if (pill) {
    pill.textContent = list.length ? "JONLI · " + list.length : "JONLI";
  }

  const box = $("#livePlayers");

  if (!box || !state.liveOpen) return;

  if (!list.length) {
    box.innerHTML =
      '<div class="live-empty">Hozircha boshqa odamlar ko‘rinmadi</div>';

    return;
  }

  box.innerHTML = list
    .map((p) => {
      const isMe = String(p.id) === String(state.id);

      return (
        '<button class="live-player" type="button" data-player-id="' +
        esc(p.id) +
        '">' +
        avatarHtml(p, "md") +
        '<span class="live-player-info">' +
        "<strong>" +
        crownHtml(p) +
        nameHtml(p, isMe ? " (Siz)" : "") +
        "</strong>" +
        "<small>" +
        Math.round(Number(p.area || 0)).toLocaleString() +
        " m² · hozir onlayn</small>" +
        "</span><b>›</b></button>"
      );
    })
    .join("");
}

function bindLive() {
  $("#liveBtn")?.addEventListener("click", () => {
    state.liveOpen = !state.liveOpen;

    $("#livePanel")?.classList.toggle("open", state.liveOpen);

    renderLive();
  });

  $("#closeLive")?.addEventListener("click", () => {
    state.liveOpen = false;
    $("#livePanel")?.classList.remove("open");
  });

  $("#livePlayers")?.addEventListener("click", (event) => {
    const button = event.target.closest(".live-player");

    if (!button) return;

    state.liveOpen = false;
    $("#livePanel")?.classList.remove("open");

    openProfile(button.dataset.playerId);
  });
}

// ============================================================
// DO'STLAR VA XABARLAR
// ============================================================
//
// Tepadagi tugma ostida do'stlar ro'yxati turadi:
//   - kelgan do'stlik so'rovlari (qabul qilish / rad etish)
//   - do'stlar va ular bilan oxirgi xabar
//
// O'qilmagan xabar bo'lsa tugmada qizil raqam chiqadi.
// ============================================================

function loadSeen() {
  try {
    const raw = loadBig("zonexSeen");

    const parsed = raw ? JSON.parse(raw) : {};

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSeen() {
  saveBig("zonexSeen", JSON.stringify(state.seen));
}

// Suhbat ochildi — shu vaqtgacha bo'lgani o'qilgan hisoblanadi
function markChatSeen(id, time) {
  const key = String(id || "");

  if (!key) return;

  const stamp = Number(time) || Date.now();

  if (Number(state.seen[key] || 0) >= stamp) return;

  state.seen[key] = stamp;

  saveSeen();

  renderFriends();
}

function isUnread(row) {
  if (!row || !row.last) return false;

  // O'zim yozgan xabar o'qilmagan bo'lmaydi
  if (String(row.last.from) === String(state.id)) return false;

  return Number(row.last.time || 0) > Number(state.seen[String(row.id)] || 0);
}

// Menga do'stlik so'rovi yuborganlar
function incomingRequests() {
  const me = playerById(state.id);

  const ids = me && Array.isArray(me.incoming) ? me.incoming : [];

  return ids.map((id) => playerById(id)).filter(Boolean);
}

function unreadCount() {
  return state.chatList.filter(isUnread).length;
}

// Kim onlayn — do'st nomi yonidagi yashil nuqta uchun
function isOnlineFriend(row) {
  const player = playerById(row.id);

  const time =
    player && player.location
      ? Number(player.location.time || 0)
      : Number(row.lastSeen || 0);

  return Boolean(time) && Date.now() - time < CONFIG.ONLINE_MS;
}

function updateFriendsBadge() {
  const badge = $("#friendsBadge");

  if (!badge) return;

  const count = incomingRequests().length + unreadCount();

  badge.hidden = !count;
  badge.textContent = count > 9 ? "9+" : String(count);

  $("#friendsBtn")?.classList.toggle("has-new", Boolean(count));
}

function friendRowHtml(row) {
  const player = playerById(row.id) || row;

  const last = row.last;

  const unread = isUnread(row);

  const preview = last
    ? (String(last.from) === String(state.id) ? "Siz: " : "") + last.text
    : "Hali xabar yo'q — birinchi bo'lib yozing";

  return (
    '<div class="friend-row' +
    (unread ? " unread" : "") +
    '">' +
    '<button class="friend-open" type="button" data-chat-id="' +
    esc(row.id) +
    '">' +
    '<span class="friend-face' +
    (isOnlineFriend(row) ? " on" : "") +
    '">' +
    avatarHtml(player, "md") +
    "</span>" +
    '<span class="friend-info">' +
    "<strong>" +
    crownHtml(player) +
    nameHtml(player) +
    "</strong>" +
    "<small>" +
    esc(preview) +
    "</small>" +
    "</span>" +
    '<span class="friend-meta">' +
    (last ? "<i>" + clockOf(last.time) + "</i>" : "") +
    (unread ? '<b class="dot"></b>' : "") +
    "</span>" +
    "</button>" +
    '<button class="friend-prof" type="button" data-player-id="' +
    esc(row.id) +
    '" aria-label="Profil">\u203a</button>' +
    "</div>"
  );
}

function requestRowHtml(player) {
  return (
    '<div class="friend-row req">' +
    '<button class="friend-open" type="button" data-player-id="' +
    esc(player.id) +
    '">' +
    '<span class="friend-face">' +
    avatarHtml(player, "md") +
    "</span>" +
    '<span class="friend-info">' +
    "<strong>" +
    nameHtml(player) +
    "</strong>" +
    "<small>do'stlik so'rovi yubordi</small>" +
    "</span>" +
    "</button>" +
    '<span class="req-actions">' +
    '<button class="mini ok" type="button" data-accept="' +
    esc(player.id) +
    '" aria-label="Qabul qilish">\u2713</button>' +
    '<button class="mini no" type="button" data-decline="' +
    esc(player.id) +
    '" aria-label="Rad etish">\u00d7</button>' +
    "</span>" +
    "</div>"
  );
}

function renderFriends() {
  updateFriendsBadge();

  const box = $("#friendsBody");

  if (!box || !state.friendsOpen) return;

  if (!state.name) {
    box.innerHTML = '<div class="live-empty">Avval username tanlang</div>';

    return;
  }

  const requests = incomingRequests();

  // Do'stlar: server ro'yxati kelmagan bo'lsa — o'zimdagi id'lardan
  const me = playerById(state.id);

  const rows = state.chatList.length
    ? state.chatList
    : (me && Array.isArray(me.friends) ? me.friends : []).map((id) => ({
        id,
        last: null
      }));

  box.innerHTML =
    (requests.length
      ? '<p class="friends-title">SO\'ROVLAR \u00b7 ' +
        requests.length +
        "</p>" +
        requests.map(requestRowHtml).join("")
      : "") +
    '<p class="friends-title">DO\'STLARIM' +
    (rows.length ? " \u00b7 " + rows.length : "") +
    "</p>" +
    (rows.length
      ? rows.map(friendRowHtml).join("")
      : '<div class="live-empty">Hali do\'stingiz yo\'q — qidiruvdan ' +
        "username toping va do'stlikka qo'shing</div>");
}

// Do'stlar va ular bilan oxirgi xabarlar — bitta so'rov bilan
async function loadChatList() {
  if (!state.name || state.chatListBusy) return;

  state.chatListBusy = true;

  try {
    const { ok, data } = await api(
      "/api/messages?list=1&id=" + encodeURIComponent(state.id)
    );

    if (ok && Array.isArray(data.friends)) {
      state.chatList = data.friends;

      renderFriends();
    }
  } catch {
    /* internet yo'q — keyingi safar */
  }

  state.chatListBusy = false;
}

function openFriends() {
  state.friendsOpen = true;

  $("#friendsPanel")?.classList.add("open");

  renderFriends();
  loadChatList();

  clearInterval(state.chatListTimer);

  state.chatListTimer = setInterval(loadChatList, 5000);
}

function closeFriends() {
  state.friendsOpen = false;

  $("#friendsPanel")?.classList.remove("open");

  clearInterval(state.chatListTimer);

  // Panel yopiq bo'lsa ham nishon yangilanib tursin
  state.chatListTimer = setInterval(loadChatList, 25000);
}

function bindFriends() {
  $("#friendsBtn")?.addEventListener("click", () => {
    if (state.friendsOpen) closeFriends();
    else openFriends();
  });

  $("#closeFriends")?.addEventListener("click", closeFriends);

  $("#friendsBody")?.addEventListener("click", (event) => {
    const accept = event.target.closest("[data-accept]");

    if (accept) {
      friendAction("accept", accept.dataset.accept).then(loadChatList);

      return;
    }

    const decline = event.target.closest("[data-decline]");

    if (decline) {
      friendAction("decline", decline.dataset.decline).then(loadChatList);

      return;
    }

    const profile = event.target.closest("[data-player-id]");

    if (profile) {
      closeFriends();
      openProfile(profile.dataset.playerId);

      return;
    }

    const chat = event.target.closest("[data-chat-id]");

    if (chat) {
      closeFriends();
      openChat(chat.dataset.chatId);
    }
  });
}

// ============================================================
// USERNAME — FAQAT BIR MARTA
// ============================================================

function showNameError(message) {
  const box = $("#nameError");

  if (!box) return;

  box.textContent = message;
  box.classList.add("show");
}

async function submitName() {
  const button = $("#continueBtn");
  const input = $("#nameInput");

  const name = cleanUsername(input?.value);

  const problem = usernameProblem(name);

  if (problem) {
    showNameError(problem);
    input?.focus();
    return;
  }

  if (button) button.disabled = true;

  let response;

  try {
    response = await api("/api/register", { id: state.id, name });
  } catch {
    if (button) button.disabled = false;
    showNameError("Server bilan aloqa yo'q — internetni tekshiring");
    return;
  }

  if (button) button.disabled = false;

  const { ok, status, data } = response;

  if (!ok) {
    showNameError(
      status === 409
        ? "Bu username band. Boshqasini tanlang."
        : data.message || "Server bilan aloqa yo'q"
    );

    return;
  }

  const player = data.player || {};

  state.name = player.name || name;

  saveStored("zonexName", state.name);

  applyColor(player.color);
  setAvatar();

  $("#nameError")?.classList.remove("show");
  $("#welcomeModal")?.classList.remove("active");

  startPolling();

  ensureLocation();
}

function setAvatar() {
  if ($("#avatarLetter")) {
    $("#avatarLetter").textContent = state.name
      ? state.name[0].toUpperCase()
      : "Z";
  }

  // Yuqoridagi tugmada o'z rasmim tursin
  const button = $("#profileBtn");

  if (!button) return;

  const me = playerById(state.id);

  const src = me ? avatarOf(me) : "";

  if (src) {
    button.style.backgroundImage = 'url("' + src + '")';
    button.classList.add("has-photo");
  } else {
    button.style.backgroundImage = "";
    button.classList.remove("has-photo");
  }
}

// Eski akkauntni server bilan moslash (username qayta so'ralmaydi)
async function syncAccount() {
  let response;

  try {
    response = await api("/api/register", { id: state.id, name: state.name });
  } catch {
    return true; // internet yo'q — o'yin lokal davom etadi
  }

  const { ok, status, data } = response;

  if (ok && data.player) {
    state.name = data.player.name || state.name;

    saveStored("zonexName", state.name);

    applyColor(data.player.color);
    setAvatar();

    return true;
  }

  // Username band bo'lib qolgan bo'lsa — bir marta qayta so'raymiz
  if (status === 409) {
    showNameError("Bu username band. Boshqasini tanlang.");
    $("#welcomeModal")?.classList.add("active");

    return false;
  }

  return true; // server yotgan bo'lsa ham o'yin davom etadi
}

// ============================================================
// TUGMALAR
// ============================================================

function bindButtons() {
  $("#continueBtn")?.addEventListener("click", submitName);

  $("#nameInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitName();
  });

  $("#nameInput")?.addEventListener("input", (event) => {
    const clean = cleanUsername(event.target.value);

    if (event.target.value !== clean) event.target.value = clean;

    $("#nameError")?.classList.remove("show");
  });

  $("#allowBtn")?.addEventListener("click", requestLocation);

  $("#startBtn")?.addEventListener("click", () => {
    if (state.active) {
      finishWalk();
    } else {
      startWalk();
    }
  });

  $("#locateBtn")?.addEventListener("click", () => {
    if (state.marker && state.map) {
      state.map.flyTo(state.marker.getLatLng(), 17);
    } else {
      requestLocation();
    }
  });

  $("#rankBtn")?.addEventListener("click", () => {
    $("#leaderboard")?.classList.toggle("open");
    renderBoard();
  });

  $("#closeBoard")?.addEventListener("click", () => {
    $("#leaderboard")?.classList.remove("open");
  });

  // Reyting qatori bosilsa — o'sha odamning profili
  $("#leaderRows")?.addEventListener("click", (event) => {
    const row = event.target.closest(".leader-row");

    if (!row) return;

    $("#leaderboard")?.classList.remove("open");

    openProfile(row.dataset.playerId);
  });

  // O'z profilim
  $("#profileBtn")?.addEventListener("click", () => {
    if (!state.name) {
      $("#welcomeModal")?.classList.add("active");
      return;
    }

    openProfile(state.id);
  });

  $("#closeProfile")?.addEventListener("click", closeProfile);

  $("#profileModal")?.addEventListener("click", (event) => {
    if (event.target === $("#profileModal")) closeProfile();
  });

  // ---- profil rasmi ----
  $("#avatarInput")?.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];

    // Bir xil faylni qayta tanlash ham ishlasin
    event.target.value = "";

    if (file) uploadAvatar(file);
  });

  // ---- suhbat ----
  $("#closeChat")?.addEventListener("click", closeChat);

  $("#chatSend")?.addEventListener("click", sendMessage);

  $("#chatInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendMessage();
  });

  $("#chatModal")?.addEventListener("click", (event) => {
    if (event.target === $("#chatModal")) closeChat();
  });

  // ---- qidiruv ----
  $("#searchBtn")?.addEventListener("click", () => {
    if (state.searchOpen) closeSearch();
    else openSearch();
  });

  $("#closeSearch")?.addEventListener("click", closeSearch);

  $("#searchInput")?.addEventListener("input", (event) => {
    state.searchText = event.target.value;

    renderSearch();
  });

  $("#searchResults")?.addEventListener("click", (event) => {
    // Hudud bosildi — o'sha yerga uchamiz
    const zoneButton = event.target.closest(".found-zone");

    if (zoneButton) {
      const owner = playerById(zoneButton.dataset.zoneOwner);

      const territory = territoriesOf(owner).find(
        (t) => String(t.id || "") === String(zoneButton.dataset.zoneId)
      );

      if (territory) {
        showTerritory(territory);
        closeSearch();
      }

      return;
    }

    // Odam bosildi — profili ochiladi
    const head = event.target.closest(".found-head");

    if (!head) return;

    closeSearch();

    openProfile(head.dataset.playerId);
  });

  bindLive();
  bindFriends();
}

// ============================================================
// BOSHLANISH
// ============================================================

async function boot() {
  bindButtons();

  initMap();

  state.pending = loadPending();
  state.seen = loadSeen();

  applyColor(state.color || colorFromId(state.id));
  setAvatar();

  // Saqlangan hududlarim darhol ko'rinsin
  renderWorld([]);

  if (!state.name) {
    // Faqat birinchi kirishda
    $("#welcomeModal")?.classList.add("active");
    return;
  }

  // Username bor — hech narsa so'ramaymiz
  const okAccount = await syncAccount();

  startPolling();

  if (okAccount) ensureLocation();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
