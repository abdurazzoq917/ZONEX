const $ = (s) => document.querySelector(s);

/* =========================================================
   ZONEX — Multiplayer Territory Game
   ========================================================= */

const state = {
  name: localStorage.getItem('zonexName') || '',
  userId:
    localStorage.getItem('zonexUserId') ||
    localStorage.getItem('izlaUserId') ||
    crypto.randomUUID(),

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
  lastSent: 0,
  players: [],

  worldTimer: null,
  locationTimer: null
};

localStorage.setItem('zonexUserId', state.userId);

/* Eski foydalanuvchi ma'lumotlarini yo'qotmaslik */
if (!localStorage.getItem('zonexName')) {
  const oldName = localStorage.getItem('izlaName');
  if (oldName) {
    state.name = oldName;
    localStorage.setItem('zonexName', oldName);
  }
}

const colors = [
  '#ef3340',
  '#1246d8',
  '#782fd1',
  '#f29c16',
  '#00a86b',
  '#e83e8c',
  '#00a8cc',
  '#ff6b00'
];

/* =========================================================
   Yordamchi funksiyalar
   ========================================================= */

function toast(msg) {
  const t = $('#toast');

  if (!t) return;

  t.textContent = msg;
  t.classList.add('show');

  clearTimeout(t._x);

  t._x = setTimeout(() => {
    t.classList.remove('show');
  }, 2600);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
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
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }

  const lat =
    points.reduce((sum, p) => sum + p[0], 0) /
    points.length *
    Math.PI /
    180;

  let sum = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    sum +=
      (a[1] * 111320 * Math.cos(lat)) *
        (b[0] * 110540) -
      (b[1] * 111320 * Math.cos(lat)) *
        (a[0] * 110540);
  }

  return Math.abs(sum / 2);
}

function getPlayerColor(player, index = 0) {
  if (player && player.color) {
    return player.color;
  }

  return colors[index % colors.length];
}

/* =========================================================
   Xarita
   ========================================================= */

function initMap(center = [41.3111, 69.2797]) {
  if (state.map) return;

  state.map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView(center, 16);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 20,
      attribution: '© OpenStreetMap'
    }
  ).addTo(state.map);

  connectOnline();
  renderBoard();
}

/* =========================================================
   Online o'yinchilar
   ========================================================= */

function clearOnline() {
  state.onlineLayers.forEach((layer) => {
    try {
      layer.remove();
    } catch {}
  });

  state.onlineLayers = [];
}

function renderOnline(data) {
  if (!state.map) return;

  clearOnline();

  state.players = Array.isArray(data?.players)
    ? data.players
    : [];

  /*
   * Har bir o'yinchining hududlari
   */
  state.players.forEach((player, index) => {
    const color = getPlayerColor(player, index);

    const allPoints = [];

    /*
     * HUDUDLAR
     */
    (player.territories || []).forEach((territory) => {
      if (
        !Array.isArray(territory.points) ||
        territory.points.length < 3
      ) {
        return;
      }

      const polygon = L.polygon(
        territory.points,
        {
          color: color,
          fillColor: color,

          /*
           * Xiralashgan hudud
           */
          fillOpacity: 0.25,

          weight: 2,

          opacity: 0.9
        }
      ).addTo(state.map);

      /*
       * Hudud ustiga bosilganda
       * egasining ma'lumotini ko'rsatadi
       */
      polygon.bindTooltip(
        `<b>${esc(player.name)}</b><br>${Math.round(
          territory.area || 0
        ).toLocaleString()} m²`,
        {
          sticky: true,
          direction: 'top'
        }
      );

      state.onlineLayers.push(polygon);

      territory.points.forEach((point) => {
        allPoints.push(point);
      });
    });

    /*
     * HUDUD MARKAZIDA NIK
     */
    if (allPoints.length) {
      const center = [
        allPoints.reduce((sum, p) => sum + p[0], 0) /
          allPoints.length,

        allPoints.reduce((sum, p) => sum + p[1], 0) /
          allPoints.length
      ];

      const size = Math.max(
        12,
        Math.min(
          26,
          12 + Math.sqrt(player.area || 0) / 16
        )
      );

      const label = L.marker(center, {
        interactive: false,

        icon: L.divIcon({
          className: 'zonex-owner-label',

          html: `
            <div style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:5px 9px;
              border-radius:999px;
              background:rgba(255,255,255,.88);
              box-shadow:0 2px 10px rgba(0,0,0,.20);
              border:2px solid ${color};
              color:${color};
              font-weight:800;
              font-size:${size}px;
              white-space:nowrap;
              text-shadow:none;
            ">
              ${esc(player.name)}
            </div>
          `,

          iconSize: null,
          iconAnchor: [0, 0]
        })
      }).addTo(state.map);

      state.onlineLayers.push(label);
    }

    /*
     * BOSHQA O'YINCHINING JOYLASHUVI
     */
    if (
      player.location &&
      player.id !== state.userId &&
      Number.isFinite(+player.location.lat) &&
      Number.isFinite(+player.location.lng)
    ) {
      const age = Date.now() - (+player.location.time || 0);

      /*
       * 2 daqiqadan eski joylashuvni ko'rsatmaymiz
       */
      if (age < 120000) {
        const dot = L.circleMarker(
          [
            +player.location.lat,
            +player.location.lng
          ],
          {
            radius: 8,
            color: '#ffffff',
            weight: 3,
            fillColor: color,
            fillOpacity: 1
          }
        ).addTo(state.map);

        dot.bindTooltip(
          `<b>${esc(player.name)}</b><br>Hozir shu yerda`,
          {
            direction: 'top'
          }
        );

        state.onlineLayers.push(dot);

        /*
         * O'yinchi yonidagi kichik nik
         */
        const playerLabel = L.marker(
          [
            +player.location.lat,
            +player.location.lng
          ],
          {
            interactive: false,

            icon: L.divIcon({
              className: 'zonex-player-label',

              html: `
                <div style="
                  margin-top:13px;
                  color:${color};
                  font-weight:800;
                  font-size:12px;
                  white-space:nowrap;
                  text-shadow:
                    0 1px 2px white,
                    1px 0 2px white,
                    -1px 0 2px white;
                ">
                  ${esc(player.name)}
                </div>
              `,

              iconSize: null
            })
          }
        ).addTo(state.map);

        state.onlineLayers.push(playerLabel);
      }
    }
  });

  /*
   * O'ZIMIZNI TOPISH
   */
  const mine = state.players.find(
    (player) => player.id === state.userId
  );

  if (mine) {
    const area = Number(mine.area) || 0;

    if ($('#totalArea')) {
      $('#totalArea').textContent =
        Math.round(area).toLocaleString();
    }

    localStorage.setItem('zonexArea', area);
    localStorage.setItem('izlaArea', area);
  }

  renderBoard();
}

/* =========================================================
   Leaderboard
   ========================================================= */

function renderBoard() {
  if (!$('#leaderRows')) return;

  const rows = (
    state.players.length
      ? state.players
      : [
          {
            id: state.userId,
            name: state.name || 'Siz',
            color: '#ef3340',
            area:
              Number(
                localStorage.getItem('zonexArea') ||
                  localStorage.getItem('izlaArea')
              ) || 0
          }
        ]
  ).slice().sort(
    (a, b) =>
      (Number(b.area) || 0) -
      (Number(a.area) || 0)
  );

  $('#leaderRows').innerHTML = rows
    .map((player, index) => {
      const color = getPlayerColor(player, index);

      const isMe =
        player.id === state.userId;

      return `
        <div class="leader-row">
          <b>${index + 1}</b>

          <i style="
            background:${color};
            box-shadow:0 0 0 3px ${color}22;
          "></i>

          <span>
            ${esc(player.name)}
            ${
              isMe
                ? '<small style="opacity:.6"> (siz)</small>'
                : ''
            }
          </span>

          <strong>
            ${Math.round(
              Number(player.area) || 0
            ).toLocaleString()} m²
          </strong>
        </div>
      `;
    })
    .join('');
}

/* =========================================================
   Server bilan aloqa
   ========================================================= */

async function fetchWorld() {
  try {
    const response = await fetch(
      '/api/world',
      {
        method: 'GET',
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error('World API error');
    }

    const data = await response.json();

    renderOnline(data);
  } catch (error) {
    console.warn(
      'ZONEX server bilan aloqa yo‘q:',
      error
    );
  }
}

function connectOnline() {
  fetchWorld();

  if (state.worldTimer) {
    clearInterval(state.worldTimer);
  }

  /*
   * Har 2 sekundda o'yinchilarni yangilash
   */
  state.worldTimer = setInterval(
    fetchWorld,
    2000
  );
}

/* =========================================================
   Joylashuvni serverga yuborish
   ========================================================= */

async function sendLocation(position) {
  if (
    !state.name ||
    Date.now() - state.lastSent < 3000
  ) {
    return;
  }

  state.lastSent = Date.now();

  try {
    await fetch(
      '/api/location',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
        },

        body: JSON.stringify({
          id: state.userId,
          name: state.name,
          lat: position[0],
          lng: position[1]
        })
      }
    );
  } catch (error) {
    console.warn(
      'Location yuborilmadi',
      error
    );
  }
}

/* =========================================================
   GPS
   ========================================================= */

function onPosition(position) {
  const p = [
    position.coords.latitude,
    position.coords.longitude
  ];

  const accuracy =
    position.coords.accuracy || 10;

  if (!state.map) {
    initMap(p);
  }

  /*
   * O'zimizning marker
   */
  if (!state.marker) {
    state.marker = L.circleMarker(
      p,
      {
        radius: 9,
        color: '#ffffff',
        weight: 4,
        fillColor: '#ef3340',
        fillOpacity: 1
      }
    ).addTo(state.map);

    state.marker.bindTooltip(
      `<b>${esc(state.name || 'Siz')}</b>`,
      {
        direction: 'top'
      }
    );

    state.accuracy = L.circle(
      p,
      {
        radius: accuracy,
        color: '#1246d8',
        weight: 1,
        fillOpacity: 0.07
      }
    ).addTo(state.map);

    state.map.setView(p, 17);
  } else {
    state.marker.setLatLng(p);

    state.accuracy
      .setLatLng(p)
      .setRadius(accuracy);
  }

  /*
   * Joylashuvni serverga yuborish
   */
  sendLocation(p);

  /*
   * Agar yurish boshlangan bo'lsa,
   * yangi nuqta qo'shamiz
   */
  if (state.active) {
    addPoint(p);
  }
}

function geoError(error) {
  initMap();

  if (error?.code === 1) {
    toast(
      'Joylashuvga ruxsat berilmadi.'
    );
  } else {
    toast(
      'Joylashuv aniqlanmadi. GPSni tekshiring.'
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

      if ($('#locationModal')) {
        $('#locationModal')
          .classList
          .remove('active');
      }

      toast('Joylashuv aniqlandi ✓');
    },

    geoError,

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    }
  );
}

/* =========================================================
   Yurish / chiziq
   ========================================================= */

function addPoint(position) {
  const previous =
    state.points.at(-1);

  /*
   * GPS juda tez-tez nuqta yuborsa,
   * 3 metrdan kamini tashlab ketamiz.
   */
  if (
    previous &&
    hav(previous, position) < 3
  ) {
    return;
  }

  if (previous) {
    state.distance += hav(
      previous,
      position
    );
  }

  state.points.push(position);

  /*
   * Qizil yurish chizig'i
   */
  if (!state.line) {
    state.line = L.polyline(
      state.points,
      {
        color: '#ef3340',
        weight: 5,
        opacity: 0.95,
        lineJoin: 'round'
      }
    ).addTo(state.map);
  } else {
    state.line.setLatLngs(
      state.points
    );
  }

  /*
   * Yopilayotgan hududni oldindan
   * xira qilib ko'rsatish
   */
  if (state.preview) {
    state.preview.remove();
  }

  if (state.points.length > 2) {
    state.preview = L.polygon(
      state.points,
      {
        color: '#ef3340',
        weight: 2,
        dashArray: '6 7',
        fillColor: '#ef3340',
        fillOpacity: 0.10
      }
    ).addTo(state.map);
  }

  updateStats();

  /*
   * Boshlagan joyga yaqinlashsa
   * avtomatik yopiladi
   */
  if (
    state.points.length > 8 &&
    hav(
      state.points[0],
      position
    ) < 18
  ) {
    finishWalk(true);
  }
}

/* =========================================================
   Statistika
   ========================================================= */

function updateStats() {
  if ($('#distance')) {
    $('#distance').innerHTML =
      `${(state.distance / 1000).toFixed(2)}
       <small>km</small>`;
  }

  const seconds = state.active
    ? Math.floor(
        (Date.now() - state.started) /
          1000
      )
    : 0;

  if ($('#timer')) {
    $('#timer').textContent =
      `${String(
        Math.floor(seconds / 60)
      ).padStart(2, '0')}:${String(
        seconds % 60
      ).padStart(2, '0')}`;
  }

  const speed = seconds
    ? (state.distance / seconds) * 3.6
    : 0;

  if ($('#speed')) {
    $('#speed').innerHTML =
      `${speed.toFixed(1)}
       <small>km/soat</small>`;
  }
}

/* =========================================================
   Yurishni boshlash
   ========================================================= */

function startWalk() {
  if (!state.name) {
    toast('Avval nik kiriting');
    return;
  }

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

  if ($('#startBtn')) {
    $('#startBtn')
      .classList
      .add('running');
  }

  if ($('#startText')) {
    $('#startText').textContent =
      'YURISHNI YAKUNLASH';
  }

  if ($('#hint')) {
    $('#hint').textContent =
      'Boshlagan joyingizga qayting';
  }

  updateStats();

  clearInterval(state.timer);

  state.timer = setInterval(
    updateStats,
    1000
  );

  if (navigator.geolocation) {
    if (state.watching != null) {
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
          timeout: 10000
        }
      );
  }

  toast(
    'Yurish boshlandi — hududingizni yarating!'
  );
}

/* =========================================================
   Yurishni tugatish
   ========================================================= */

async function finishWalk(closed = false) {
  if (!state.active) {
    return;
  }

  state.active = false;

  clearInterval(state.timer);

  state.timer = null;

  if (state.watching != null) {
    navigator.geolocation.clearWatch(
      state.watching
    );

    state.watching = null;
  }

  if ($('#startBtn')) {
    $('#startBtn')
      .classList
      .remove('running');
  }

  if ($('#startText')) {
    $('#startText').textContent =
      'YURISHNI BOSHLASH';
  }

  if ($('#hint')) {
    $('#hint').textContent =
      'Boshlagan joyingizga qaytib hududni yoping';
  }

  if (state.points.length < 3) {
    toast(
      'Hudud yaratish uchun ko‘proq yuring'
    );
    return;
  }

  /*
   * Boshlanish va tugash nuqtalari
   */
  const gap = hav(
    state.points[0],
    state.points.at(-1)
  );

  /*
   * Avtomatik yopilgan bo'lsa,
   * gapni tekshirish shart emas.
   */
  if (!closed && gap > 35) {
    toast(
      'Hudud yopilmadi — boshlagan joyingizga qayting'
    );

    state.active = true;

    if (navigator.geolocation) {
      state.watching =
        navigator.geolocation.watchPosition(
          onPosition,
          geoError,
          {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 10000
          }
        );
    }

    return;
  }

  const area = Math.round(
    polygonArea(state.points)
  );

  if (state.preview) {
    state.preview.remove();
    state.preview = null;
  }

  if ($('#areaStatus')) {
    $('#areaStatus').textContent =
      `Yangi hudud: +${area.toLocaleString()} m²`;
  }

  /*
   * Serverga hudud yuborish
   */
  try {
    const response = await fetch(
      '/api/territory',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json'
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
        `HTTP ${response.status}`
      );
    }

    const result =
      await response.json();

    /*
     * Yangi umumiy maydon
     */
    if (
      result &&
      Number.isFinite(+result.area)
    ) {
      localStorage.setItem(
        'zonexArea',
        result.area
      );

      localStorage.setItem(
        'izlaArea',
        result.area
      );

      if ($('#totalArea')) {
        $('#totalArea').textContent =
          Math.round(
            result.area
          ).toLocaleString();
      }
    }

    toast(
      `${area.toLocaleString()} m² hudud ZONEXga qo‘shildi!`
    );

    /*
     * Serverdagi yangilangan dunyoni olish
     */
    await fetchWorld();
  } catch (error) {
    console.error(
      'Territory error:',
      error
    );

    /*
     * Internet bo'lmasa vaqtincha
     * xaritada ko'rsatamiz
     */
    const temporary =
      L.polygon(
        state.points,
        {
          color: '#ef3340',
          fillColor: '#ef3340',
          fillOpacity: 0.28,
          weight: 3
        }
      ).addTo(state.map);

    temporary.bindTooltip(
      `<b>${esc(state.name)}</b><br>${area.toLocaleString()} m²`
    );

    toast(
      'Serverga yuborilmadi — hudud vaqtincha ko‘rinadi'
    );
  }

  /*
   * Keyingi yurishga tayyorlash
   */
  state.points = [];
  state.distance = 0;

  if (state.line) {
    state.line.remove();
    state.line = null;
  }

  updateStats();
}

/* =========================================================
   Nik oynasi
   ========================================================= */

function saveName() {
  const input = $('#nameInput');

  if (!input) return false;

  const name =
    input.value.trim();

  if (!name) {
    if ($('#nameError')) {
      $('#nameError')
        .classList
        .add('show');
    }

    input.focus();

    return false;
  }

  /*
   * 20 ta belgidan oshirmaymiz
   */
  state.name = name.slice(0, 20);

  /*
   * Yangi ZONEX kaliti
   */
  localStorage.setItem(
    'zonexName',
    state.name
  );

  /*
   * Eski kalit ham saqlanadi
   * — eski foydalanuvchi yo'qolmaydi
   */
  localStorage.setItem(
    'izlaName',
    state.name
  );

  if ($('#avatarLetter')) {
    $('#avatarLetter').textContent =
      state.name[0].toUpperCase();
  }

  if ($('#welcomeModal')) {
    $('#welcomeModal')
      .classList
      .remove('active');
  }

  if ($('#locationModal')) {
    $('#locationModal')
      .classList
      .add('active');
  }

  renderBoard();

  return true;
}

/* =========================================================
   Tugmalar
   ========================================================= */

if ($('#continueBtn')) {
  $('#continueBtn').onclick =
    saveName;
}

if ($('#nameInput')) {
  $('#nameInput').onkeydown =
    (event) => {
      if (event.key === 'Enter') {
        saveName();
      }
    };

  $('#nameInput').oninput = () => {
    if ($('#nameError')) {
      $('#nameError')
        .classList
        .remove('show');
    }
  };
}

if ($('#allowBtn')) {
  $('#allowBtn').onclick =
    requestLocation;
}

if ($('#startBtn')) {
  $('#startBtn').onclick = () => {
    if (state.active) {
      finishWalk();
    } else {
      startWalk();
    }
  };
}

if ($('#locateBtn')) {
  $('#locateBtn').onclick = () => {
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

if ($('#rankBtn')) {
  $('#rankBtn').onclick = () => {
    if ($('#leaderboard')) {
      $('#leaderboard')
        .classList
        .toggle('open');
    }
  };
}

if ($('#closeBoard')) {
  $('#closeBoard').onclick = () => {
    if ($('#leaderboard')) {
      $('#leaderboard')
        .classList
        .remove('open');
    }
  };
}

/* =========================================================
   Sahifa yuklanganda
   ========================================================= */

(function boot() {
  /*
   * Saqlangan nik
   */
  const saved =
    localStorage.getItem('zonexName') ||
    localStorage.getItem('izlaName');

  if (saved) {
    state.name = saved;

    if ($('#nameInput')) {
      $('#nameInput').value =
        saved;
    }

    if ($('#avatarLetter')) {
      $('#avatarLetter').textContent =
        saved[0].toUpperCase();
    }
  }

  /*
   * Saqlangan maydon
   */
  const savedArea =
    Number(
      localStorage.getItem('zonexArea') ||
      localStorage.getItem('izlaArea')
    ) || 0;

  if ($('#totalArea')) {
    $('#totalArea').textContent =
      Math.round(
        savedArea
      ).toLocaleString();
  }

  /*
   * Xarita mavjud bo'lsa ishga tushiramiz
   */
  if ($('#map')) {
    initMap();
  }

  renderBoard();
})();