// api/shop.js
// ============================================================
// DO'KON — NAQISHLAR VA POINTNI PULGA AYLANTIRISH
// ============================================================
//
//   GET  /api/shop?id=<men>
//        katalog + pointim + menda bor naqishlar
//
//   POST /api/shop { id, action, ... }
//
//     action "buy"     { skinId }
//            Epik / mifik naqishni POINT bilan sotib olish.
//            Legendar naqishni point bilan OLIB BO'LMAYDI.
//
//     action "equip"   { skinId }
//            Naqishni hududlarga qo'yish ("" — olib tashlash).
//
//     action "order"   { skinId }
//            Legendar naqish uchun PUL buyurtmasi. Buyurtma
//            "pending" bo'lib turadi — admin tasdiqlagach
//            naqish ochiladi.
//
//     action "cashout" { points, method, account }
//            Pointni pulga aylantirish so'rovi.
//
//     action "admin"   { do: "list" | "approve" | "reject",
//                        target, orderId }
//            Faqat admin uchun: buyurtma va to'lovlarni
//            ko'rish va tasdiqlash.
//
// Narx va daraja faqat api/_skins.js da turadi — brauzerdan
// o'zgartirib bo'lmaydi.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  publicPlayer,
  publicList,
  isBanned,
  banInfo,
  adminAllowed,
  skins,
  notify
} = require("./_store");

const { guard } = require("./_auth");

function makeOrderId(prefix) {
  return (
    prefix +
    "-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

// Katalog: har bir naqish uchun "menda bormi" belgisi bilan
function catalogFor(player) {
  const owned = new Set(player ? player.skins : []);

  const pending = new Set(
    (player && Array.isArray(player.orders) ? player.orders : [])
      .filter((order) => order.status === "pending")
      .map((order) => order.skinId)
  );

  return skins.SKINS.map((skin) => ({
    id: skin.id,
    name: skin.name,
    rarity: skin.rarity,
    about: skin.about,
    pattern: skin.pattern,

    // Epik / mifik — point; legendar — pul
    points: skins.isMoneySkin(skin) ? 0 : skin.points,
    price: skins.isMoneySkin(skin) ? skin.price : 0,

    owned: owned.has(skin.id),
    pending: pending.has(skin.id)
  }));
}

function shopView(player, id) {
  return {
    ok: true,

    points: player.points,
    earned: player.earned,
    skin: player.skin,
    skins: player.skins,

    catalog: catalogFor(player),

    // Pointni pulga aylantirish shartlari
    cash: {
      rate: skins.POINT_UZS,
      min: skins.CASHOUT_MIN,
      value: Math.floor(player.points * skins.POINT_UZS)
    },

    orders: player.orders,
    cashouts: player.cashouts,

    player: publicPlayer(player, id),
    time: Date.now()
  };
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    // ---------------------------------------------------------
    // KATALOG
    // ---------------------------------------------------------

    if (req.method === "GET") {
      const params = new URLSearchParams(req.url.split("?")[1] || "");

      const id = String(params.get("id") || "").trim();

      const players = await readPlayers();

      const check = guard(players, id, req, null);

      if (!check.ok) {
        return json(res, check.status, {
          error: check.error,
          message: check.message
        });
      }

      return json(res, 200, shopView(check.player, id));
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();

    if (!id) {
      return json(res, 400, { error: "ID kerak" });
    }

    const players = await readPlayers();

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const player = check.player;

    if (isBanned(player)) {
      return json(res, 403, {
        error: "banned",
        message: "Siz banlangansiz",
        ban: banInfo(player)
      });
    }

    switch (action) {
      // -----------------------------------------------------
      // POINT BILAN SOTIB OLISH (epik / mifik)
      // -----------------------------------------------------
      case "buy": {
        const skin = skins.skinById(body.skinId);

        if (!skin) {
          return json(res, 404, { error: "Bunday naqish yo'q" });
        }

        if (skins.isMoneySkin(skin)) {
          return json(res, 400, {
            error: "money_only",
            message:
              "Legendar naqish faqat pulga sotiladi — pastdagi " +
              "«Pulga olish» tugmasidan foydalaning"
          });
        }

        if (player.skins.includes(skin.id)) {
          return json(res, 400, {
            error: "owned",
            message: "Bu naqish allaqachon sizda"
          });
        }

        if (player.points < skin.points) {
          return json(res, 400, {
            error: "no_points",
            message:
              "Point yetmayapti — yana " +
              (skin.points - player.points) +
              " point kerak"
          });
        }

        player.points -= skin.points;
        player.skins.push(skin.id);

        // Sotib olingan naqish darhol qo'yiladi
        player.skin = skin.id;

        notify.notify(player, {
          type: "shop",
          title: "Yangi naqish",
          body: skin.name + " sotib olindi va hududlaringizga qo'yildi"
        });

        await writePlayers([player]);

        return json(res, 200, {
          ...shopView(player, id),
          message: skin.name + " sizniki!",
          players: publicList(players, id)
        });
      }

      // -----------------------------------------------------
      // NAQISHNI QO'YISH / OLIB TASHLASH
      // -----------------------------------------------------
      case "equip": {
        const want = String(body.skinId || "");

        if (want && !player.skins.includes(want)) {
          return json(res, 400, {
            error: "not_owned",
            message: "Bu naqish sizda yo'q"
          });
        }

        player.skin = want;

        await writePlayers([player]);

        return json(res, 200, {
          ...shopView(player, id),
          message: want ? "Naqish qo'yildi" : "Naqish olib tashlandi",
          players: publicList(players, id)
        });
      }

      // -----------------------------------------------------
      // LEGENDAR NAQISH — PUL BUYURTMASI
      // -----------------------------------------------------
      case "order": {
        const skin = skins.skinById(body.skinId);

        if (!skin || !skins.isMoneySkin(skin)) {
          return json(res, 400, {
            error: "not_money",
            message: "Bu naqish pulga sotilmaydi"
          });
        }

        if (player.skins.includes(skin.id)) {
          return json(res, 400, {
            error: "owned",
            message: "Bu naqish allaqachon sizda"
          });
        }

        const already = player.orders.find(
          (order) => order.skinId === skin.id && order.status === "pending"
        );

        if (already) {
          return json(res, 400, {
            error: "pending",
            message: "Bu naqish uchun buyurtmangiz allaqachon kutmoqda"
          });
        }

        player.orders.unshift({
          id: makeOrderId("o"),
          skinId: skin.id,
          price: skin.price,
          status: "pending",
          time: Date.now(),
          note: ""
        });

        notify.notify(player, {
          type: "shop",
          title: "Buyurtma qabul qilindi",
          body:
            skin.name +
            " — " +
            skins.moneyText(skin.price) +
            " so'm. To'lov tasdiqlangach naqish ochiladi."
        });

        await writePlayers([player]);

        return json(res, 200, {
          ...shopView(player, id),
          message:
            "Buyurtma yuborildi — " +
            skins.moneyText(skin.price) +
            " so'm to'langach naqish ochiladi"
        });
      }

      // -----------------------------------------------------
      // POINTNI PULGA AYLANTIRISH
      // -----------------------------------------------------
      case "cashout": {
        const want = Math.floor(Number(body.points) || 0);

        const method = String(body.method || "").trim().slice(0, 20);
        const account = String(body.account || "").trim().slice(0, 40);

        if (want < skins.CASHOUT_MIN) {
          return json(res, 400, {
            error: "too_small",
            message:
              "Eng kami " + skins.CASHOUT_MIN + " point pulga aylantiriladi"
          });
        }

        if (want > player.points) {
          return json(res, 400, {
            error: "no_points",
            message: "Sizda bunchalik point yo'q"
          });
        }

        if (account.length < 5) {
          return json(res, 400, {
            error: "no_account",
            message: "Karta yoki telefon raqamini to'liq yozing"
          });
        }

        const amount = Math.floor(want * skins.POINT_UZS);

        // Point DARHOL yechiladi — ikki marta yuborib bo'lmaydi.
        // So'rov rad etilsa, admin uni qaytaradi.
        player.points -= want;

        player.cashouts.unshift({
          id: makeOrderId("c"),
          points: want,
          amount,
          method: method || "card",
          account,
          status: "pending",
          time: Date.now(),
          note: ""
        });

        notify.notify(player, {
          type: "shop",
          title: "To'lov so'rovi yuborildi",
          body:
            want +
            " point → " +
            skins.moneyText(amount) +
            " so'm. Tekshirilgach hisobingizga o'tkaziladi."
        });

        await writePlayers([player]);

        return json(res, 200, {
          ...shopView(player, id),
          message:
            skins.moneyText(amount) + " so'mlik so'rov qabul qilindi"
        });
      }

      // -----------------------------------------------------
      // ADMIN: BUYURTMALARNI KO'RISH VA TASDIQLASH
      // -----------------------------------------------------
      case "admin": {
        if (!adminAllowed(player, body.key)) {
          return json(res, 403, {
            error: "not_admin",
            message: "Bu amal faqat admin uchun"
          });
        }

        const task = String(body.do || "list");

        // ---- barcha kutayotgan so'rovlar ----
        if (task === "list") {
          const orders = [];
          const cashouts = [];

          Object.values(players).forEach((other) => {
            other.orders.forEach((order) => {
              if (order.status !== "pending") return;

              orders.push({ ...order, playerId: other.id, name: other.name });
            });

            other.cashouts.forEach((cash) => {
              if (cash.status !== "pending") return;

              cashouts.push({ ...cash, playerId: other.id, name: other.name });
            });
          });

          return json(res, 200, {
            ok: true,
            orders: orders.sort((a, b) => b.time - a.time),
            cashouts: cashouts.sort((a, b) => b.time - a.time),
            time: Date.now()
          });
        }

        const target = players[String(body.target || "")];

        if (!target) {
          return json(res, 404, { error: "Bunday odam topilmadi" });
        }

        const orderId = String(body.orderId || "");

        const order = target.orders.find((item) => item.id === orderId);
        const cash = target.cashouts.find((item) => item.id === orderId);

        if (!order && !cash) {
          return json(res, 404, { error: "Buyurtma topilmadi" });
        }

        const approve = task === "approve";

        if (order) {
          order.status = approve ? "done" : "rejected";

          const skin = skins.skinById(order.skinId);

          if (approve && skin && !target.skins.includes(skin.id)) {
            target.skins.push(skin.id);
            target.skin = skin.id;
          }

          notify.notify(target, {
            type: "shop",
            title: approve ? "Naqish ochildi" : "Buyurtma rad etildi",
            body: skin
              ? skin.name + (approve ? " endi sizniki" : " — to'lov topilmadi")
              : ""
          });
        }

        if (cash) {
          cash.status = approve ? "done" : "rejected";

          // Rad etilsa — pointlar qaytariladi
          if (!approve) target.points += cash.points;

          notify.notify(target, {
            type: "shop",
            title: approve ? "Pul yuborildi" : "To'lov rad etildi",
            body: approve
              ? skins.moneyText(cash.amount) + " so'm " + cash.account + " ga o'tkazildi"
              : cash.points + " point hisobingizga qaytarildi"
          });
        }

        await writePlayers([target]);

        return json(res, 200, {
          ok: true,
          message: approve ? "Tasdiqlandi" : "Rad etildi",
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      default:
        return json(res, 400, { error: "Noma'lum amal" });
    }
  } catch (error) {
    console.error("SHOP API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

// Bazani o'zgartiradigan so'rovlar birin-ketin bajariladi
module.exports = locked("players", handler);
