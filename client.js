const $ = (s) => document.querySelector(s);

const state = {
  name: localStorage.getItem("izlaName") || "",
  userId:
    localStorage.getItem("izlaUserId") ||
    (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),

  map: null,
  marker: null,
  accuracy: null,
  watching: null,

  active: false,
  started: 0,
  points: [],
  line: null,
  preview: null,

  distance: 0,
  timer: null,

  onlineLayers: [],
  playerMarkers: [],
  lastSent: 0,

  players: []
};

localStorage.setItem("izlaUserId", state.userId);

const colors = [
  "#ef3340",
  "#1246d8",
  "#782fd1",
  "#f29c16",
  "#00a878",
  "#ff5c35",
  "#8e44ad",
  "#16a085"
];

/* =========================
   YORDAMCHI FUNKSIYALAR
========================= */

function toast(msg) {
  const t = $("#toast");

  if (!t) return;

  t.textContent = msg;
  t.classList.add("show");

  clearTimeout(t._x);

  t._x = setTimeout(() => {
    t.classList.remove("show");
  }, 2600);
}

function esc(v) {
  return String(v || "").replace(/[<>&"']/g, (c) => {
    return {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#039;"
    }[c];
  });
}

function hav(a, b) {
  const R = 6371000;
  const p = Math.PI / 180;

  const d1 = (b[0] - a[0]) * p;
  const d2 = (b[1] - a[1]) * p;

  const x =
    Math.sin(d1 / 2) ** 2 +
    Math.cos(a[0] * p) *
      Math.cos(b[0] * p) *
      Math.sin(d2 / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

function polygonArea(points) {
  if (points.length < 3) return 0;

  const lat =
    (points.reduce((s, p) => s + p[0], 0) / points.length) *
    Math.PI /
    180;

  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    sum +=
      a[1] *
        111320 *
        Math.cos(lat) *
        b[0] *
        110540 -
      b[1] *
        111320 *
        Math.cos(lat) *
        a[0] *
        110540;
  }

  return Math.abs(sum / 2);
}

/* =========================
   MAP
========================= */

function initMap(center = [41.3111, 69.2797]) {
  if (state.map) return;

  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: true
  }).setView(center, 16);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution: "© OpenStreetMap"
    }
  ).addTo(state.map);

  connectOnline();
  renderBoard();
}

/* =========================
   ONLINE ODAMLAR
========================= */

function clearOnline() {
  state.onlineLayers.forEach((layer) => {
    try {
      layer.remove();
    } catch {}
  });

  state.onlineLayers = [];
  state.playerMarkers = [];
}

function playerColor(player, index) {
  return player.color || colors[index % colors.length];
}

function createPlayerMarker(player, color) {
  if (!state.map || !player.location) return null;

  const lat = Number(player.location.lat);
  const lng = Number(player.location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  /*
    Nik + rangli nuqta
  */

  const icon = L.divIcon({
    className: "zonex-player-marker",

    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        pointer-events:none;
      ">

        <div style="
          background:${color};
          width:16px;
          height:16px;
          border-radius:50%;
          border:3px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,.45);
        "></div>

        <div style="
          margin-top:3px;
          padding:3px 8px;
          border-radius:999px;
          background:rgba(0,0,0,.78);
          color:white;
          font-weight:800;
          font-size:12px;
          white-space:nowrap;
          box-shadow:0 2px 7px rgba(0,0,0,.3);
        ">
          ${esc(player.name)}
        </div>

      </div>
    `,

    iconSize: [1, 1],
    iconAnchor: [0, 0]
  });

  const marker = L.marker(
    [lat, lng],
    {
      icon,
      interactive: true
    }
  )
    .addTo(state.map)
    .bindTooltip(esc(player.name), {
      direction: "top"
    });

  return marker;
}

/* =========================
   ONLINE DATA
========================= */

function renderOnline(data) {
  if (!state.map) return;

  clearOnline();

  state.players = Array.isArray(data.players)
    ? data.players
    : [];

  state.players.forEach((player, index) => {
    const color = playerColor(player, index);

    /*
      HUDUDLAR
    */

    if (Array.isArray(player.territories)) {
      player.territories.forEach((territory) => {
        if (
          !Array.isArray(territory.points) ||
          territory.points.length < 3
        ) {
          return;
        }

        const layer = L.polygon(
          territory.points,
          {
            color,
            fillColor: color,
            fillOpacity: 0.25,
            weight: 2
          }
        )
          .addTo(state.map)
          .bindTooltip(
            esc(
              territory.ownerName ||
                player.name ||
                "Noma'lum"
            ),
            {
              sticky: true
            }
          );

        state.onlineLayers.push(layer);
      });
    }

    /*
      ODAMNING JOYLASHUVI

      O'zimizni boshqa marker bilan
      ko'rsatmaymiz.
    */

    if (
      String(player.id) !== String(state.userId) &&
      player.location
    ) {
      const locationTime = Number(
        player.location.time || 0
      );

      /*
        2 daqiqadan eski joylashuvni
        ko'rsatmaymiz.
      */

      if (
        locationTime &&
        Date.now() - locationTime > 120000
      ) {
        return;
      }

      const marker = createPlayerMarker(
        player,
        color
      );

      if (marker) {
        state.onlineLayers.push(marker);
        state.playerMarkers.push(marker);
      }
    }
  });

  /*
    O'Z HUDUDIMIZ
  */

  const mine = state.players.find(
    (p) => String(p.id) === String(state.userId)
  );

  if (mine) {
    if ($("#totalArea")) {
      $("#totalArea").textContent =
        Math.round(
          Number(mine.area || 0)
        ).toLocaleString();
    }

    localStorage.setItem(
      "izlaArea",
      Number(mine.area || 0)
    );
  }

  renderBoard();
}

/* =========================
   SERVERDAN WORLD OLISH
========================= */

async function fetchWorld() {
  try {
    const response = await fetch(
      "/api/world?t=" + Date.now(),
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error("World API error");
    }

    const data = await response.json();

    renderOnline(data);

  } catch (error) {
    console.log(
      "World yuklanmadi:",
      error
    );
  }
}

/*
  Har 2 sekundda boshqa
  odamlarning joylashuvini yangilaymiz.
*/

function connectOnline() {
  fetchWorld();

  if (state.worldTimer) {
    clearInterval(state.worldTimer);
  }

  state.worldTimer = setInterval(
    fetchWorld,
    2000
  );
}

/* =========================
   LOCATION YUBORISH
========================= */

async function sendLocation(position) {
  if (!state.name) return;

  /*
    Juda ko'p request yubormaslik
  */

  if (
    Date.now() - state.lastSent <
    2000
  ) {
    return;
  }

  state.lastSent = Date.now();

  try {
    const response = await fetch(
      "/api/location",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          id: state.userId,
          name: state.name,
          lat: Number(position[0]),
          lng: Number(position[1])
        })
      }
    );

    if (!response.ok) {
      console.log(
        "Location yuborilmadi"
      );
    }

  } catch (error) {
    console.log(
      "Location server xatosi:",
      error
    );
  }
}

/* =========================
   GPS
========================= */

function onPosition(pos) {
  const point = [
    Number(pos.coords.latitude),
    Number(pos.coords.longitude)
  ];

  const accuracy =
    Number(pos.coords.accuracy) || 10;

  if (!state.map) {
    initMap(point);
  }

  /*
    O'z markerimiz
  */

  if (!state.marker) {
    state.marker =
      L.circleMarker(point, {
        radius: 8,
        color: "#ffffff",
        weight: 4,
        fillColor: "#ef3340",
        fillOpacity: 1
      }).addTo(state.map);

    state.accuracy =
      L.circle(point, {
        radius: accuracy,
        color: "#1246d8",
        weight: 1,
        fillOpacity: 0.07
      }).addTo(state.map);

    state.map.setView(
      point,
      17
    );

  } else {
    state.marker.setLatLng(point);

    if (state.accuracy) {
      state.accuracy
        .setLatLng(point)
        .setRadius(accuracy);
    }
  }

  /*
    Joylashuvni serverga yuborish
  */

  sendLocation(point);

  /*
    Yurish boshlangan bo'lsa
    nuqta qo'shamiz
  */

  if (state.active) {
    addPoint(point);
  }
}

function geoError(error) {
  initMap();

  if (error && error.code === 1) {
    toast(
      "Joylashuvga ruxsat berilmadi."
    );
  } else {
    toast(
      "Joylashuv aniqlanmadi. GPSni tekshiring."
    );
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    geoError({ code: 0 });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      onPosition(position);

      if ($("#locationModal")) {
        $("#locationModal")
          .classList.remove("active");
      }

      toast(
        "Joylashuv aniqlandi ✓"
      );
    },

    geoError,

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

/* =========================
   YURISH
========================= */

function addPoint(point) {
  const previous =
    state.points.at(-1);

  if (
    previous &&
    hav(previous, point) < 3
  ) {
    return;
  }

  if (previous) {
    state.distance += hav(
      previous,
      point
    );
  }

  state.points.push(point);

  if (!state.line) {
    state.line =
      L.polyline(
        state.points,
        {
          color: "#ef3340",
          weight: 5,
          opacity: 0.95,
          lineJoin: "round"
        }
      ).addTo(state.map);

  } else {
    state.line.setLatLngs(
      state.points
    );
  }

  if (state.preview) {
    state.preview.remove();
  }

  if (state.points.length > 2) {
    state.preview =
      L.polygon(
        state.points,
        {
          color: "#ef3340",
          weight: 1,
          dashArray: "5 7",
          fillColor: "#ef3340",
          fillOpacity: 0.1
        }
      ).addTo(state.map);
  }

  updateStats();

  /*
    Boshlangan joyga qaytsa
  */

  if (
    state.points.length > 8 &&
    hav(
      state.points[0],
      point
    ) < 18
  ) {
    finishWalk(true);
  }
}

function updateStats() {
  if ($("#distance")) {
    $("#distance").innerHTML =
      `${(
        state.distance / 1000
      ).toFixed(2)} <small>km</small>`;
  }

  const seconds =
    state.active
      ? Math.floor(
          (Date.now() -
            state.started) /
            1000
        )
      : 0;

  if ($("#timer")) {
    $("#timer").textContent =
      `${String(
        Math.floor(seconds / 60)
      ).padStart(2, "0")}:${String(
        seconds % 60
      ).padStart(2, "0")}`;
  }

  const speed =
    seconds
      ? (state.distance /
          seconds) *
        3.6
      : 0;

  if ($("#speed")) {
    $("#speed").innerHTML =
      `${speed.toFixed(
        1
      )} <small>km/soat</small>`;
  }
}

function startWalk() {
  if (!state.map) {
    initMap();
  }

  state.active = true;
  state.started = Date.now();

  state.points = [];
  state.distance = 0;

  if (state.line) {
    state.line.remove();
  }

  if (state.preview) {
    state.preview.remove();
  }

  state.line = null;
  state.preview = null;

  $("#startBtn")?.classList.add(
    "running"
  );

  if ($("#startText")) {
    $("#startText").textContent =
      "YURISHNI YAKUNLASH";
  }

  if ($("#hint")) {
    $("#hint").textContent =
      "Boshlagan nuqtangizga qayting";
  }

  clearInterval(state.timer);

  state.timer =
    setInterval(
      updateStats,
      1000
    );

  if (
    navigator.geolocation
  ) {
    if (
      state.watching !== null
    ) {
      navigator.geolocation.clearWatch(
        state.watching
      );
    }

    state.watching =
      navigator.geolocation.watchPosition(
        onPosition,
        geoError,
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 15000
        }
      );
  }

  toast(
    "Yurish boshlandi — xavfsiz yuring!"
  );
}

/* =========================
   HUDUDNI YAKUNLASH
========================= */

async function finishWalk(
  closed = false
) {
  state.active = false;

  clearInterval(
    state.timer
  );

  if (
    state.watching !== null
  ) {
    navigator.geolocation.clearWatch(
      state.watching
    );

    state.watching = null;
  }

  $("#startBtn")?.classList.remove(
    "running"
  );

  if ($("#startText")) {
    $("#startText").textContent =
      "YURISHNI BOSHLASH";
  }

  if ($("#hint")) {
    $("#hint").textContent =
      "Boshlagan joyingizga qaytib, hududni yoping";
  }

  if (
    state.points.length < 3
  ) {
    toast(
      "Hudud yaratish uchun ko'proq yuring"
    );
    return;
  }

  const gap = hav(
    state.points[0],
    state.points.at(-1)
  );

  if (
    !closed &&
    gap > 35
  ) {
    toast(
      "Hudud yopilmadi — boshlagan nuqtaga qayting"
    );
    return;
  }

  const area = Math.round(
    polygonArea(
      state.points
    )
  );

  if (state.preview) {
    state.preview.remove();
    state.preview = null;
  }

  if ($("#areaStatus")) {
    $("#areaStatus").textContent =
      `Yangi hudud: +${area.toLocaleString()} m²`;
  }

  try {
    const response =
      await fetch(
        "/api/territory",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            id: state.userId,
            name: state.name,
            points: state.points,
            area
          })
        }
      );

    if (!response.ok) {
      throw new Error(
        "Territory API error"
      );
    }

    const result =
      await response.json();

    /*
      Serverdan keyingi
      worldni darhol olamiz.
    */

    await fetchWorld();

    toast(
      `${area.toLocaleString()} m² hudud saqlandi!`
    );

    /*
      Yangi hududni xaritada
      darhol ko'rsatish
    */

    if (
      result.territory &&
      Array.isArray(
        result.territory.points
      )
    ) {
      const color =
        result.player?.color ||
        "#ef3340";

      const layer =
        L.polygon(
          result.territory.points,
          {
            color,
            fillColor: color,
            fillOpacity: 0.28,
            weight: 3
          }
        ).addTo(state.map);

      state.onlineLayers.push(
        layer
      );
    }

  } catch (error) {
    console.log(
      "Territory error:",
      error
    );

    /*
      Server ishlamasa ham
      lokal xaritada ko'rsatamiz
    */

    L.polygon(
      state.points,
      {
        color: "#ef3340",
        fillColor: "#ef3340",
        fillOpacity: 0.28,
        weight: 3
      }
    ).addTo(state.map);

    toast(
      "Server bilan aloqa yo'q — hudud vaqtincha lokal ko'rinadi"
    );
  }
}

/* =========================
   LEADERBOARD
========================= */

function renderBoard() {
  if (!$("#leaderRows")) {
    return;
  }

  const rows = (
    state.players.length
      ? state.players
      : [
          {
            name:
              state.name || "Siz",
            color: "#ef3340",
            area:
              Number(
                localStorage.getItem(
                  "izlaArea"
                )
              ) || 0
          }
        ]
  ).sort(
    (a, b) =>
      Number(b.area || 0) -
      Number(a.area || 0)
  );

  $("#leaderRows").innerHTML =
    rows
      .map(
        (player, index) => `
        <div class="leader-row">
          <b>${index + 1}</b>

          <i style="
            background:${
              player.color ||
              colors[
                index %
                  colors.length
              ]
            };
          "></i>

          <span>
            ${esc(
              player.name
            )}
          </span>

          <strong>
            ${Math.round(
              Number(
                player.area || 0
              )
            ).toLocaleString()}
            m²
          </strong>
        </div>
      `
      )
      .join("");
}

/* =========================
   ISM / NIK
========================= */

function saveName(name) {
  state.name =
    String(name)
      .trim()
      .slice(0, 30);

  localStorage.setItem(
    "izlaName",
    state.name
  );

  if ($("#nameInput")) {
    $("#nameInput").value =
      state.name;
  }

  if ($("#avatarLetter")) {
    $("#avatarLetter").textContent =
      state.name
        ? state.name[0].toUpperCase()
        : "?";
  }
}

if ($("#continueBtn")) {
  $("#continueBtn").onclick =
    () => {
      const name =
        $("#nameInput")
          ?.value
          .trim();

      if (!name) {
        $("#nameError")?.classList.add(
          "show"
        );

        $("#nameInput")?.focus();

        return;
      }

      saveName(name);

      $("#nameError")?.classList.remove(
        "show"
      );

      $("#welcomeModal")?.classList.remove(
        "active"
      );

      $("#locationModal")?.classList.add(
        "active"
      );

      renderBoard();
    };
}

if ($("#nameInput")) {
  $("#nameInput").onkeydown =
    (event) => {
      if (
        event.key === "Enter"
      ) {
        $("#continueBtn")?.click();
      }
    };

  $("#nameInput").oninput =
    () => {
      $("#nameError")?.classList.remove(
        "show"
      );
    };
}

/* =========================
   TUGMALAR
========================= */

if ($("#allowBtn")) {
  $("#allowBtn").onclick =
    requestLocation;
}

if ($("#startBtn")) {
  $("#startBtn").onclick =
    () => {
      if (state.active) {
        finishWalk();
      } else {
        startWalk();
      }
    };
}

if ($("#locateBtn")) {
  $("#locateBtn").onclick =
    () => {
      if (
        state.marker &&
        state.map
      ) {
        state.map.flyTo(
          state.marker.getLatLng(),
          17
        );
      } else {
        requestLocation();
      }
    };
}

if ($("#rankBtn")) {
  $("#rankBtn").onclick =
    () => {
      $("#leaderboard")?.classList.toggle(
        "open"
      );
    };
}

if ($("#closeBoard")) {
  $("#closeBoard").onclick =
    () => {
      $("#leaderboard")?.classList.remove(
        "open"
      );
    };
}

/* =========================
   SAQLANGAN NIK
========================= */

const savedName =
  localStorage.getItem(
    "izlaName"
  );

if (savedName) {
  saveName(savedName);
}

if ($("#totalArea")) {
  $("#totalArea").textContent =
    Math.round(
      Number(
        localStorage.getItem(
          "izlaArea"
        )
      ) || 0
    ).toLocaleString();
}

/* =========================
   START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    /*
      Agar ism oldindan saqlangan
      bo'lsa, server bilan
      ishlashni boshlaymiz.
    */

    if (state.name) {
      initMap();
      fetchWorld();
    }
  }
);