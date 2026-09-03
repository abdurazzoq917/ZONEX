// api/challenges.js
// ============================================================
// HAR KUNLIK CHELENJ
//
//   GET  /api/challenges?id=<men>        — bugungi vazifalar
//   POST /api/challenges { id, key }     — mukofotni olish
//
// `key` — vazifa kaliti yoki "bonus" (uchalasi bajarilganda
// beriladigan kun bonusi).
//
// Vazifalar har kuni va har bir odamga boshqacha bo'ladi —
// qanday tanlanishi api/_daily.js da yozilgan.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  publicPlayer,
  isBanned,
  banInfo,
  daily,
  notify
} = require("./_store");

const { guard } = require("./_auth");

async function handler(req, res) {
  if (preflight(req, res)) return;

  try {
    // ---------------------------------------------------------
    // BUGUNGI VAZIFALAR
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

      const player = check.player;

      // Kun almashgan bo'lsa — yangi kun ochiladi va SAQLANADI,
      // shunda "kirib chiqing" vazifasi darhol bajarilgan
      // bo'lib turadi.
      if (daily.rollDay(player, Date.now())) {
        await writePlayers([player]);
      }

      return json(res, 200, {
        ok: true,
        points: player.points,
        daily: daily.todayView(player),
        time: Date.now()
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, { error: "Faqat GET yoki POST" });
    }

    // ---------------------------------------------------------
    // MUKOFOTNI OLISH
    // ---------------------------------------------------------

    const body = await readBody(req);

    const id = String(body.id || "").trim();
    const key = String(body.key || "").trim();

    if (!id || !key) {
      return json(res, 400, { error: "ID va vazifa kaliti kerak" });
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

    const result = daily.claim(player, key);

    if (!result.ok) {
      return json(res, 400, {
        error: result.error,
        message: result.message,
        daily: daily.todayView(player),
        points: player.points
      });
    }

    player.earned = Math.max(0, Number(player.earned) || 0) + result.reward;

    notify.notify(player, {
      type: "reward",
      title: result.bonus ? "Kun bonusi olindi" : "Chelenj bajarildi",
      body: "+" + result.reward + " point hisobingizga qo'shildi"
    });

    await writePlayers([player]);

    return json(res, 200, {
      ok: true,
      reward: result.reward,
      bonus: Boolean(result.bonus),
      points: player.points,
      daily: daily.todayView(player),
      player: publicPlayer(player, id),
      message: "+" + result.reward + " point!",
      time: Date.now()
    });
  } catch (error) {
    console.error("CHALLENGES API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

// Bazani o'zgartiradigan so'rovlar birin-ketin bajariladi
module.exports = locked("players", handler);
