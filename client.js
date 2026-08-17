const $ = (s) => document.querySelector(s);

// ===============================
// SAQLANGAN FOYDALANUVCHI
// ===============================
const savedName = localStorage.getItem('izlaName') || '';

const state = {
  name: savedName,
  userId:
    localStorage.getItem('izlaUserId') ||
    (crypto.randomUUID ? crypto.randomUUID() : 'user-' + Date.now()),

  map: null,
  marker: null,
  accuracy: null,
  watching: null,
  active: false,
  started: 0,
  points: [],
  line: null,
  preview: null,
  territories: [],
  distance: 0,
  timer: null,
  onlineLayers: [],
  lastSent: 0,
  players: []
};

// User ID ni saqlash
localStorage.setItem('izlaUserId', state.userId);

// Agar nik mavjud bo'lsa, uni ham saqlab qo'yamiz
if (state.name) {
  localStorage.setItem('izlaName', state.name);
}

const colors = [
  '#ef3340',
  '#1246d8',
  '#782fd1',
  '#f29c16'
];

// ===============================
// TOAST
// ===============================
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

// ===============================
// XAVFSIZ MATN
// ===============================
function esc(v) {
  return String(v || '').replace(/[<>]/g, '');
}

// ===============================
// MASOFA
// ===============================
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

// ===============================
// POLIGON MAYDONI
// ===============================
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
      (a[1] * 111320 * Math.cos(lat)) * (b[0] * 110540) -
      (b[1] * 111320 * Math.cos(lat)) * (a[0] * 110540);
  }

  return Math.abs(sum / 2);
}

// ===============================
// MAP
// ===============================
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

// ===============================
// RIVALS
// ===============================
function addRivals(c) {
  const rivals = [
    {
      name: 'Sardor',
      color: colors[1],
      off: [0.0013, 0.0009],
      area: 2840
    },
    {
      name: 'Malika',
      color: colors[2],
      off: [-0.0011, 0.0014],
      area: 1920
    },
    {
      name: 'Akmal',
      color: colors[3],
      off: [0.0005, -0.0018],
      area: 980
    }
  ];

  rivals.forEach((r, i) => {
    const [x, y] = [
      c[0] + r.off[0],
      c[1] + r.off[1]
    ];

    const d = 0.00045 + i * 0.00008;

    const pts = [
      [x - d, y - d],
      [x + d * 0.7, y - d * 1.1],
      [x + d, y + d * 0.55],
      [x - d * 0.35, y + d],
      [x - d * 1.1, y + d * 0.25]
    ];

    L.polygon(pts, {
      color: r.color,
      fillColor: r.color,
      fillOpacity: 0.23,
      weight: 2
    })
      .addTo(state.map)
      .bindTooltip(r.name, {
        permanent: true,
        direction: 'center',
        className: 'territory-label'
      });

    state.territories.push(r);
  });
}

// ===============================
// LEADERBOARD
// ===============================
function renderBoard() {
  const rows = (
    state.players.length
      ? state.players
      : [
          {
            name: state.name || 'Siz',
            color: '#ef3340',
            area: +localStorage.getItem('izlaArea') || 0
          }
        ]
  ).sort((a, b) => b.area - a.area);

  const leaderRows = $('#leaderRows');

  if (!leaderRows) return;

  leaderRows.innerHTML = rows
    .map(
      (r, i) => `
        <div class="leader-row">
          <b>${i + 1}</b>
          <i style="background:${r.color || colors[i % colors.length]}"></i>
          <span>${esc(r.name)}</span>
          <strong>${Math.round(r.area).toLocaleString()} m²</strong>
        </div>
      `
    )
    .join('');
}

// ===============================
// ONLINE QATLAMLAR
// ===============================
function clearOnline() {
  state.onlineLayers.forEach((l) => l.remove());
  state.onlineLayers = [];
}

// ===============================
// ONLINE WORLD
// ===============================
function renderOnline(data) {
  if (!state.map) return;

  clearOnline();

  state.players = data.players || [];

  state.players.forEach((p, idx) => {
    const color =
      p.color || colors[idx % colors.length];

    const all = [];

    // Hududlar
    (p.territories || []).forEach((t) => {
      const layer = L.polygon(t.points, {
        color,
        fillColor: color,
        fillOpacity: 0.24,
        weight: 2
      }).addTo(state.map);

      state.onlineLayers.push(layer);

      t.points.forEach((x) => all.push(x));
    });

    // Ism
    if (all.length) {
      const center = [
        all.reduce((s, x) => s + x[0], 0) / all.length,
        all.reduce((s, x) => s + x[1], 0) / all.length
      ];

      const size = Math.max(
        10,
        Math.min(
          28,
          10 + Math.sqrt(p.area || 0) / 14
        )
      );

      const label = L.marker(center, {
        interactive: false,
        icon: L.divIcon({
          className: 'owner-label',
          html: `
            <span style="
              font-size:${size}px;
              color:${color}
            ">
              ${esc(p.name)}
            </span>
          `
        })
      }).addTo(state.map);

      state.onlineLayers.push(label);
    }

    // Odamning joylashuvi
    if (
      p.location &&
      p.id !== state.userId &&
      Date.now() - p.location.time < 120000
    ) {
      const dot = L.circleMarker(
        [p.location.lat, p.location.lng],
        {
          radius: 6,
          color: '#fff',
          weight: 3,
          fillColor: color,
          fillOpacity: 1
        }
      )
        .addTo(state.map)
        .bindTooltip(esc(p.name));

      state.onlineLayers.push(dot);
    }
  });

  // O'zimizning maydonimiz
  const mine = state.players.find(
    (p) => p.id === state.userId
  );

  if (mine) {
    const totalArea = $('#totalArea');

    if (totalArea) {
      totalArea.textContent =
        Math.round(mine.area).toLocaleString();
    }

    localStorage.setItem(
      'izlaArea',
      mine.area
    );
  }

  renderBoard();
}

// ===============================
// WORLD OLISH
// ===============================
async function fetchWorld() {
  try {
    const r = await fetch('/api/world');

    if (r.ok) {
      renderOnline(await r.json());
    }
  } catch {
    toast('Server bilan aloqa yo‘q — offline rejim');
  }
}

// ===============================
// ONLINE ULANISH
// ===============================
function connectOnline() {
  fetchWorld();

  setInterval(fetchWorld, 5000);
}

// ===============================
// LOCATION SERVERGA YUBORISH
// ===============================
async function sendLocation(p) {
  if (
    !state.name ||
    Date.now() - state.lastSent < 3000
  ) {
    return;
  }

  state.lastSent = Date.now();

  try {
    await fetch('/api/location', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: state.userId,
        name: state.name,
        lat: p[0],
        lng: p[1]
      })
    });
  } catch {}
}

// ===============================
// GEOLOCATION
// ===============================
function onPosition(pos) {
  const p = [
    pos.coords.latitude,
    pos.coords.longitude
  ];

  const acc = pos.coords.accuracy || 10;

  if (!state.map) {
    initMap(p);
  }

  if (!state.marker) {
    state.marker = L.circleMarker(p, {
      radius: 8,
      color: '#fff',
      weight: 4,
      fillColor: '#ef3340',
      fillOpacity: 1
    }).addTo(state.map);

    state.accuracy = L.circle(p, {
      radius: acc,
      color: '#1246d8',
      weight: 1,
      fillOpacity: 0.07
    }).addTo(state.map);

    state.map.setView(p, 17);
  } else {
    state.marker.setLatLng(p);
    state.accuracy
      .setLatLng(p)
      .setRadius(acc);
  }

  sendLocation(p);

  if (state.active) {
    addPoint(p);
  }
}

// ===============================
// GEO ERROR
// ===============================
function geoError(e) {
  initMap();

  toast(
    e.code === 1
      ? 'Joylashuvga ruxsat berilmadi. Telefon sozlamalaridan ruxsat bering.'
      : 'Joylashuv aniqlanmadi. GPS yoqilganini tekshiring.'
  );
}

// ===============================
// LOCATION REQUEST
// ===============================
function requestLocation() {
  if (!navigator.geolocation) {
    geoError({ code: 0 });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (p) => {
      onPosition(p);

      $('#locationModal')?.classList.remove(
        'active'
      );

      toast('Joylashuv aniqlandi ✓');
    },
    geoError,
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  );
}

// ===============================
// POINT QO'SHISH
// ===============================
function addPoint(p) {
  const prev = state.points.at(-1);

  if (prev && hav(prev, p) < 3) {
    return;
  }

  if (prev) {
    state.distance += hav(prev, p);
  }

  state.points.push(p);

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
    state.line.setLatLngs(state.points);
  }

  if (state.preview) {
    state.preview.remove();
  }

  if (state.points.length > 2) {
    state.preview = L.polygon(
      state.points,
      {
        color: '#ef3340',
        weight: 1,
        dashArray: '5 7',
        fillColor: '#ef3340',
        fillOpacity: 0.1
      }
    ).addTo(state.map);
  }

  updateStats();

  if (
    state.points.length > 8 &&
    hav(state.points[0], p) < 18
  ) {
    finishWalk(true);
  }
}

// ===============================
// STATISTIKA
// ===============================
function updateStats() {
  const distance = $('#distance');
  const timer = $('#timer');
  const speed = $('#speed');

  if (distance) {
    distance.innerHTML = `
      ${(state.distance / 1000).toFixed(2)}
      <small>km</small>
    `;
  }

  const secs = state.active
    ? Math.floor(
        (Date.now() - state.started) / 1000
      )
    : 0;

  if (timer) {
    timer.textContent =
      `${String(Math.floor(secs / 60)).padStart(2, '0')}:` +
      `${String(secs % 60).padStart(2, '0')}`;
  }

  const sp = secs
    ? (state.distance / secs) * 3.6
    : 0;

  if (speed) {
    speed.innerHTML = `
      ${sp.toFixed(1)}
      <small>km/soat</small>
    `;
  }
}

// ===============================
// WALK BOSHLASH
// ===============================
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

  $('#startBtn')?.classList.add('running');

  if ($('#startText')) {
    $('#startText').textContent =
      'YURISHNI YAKUNLASH';
  }

  if ($('#hint')) {
    $('#hint').textContent =
      'Boshlagan nuqtangizga qayting';
  }

  state.timer = setInterval(
    updateStats,
    1000
  );

  if (navigator.geolocation) {
    state.watching =
      navigator.geolocation.watchPosition(
        onPosition,
        geoError,
        {
          enableHighAccuracy: true,
          maximumAge: 1000
        }
      );
  }

  toast(
    'Yurish boshlandi — xavfsiz yuring!'
  );
}

// ===============================
// WALK TUGATISH
// ===============================
async function finishWalk(closed = false) {
  state.active = false;

  clearInterval(state.timer);

  if (state.watching != null) {
    navigator.geolocation.clearWatch(
      state.watching
    );
  }

  state.watching = null;

  $('#startBtn')?.classList.remove(
    'running'
  );

  if ($('#startText')) {
    $('#startText').textContent =
      'YURISHNI BOSHLASH';
  }

  if ($('#hint')) {
    $('#hint').textContent =
      'Boshlagan joyingizga qaytib, hududni yoping';
  }

  if (state.points.length < 3) {
    toast(
      'Hudud yaratish uchun ko‘proq yuring'
    );
    return;
  }

  const gap = hav(
    state.points[0],
    state.points.at(-1)
  );

  if (!closed && gap > 35) {
    toast(
      'Hudud yopilmadi — boshlagan nuqtaga qayting'
    );
    return;
  }

  const area = Math.round(
    polygonArea(state.points)
  );

  if (state.preview) {
    state.preview.remove();
  }

  if ($('#areaStatus')) {
    $('#areaStatus').textContent =
      `Yangi hudud: +${area.toLocaleString()} m²`;
  }

  try {
    const r = await fetch(
      '/api/territory',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: state.userId,
          name: state.name,
          points: state.points,
          area
        })
      }
    );

    if (!r.ok) {
      throw new Error('Server error');
    }

    // Hududni localStorage'da ham saqlaymiz
    const oldArea =
      +localStorage.getItem('izlaArea') || 0;

    localStorage.setItem(
      'izlaArea',
      oldArea + area
    );

    toast(
      `${area.toLocaleString()} m² hudud hammaga qo‘shildi!`
    );

    await fetchWorld();
  } catch {
    L.polygon(
      state.points,
      {
        color: '#ef3340',
        fillColor: '#ef3340',
        fillOpacity: 0.28,
        weight: 3
      }
    ).addTo(state.map);

    toast(
      'Server topilmadi — hudud vaqtincha faqat sizda ko‘rinadi'
    );
  }
}

// ===============================
// NICKNAME SAQLASH
// ===============================
function savePlayerName(name) {
  const cleanName = String(name || '')
    .trim()
    .slice(0, 20);

  if (!cleanName) {
    return false;
  }

  state.name = cleanName;

  // ENG MUHIM QATOR
  localStorage.setItem(
    'izlaName',
    cleanName
  );

  // Avatar
  const avatar = $('#avatarLetter');

  if (avatar) {
    avatar.textContent =
      cleanName[0].toUpperCase();
  }

  return true;
}

// ===============================
// CONTINUE
// ===============================
$('#continueBtn').onclick = () => {
  const input = $('#nameInput');

  const n = input
    ? input.value.trim()
    : '';

  if (!n) {
    $('#nameError')?.classList.add(
      'show'
    );

    input?.focus();

    return;
  }

  // Nikni saqlash
  savePlayerName(n);

  // Welcome oynasini yopish
  $('#welcomeModal')?.classList.remove(
    'active'
  );

  // Location oynasini ochish
  $('#locationModal')?.classList.add(
    'active'
  );

  renderBoard();
};

// ===============================
// ENTER BOSILGANDA
// ===============================
$('#nameInput').onkeydown = (e) => {
  if (e.key === 'Enter') {
    $('#continueBtn')?.click();
  }
};

// ===============================
// INPUT O'ZGARGANDA
// ===============================
$('#nameInput').oninput = () => {
  $('#nameError')?.classList.remove(
    'show'
  );
};

// ===============================
// LOCATION BUTTON
// ===============================
$('#allowBtn').onclick =
  requestLocation;

// ===============================
// START BUTTON
// ===============================
$('#startBtn').onclick = () => {
  if (state.active) {
    finishWalk();
  } else {
    startWalk();
  }
};

// ===============================
// LOCATE BUTTON
// ===============================
$('#locateBtn').onclick = () => {
  if (state.marker) {
    state.map.flyTo(
      state.marker.getLatLng(),
      17
    );
  } else {
    requestLocation();
  }
};

// ===============================
// LEADERBOARD
// ===============================
$('#rankBtn').onclick = () => {
  $('#leaderboard')?.classList.toggle(
    'open'
  );
};

$('#closeBoard').onclick = () => {
  $('#leaderboard')?.classList.remove(
    'open'
  );
};

// ===============================
// SAQLANGAN NIKNI QAYTA TIKLASH
// ===============================
const saved = localStorage.getItem(
  'izlaName'
);

if (saved) {
  state.name = saved;

  const input = $('#nameInput');

  if (input) {
    input.value = saved;
  }

  const avatar = $('#avatarLetter');

  if (avatar) {
    avatar.textContent =
      saved[0].toUpperCase();
  }
}

// ===============================
// SAQLANGAN AREA
// ===============================
const savedArea =
  +localStorage.getItem('izlaArea') || 0;

if ($('#totalArea')) {
  $('#totalArea').textContent =
    Math.round(savedArea).toLocaleString();
}

// ===============================
// AGAR NIK OLDIN SAQLANGAN BO'LSA
// WELCOME OYNASINI OCHMASLIK
// ===============================
if (saved) {
  $('#welcomeModal')?.classList.remove(
    'active'
  );
}

// Xarita
initMap();