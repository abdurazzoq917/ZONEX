// game.js
// ============================================================
// ZONEX — CHELENJ, POINT, NAQISHLAR, BILDIRISHNOMALAR
// ============================================================
//
// Bu fayl client.js dan KEYIN yuklanadi va uning `state`,
// `api`, `toast`, `esc` kabi umumiy narsalaridan foydalanadi.
// client.js esa bu yerga `window.ZONEX_GAME` orqali murojaat
// qiladi (hudud naqishi va nishonlarni yangilash uchun).
//
// Ichida:
//
//   1) uchta nuqta menyusi
//   2) kunlik chelenj oynasi
//   3) do'kon: naqishlarni point/pulga olish + pointni pulga
//      aylantirish so'rovi
//   4) bildirishnomalar + telefonga chiqadigan (local) xabar
//   5) QR kod oynasi
//   6) hudud ustidagi naqishni chizish
// ============================================================

(function () {
  "use strict";

  // Ulashiladigan manzil — QR kod shunga ishlaydi
  const SHARE_URL = "https://zonex-project.vercel.app";

  // Android bildirishnoma kanali
  const NOTIF_CHANNEL = "zonex";

  const G = {
    started: false,

    points: 0,
    daily: null,

    // Do'kon: server bergan katalog
    catalog: [],
    cash: null,
    orders: [],
    cashouts: [],
    mySkin: "",
    mySkins: [],

    shopTab: "skins",
    shopBusy: false,

    notifs: [],
    unread: 0,

    // Telefonga chiqarilgan bildirishnomalar (takror chiqmasin)
    pushed: {},

    localNotif: null,
    notifAsked: false,

    notifTimer: null,
    dailyTimer: null,
    resetAt: 0
  };

  const $ = (selector) => document.querySelector(selector);

  // ==========================================================
  // KICHIK YORDAMCHILAR
  // ==========================================================

  function money(value) {
    return String(Math.round(Number(value) || 0)).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      " "
    );
  }

  // Katta sonni bo'lib ko'rsatamiz: 12500 -> "12 500"
  const num = money;

  // "3 soat 12 daqiqa" ko'rinishidagi qolgan vaqt
  function leftText(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);

    const hours = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);

    if (hours > 0) return hours + " soat " + mins + " daqiqa";

    return mins + " daqiqa";
  }

  function ago(time) {
    const diff = Date.now() - (Number(time) || 0);

    if (diff < 60000) return "hozir";
    if (diff < 3600000) return Math.floor(diff / 60000) + " daq oldin";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " soat oldin";

    return Math.floor(diff / 86400000) + " kun oldin";
  }

  function loggedIn() {
    return Boolean(state && state.id && state.token);
  }

  // ==========================================================
  // NAQISH (SKIN) CHIZMASI
  // ==========================================================
  //
  // Serverdan kelgan tavsif ({ kind, ink, back, scale }) shu
  // yerda SVG naqshga aylanadi. Naqsh xarita SVG'sining
  // <defs> ichiga bir marta qo'yiladi va hamma hudud o'shanga
  // havola qiladi.
  // ==========================================================

  function patternBody(pattern) {
    const s = Number(pattern.scale) || 14;
    const ink = pattern.ink || "#ffffff";
    const back = pattern.back || "#333333";

    const half = s / 2;

    const base = '<rect width="' + s + '" height="' + s + '" fill="' + back + '"/>';

    const line = (d, width) =>
      '<path d="' +
      d +
      '" fill="none" stroke="' +
      ink +
      '" stroke-width="' +
      (width || 2) +
      '" stroke-linecap="round"/>';

    switch (pattern.kind) {
      case "grid":
        return base + line("M0 0H" + s + "M0 0V" + s, 1.6);

      case "stripes":
        return (
          base +
          line("M-" + half + " " + half + "L" + half + " -" + half, 3) +
          line("M0 " + s + "L" + s + " 0", 3) +
          line(
            "M" + half + " " + (s + half) + "L" + (s + half) + " " + half,
            3
          )
        );

      case "dots":
        return (
          base +
          '<circle cx="' + half + '" cy="' + half + '" r="' + s / 5 +
          '" fill="' + ink + '"/>' +
          '<circle cx="0" cy="0" r="' + s / 9 + '" fill="' + ink + '"/>' +
          '<circle cx="' + s + '" cy="' + s + '" r="' + s / 9 +
          '" fill="' + ink + '"/>'
        );

      case "waves":
        return (
          base +
          line(
            "M0 " + s * 0.65 + "q" + s * 0.25 + " -" + s * 0.35 + " " +
            half + " 0t" + half + " 0",
            2.2
          ) +
          line(
            "M0 " + s * 0.25 + "q" + s * 0.25 + " -" + s * 0.35 + " " +
            half + " 0t" + half + " 0",
            1.4
          )
        );

      case "chevron":
        return (
          base +
          line("M0 " + s * 0.7 + "L" + half + " " + s * 0.3 + "L" + s + " " + s * 0.7, 2.4) +
          line("M0 " + s * 0.3 + "L" + half + " -" + s * 0.1 + "L" + s + " " + s * 0.3, 2.4)
        );

      case "hex":
        return (
          base +
          line(
            "M" + half + " " + s * 0.08 +
            "L" + s * 0.93 + " " + s * 0.3 +
            "L" + s * 0.93 + " " + s * 0.7 +
            "L" + half + " " + s * 0.92 +
            "L" + s * 0.07 + " " + s * 0.7 +
            "L" + s * 0.07 + " " + s * 0.3 + "Z",
            1.8
          )
        );

      case "stars": {
        const star = (cx, cy, r) =>
          '<path d="M' + cx + " " + (cy - r) +
          "L" + (cx + r * 0.3) + " " + (cy - r * 0.3) +
          "L" + (cx + r) + " " + cy +
          "L" + (cx + r * 0.3) + " " + (cy + r * 0.3) +
          "L" + cx + " " + (cy + r) +
          "L" + (cx - r * 0.3) + " " + (cy + r * 0.3) +
          "L" + (cx - r) + " " + cy +
          "L" + (cx - r * 0.3) + " " + (cy - r * 0.3) +
          'Z" fill="' + ink + '"/>';

        return (
          base +
          star(half, half, s * 0.22) +
          star(s * 0.15, s * 0.85, s * 0.1) +
          star(s * 0.85, s * 0.18, s * 0.12)
        );
      }

      case "scales":
        return (
          base +
          line("M0 " + half + "a" + half + " " + half + " 0 0 0 " + s + " 0", 2) +
          line("M-" + half + " " + s + "a" + half + " " + half + " 0 0 0 " + s + " 0", 2) +
          line("M" + half + " " + s + "a" + half + " " + half + " 0 0 0 " + s + " 0", 2)
        );

      case "circuit":
        return (
          base +
          line("M0 " + half + "H" + s * 0.35 + "V" + s * 0.15 + "H" + s, 1.6) +
          line("M" + half + " " + s + "V" + s * 0.65 + "H" + s * 0.1, 1.6) +
          '<circle cx="' + s * 0.35 + '" cy="' + half + '" r="' + s * 0.08 +
          '" fill="' + ink + '"/>' +
          '<rect x="' + (half - s * 0.06) + '" y="' + (s * 0.65 - s * 0.06) +
          '" width="' + s * 0.12 + '" height="' + s * 0.12 + '" fill="' + ink + '"/>'
        );

      case "flame":
        return (
          base +
          '<path d="M' + half + " " + s * 0.9 +
          "q-" + s * 0.3 + " -" + s * 0.25 + " -" + s * 0.05 + " -" + s * 0.5 +
          "q" + s * 0.05 + " " + s * 0.15 + " " + s * 0.18 + " " + s * 0.12 +
          "q-" + s * 0.1 + " -" + s * 0.28 + " " + s * 0.12 + " -" + s * 0.4 +
          "q-" + s * 0.04 + " " + s * 0.3 + " " + s * 0.22 + " " + s * 0.4 +
          "q" + s * 0.12 + " " + s * 0.25 + " -" + s * 0.22 + " " + s * 0.38 +
          'Z" fill="' + ink + '" opacity=".9"/>'
        );

      case "diamond":
        return (
          base +
          '<path d="M' + half + " " + s * 0.12 +
          "L" + s * 0.88 + " " + half +
          "L" + half + " " + s * 0.88 +
          "L" + s * 0.12 + " " + half +
          'Z" fill="none" stroke="' + ink + '" stroke-width="2"/>' +
          '<path d="M' + half + " " + s * 0.32 +
          "L" + s * 0.68 + " " + half +
          "L" + half + " " + s * 0.68 +
          "L" + s * 0.32 + " " + half +
          'Z" fill="' + ink + '" opacity=".75"/>'
        );

      case "crown":
        return (
          base +
          '<path d="M' + s * 0.12 + " " + s * 0.72 +
          "L" + s * 0.2 + " " + s * 0.3 +
          "L" + s * 0.35 + " " + s * 0.55 +
          "L" + half + " " + s * 0.22 +
          "L" + s * 0.65 + " " + s * 0.55 +
          "L" + s * 0.8 + " " + s * 0.3 +
          "L" + s * 0.88 + " " + s * 0.72 +
          'Z" fill="' + ink + '"/>'
        );

      case "cosmos":
        return (
          base +
          '<circle cx="' + s * 0.3 + '" cy="' + s * 0.3 + '" r="' + s * 0.26 +
          '" fill="' + ink + '" opacity=".28"/>' +
          '<circle cx="' + s * 0.72 + '" cy="' + s * 0.66 + '" r="' + s * 0.16 +
          '" fill="' + ink + '" opacity=".45"/>' +
          '<circle cx="' + s * 0.5 + '" cy="' + s * 0.12 + '" r="' + s * 0.05 +
          '" fill="#ffffff"/>' +
          '<circle cx="' + s * 0.16 + '" cy="' + s * 0.82 + '" r="' + s * 0.04 +
          '" fill="#ffffff"/>' +
          '<circle cx="' + s * 0.88 + '" cy="' + s * 0.2 + '" r="' + s * 0.03 +
          '" fill="#ffffff"/>'
        );

      default:
        return base;
    }
  }

  function skinById(id) {
    return G.catalog.find((skin) => skin.id === String(id || "")) || null;
  }

  // Do'kon kartochkasi uchun kichik ko'rinish.
  //
  // Bu yerda <pattern> ISHLATILMAYDI: sahifada o'nlab
  // ko'rinish bo'ladi va ularning id'lari to'qnashib ketardi.
  // Buning o'rniga naqsh shunchaki bir necha marta chiziladi.
  function previewSvg(pattern, size) {
    const box = size || 64;

    const s = Number(pattern.scale) || 14;

    let tiles = "";

    for (let y = 0; y < box; y += s) {
      for (let x = 0; x < box; x += s) {
        tiles +=
          '<g transform="translate(' + x + "," + y + ')">' +
          patternBody(pattern) +
          "</g>";
      }
    }

    return (
      '<svg viewBox="0 0 ' + box + " " + box +
      '" xmlns="http://www.w3.org/2000/svg" class="skin-preview" ' +
      'preserveAspectRatio="xMidYMid slice">' +
      '<rect width="' + box + '" height="' + box + '" fill="' +
      (pattern.back || "#333") + '"/>' +
      tiles +
      "</svg>"
    );
  }

  // ---- xaritadagi naqsh ----

  function ensurePattern(path, skin) {
    const svg = path.ownerSVGElement;

    if (!svg) return "";

    const id = "zx-skin-" + skin.id;

    if (!svg.querySelector("#" + id)) {
      let defs = svg.querySelector("defs");

      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svg.insertBefore(defs, svg.firstChild);
      }

      const s = Number(skin.pattern.scale) || 14;

      const holder = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "pattern"
      );

      holder.setAttribute("id", id);
      holder.setAttribute("width", String(s));
      holder.setAttribute("height", String(s));
      holder.setAttribute("patternUnits", "userSpaceOnUse");
      holder.innerHTML = patternBody(skin.pattern);

      defs.appendChild(holder);
    }

    return "url(#" + id + ")";
  }

  function paintZone(polygon, skinId, isMe) {
    const skin = skinById(skinId);

    if (!skin || !polygon || !polygon._path) return;

    try {
      const url = ensurePattern(polygon._path, skin);

      if (!url) return;

      polygon._path.setAttribute("fill", url);

      // Naqsh ostidan xarita ko'rinib tursin — aks holda
      // ko'chalar butunlay yopilib qoladi
      polygon._path.setAttribute("fill-opacity", isMe ? "0.58" : "0.46");
      polygon._path.setAttribute("stroke", skin.pattern.ink);
    } catch {
      /* xarita hali tayyor emas */
    }
  }

  // Katalog kechroq kelsa — allaqachon chizilgan hududlarni
  // qaytadan bo'yab chiqamiz
  function repaintZones() {
    if (typeof state === "undefined" || !state.zoneLayers) return;

    state.zoneLayers.forEach((entry) => {
      const skinId = entry.player && entry.player.skin;

      if (!skinId) return;

      paintZone(entry.layer, skinId, entry.isMe);
    });
  }

  // ==========================================================
  // OYNALARNI OCHISH / YOPISH
  // ==========================================================

  function openModal(id) {
    closeMenu();

    $(id)?.classList.add("active");
  }

  function closeModal(id) {
    $(id)?.classList.remove("active");
  }

  function closeMenu() {
    $("#menuPanel")?.classList.remove("open");
  }

  // ==========================================================
  // KUNLIK CHELENJ
  // ==========================================================

  async function loadDaily(quiet) {
    if (!loggedIn()) return;

    try {
      const { ok, data } = await api(
        "/api/challenges?id=" + encodeURIComponent(state.id)
      );

      if (!ok) return;

      G.daily = data.daily || null;
      G.points = Number(data.points) || 0;

      G.resetAt =
        Date.now() + (Number(data.daily && data.daily.resetIn) || 0);

      renderBadges();

      if (!quiet) renderChallenge();
    } catch {
      /* internet yo'q — keyingi safar */
    }
  }

  function taskRowHtml(task) {
    const percent = Math.min(
      100,
      Math.round((task.progress / task.target) * 100)
    );

    const shown =
      task.type === "distance"
        ? num(task.progress) + " / " + num(task.target) + " m"
        : task.type === "area"
        ? num(task.progress) + " / " + num(task.target) + " m²"
        : task.progress + " / " + task.target;

    return (
      '<div class="task' +
      (task.claimed ? " done" : task.done ? " ready" : "") +
      '">' +
      '<div class="task-head">' +
      "<strong>" +
      esc(task.title) +
      "</strong>" +
      '<em class="task-reward">+' +
      task.reward +
      " P</em>" +
      "</div>" +
      "<small>" +
      esc(task.about) +
      "</small>" +
      '<div class="task-bar"><i style="width:' +
      percent +
      '%"></i></div>' +
      '<div class="task-foot">' +
      "<span>" +
      esc(shown) +
      "</span>" +
      (task.claimed
        ? '<b class="taken">OLINGAN ✓</b>'
        : task.done
        ? '<button class="mini-claim" type="button" data-claim="' +
          esc(task.key) +
          '">MUKOFOTNI OLISH</button>'
        : '<b class="wait">Davom eting</b>') +
      "</div>" +
      "</div>"
    );
  }

  function renderChallenge() {
    const box = $("#challengeBody");

    if (!box) return;

    if ($("#challengePoints")) {
      $("#challengePoints").textContent = num(G.points);
    }

    if (!loggedIn()) {
      box.innerHTML = '<div class="empty">Avval akkauntingizga kiring</div>';
      return;
    }

    if (!G.daily) {
      box.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      return;
    }

    const daily = G.daily;

    if ($("#challengeReset")) {
      $("#challengeReset").textContent =
        "Yangi vazifalar " + leftText(G.resetAt - Date.now()) + "dan keyin";
    }

    const bonus = daily.bonus || {};

    box.innerHTML =
      '<div class="streak">' +
      '<span class="streak-flame">▲</span>' +
      "<span><strong>" +
      daily.streak +
      " kun ketma-ket</strong>" +
      "<small>Har kuni uchala vazifani bajarsangiz streak o'sadi</small></span>" +
      "</div>" +
      daily.tasks.map(taskRowHtml).join("") +
      '<div class="task bonus' +
      (bonus.taken ? " done" : bonus.ready ? " ready" : "") +
      '">' +
      '<div class="task-head"><strong>Kun bonusi</strong>' +
      '<em class="task-reward">+' +
      bonus.reward +
      " P</em></div>" +
      "<small>Uchala vazifa bajarilganda ochiladi</small>" +
      '<div class="task-foot"><span>' +
      daily.tasks.filter((task) => task.claimed).length +
      " / " +
      daily.tasks.length +
      " bajarildi</span>" +
      (bonus.taken
        ? '<b class="taken">OLINGAN ✓</b>'
        : bonus.ready
        ? '<button class="mini-claim" type="button" data-claim="bonus">BONUSNI OLISH</button>'
        : '<b class="wait">Yopiq</b>') +
      "</div></div>" +
      '<p class="sheet-note">Point bilan naqish sotib olish yoki uni ' +
      "pulga aylantirish mumkin — pastdagi «POINT» tugmasidan.</p>";
  }

  async function claimTask(key) {
    if (!loggedIn()) return;

    const { ok, data } = await api("/api/challenges", {
      id: state.id,
      key
    });

    if (!ok) {
      toast(data.message || "Mukofotni olib bo'lmadi");

      if (data.daily) {
        G.daily = data.daily;
        renderChallenge();
      }

      return;
    }

    G.daily = data.daily;
    G.points = Number(data.points) || 0;

    toast(data.message || "Mukofot olindi");

    renderChallenge();
    renderBadges();
  }

  // ==========================================================
  // DO'KON
  // ==========================================================

  async function loadShop(quiet) {
    if (!loggedIn()) return;

    try {
      const { ok, data } = await api(
        "/api/shop?id=" + encodeURIComponent(state.id)
      );

      if (!ok) return;

      applyShop(data);

      if (!quiet) renderShop();
    } catch {
      /* internet yo'q */
    }
  }

  function applyShop(data) {
    if (!data) return;

    if (Array.isArray(data.catalog)) G.catalog = data.catalog;

    G.points = Number(data.points) || 0;
    G.cash = data.cash || G.cash;
    G.orders = Array.isArray(data.orders) ? data.orders : [];
    G.cashouts = Array.isArray(data.cashouts) ? data.cashouts : [];
    G.mySkin = String(data.skin || "");
    G.mySkins = Array.isArray(data.skins) ? data.skins : [];

    renderBadges();
    repaintZones();
  }

  const RARITY = {
    epic: { name: "EPIK", cls: "epic" },
    mythic: { name: "MIFIK", cls: "mythic" },
    legendary: { name: "LEGENDAR", cls: "legend" }
  };

  function skinCardHtml(skin) {
    const rarity = RARITY[skin.rarity] || RARITY.epic;

    const isOn = G.mySkin === skin.id;

    let action;

    if (skin.owned) {
      action = isOn
        ? '<button class="skin-btn on" type="button" data-equip="">QO\'YILGAN ✓</button>'
        : '<button class="skin-btn" type="button" data-equip="' +
          esc(skin.id) +
          '">QO\'YISH</button>';
    } else if (skin.rarity === "legendary") {
      action = skin.pending
        ? '<button class="skin-btn wait" type="button" disabled>TASDIQ KUTILMOQDA</button>'
        : '<button class="skin-btn buy money" type="button" data-order="' +
          esc(skin.id) +
          '">' +
          money(skin.price) +
          " so'm</button>";
    } else {
      action =
        '<button class="skin-btn buy" type="button" data-buy="' +
        esc(skin.id) +
        '"' +
        (G.points < skin.points ? " data-poor=\"1\"" : "") +
        ">" +
        num(skin.points) +
        " P</button>";
    }

    return (
      '<div class="skin-card ' +
      rarity.cls +
      (isOn ? " active" : "") +
      '">' +
      '<div class="skin-art">' +
      previewSvg(skin.pattern, 72) +
      '<em class="skin-rarity">' +
      rarity.name +
      "</em>" +
      "</div>" +
      '<div class="skin-info">' +
      "<strong>" +
      esc(skin.name) +
      "</strong>" +
      "<small>" +
      esc(skin.about) +
      "</small>" +
      action +
      "</div>" +
      "</div>"
    );
  }

  function shopSkinsHtml() {
    if (!G.catalog.length) {
      return '<div class="empty">Yuklanmoqda…</div>';
    }

    const groups = ["epic", "mythic", "legendary"];

    const titles = {
      epic: ["EPIK", "Point bilan olinadi"],
      mythic: ["MIFIK", "Qimmatroq, lekin ko'zga tashlanadi"],
      legendary: ["LEGENDAR", "Faqat pulga — narxi arzon qo'yilgan"]
    };

    return (
      (G.mySkin
        ? '<button class="skin-off" type="button" data-equip="">' +
          "Naqishni olib tashlash</button>"
        : "") +
      groups
        .map((rarity) => {
          const list = G.catalog.filter((skin) => skin.rarity === rarity);

          if (!list.length) return "";

          return (
            '<p class="shop-title"><b>' +
            titles[rarity][0] +
            "</b><span>" +
            titles[rarity][1] +
            "</span></p>" +
            '<div class="skin-grid">' +
            list.map(skinCardHtml).join("") +
            "</div>"
          );
        })
        .join("")
    );
  }

  function orderRowHtml(row) {
    const label =
      row.status === "done"
        ? '<b class="ok">BAJARILDI ✓</b>'
        : row.status === "rejected"
        ? '<b class="no">RAD ETILDI</b>'
        : '<b class="wait">KUTILMOQDA</b>';

    if (row.skinId) {
      const skin = skinById(row.skinId);

      return (
        '<div class="order-row"><span>' +
        esc(skin ? skin.name : row.skinId) +
        " · " +
        money(row.price) +
        " so'm<small>" +
        ago(row.time) +
        "</small></span>" +
        label +
        "</div>"
      );
    }

    return (
      '<div class="order-row"><span>' +
      num(row.points) +
      " P → " +
      money(row.amount) +
      " so'm<small>" +
      esc(row.account) +
      " · " +
      ago(row.time) +
      "</small></span>" +
      label +
      "</div>"
    );
  }

  function shopCashHtml() {
    const cash = G.cash || { rate: 5, min: 5000, value: 0 };

    const enough = G.points >= cash.min;

    return (
      '<div class="cash-top">' +
      "<p class=\"eyebrow\">POINTINGIZ</p>" +
      "<h3>" +
      num(G.points) +
      " <small>point</small></h3>" +
      '<p class="cash-value">≈ ' +
      money(G.points * cash.rate) +
      " so'm</p>" +
      "</div>" +
      '<div class="cash-note">1 point = ' +
      cash.rate +
      " so'm · eng kami " +
      num(cash.min) +
      " point</div>" +
      (enough
        ? '<label for="cashPoints">QANCHA POINT</label>' +
          '<input id="cashPoints" inputmode="numeric" placeholder="' +
          cash.min +
          '" value="' +
          Math.min(G.points, Math.max(cash.min, G.points)) +
          '" />' +
          '<p class="cash-out" id="cashOut"></p>' +
          '<label for="cashAccount" class="mt">KARTA YOKI TELEFON RAQAM</label>' +
          '<input id="cashAccount" inputmode="numeric" placeholder="8600 0000 0000 0000" />' +
          '<div class="cash-methods">' +
          '<button type="button" class="on" data-method="card">Karta</button>' +
          '<button type="button" data-method="click">Click</button>' +
          '<button type="button" data-method="payme">Payme</button>' +
          "</div>" +
          '<button class="primary" id="cashSend" type="button">' +
          "SO'ROV YUBORISH <span>→</span></button>" +
          '<small class="terms">So\'rov tekshirilgach pul yuboriladi. ' +
          "Rad etilsa pointlar qaytariladi.</small>"
        : '<div class="empty">Pulga aylantirish uchun kamida ' +
          num(cash.min) +
          " point kerak — yana " +
          num(cash.min - G.points) +
          " point to'plang.<br><br>Kunlik chelenjni bajaring!</div>") +
      (G.cashouts.length || G.orders.length
        ? '<p class="shop-title"><b>SO\'ROVLARIM</b></p>' +
          G.orders.map(orderRowHtml).join("") +
          G.cashouts.map(orderRowHtml).join("")
        : "")
    );
  }

  function renderShop() {
    const box = $("#shopBody");

    if (!box) return;

    if ($("#shopPoints")) $("#shopPoints").textContent = num(G.points);

    if (!loggedIn()) {
      box.innerHTML = '<div class="empty">Avval akkauntingizga kiring</div>';
      return;
    }

    box.innerHTML =
      G.shopTab === "cash" ? shopCashHtml() : shopSkinsHtml();

    document.querySelectorAll(".sheet-tabs button").forEach((button) => {
      button.classList.toggle("on", button.dataset.tab === G.shopTab);
    });

    updateCashOut();
  }

  function updateCashOut() {
    const input = $("#cashPoints");
    const out = $("#cashOut");

    if (!input || !out) return;

    const cash = G.cash || { rate: 5 };

    const value = Math.max(0, Math.floor(Number(input.value) || 0));

    out.textContent = "≈ " + money(value * cash.rate) + " so'm";
  }

  async function shopAction(body, doneText) {
    if (G.shopBusy || !loggedIn()) return;

    G.shopBusy = true;

    try {
      const { ok, data } = await api("/api/shop", {
        id: state.id,
        ...body
      });

      if (!ok) {
        toast(data.message || data.error || "Amal bajarilmadi");
      } else {
        applyShop(data);

        toast(data.message || doneText || "Bajarildi");

        // Naqish o'zgarsa xaritadagi hududlar yangilansin
        if (typeof fetchWorld === "function") fetchWorld();
      }

      renderShop();
    } catch {
      toast("Internet yo'q — keyinroq urinib ko'ring");
    }

    G.shopBusy = false;
  }

  // ==========================================================
  // BILDIRISHNOMALAR
  // ==========================================================

  function loadPushed() {
    try {
      const raw = localStorage.getItem("zonexPushed");

      const parsed = raw ? JSON.parse(raw) : {};

      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function savePushed() {
    try {
      // Ro'yxat cheksiz o'smasin — oxirgi 120 tasi yetadi
      const keys = Object.keys(G.pushed);

      if (keys.length > 120) {
        const trimmed = {};

        keys.slice(-120).forEach((key) => {
          trimmed[key] = G.pushed[key];
        });

        G.pushed = trimmed;
      }

      localStorage.setItem("zonexPushed", JSON.stringify(G.pushed));
    } catch {
      /* xotira to'la */
    }
  }

  // ---- telefonda chiqadigan bildirishnoma ----

  function isNativeApp() {
    const cap = window.Capacitor;

    return Boolean(cap && cap.isNativePlatform && cap.isNativePlatform());
  }

  function localNotifications() {
    const cap = window.Capacitor;

    if (!cap || !cap.registerPlugin) return null;

    if (!G.localNotif) {
      G.localNotif = cap.registerPlugin("LocalNotifications");
    }

    return G.localNotif;
  }

  async function askNotifPermission() {
    if (G.notifAsked) return;

    G.notifAsked = true;

    if (isNativeApp()) {
      const plugin = localNotifications();

      if (!plugin) return;

      try {
        const status = await plugin.checkPermissions();

        if (status && status.display !== "granted") {
          await plugin.requestPermissions();
        }
      } catch {
        /* eski Android — ruxsat so'ralmaydi */
      }

      // Android 8+ da bildirishnoma KANALSIZ ko'rinmaydi.
      // Kanal bir marta yaratiladi, keyingi chaqiruvlar
      // hech nima o'zgartirmaydi.
      try {
        await plugin.createChannel({
          id: NOTIF_CHANNEL,
          name: "ZONEX",
          description: "Hudud, do'stlik va xabar bildirishnomalari",
          importance: 4,
          visibility: 1,
          vibration: true
        });
      } catch {
        /* kanal allaqachon bor yoki eski Android */
      }

      return;
    }

    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        await Notification.requestPermission();
      }
    } catch {
      /* brauzer ruxsat bermadi */
    }
  }

  // Bitta bildirishnomani telefon ekraniga chiqaradi
  async function pushNotice(item) {
    const title = item.title || "ZONEX";
    const body = item.body || "";

    if (isNativeApp()) {
      const plugin = localNotifications();

      if (!plugin) return;

      try {
        await plugin.schedule({
          notifications: [
            {
              // Android bildirishnoma raqami butun son bo'lishi
              // kerak va ular bir-birini bosib ketmasin
              id: Math.floor(Math.random() * 2000000) + 1,
              title,
              body,
              channelId: NOTIF_CHANNEL
            }
          ]
        });
      } catch {
        /* ruxsat berilmagan */
      }

      return;
    }

    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        new Notification(title, { body, tag: item.id });
      } else {
        // Ilova ochiq turganda oddiy toast yetarli
        toast(title + " — " + body);
      }
    } catch {
      /* brauzer qo'llab-quvvatlamaydi */
    }
  }

  async function loadNotifs(quiet) {
    if (!loggedIn()) return;

    try {
      const { ok, data } = await api(
        "/api/notify?id=" + encodeURIComponent(state.id)
      );

      if (!ok) return;

      const items = Array.isArray(data.items) ? data.items : [];

      // Yangi (hali telefonga chiqarilmagan) o'qilmaganlar
      const fresh = items.filter(
        (item) => !item.read && !G.pushed[item.id]
      );

      G.notifs = items;
      G.unread = Number(data.unread) || 0;

      if (fresh.length) {
        fresh.forEach((item) => {
          G.pushed[item.id] = 1;
        });

        savePushed();

        // Eng yangisidan boshlab, ko'pi bilan 3 tasi
        fresh
          .slice(0, 3)
          .reverse()
          .forEach((item) => pushNotice(item));
      }

      renderBadges();

      if (!quiet) renderNotifs();
    } catch {
      /* internet yo'q */
    }
  }

  const NOTIF_ICON = {
    capture: "⚑",
    trim: "✂",
    friend_req: "☺",
    friend_ok: "☺",
    chat: "✉",
    reward: "✦",
    shop: "✦"
  };

  function notifRowHtml(item) {
    return (
      '<div class="notif' +
      (item.read ? "" : " new") +
      '" data-notif="' +
      esc(item.id) +
      '"' +
      (item.from ? ' data-from="' + esc(item.from) + '"' : "") +
      ">" +
      '<span class="notif-ico ' +
      esc(item.type) +
      '">' +
      (NOTIF_ICON[item.type] || "•") +
      "</span>" +
      '<span class="notif-text">' +
      "<strong>" +
      esc(item.title) +
      "</strong>" +
      "<small>" +
      esc(item.body) +
      "</small>" +
      "</span>" +
      '<i class="notif-time">' +
      ago(item.time) +
      "</i>" +
      "</div>"
    );
  }

  function renderNotifs() {
    const box = $("#notifBody");

    if (!box) return;

    if (!loggedIn()) {
      box.innerHTML = '<div class="empty">Avval akkauntingizga kiring</div>';
      return;
    }

    box.innerHTML = G.notifs.length
      ? G.notifs.map(notifRowHtml).join("")
      : '<div class="empty">Hozircha bildirishnoma yo\'q.<br><br>' +
        "Hududingizni kimdir bosib olsa yoki do'stlik so'rovi kelsa — " +
        "shu yerda va telefoningizda ko'rinadi.</div>";
  }

  // ==========================================================
  // NISHONLAR (badge)
  // ==========================================================

  function friendRequestCount() {
    try {
      const me = playerById(state.id);

      return me && Array.isArray(me.incoming) ? me.incoming.length : 0;
    } catch {
      return 0;
    }
  }

  function setCount(selector, count) {
    const node = $(selector);

    if (!node) return;

    node.hidden = !count;
    node.textContent = count > 9 ? "9+" : String(count);
  }

  function renderBadges() {
    const ready = G.daily
      ? G.daily.tasks.filter((task) => task.done && !task.claimed).length +
        (G.daily.bonus && G.daily.bonus.ready && !G.daily.bonus.taken ? 1 : 0)
      : 0;

    const friends = friendRequestCount();

    setCount("#challengeCount", ready);
    setCount("#notifCount", G.unread);
    setCount("#menuFriendCount", friends);
    setCount("#menuBadge", ready + G.unread + friends);

    if ($("#pointsValue")) $("#pointsValue").textContent = num(G.points);

    const pointsNew = $("#pointsNew");

    if (pointsNew) pointsNew.hidden = !ready;

    if ($("#menuCashHint") && G.cash) {
      $("#menuCashHint").textContent =
        num(G.points) + " point ≈ " + money(G.points * G.cash.rate) + " so'm";
    }
  }

  // client.js dunyoni yangilagach chaqiriladi
  function onWorld(me) {
    if (!me) return;

    if (Number.isFinite(Number(me.points))) G.points = Number(me.points);

    if (Number.isFinite(Number(me.notifUnread))) {
      // Serverdagi son o'zgargan bo'lsa — ro'yxatni yangilaymiz
      if (Number(me.notifUnread) !== G.unread) {
        G.unread = Number(me.notifUnread);

        loadNotifs(!$("#notifModal")?.classList.contains("active"));
      }
    }

    renderBadges();
  }

  // ==========================================================
  // QR KOD
  // ==========================================================

  function drawQr() {
    const box = $("#qrBox");

    if (!box || box.dataset.done === "1") return;

    try {
      box.innerHTML = window.ZonexQR.svg(SHARE_URL, {
        dark: "#10121a",
        light: "#ffffff"
      });

      box.dataset.done = "1";
    } catch (error) {
      box.innerHTML =
        '<p class="empty">QR kodni chizib bo\'lmadi — havolani ' +
        "qo'lda yozing</p>";
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(SHARE_URL);

      toast("Havoladan nusxa olindi ✓");
    } catch {
      toast(SHARE_URL);
    }
  }

  // ==========================================================
  // TUGMALAR
  // ==========================================================

  function openChallenge() {
    openModal("#challengeModal");

    renderChallenge();
    loadDaily();
  }

  function openShop(tab) {
    G.shopTab = tab === "cash" ? "cash" : "skins";

    openModal("#shopModal");

    renderShop();
    loadShop();
  }

  function openNotifs() {
    openModal("#notifModal");

    renderNotifs();
    loadNotifs();
  }

  function openQr() {
    openModal("#qrModal");

    drawQr();
  }

  function bind() {
    // ---- uchta nuqta ----
    $("#menuBtn")?.addEventListener("click", (event) => {
      event.stopPropagation();

      $("#menuPanel")?.classList.toggle("open");

      renderBadges();
    });

    document.addEventListener("click", (event) => {
      if (
        !event.target.closest("#menuPanel") &&
        !event.target.closest("#menuBtn")
      ) {
        closeMenu();
      }
    });

    $("#menuPanel")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-menu]");

      if (!row) return;

      closeMenu();

      switch (row.dataset.menu) {
        case "challenge":
          openChallenge();
          break;

        case "shop":
          openShop("skins");
          break;

        case "cash":
          openShop("cash");
          break;

        case "notif":
          openNotifs();
          break;

        case "friends":
        case "chat":
          // Do'stlar ro'yxati alohida oyna bo'lib ochiladi
          $("#friendsPanel")?.classList.add("as-window");

          if (typeof openFriends === "function") openFriends();
          break;

        case "qr":
          openQr();
          break;

        case "profile":
          if (typeof openProfile === "function") openProfile(state.id);
          break;
      }
    });

    // "Katta oyna" ko'rinishi faqat menyudan ochilganda bo'ladi.
    // Yopilganda ham, pastdagi suhbat tugmasidan ochilganda ham
    // panel odatdagi holiga qaytadi.
    ["#closeFriends", "#friendsBtn"].forEach((selector) => {
      $(selector)?.addEventListener("click", () => {
        $("#friendsPanel")?.classList.remove("as-window");
      });
    });

    // ---- pastki chap: point ----
    $("#pointsBtn")?.addEventListener("click", () => openShop("skins"));

    $("#closeQr")?.addEventListener("click", () => closeModal("#qrModal"));

    $("#qrModal")?.addEventListener("click", (event) => {
      if (event.target === $("#qrModal")) closeModal("#qrModal");
    });

    $("#copyQr")?.addEventListener("click", copyLink);

    $("#openQr")?.addEventListener("click", () => {
      window.open(SHARE_URL, "_blank", "noopener");
    });

    // ---- chelenj ----
    $("#closeChallenge")?.addEventListener("click", () =>
      closeModal("#challengeModal")
    );

    $("#challengeModal")?.addEventListener("click", (event) => {
      if (event.target === $("#challengeModal")) {
        closeModal("#challengeModal");
      }
    });

    $("#challengeBody")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-claim]");

      if (button) claimTask(button.dataset.claim);
    });

    // ---- do'kon ----
    $("#closeShop")?.addEventListener("click", () => closeModal("#shopModal"));

    $("#shopModal")?.addEventListener("click", (event) => {
      if (event.target === $("#shopModal")) closeModal("#shopModal");
    });

    document.querySelectorAll(".sheet-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        G.shopTab = button.dataset.tab;

        renderShop();
      });
    });

    $("#shopBody")?.addEventListener("click", (event) => {
      const buy = event.target.closest("[data-buy]");

      if (buy) {
        shopAction({ action: "buy", skinId: buy.dataset.buy });
        return;
      }

      const equip = event.target.closest("[data-equip]");

      if (equip) {
        shopAction({ action: "equip", skinId: equip.dataset.equip });
        return;
      }

      const order = event.target.closest("[data-order]");

      if (order) {
        const skin = skinById(order.dataset.order);

        const okay = window.confirm(
          (skin ? skin.name : "Naqish") +
            " — " +
            money(skin ? skin.price : 0) +
            " so'm.\n\nBuyurtma yuborilsinmi? To'lov tasdiqlangach " +
            "naqish hisobingizda ochiladi."
        );

        if (okay) {
          shopAction({ action: "order", skinId: order.dataset.order });
        }

        return;
      }

      const method = event.target.closest("[data-method]");

      if (method) {
        document.querySelectorAll("[data-method]").forEach((node) => {
          node.classList.toggle("on", node === method);
        });

        return;
      }

      if (event.target.closest("#cashSend")) {
        const points = Math.floor(Number($("#cashPoints")?.value) || 0);
        const account = String($("#cashAccount")?.value || "").trim();

        const active = document.querySelector("[data-method].on");

        shopAction({
          action: "cashout",
          points,
          account,
          method: active ? active.dataset.method : "card"
        });
      }
    });

    $("#shopBody")?.addEventListener("input", (event) => {
      if (event.target.id === "cashPoints") updateCashOut();
    });

    // ---- bildirishnomalar ----
    $("#closeNotif")?.addEventListener("click", () =>
      closeModal("#notifModal")
    );

    $("#notifModal")?.addEventListener("click", (event) => {
      if (event.target === $("#notifModal")) closeModal("#notifModal");
    });

    $("#readAllNotif")?.addEventListener("click", async () => {
      if (!loggedIn()) return;

      const { ok, data } = await api("/api/notify", {
        id: state.id,
        action: "readAll"
      });

      if (ok) {
        G.notifs = data.items || [];
        G.unread = 0;

        renderNotifs();
        renderBadges();
      }
    });

    $("#notifBody")?.addEventListener("click", async (event) => {
      const row = event.target.closest("[data-notif]");

      if (!row || !loggedIn()) return;

      const from = row.dataset.from;

      const { ok, data } = await api("/api/notify", {
        id: state.id,
        action: "read",
        notifId: row.dataset.notif
      });

      if (ok) {
        G.notifs = data.items || [];
        G.unread = Number(data.unread) || 0;

        renderNotifs();
        renderBadges();
      }

      // Kimdandir kelgan bo'lsa — o'sha odamning profili
      if (from && typeof openProfile === "function") {
        closeModal("#notifModal");

        openProfile(from);
      }
    });

    // Escape — ochiq oynani yopadi
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      ["#qrModal", "#shopModal", "#challengeModal", "#notifModal"].forEach(
        closeModal
      );

      closeMenu();
    });
  }

  // ==========================================================
  // ISHGA TUSHIRISH
  // ==========================================================

  function start() {
    if (!loggedIn()) return;

    G.pushed = loadPushed();

    askNotifPermission();

    loadDaily(true);
    loadShop(true);
    loadNotifs(true);

    clearInterval(G.notifTimer);
    clearInterval(G.dailyTimer);

    // Bildirishnoma — tez-tez, chelenj — kamroq
    G.notifTimer = setInterval(() => loadNotifs(true), 20000);
    G.dailyTimer = setInterval(() => loadDaily(true), 60000);

    G.started = true;
  }

  function stop() {
    clearInterval(G.notifTimer);
    clearInterval(G.dailyTimer);

    G.started = false;
    G.daily = null;
    G.points = 0;
    G.unread = 0;
    G.notifs = [];

    renderBadges();

    ["#qrModal", "#shopModal", "#challengeModal", "#notifModal"].forEach(
      closeModal
    );
  }

  // client.js shu nomlar orqali murojaat qiladi
  window.ZONEX_GAME = {
    start,
    stop,
    onWorld,
    paintZone,
    repaintZones,
    openShop,
    openChallenge
  };

  function boot() {
    bind();
    renderBadges();

    // Tugmachadagi kichkina QR darhol chizilsin
    drawQr();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
