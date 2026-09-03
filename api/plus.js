// api/plus.js
// ============================================================
// ZONEX PLUS — oylik obuna (19 990 so'm)
//
//   GET  /api/plus?id=<men>       — holat, narx, imkoniyatlar
//   POST /api/plus { id, action }
//
//     "order"  { months }         — obuna so'rovi
//     "cancel" { orderId }        — kutilayotgan so'rovni bekor qilish
//     "admin"  { do, target, orderId, key }
//                                 — admin: ro'yxat / tasdiq / rad
//
// To'lov avtomatik emas: o'yinchi so'rov yuboradi, siz pulni
// olganingizdan keyin tasdiqlaysiz va obuna 30 kunga yoqiladi.
//
// Plus O'YINDAGI KUCH bermaydi (himoya uzaymaydi, XP tezlashmaydi,
// xarita ochilmaydi) — faqat ko'rinish va qulaylik.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  publicPlayer,
  adminAllowed,
  isBanned,
  plus,
  notify,
  skins
} = require("./_store");

const { guard } = require("./_auth");

function makeOrderId() {
  return (
    "ps-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 7)
  );
}

function view(player, id) {
  return {
    ok: true,
    plus: plus.plusView(player),
    player: publicPlayer(player, id),
    time: Date.now()
  };
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
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

      return json(res, 200, view(check.player, id));
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();

    if (!id) return json(res, 400, { error: "ID kerak" });

    const players = await readPlayers();

    const check = guard(players, id, req, body);

    if (!check.ok) {
      return json(res, check.status, {
        error: check.error,
        message: check.message
      });
    }

    const player = check.player;

    switch (action) {
      // -----------------------------------------------------
      // OBUNA SO'ROVI
      // -----------------------------------------------------
      case "order": {
        if (isBanned(player)) {
          return json(res, 403, {
            error: "banned",
            message: "Siz banlangansiz"
          });
        }

        const months = Math.min(
          12,
          Math.max(1, Math.floor(Number(body.months) || 1))
        );

        const pending = player.plus.orders.find(
          (order) => order.status === "pending"
        );

        if (pending) {
          return json(res, 400, {
            error: "pending",
            message: "So'rovingiz allaqachon tekshirilmoqda"
          });
        }

        const price = plus.PRICE_UZS * months;

        player.plus.orders.unshift({
          id: makeOrderId(),
          price,
          months,
          status: "pending",
          time: Date.now(),
          note: ""
        });

        notify.notify(player, {
          type: "plus",
          title: "ZoneX Plus so'rovi qabul qilindi",
          body:
            months +
            " oy — " +
            skins.moneyText(price) +
            " so'm. To'lov tasdiqlangach obuna yoqiladi."
        });

        await writePlayers([player]);

        return json(res, 200, {
          ...view(player, id),
          message:
            skins.moneyText(price) +
            " so'mlik so'rov yuborildi — tasdiqlanishini kuting"
        });
      }

      // -----------------------------------------------------
      // SO'ROVNI BEKOR QILISH
      // -----------------------------------------------------
      case "cancel": {
        const order = player.plus.orders.find(
          (item) => item.id === String(body.orderId || "")
        );

        if (!order || order.status !== "pending") {
          return json(res, 404, { error: "Bunday so'rov yo'q" });
        }

        order.status = "rejected";
        order.note = "o'zi bekor qildi";

        await writePlayers([player]);

        return json(res, 200, {
          ...view(player, id),
          message: "So'rov bekor qilindi"
        });
      }

      // -----------------------------------------------------
      // ADMIN
      // -----------------------------------------------------
      case "admin": {
        if (!adminAllowed(player, body.key)) {
          return json(res, 403, {
            error: "not_admin",
            message: "Bu amal faqat admin uchun"
          });
        }

        const task = String(body.do || "list");

        if (task === "list") {
          const orders = [];

          Object.values(players).forEach((other) => {
            other.plus.orders.forEach((order) => {
              if (order.status !== "pending") return;

              orders.push({
                ...order,
                playerId: other.id,
                name: other.name
              });
            });
          });

          return json(res, 200, {
            ok: true,
            orders: orders.sort((a, b) => b.time - a.time),
            price: plus.PRICE_UZS,
            time: Date.now()
          });
        }

        const target = players[String(body.target || "")];

        if (!target) return json(res, 404, { error: "O'yinchi topilmadi" });

        const order = target.plus.orders.find(
          (item) => item.id === String(body.orderId || "")
        );

        if (!order) return json(res, 404, { error: "So'rov topilmadi" });

        if (task === "approve") {
          order.status = "done";

          const until = plus.grant(target, order.months);

          notify.notify(target, {
            type: "plus",
            title: "ZoneX Plus yoqildi!",
            body:
              order.months +
              " oylik obuna faol. Tugash sanasi: " +
              new Date(until).toLocaleDateString("uz-UZ")
          });
        } else {
          order.status = "rejected";
          order.note = String(body.note || "to'lov topilmadi").slice(0, 120);

          notify.notify(target, {
            type: "plus",
            title: "Obuna so'rovi rad etildi",
            body: order.note
          });
        }

        await writePlayers([target]);

        return json(res, 200, {
          ok: true,
          message: task === "approve" ? "Obuna yoqildi" : "Rad etildi",
          time: Date.now()
        });
      }

      // -----------------------------------------------------
      default:
        return json(res, 400, { error: "Noma'lum amal" });
    }
  } catch (error) {
    console.error("PLUS API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

module.exports = locked("players", handler);
