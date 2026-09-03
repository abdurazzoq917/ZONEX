// hub.js
// ============================================================
// ZONEX — UY, XARITALAR, DARAJA, REYTING, KLAN, PLUS, REKLAMA
// ============================================================
//
// client.js va game.js dan KEYIN yuklanadi va ularning umumiy
// narsalaridan (state, api, toast, esc) foydalanadi.
//
// Ichida:
//
//   1) uy belgilash (MAJBURIY — o'yin shundan boshlanadi)
//   2) xarita tanlash (Beginner → World, daraja bilan ochiladi)
//   3) daraja chizig'i va "level up" xabari
//   4) reytinglar: global / shahar / do'stlar / klanlar
//      × kunlik / haftalik / oylik / umumiy
//   5) klanlar (team)
//   6) ZoneX Plus obunasi, ramkalar va xarita ko'rinishlari
//   7) hamkor joylar (reklama) va yaqindagi takliflar
//   8) maxfiylik sozlamasi
//   9) admin panel (foydalanuvchilar statistikasi)
// ============================================================

(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const H = {
    profile: null,
    level: null,
    maps: [],
    plus: null,

    rankScope: "global",
    rankPeriod: "weekly",
    rank: null,

    clans: null,
    admin: null,

    places: [],
    placesAds: true,
    contact: null,

    // Qaysi taklif qachon ko'rsatilgan (takror chiqmasin)
    shown: {},

    homeMap: null,
    homePick: null,
    homeMarker: null,

    busy: false,
    timer: null,
    guardTimer: null
  };

  const money = (value) =>
    String(Math.round(Number(value) || 0)).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      " "
    );

  function loggedIn() {
    return Boolean(state && state.id && state.token);
  }

  function me() {
    try {
      return playerById(state.id);
    } catch {
      return null;
    }
  }

  function openModal(id) {
    $("#menuPanel")?.classList.remove("open");

    $(id)?.classList.add("active");
  }

  function closeModal(id) {
    $(id)?.classList.remove("active");
  }

  // ==========================================================
  // 1) UY — MAJBURIY QADAM
  // ==========================================================
  //
  // Uy belgilanmaguncha o'yin boshlanmaydi. Uydan shahar
  // aniqlanadi va shahar reytingi shunga qarab tuziladi.
  //
  // Uyning aniq nuqtasi hech kimga ko'rsatilmaydi — u faqat
  // o'zingizning javobingizda qaytadi.
  // ==========================================================

  function openHome(force) {
    const modal = $("#homeModal");

    if (!modal) return;

    modal.classList.add("active");
    modal.classList.toggle("must", Boolean(force));

    // Majburiy holatda yopish tugmasi ko'rinmaydi
    const close = $("#closeHome");

    if (close) close.hidden = Boolean(force);

    setTimeout(buildHomeMap, 60);
  }

  function buildHomeMap() {
    const box = $("#homeMap");

    if (!box || typeof L === "undefined") return;

    const saved = H.profile && H.profile.home;

    const center = saved
      ? [saved.lat, saved.lng]
      : state.lastFix
      ? [state.lastFix[0], state.lastFix[1]]
      : [41.3111, 69.2797];

    if (!H.homeMap) {
      H.homeMap = L.map(box, {
        zoomControl: true,
        attributionControl: false
      }).setView(center, 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        maxNativeZoom: 19
      }).addTo(H.homeMap);

      // Xaritaning o'rtasidagi nishon turgan joy — uy joyi.
      // Alohida marker surish o'rniga xaritaning o'zi suriladi:
      // telefonda shunisi ancha qulay.
      H.homeMap.on("move", () => {
        const point = H.homeMap.getCenter();

        H.homePick = [point.lat, point.lng];

        const label = $("#homeCoords");

        if (label) {
          label.textContent =
            point.lat.toFixed(5) + ", " + point.lng.toFixed(5);
        }
      });
    }

    H.homeMap.invalidateSize();
    H.homeMap.setView(center, 16);

    H.homePick = center;

    const label = $("#homeCoords");

    if (label) label.textContent = center[0].toFixed(5) + ", " + center[1].toFixed(5);
  }

  async function saveHome() {
    if (!H.homePick || !loggedIn() || H.busy) return;

    H.busy = true;

    const name = String($("#homeName")?.value || "").trim();

    const { ok, data } = await api("/api/profile", {
      id: state.id,
      action: "home",
      lat: H.homePick[0],
      lng: H.homePick[1],
      name
    });

    H.busy = false;

    if (!ok) {
      toast(data.message || "Uyni saqlab bo'lmadi");
      return;
    }

    applyProfile(data);

    closeModal("#homeModal");

    toast(data.message || "Uy belgilandi");

    drawHome();

    if (typeof fetchWorld === "function") fetchWorld();
  }

  // Uy xaritada kichkina nishon bo'lib turadi (faqat o'zingizga)
  function drawHome() {
    if (!state.map || typeof L === "undefined") return;

    const home = H.profile && H.profile.home;

    if (!home) return;

    if (state.homeMarker) {
      state.homeMarker.setLatLng([home.lat, home.lng]);
      return;
    }

    state.homeMarker = L.marker([home.lat, home.lng], {
      icon: L.divIcon({
        className: "zonex-home-marker",
        html:
          '<div class="zx-home"><b>⌂</b><span>' +
          esc(home.name || "Uyim") +
          "</span></div>",
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      }),
      interactive: false
    }).addTo(state.map);
  }

  // ==========================================================
  // 2) PROFIL MA'LUMOTI (uy + xaritalar + daraja + Plus)
  // ==========================================================

  async function loadProfile(quiet) {
    if (!loggedIn()) return null;

    try {
      const { ok, data } = await api(
        "/api/profile?id=" + encodeURIComponent(state.id)
      );

      if (!ok) return null;

      applyProfile(data);

      if (!quiet) renderMaps();

      return data;
    } catch {
      return null;
    }
  }

  function applyProfile(data) {
    if (!data) return;

    H.profile = data;
    H.level = data.level || null;
    H.maps = Array.isArray(data.maps) ? data.maps : [];
    H.plus = data.plus || null;

    if (data.mapId && data.mapId !== state.mapId) {
      state.mapId = data.mapId;

      saveStored("zonexMap", data.mapId);
    }

    renderLevel();
    renderBrand();
    applyMapTheme();
    applyFrame();
    drawHome();
  }

  // ==========================================================
  // 3) DARAJA CHIZIG'I
  // ==========================================================

  function renderLevel() {
    const bar = $("#levelBar");

    if (!bar || !H.level) return;

    bar.hidden = false;

    const map = H.maps.find((item) => item.id === state.mapId);

    bar.innerHTML =
      '<button class="lvl-map" type="button" data-open="map">' +
      '<i style="background:' +
      esc((map && map.color) || "#1246d8") +
      '">' +
      esc((map && map.icon) || "○") +
      "</i>" +
      "<span>" +
      esc((map && map.name) || "Beginner Zone") +
      "</span>" +
      "</button>" +
      '<div class="lvl-wrap">' +
      '<div class="lvl-head"><b>Level ' +
      H.level.level +
      "</b><em>" +
      money(H.level.into) +
      " / " +
      money(H.level.need) +
      " XP</em></div>" +
      '<div class="lvl-track"><i style="width:' +
      H.level.percent +
      '%"></i></div>' +
      "</div>";
  }

  // Daraja oshdi / yangi xarita ochildi — katta xabar
  function celebrate(title, body) {
    const box = $("#levelUp");

    if (!box) return;

    box.innerHTML =
      '<div class="up-card"><b>' +
      esc(title) +
      "</b><span>" +
      esc(body) +
      "</span></div>";

    box.classList.add("show");

    clearTimeout(box._timer);

    box._timer = setTimeout(() => box.classList.remove("show"), 4200);
  }

  // client.js hudud yozgandan keyin chaqiradi
  function onTerritory(data) {
    if (!data) return;

    if (data.xp) {
      if (data.xp.view) {
        H.level = data.xp.view;
        renderLevel();
      }

      if (data.xp.levelUp) {
        celebrate("LEVEL " + data.xp.levelUp, "Yangi darajaga chiqdingiz!");
      }

      (data.xp.unlocked || []).forEach((map) => {
        celebrate("YANGI XARITA!", map.name + " ochildi");
      });

      if (data.xp.unlocked && data.xp.unlocked.length) loadProfile(true);
    }

    if (data.blocked && data.blocked.length) {
      const first = data.blocked[0];

      toast(
        first.newbie
          ? "Bu yangi o'yinchining hududi — unga tegib bo'lmaydi"
          : "Hudud himoyada — " +
            Math.ceil(first.left / 3600000) +
            " soatdan keyin urinib ko'ring"
      );
    }
  }

  // ==========================================================
  // 4) XARITA TANLASH
  // ==========================================================

  function renderMaps() {
    const box = $("#mapBody");

    if (!box) return;

    if (!H.maps.length) {
      box.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      return;
    }

    box.innerHTML =
      '<p class="sheet-note">Xaritalar DARAJA bilan ochiladi — pul bilan ' +
      "emas. Har bir xaritaning hududlari alohida saqlanadi.</p>" +
      H.maps
        .map(
          (map) =>
            '<button class="map-row' +
            (map.active ? " active" : "") +
            (map.open ? "" : " locked") +
            '" type="button" data-map="' +
            esc(map.id) +
            '"' +
            (map.open ? "" : " disabled") +
            ">" +
            '<i class="map-ico" style="background:' +
            esc(map.color) +
            '">' +
            esc(map.icon) +
            "</i>" +
            '<span class="map-text"><strong>' +
            esc(map.name) +
            "</strong><small>" +
            esc(map.about) +
            "</small></span>" +
            (map.open
              ? map.active
                ? '<b class="map-tag on">HOZIR</b>'
                : '<b class="map-tag">✓ OCHIQ</b>'
              : '<b class="map-tag off">🔒 L' + map.level + "</b>") +
            "</button>"
        )
        .join("");
  }

  async function pickMap(mapId) {
    if (!loggedIn() || H.busy) return;

    H.busy = true;

    const { ok, data } = await api("/api/profile", {
      id: state.id,
      action: "map",
      mapId
    });

    H.busy = false;

    if (!ok) {
      toast(data.message || "Xaritani almashtirib bo'lmadi");
      return;
    }

    applyProfile(data);
    renderMaps();

    toast(data.message || "Xarita almashtirildi");

    // Xarita almashdi — eski hududlarni tozalab, yangisini chizamiz
    if (state.zoneLayers) {
      state.zoneLayers.forEach((entry) => {
        try {
          entry.layer.remove();
        } catch {
          /* allaqachon olib tashlangan */
        }
      });

      state.zoneLayers.clear();
    }

    if (typeof fetchWorld === "function") fetchWorld();
  }

  // ==========================================================
  // 5) REYTINGLAR
  // ==========================================================

  const SCOPES = [
    { id: "global", name: "GLOBAL" },
    { id: "city", name: "SHAHAR" },
    { id: "friends", name: "DO'STLAR" },
    { id: "clans", name: "KLANLAR" }
  ];

  const PERIODS = [
    { id: "daily", name: "Kunlik" },
    { id: "weekly", name: "Haftalik" },
    { id: "monthly", name: "Oylik" },
    { id: "total", name: "Umumiy" }
  ];

  async function loadRank() {
    if (!loggedIn()) return;

    const box = $("#rankBody");

    if (box && !H.rank) box.innerHTML = '<div class="empty">Yuklanmoqda…</div>';

    try {
      const { ok, data } = await api(
        "/api/rank?id=" +
          encodeURIComponent(state.id) +
          "&scope=" +
          H.rankScope +
          "&period=" +
          H.rankPeriod
      );

      if (ok) {
        H.rank = data;
        renderRank();
      }
    } catch {
      /* internet yo'q */
    }
  }

  function medal(place) {
    if (place === 1) return "🥇";
    if (place === 2) return "🥈";
    if (place === 3) return "🥉";

    return String(place);
  }

  function rankRowHtml(row, isMe) {
    return (
      '<div class="rank-row' +
      (isMe ? " me" : "") +
      '" data-player-id="' +
      esc(row.id) +
      '">' +
      '<b class="rank-place">' +
      medal(row.place) +
      "</b>" +
      '<span class="rank-name">' +
      (row.plus ? '<em class="plus-dot">PLUS</em>' : "") +
      esc(row.name) +
      '<small>L' +
      row.level +
      " · " +
      esc(row.cityName || "") +
      "</small></span>" +
      '<span class="rank-val"><b>' +
      money(row.xp) +
      "</b><small>XP</small></span>" +
      "</div>"
    );
  }

  function renderRank() {
    const box = $("#rankBody");

    if (!box || !H.rank) return;

    document.querySelectorAll("[data-scope]").forEach((node) => {
      node.classList.toggle("on", node.dataset.scope === H.rankScope);
    });

    document.querySelectorAll("[data-period]").forEach((node) => {
      node.classList.toggle("on", node.dataset.period === H.rankPeriod);
    });

    // ---- klanlar ----
    if (H.rankScope === "clans") {
      const list = H.rank.clans || [];

      box.innerHTML = list.length
        ? list
            .map(
              (clan, index) =>
                '<div class="rank-row' +
                (clan.id === H.rank.myClanId ? " me" : "") +
                '">' +
                '<b class="rank-place">' +
                medal(index + 1) +
                "</b>" +
                '<span class="rank-name"><i class="clan-dot" style="background:' +
                esc(clan.color) +
                '"></i>[' +
                esc(clan.tag) +
                "] " +
                esc(clan.name) +
                "<small>" +
                clan.count +
                " a'zo</small></span>" +
                '<span class="rank-val"><b>' +
                money(clan.xp) +
                "</b><small>XP</small></span>" +
                "</div>"
            )
            .join("")
        : '<div class="empty">Hali klan yo\'q — birinchi bo\'lib oching!</div>';

      return;
    }

    const rows = H.rank.rows || [];

    const mine = H.rank.me;

    const inList = rows.some((row) => String(row.id) === String(state.id));

    box.innerHTML =
      // Shaharlar reytingi — global ro'yxat ustida
      (H.rankScope === "global" && (H.rank.cities || []).length
        ? '<p class="shop-title"><b>SHAHARLAR</b><span>' +
          PERIODS.find((p) => p.id === H.rankPeriod).name.toLowerCase() +
          "</span></p>" +
          '<div class="city-board">' +
          H.rank.cities
            .slice(0, 6)
            .map(
              (city, index) =>
                '<div class="city-row' +
                (city.id === H.rank.myCity ? " me" : "") +
                '"><b>' +
                (index + 1) +
                "</b><span>" +
                esc(city.name) +
                "</span><i>" +
                money(city.xp) +
                " XP</i><em>" +
                city.players +
                " o'yinchi</em></div>"
            )
            .join("") +
          "</div>"
        : "") +
      '<p class="shop-title"><b>O\'YINCHILAR</b><span>' +
      (H.rank.total || 0) +
      " ta</span></p>" +
      (rows.length
        ? rows
            .map((row) => rankRowHtml(row, String(row.id) === String(state.id)))
            .join("")
        : '<div class="empty">Bu davrda hali natija yo\'q — yurishni ' +
          "boshlang!</div>") +
      (mine && !inList && mine.place
        ? '<p class="shop-title"><b>SIZ</b></p>' + rankRowHtml(mine, true)
        : "");
  }

  // ==========================================================
  // 6) KLANLAR
  // ==========================================================

  async function loadClans() {
    if (!loggedIn()) return;

    try {
      const { ok, data } = await api(
        "/api/clans?id=" + encodeURIComponent(state.id)
      );

      if (ok) {
        H.clans = data;
        renderClans();
      }
    } catch {
      /* internet yo'q */
    }
  }

  function renderClans() {
    const box = $("#clanBody");

    if (!box) return;

    if (!H.clans) {
      box.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      return;
    }

    const mine = H.clans.mine;

    // ---- klanim bor ----
    if (mine) {
      const isOwner = String(mine.ownerId) === String(state.id);

      box.innerHTML =
        '<div class="clan-head" style="--clan:' +
        esc(mine.color) +
        '">' +
        "<b>[" +
        esc(mine.tag) +
        "]</b>" +
        "<strong>" +
        esc(mine.name) +
        "</strong>" +
        "<small>" +
        esc(mine.about || "Ta'rif yo'q") +
        "</small>" +
        '<div class="clan-stats">' +
        "<span><b>" +
        mine.count +
        "/" +
        mine.max +
        "</b>a'zo</span>" +
        "<span><b>" +
        money(mine.xp) +
        "</b>XP</span>" +
        "<span><b>" +
        money(mine.area) +
        "</b>m²</span>" +
        "</div></div>" +
        (isOwner && mine.requests && mine.requests.length
          ? '<p class="shop-title"><b>SO\'ROVLAR</b></p>' +
            mine.requests
              .map(
                (person) =>
                  '<div class="friend-row req"><span class="friend-info">' +
                  "<strong>" +
                  esc(person.name) +
                  "</strong><small>L" +
                  person.level +
                  "</small></span>" +
                  '<span class="req-actions">' +
                  '<button class="mini ok" type="button" data-clan-accept="' +
                  esc(person.id) +
                  '">✓</button>' +
                  '<button class="mini no" type="button" data-clan-decline="' +
                  esc(person.id) +
                  '">×</button></span></div>'
              )
              .join("")
          : "") +
        '<p class="shop-title"><b>A\'ZOLAR</b></p>' +
        mine.members
          .map(
            (member) =>
              '<div class="clan-member" data-player-id="' +
              esc(member.id) +
              '">' +
              '<b class="rank-place">' +
              (member.owner ? "👑" : "·") +
              "</b>" +
              '<span class="rank-name">' +
              esc(member.name) +
              "<small>L" +
              member.level +
              " · " +
              money(member.area) +
              " m²</small></span>" +
              '<span class="rank-val"><b>' +
              money(member.xp) +
              "</b><small>XP</small></span>" +
              (isOwner && !member.owner
                ? '<button class="clan-kick" type="button" data-clan-kick="' +
                  esc(member.id) +
                  '">×</button>'
                : "") +
              "</div>"
          )
          .join("") +
        '<button class="skin-off" type="button" data-clan-leave="1">' +
        (isOwner ? "Klanni yopish / chiqish" : "Klandan chiqish") +
        "</button>";

      return;
    }

    // ---- klanim yo'q ----
    box.innerHTML =
      (H.clans.canCreate
        ? '<div class="clan-new">' +
          "<p class=\"eyebrow\">YANGI KLAN</p>" +
          '<label for="clanName">KLAN NOMI</label>' +
          '<input id="clanName" maxlength="20" placeholder="ZoneX Team" />' +
          '<label for="clanTag" class="mt">QISQARTMA (2–5 harf)</label>' +
          '<input id="clanTag" maxlength="5" placeholder="ZNX" />' +
          '<label for="clanAbout" class="mt">TA\'RIF</label>' +
          '<input id="clanAbout" maxlength="120" placeholder="Eng kuchlilar jamoasi" />' +
          '<button class="primary" id="clanCreate" type="button">KLAN OCHISH <span>→</span></button>' +
          "</div>"
        : '<div class="empty">Klan ochish uchun ' +
          H.clans.minLevel +
          "-daraja kerak. Hozirgi darajangiz — " +
          H.clans.level +
          ".<br><br>Quyidagi klanlardan biriga qo'shilishingiz mumkin.</div>") +
      '<p class="shop-title"><b>KLANLAR</b><span>' +
      (H.clans.board || []).length +
      " ta</span></p>" +
      ((H.clans.board || []).length
        ? H.clans.board
            .map(
              (clan) =>
                '<div class="rank-row"><i class="clan-dot" style="background:' +
                esc(clan.color) +
                '"></i>' +
                '<span class="rank-name">[' +
                esc(clan.tag) +
                "] " +
                esc(clan.name) +
                "<small>" +
                clan.count +
                " a'zo · " +
                money(clan.xp) +
                " XP</small></span>" +
                '<button class="mini ok" type="button" data-clan-join="' +
                esc(clan.id) +
                '">KIRISH</button></div>'
            )
            .join("")
        : '<div class="empty">Hali klan yo\'q</div>');
  }

  async function clanAction(body, done) {
    if (!loggedIn() || H.busy) return;

    H.busy = true;

    const { ok, data } = await api("/api/clans", { id: state.id, ...body });

    H.busy = false;

    toast(data.message || (ok ? "Bajarildi" : "Amal bajarilmadi"));

    if (ok) {
      await loadClans();

      if (done) done(data);
    }
  }

  // ==========================================================
  // 7) ZONEX PLUS
  // ==========================================================

  async function loadPlus() {
    if (!loggedIn()) return;

    try {
      const { ok, data } = await api(
        "/api/plus?id=" + encodeURIComponent(state.id)
      );

      if (ok) {
        H.plus = data.plus;

        renderPlus();
        renderBrand();
      }
    } catch {
      /* internet yo'q */
    }
  }

  function renderPlus() {
    const box = $("#plusBody");

    if (!box) return;

    if (!H.plus) {
      box.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      return;
    }

    const plus = H.plus;

    const pending = (plus.orders || []).find(
      (order) => order.status === "pending"
    );

    box.innerHTML =
      '<div class="plus-hero' +
      (plus.active ? " on" : "") +
      '">' +
      '<div class="plus-logo"><span>ZONE</span><i>X</i><b>PLUS</b></div>' +
      (plus.active
        ? "<h3>Obuna faol</h3><p>" +
          plus.daysLeft +
          " kun qoldi · jami " +
          plus.months +
          " oy</p>"
        : "<h3>" +
          money(plus.price) +
          " so'm</h3><p>oyiga · " +
          plus.days +
          " kun</p>") +
      "</div>" +
      '<div class="perks">' +
      plus.perks
        .map(
          (perk) =>
            '<div class="perk"><i>' +
            esc(perk.icon) +
            "</i><span><strong>" +
            esc(perk.title) +
            "</strong><small>" +
            esc(perk.about) +
            "</small></span></div>"
        )
        .join("") +
      "</div>" +
      '<p class="sheet-note">ZoneX Plus o\'yinda KUCH bermaydi: hudud ' +
      "himoyasi uzaymaydi, XP tezlashmaydi va yopiq xaritalar ochilmaydi. " +
      "U faqat ko'rinish va qulaylik.</p>" +
      (plus.active
        ? framesHtml() + themesHtml()
        : pending
        ? '<div class="order-row"><span>' +
          money(pending.price) +
          " so'm · " +
          pending.months +
          ' oy<small>tasdiqlanishini kuting</small></span><b class="wait">KUTILMOQDA</b></div>' +
          '<button class="skin-off" type="button" data-plus-cancel="' +
          esc(pending.id) +
          '">So\'rovni bekor qilish</button>'
        : '<button class="primary" id="plusOrder" type="button">' +
          money(plus.price) +
          " SO'MGA OLISH <span>→</span></button>" +
          '<small class="terms">So\'rov yuborilgach admin to\'lovni ' +
          "tekshiradi va obuna yoqiladi.</small>");
  }

  function framesHtml() {
    return (
      '<p class="shop-title"><b>PROFIL RAMKASI</b></p>' +
      '<div class="frame-grid">' +
      H.plus.frames
        .map(
          (frame) =>
            '<button class="frame-pick' +
            (H.plus.frame === frame.id ? " on" : "") +
            '" type="button" data-frame="' +
            esc(frame.id) +
            '"><i class="fr' +
            (frame.css ? " fr-" + frame.css : "") +
            '"></i><span>' +
            esc(frame.name) +
            "</span></button>"
        )
        .join("") +
      "</div>"
    );
  }

  function themesHtml() {
    return (
      '<p class="shop-title"><b>XARITA KO\'RINISHI</b></p>' +
      '<div class="theme-grid">' +
      H.plus.themes
        .map(
          (theme) =>
            '<button class="theme-pick' +
            (H.plus.theme === theme.id ? " on" : "") +
            '" type="button" data-theme="' +
            esc(theme.id) +
            '"><i style="filter:' +
            esc(theme.filter) +
            '"></i><span>' +
            esc(theme.name) +
            "</span></button>"
        )
        .join("") +
      "</div>"
    );
  }

  // Xaritaning ko'rinishini qo'llaymiz
  function applyMapTheme() {
    if (!H.plus || !state.map) return;

    const theme = (H.plus.themes || []).find(
      (item) => item.id === H.plus.theme
    );

    const pane = document.querySelector(".leaflet-tile-pane");

    if (pane) {
      pane.style.filter = theme
        ? theme.filter
        : "saturate(.45) contrast(.95) brightness(1.06)";
    }
  }

  // Profil ramkasi (avatar atrofida)
  function applyFrame() {
    const frame = H.plus && H.plus.active ? H.plus.frame : "";

    document.body.dataset.frame = frame || "";
  }

  // Chapdagi ZONEX yozuvi — obunachida ZONEX PLUS bo'ladi
  function renderBrand() {
    const brand = $("#brandBtn");

    if (!brand) return;

    const active = Boolean(H.plus && H.plus.active);

    brand.classList.toggle("is-plus", active);

    if (active && !brand.querySelector("b")) {
      brand.insertAdjacentHTML("beforeend", "<b>PLUS</b>");
    }

    if (!active) brand.querySelector("b")?.remove();
  }

  // ==========================================================
  // 8) HAMKOR JOYLAR (REKLAMA)
  // ==========================================================

  async function loadPlaces() {
    if (!loggedIn() || !state.map) return;

    const point = state.lastFix;

    try {
      const bounds = state.map.getBounds();

      const query =
        "/api/places?id=" +
        encodeURIComponent(state.id) +
        "&south=" +
        bounds.getSouth() +
        "&north=" +
        bounds.getNorth() +
        "&west=" +
        bounds.getWest() +
        "&east=" +
        bounds.getEast() +
        (point ? "&lat=" + point[0] + "&lng=" + point[1] : "");

      const { ok, data } = await api(query);

      if (!ok) return;

      H.placesAds = data.ads !== false;
      H.contact = data.contact || H.contact;

      drawPlaces(data.places || []);

      (data.near || []).forEach(showOffer);
    } catch {
      /* internet yo'q */
    }
  }

  function drawPlaces(list) {
    if (!state.map || typeof L === "undefined") return;

    if (!H.markers) H.markers = new Map();

    const alive = new Set();

    list.forEach((place) => {
      alive.add(place.id);

      if (H.markers.has(place.id)) return;

      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          className: "zonex-place-marker",
          html:
            '<div class="zx-place"><b>📍</b><span>' +
            esc(place.name) +
            "</span></div>",
          iconSize: [1, 1],
          iconAnchor: [0, 0]
        })
      }).addTo(state.map);

      marker.on("click", () => showOffer({ ...place, meters: 0 }, true));

      H.markers.set(place.id, marker);
    });

    H.markers.forEach((marker, id) => {
      if (alive.has(id)) return;

      try {
        marker.remove();
      } catch {
        /* allaqachon olib tashlangan */
      }

      H.markers.delete(id);
    });
  }

  // Yaqindagi taklif — pastdan chiqadigan kartochka
  function showOffer(place, force) {
    const box = $("#offerCard");

    if (!box) return;

    const last = Number(H.shown[place.id] || 0);

    if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return;

    H.shown[place.id] = Date.now();

    try {
      localStorage.setItem("zonexOffers", JSON.stringify(H.shown));
    } catch {
      /* xotira to'la */
    }

    box.innerHTML =
      '<button class="offer-x" type="button" data-offer-close="1">×</button>' +
      '<span class="offer-tag">ZONEX HAMKORI</span>' +
      "<strong>" +
      esc(place.name) +
      "</strong>" +
      "<p>" +
      esc(place.offer || place.about || "") +
      "</p>" +
      (place.meters
        ? "<small>" + Math.round(place.meters) + " metr narida</small>"
        : "") +
      (place.contact ? "<small>" + esc(place.contact) + "</small>" : "");

    box.classList.add("show");

    // Biznesga hisobot: taklif ko'rsatildi
    api("/api/places", {
      id: state.id,
      action: "view",
      placeId: place.id
    }).catch(() => {});

    clearTimeout(box._timer);

    box._timer = setTimeout(() => box.classList.remove("show"), 12000);
  }

  // ==========================================================
  // 9) MAXFIYLIK
  // ==========================================================

  const PRIVACY = [
    {
      id: "public",
      name: "Hamma ko'radi",
      about: "Joyingiz taxminan ko'rsatiladi (aniq nuqta emas)"
    },
    {
      id: "friends",
      name: "Faqat do'stlar",
      about: "Do'stlaringizgina xaritada ko'radi"
    },
    {
      id: "private",
      name: "Hech kim",
      about: "Xaritada umuman ko'rinmaysiz"
    }
  ];

  function renderPrivacy() {
    const box = $("#privacyBody");

    if (!box) return;

    const now = (H.profile && H.profile.privacy) || "public";

    box.innerHTML =
      '<p class="sheet-note">Sizning ANIQ GPS nuqtangiz hech qachon ' +
      "boshqalarga berilmaydi — u har doim bir necha o'n metrga surib " +
      "ko'rsatiladi.</p>" +
      PRIVACY.map(
        (item) =>
          '<button class="map-row' +
          (now === item.id ? " active" : "") +
          '" type="button" data-privacy="' +
          esc(item.id) +
          '">' +
          '<i class="map-ico" style="background:' +
          (item.id === "public"
            ? "#22c55e"
            : item.id === "friends"
            ? "#3b82f6"
            : "#64748b") +
          '">◉</i>' +
          '<span class="map-text"><strong>' +
          esc(item.name) +
          "</strong><small>" +
          esc(item.about) +
          "</small></span>" +
          (now === item.id ? '<b class="map-tag on">TANLANGAN</b>' : "") +
          "</button>"
      ).join("") +
      '<p class="shop-title"><b>UY</b></p>' +
      '<button class="map-row" type="button" data-open="home">' +
      '<i class="map-ico" style="background:#f59e0b">⌂</i>' +
      '<span class="map-text"><strong>' +
      esc((H.profile && H.profile.home && H.profile.home.name) || "Uyim") +
      "</strong><small>" +
      esc((H.profile && H.profile.cityName) || "Belgilanmagan") +
      "</small></span></button>";
  }

  async function setPrivacy(value) {
    if (!loggedIn() || H.busy) return;

    H.busy = true;

    const { ok, data } = await api("/api/profile", {
      id: state.id,
      action: "privacy",
      privacy: value
    });

    H.busy = false;

    if (ok) {
      applyProfile(data);
      renderPrivacy();
    }

    toast(data.message || "Saqlandi");
  }

  // ==========================================================
  // 10) ADMIN PANEL
  // ==========================================================

  function isAdmin() {
    const player = me();

    return Boolean(player && player.role === "admin");
  }

  async function loadAdmin() {
    if (!loggedIn()) return;

    const box = $("#adminBody");

    if (box) box.innerHTML = '<div class="empty">Yuklanmoqda…</div>';

    try {
      const key = String(state.adminKey || "");

      const { ok, data } = await api(
        "/api/admin?id=" +
          encodeURIComponent(state.id) +
          (key ? "&key=" + encodeURIComponent(key) : "")
      );

      if (!ok) {
        if (!box) return;

        // Server ADMIN_KEY talab qilyapti — uni bir marta
        // so'raymiz va qurilmada saqlaymiz
        if (data.error === "not_admin") {
          box.innerHTML =
            '<div class="clan-new">' +
            "<p class=\"eyebrow\">ADMIN MAXFIY SO'ZI</p>" +
            '<p class="sheet-note">Serverda ADMIN_KEY qo\'yilgan. ' +
            "Panelni ochish uchun o'sha so'zni bir marta kiriting — " +
            "u shu qurilmada saqlanadi.</p>" +
            '<input id="adminKey" type="password" placeholder="ADMIN_KEY" />' +
            '<button class="primary" id="adminKeySave" type="button">' +
            "KIRISH <span>→</span></button></div>";

          return;
        }

        box.innerHTML =
          '<div class="empty">' + esc(data.message || "Ruxsat yo'q") + "</div>";

        return;
      }

      H.admin = data;

      renderAdmin();
    } catch {
      if (box) box.innerHTML = '<div class="empty">Internet yo\'q</div>';
    }
  }

  function statHtml(label, value, hint) {
    return (
      '<div class="stat"><b>' +
      money(value) +
      "</b><span>" +
      esc(label) +
      "</span>" +
      (hint ? "<small>" + esc(hint) + "</small>" : "") +
      "</div>"
    );
  }

  // Kutilayotgan to'lov qatori — tasdiqlash / rad etish bilan
  function payRowHtml(kind, order, title, note) {
    return (
      '<div class="pay-row">' +
      "<span>" +
      esc(title) +
      "<small>" +
      esc(note) +
      "</small></span>" +
      '<span class="pay-acts">' +
      '<button class="mini ok" type="button" data-pay="approve" ' +
      'data-kind="' +
      kind +
      '" data-target="' +
      esc(order.playerId) +
      '" data-order="' +
      esc(order.id) +
      '">✓</button>' +
      '<button class="mini no" type="button" data-pay="reject" ' +
      'data-kind="' +
      kind +
      '" data-target="' +
      esc(order.playerId) +
      '" data-order="' +
      esc(order.id) +
      '">×</button>' +
      "</span></div>"
    );
  }

  // To'lovni tasdiqlash / rad etish
  async function decidePay(node) {
    const kind = node.dataset.kind;

    const approve = node.dataset.pay === "approve";

    const url = kind === "plus" ? "/api/plus" : "/api/shop";

    const { ok, data } = await api(url, {
      id: state.id,
      action: "admin",
      do: approve ? "approve" : "reject",
      target: node.dataset.target,
      orderId: node.dataset.order,
      key: state.adminKey || ""
    });

    toast(data.message || (ok ? "Bajarildi" : "Xatolik"));

    if (ok) loadAdmin();
  }

  function renderAdmin() {
    const box = $("#adminBody");

    if (!box || !H.admin) return;

    const c = H.admin.counts;
    const t = H.admin.totals;

    const pending =
      H.admin.pending.plus.length +
      H.admin.pending.skins.length +
      H.admin.pending.cashouts.length;

    box.innerHTML =
      '<p class="shop-title"><b>FOYDALANUVCHILAR</b></p>' +
      '<div class="stat-grid">' +
      statHtml("Jami ro'yxatdan o'tgan", c.total) +
      statHtml("Hozir onlayn", c.online) +
      statHtml("Bugun qo'shilgan", c.today) +
      statHtml("Bu hafta qo'shilgan", c.week) +
      statHtml("Hafta ichida faol", c.activeWeek) +
      statHtml("Oy ichida faol", c.activeMonth) +
      statHtml("Uy belgilagan", c.withHome) +
      statHtml("Email biriktirgan", c.withEmail) +
      statHtml("ZoneX Plus", c.plus) +
      statHtml("Banlangan", c.banned) +
      "</div>" +
      '<p class="shop-title"><b>O\'YIN</b></p>' +
      '<div class="stat-grid">' +
      statHtml("Hududlar", t.territories) +
      statHtml("Jami maydon", Math.round(t.area), "m²") +
      statHtml("Yurilgan yo'l", Math.round(t.distance / 1000), "km") +
      statHtml("Jami XP", t.xp) +
      statHtml("Muomaladagi point", t.points) +
      statHtml("Berilgan point", t.pointsEarned) +
      "</div>" +
      (pending
        ? '<p class="shop-title"><b>KUTILAYOTGAN TO\'LOVLAR</b><span>' +
          pending +
          " ta</span></p>" +
          H.admin.pending.plus
            .map((order) =>
              payRowHtml(
                "plus",
                order,
                "ZoneX Plus · @" + order.name,
                money(order.price) + " so'm · " + order.months + " oy"
              )
            )
            .join("") +
          H.admin.pending.skins
            .map((order) =>
              payRowHtml(
                "skin",
                order,
                "Naqish · @" + order.name,
                money(order.price) + " so'm"
              )
            )
            .join("") +
          H.admin.pending.cashouts
            .map((order) =>
              payRowHtml(
                "cash",
                order,
                "Pul yechish · @" + order.name,
                money(order.points) +
                  " P → " +
                  money(order.amount) +
                  " so'm · " +
                  order.account
              )
            )
            .join("")
        : "") +
      '<p class="shop-title"><b>XARITALAR</b></p>' +
      H.admin.byMap
        .map(
          (map) =>
            '<div class="order-row"><span>' +
            esc(map.name) +
            "<small>L" +
            map.level +
            " · " +
            map.players +
            " o'yinchi</small></span><b>" +
            map.territories +
            " hudud</b></div>"
        )
        .join("") +
      '<p class="shop-title"><b>SHAHARLAR</b></p>' +
      H.admin.byCity
        .map(
          (city) =>
            '<div class="order-row"><span>' +
            esc(city.name) +
            "</span><b>" +
            city.players +
            " o'yinchi</b></div>"
        )
        .join("") +
      '<p class="shop-title"><b>HAMKOR JOYLAR</b><span>' +
      H.admin.places.length +
      " ta</span></p>" +
      (H.admin.places.length
        ? H.admin.places
            .map(
              (place) =>
                '<div class="order-row"><span>' +
                esc(place.name) +
                "<small>" +
                esc(place.offer || "") +
                "</small></span><b>" +
                place.views +
                " ko'rildi</b></div>"
            )
            .join("")
        : '<div class="empty">Hamkor joy yo\'q</div>') +
      '<p class="shop-title"><b>OXIRGI QO\'SHILGANLAR</b></p>' +
      H.admin.newest
        .map(
          (person) =>
            '<div class="order-row" data-player-id="' +
            esc(person.id) +
            '"><span>@' +
            esc(person.name) +
            "<small>L" +
            person.level +
            " · " +
            esc(person.city) +
            (person.plus ? " · PLUS" : "") +
            "</small></span><b>" +
            (person.online ? "onlayn" : "") +
            "</b></div>"
        )
        .join("") +
      '<p class="sheet-note">Baza: ' +
      esc(H.admin.storage.mode.toUpperCase()) +
      "</p>";
  }

  // ==========================================================
  // TUGMALAR
  // ==========================================================

  function bind() {
    // ---- menyu qatorlari ----
    $("#menuPanel")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-hub]");

      if (!row) return;

      $("#menuPanel")?.classList.remove("open");

      openHub(row.dataset.hub);
    });

    // ---- daraja chizig'idagi xarita tugmasi ----
    $("#levelBar")?.addEventListener("click", (event) => {
      if (event.target.closest('[data-open="map"]')) openHub("map");
    });

    // ---- uy ----
    $("#closeHome")?.addEventListener("click", () => closeModal("#homeModal"));

    $("#saveHome")?.addEventListener("click", saveHome);

    $("#useMyLocation")?.addEventListener("click", () => {
      if (state.lastFix && H.homeMap) {
        H.homeMap.setView([state.lastFix[0], state.lastFix[1]], 17);
      } else {
        toast("Joylashuv hali aniqlanmadi");
      }
    });

    // ---- xaritalar ----
    $("#closeMap")?.addEventListener("click", () => closeModal("#mapModal"));

    $("#mapBody")?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-map]");

      if (row) pickMap(row.dataset.map);
    });

    // ---- reyting ----
    $("#closeRank")?.addEventListener("click", () => closeModal("#rankModal"));

    $("#rankModal")?.addEventListener("click", (event) => {
      const scope = event.target.closest("[data-scope]");

      if (scope) {
        H.rankScope = scope.dataset.scope;
        H.rank = null;

        loadRank();

        return;
      }

      const period = event.target.closest("[data-period]");

      if (period) {
        H.rankPeriod = period.dataset.period;
        H.rank = null;

        loadRank();

        return;
      }

      const row = event.target.closest("[data-player-id]");

      if (row && typeof openProfile === "function") {
        closeModal("#rankModal");

        openProfile(row.dataset.playerId);
      }
    });

    // ---- klanlar ----
    $("#closeClan")?.addEventListener("click", () => closeModal("#clanModal"));

    $("#clanBody")?.addEventListener("click", (event) => {
      const create = event.target.closest("#clanCreate");

      if (create) {
        clanAction({
          action: "create",
          name: $("#clanName")?.value,
          tag: $("#clanTag")?.value,
          about: $("#clanAbout")?.value,
          open: true
        });

        return;
      }

      const join = event.target.closest("[data-clan-join]");

      if (join) {
        clanAction({ action: "join", clanId: join.dataset.clanJoin });
        return;
      }

      const accept = event.target.closest("[data-clan-accept]");

      if (accept) {
        clanAction({ action: "accept", target: accept.dataset.clanAccept });
        return;
      }

      const decline = event.target.closest("[data-clan-decline]");

      if (decline) {
        clanAction({ action: "decline", target: decline.dataset.clanDecline });
        return;
      }

      const kick = event.target.closest("[data-clan-kick]");

      if (kick) {
        clanAction({ action: "kick", target: kick.dataset.clanKick });
        return;
      }

      if (event.target.closest("[data-clan-leave]")) {
        clanAction({ action: "leave" });
        return;
      }

      const person = event.target.closest("[data-player-id]");

      if (person && typeof openProfile === "function") {
        closeModal("#clanModal");

        openProfile(person.dataset.playerId);
      }
    });

    // ---- Plus ----
    $("#closePlus")?.addEventListener("click", () => closeModal("#plusModal"));

    $("#plusBody")?.addEventListener("click", async (event) => {
      if (event.target.closest("#plusOrder")) {
        const { ok, data } = await api("/api/plus", {
          id: state.id,
          action: "order",
          months: 1
        });

        toast(data.message || (ok ? "So'rov yuborildi" : "Xatolik"));

        loadPlus();

        return;
      }

      const cancel = event.target.closest("[data-plus-cancel]");

      if (cancel) {
        const { data } = await api("/api/plus", {
          id: state.id,
          action: "cancel",
          orderId: cancel.dataset.plusCancel
        });

        toast(data.message || "Bekor qilindi");

        loadPlus();

        return;
      }

      // MUHIM: `.frame-pick` bo'yicha qidiramiz, `[data-frame]`
      // bo'yicha EMAS. Ramka tanlanganda <body> ga ham
      // `data-frame` qo'yiladi (CSS uchun) va `closest` shu
      // sababli HAR QANDAY bosishni ramka deb topib olardi.
      const frame = event.target.closest(".frame-pick");

      if (frame) {
        const { ok, data } = await api("/api/profile", {
          id: state.id,
          action: "frame",
          frame: frame.dataset.frame
        });

        toast(data.message || "Saqlandi");

        if (ok) {
          applyProfile(data);

          H.plus = data.plus;

          renderPlus();
        }

        return;
      }

      const theme = event.target.closest(".theme-pick");

      if (theme) {
        const { ok, data } = await api("/api/profile", {
          id: state.id,
          action: "theme",
          theme: theme.dataset.theme
        });

        toast(data.message || "Saqlandi");

        if (ok) {
          applyProfile(data);

          H.plus = data.plus;

          renderPlus();
        }
      }
    });

    // ---- maxfiylik ----
    $("#closePrivacy")?.addEventListener("click", () =>
      closeModal("#privacyModal")
    );

    $("#privacyBody")?.addEventListener("click", (event) => {
      const pick = event.target.closest("[data-privacy]");

      if (pick) {
        setPrivacy(pick.dataset.privacy);
        return;
      }

      if (event.target.closest('[data-open="home"]')) {
        closeModal("#privacyModal");

        openHome(false);
      }
    });

    // ---- admin ----
    $("#closeAdmin")?.addEventListener("click", () => closeModal("#adminModal"));

    $("#adminBody")?.addEventListener("click", (event) => {
      // Maxfiy so'zni saqlash
      if (event.target.closest("#adminKeySave")) {
        const key = String($("#adminKey")?.value || "").trim();

        if (!key) return;

        state.adminKey = key;

        saveStored("zonexAdminKey", key);

        loadAdmin();

        return;
      }

      const pay = event.target.closest("[data-pay]");

      if (pay) {
        decidePay(pay);
        return;
      }

      const row = event.target.closest("[data-player-id]");

      if (row && typeof openProfile === "function") {
        closeModal("#adminModal");

        openProfile(row.dataset.playerId);
      }
    });

    // ---- reklama kartochkasi ----
    $("#offerCard")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-offer-close]")) {
        $("#offerCard")?.classList.remove("show");
      }
    });

    // ---- reklama uchun murojaat ----
    $("#adContact")?.addEventListener("click", () => {
      const url = (H.contact && H.contact.url) || "https://t.me/Abduumalikov_7";

      window.open(url, "_blank", "noopener");
    });

    // ---- fon bosilsa yopilsin ----
    [
      "#mapModal",
      "#rankModal",
      "#clanModal",
      "#plusModal",
      "#privacyModal",
      "#adminModal"
    ].forEach((id) => {
      $(id)?.addEventListener("click", (event) => {
        if (event.target === $(id)) closeModal(id);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      [
        "#mapModal",
        "#rankModal",
        "#clanModal",
        "#plusModal",
        "#privacyModal",
        "#adminModal"
      ].forEach(closeModal);
    });
  }

  function openHub(what) {
    switch (what) {
      case "map":
        openModal("#mapModal");
        renderMaps();
        loadProfile();
        break;

      case "rank":
        openModal("#rankModal");
        renderRank();
        loadRank();
        break;

      case "clan":
        openModal("#clanModal");
        renderClans();
        loadClans();
        break;

      case "plus":
        openModal("#plusModal");
        renderPlus();
        loadPlus();
        break;

      case "privacy":
        openModal("#privacyModal");
        renderPrivacy();
        break;

      case "home":
        openHome(false);
        break;

      case "admin":
        openModal("#adminModal");
        loadAdmin();
        break;
    }
  }

  // ==========================================================
  // ISHGA TUSHIRISH
  // ==========================================================

  async function start() {
    if (!loggedIn()) return;

    try {
      const raw = localStorage.getItem("zonexOffers");

      H.shown = raw ? JSON.parse(raw) || {} : {};
    } catch {
      H.shown = {};
    }

    const data = await loadProfile(true);

    // UY MAJBURIY — belgilanmagan bo'lsa oyna ochiladi va
    // yopilmaydi
    if (data && !data.home) {
      openHome(true);
    }

    // Admin bo'lsa menyuda admin paneli ko'rinadi
    const adminRow = $('[data-hub="admin"]');

    if (adminRow) adminRow.hidden = !isAdmin();

    loadPlus();
    loadPlaces();

    clearInterval(H.timer);

    H.timer = setInterval(() => {
      loadProfile(true);
      loadPlaces();
    }, 60000);

    // Himoya soati har sekundda yangilanib tursin
    clearInterval(H.guardTimer);

    H.guardTimer = setInterval(tickGuards, 1000);
  }

  // Hudud ustidagi himoya soatini sanab turadi
  function tickGuards() {
    if (!state.zoneLayers || !state.zoneLayers.size) return;

    const now = Date.now();

    state.zoneLayers.forEach((entry) => {
      const guard = entry.territory && entry.territory.defense;

      if (!guard || !guard.until) return;

      guard.left = Math.max(0, guard.until - now);

      if (guard.left === 0 && guard.state === "DEFENDED") {
        guard.state = "VULNERABLE";
      }
    });

    if (typeof refreshZoneLabels === "function") refreshZoneLabels();
  }

  function stop() {
    clearInterval(H.timer);
    clearInterval(H.guardTimer);

    H.profile = null;
    H.level = null;
    H.plus = null;
    H.rank = null;
    H.clans = null;
    H.admin = null;

    if ($("#levelBar")) $("#levelBar").hidden = true;

    [
      "#homeModal",
      "#mapModal",
      "#rankModal",
      "#clanModal",
      "#plusModal",
      "#privacyModal",
      "#adminModal"
    ].forEach(closeModal);
  }

  // Xarita tayyor bo'lganda (client.js chaqiradi)
  function onMap() {
    applyMapTheme();
    drawHome();
  }

  window.ZONEX_HUB = {
    start,
    stop,
    onMap,
    onTerritory,
    openHub,
    loadPlaces
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
