// api/avatar.js
// ============================================================
// PROFIL RASMI
//
//   GET  /api/avatar?id=<qurilma>      — rasmni olish
//   POST /api/avatar { id, avatar, nsfw, score }
//                                      — rasmni qo'yish
//
// Rasm juda katta bo'lgani uchun /api/world unga tegmaydi:
// u yerda faqat `avatarAt` (versiya) yuriladi, rasmni klient
// shu yerdan bir marta olib, keshlab qo'yadi.
//
// 18+ TEKSHIRUVI
// ------------------------------------------------------------
// Rasm brauzerda tekshiriladi (teri rangi ulushi bo'yicha) va
// natija `nsfw` maydonida keladi. Bu TAXMINIY usul — 100%
// aniq emas va uni chetlab o'tish mumkin. Shuning uchun:
//
//   - shubhali rasm PROFILGA QO'YILMAYDI;
//   - odamga 3 kunlik ban yoziladi (profilida ko'rinadi);
//   - admin bandan chiqarib yuborishi mumkin.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  readAvatar,
  writeAvatar,
  applyBan,
  banInfo,
  RULES
} = require("./_store");

// Faqat oddiy rasm formatlari
const ALLOWED = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

async function handler(req, res) {
  if (preflight(req, res)) return;

  // ---------------------------------------------------------
  // RASMNI OLISH
  // ---------------------------------------------------------

  if (req.method === "GET") {
    const query = req.url.split("?")[1] || "";

    const params = new URLSearchParams(query);

    const id = String(params.get("id") || "").trim();

    if (!id) {
      return json(res, 400, { error: "Qurilma ID kerak" });
    }

    // Butun dunyoni emas — faqat shu odamning rasmini o'qiymiz
    const record = await readAvatar(id);

    return json(res, 200, {
      ok: true,
      id,
      avatar: record.avatar || "",
      avatarAt: Number(record.avatarAt) || 0
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat GET yoki POST" });
  }

  // ---------------------------------------------------------
  // RASMNI QO'YISH
  // ---------------------------------------------------------

  try {
    const body = await readBody(req);

    const id = String(body.id || "").trim();

    if (!id) {
      return json(res, 400, { error: "Qurilma ID kerak" });
    }

    const players = await readPlayers();

    const player = players[id];

    if (!player) {
      return json(res, 400, { error: "Avval ro'yxatdan o'ting" });
    }

    const avatar = String(body.avatar || "");

    // ---- rasmni o'chirish ----
    if (!avatar) {
      await writeAvatar(id, "", 0);

      player.avatarAt = 0;

      delete player.avatar;

      await writePlayers(player);

      return json(res, 200, { ok: true, removed: true, avatarAt: 0 });
    }

    if (avatar.length > RULES.AVATAR_MAX) {
      return json(res, 413, {
        error: "too_big",
        message: "Rasm juda katta — kichikroq rasm tanlang"
      });
    }

    if (!ALLOWED.test(avatar)) {
      return json(res, 400, {
        error: "bad_image",
        message: "Rasm formati noto'g'ri (PNG, JPEG yoki WEBP bo'lsin)"
      });
    }

    // ---- 18+ tekshiruvi ----
    if (body.nsfw === true) {
      player.nsfwHits = Number(player.nsfwHits || 0) + 1;

      applyBan(player, RULES.NSFW_BAN_DAYS, "18+ rasm aniqlandi");

      // Rasm qo'yilmaydi
      await writePlayers(player);

      return json(res, 403, {
        error: "nsfw",
        message:
          "Rasmda 18+ mazmun aniqlandi. Profilingizga " +
          RULES.NSFW_BAN_DAYS +
          " kunlik ban yozildi.",
        ban: banInfo(player),
        score: Number(body.score) || 0
      });
    }

    player.avatarAt = Date.now();

    // Rasmning o'zi alohida kalitga, o'yinchi yozuviga faqat versiya
    await writeAvatar(id, avatar, player.avatarAt);

    delete player.avatar;

    await writePlayers(player);

    return json(res, 200, {
      ok: true,
      avatarAt: player.avatarAt,
      ban: banInfo(player)
    });
  } catch (error) {
    console.error("AVATAR API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: (error && error.status) ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
};

// Bazani o'zgartiradigan so'rovlar birin-ketin bajariladi
module.exports = locked("players", handler);
