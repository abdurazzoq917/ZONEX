// api/cleanup.js
// ============================================================
// BIR MARTALIK KO'CHIRISH — eski (parolsiz) akkauntlarni olib
// tashlash
// ============================================================
//
//   GET  /api/cleanup   — faqat KO'RSATADI, hech narsa o'chmaydi
//   POST /api/cleanup   — o'chiradi
//
// Ikkalasi ham `x-admin-key` sarlavhasini talab qiladi
// (Vercel'dagi ADMIN_KEY).
//
// NIMA O'CHADI
// ------------------------------------------------------------
// FAQAT paroli yo'q yozuvlar. Ular eski tizimdan qolgan: kirish
// qurilma ID bo'yicha bo'lgani uchun ularda na parol, na email
// bor — ya'ni ular bilan HECH KIM kira olmaydi, faqat username
// band bo'lib turadi.
//
// Paroli bor akkauntga bu endpoint TEGA OLMAYDI — kalit sizib
// chiqsa ham haqiqiy akkaunt o'chmaydi.
//
// BU FAYL VAQTINCHALIK. Ko'chirish tugagach o'chiriladi.
// ============================================================

const { json, preflight } = require("./_http");
const { locked } = require("./_lock");

const { readPlayers, deletePlayers } = require("./_store");
const { hasPassword } = require("./_auth");

const ADMIN_KEY = String(process.env.ADMIN_KEY || "");

function keyOk(req) {
  if (!ADMIN_KEY) return false;

  const given = String(
    (req.headers && req.headers["x-admin-key"]) || ""
  );

  if (given.length !== ADMIN_KEY.length) return false;

  // Vaqt sizdirmaydigan taqqoslash
  let diff = 0;

  for (let i = 0; i < ADMIN_KEY.length; i++) {
    diff |= given.charCodeAt(i) ^ ADMIN_KEY.charCodeAt(i);
  }

  return diff === 0;
}

function describe(player) {
  return {
    id: player.id,
    name: player.name,
    area: Math.round(Number(player.area) || 0),
    territories: Array.isArray(player.territories)
      ? player.territories.length
      : 0,
    createdAt: Number(player.createdAt) || 0
  };
}

async function handler(req, res) {
  if (preflight(req, res)) return;

  if (!keyOk(req)) {
    return json(res, 403, {
      error: "forbidden",
      message: "x-admin-key noto'g'ri yoki ADMIN_KEY qo'yilmagan"
    });
  }

  try {
    const players = await readPlayers();

    const all = Object.values(players);

    // Parolsiz = eski yozuv. Boshqasiga tegmaymiz.
    const legacy = all.filter((player) => !hasPassword(player));

    const keep = all.filter((player) => hasPassword(player));

    const report = {
      ok: true,
      jami: all.length,
      ochiriladi: legacy.map(describe),
      qoladi: keep.map(describe)
    };

    if (req.method !== "POST") {
      report.rejim = "ko'rsatish (hech narsa o'chirilmadi)";

      return json(res, 200, report);
    }

    // ---- HAQIQATAN O'CHIRISH ----
    //
    // Hudud egallagan yozuvni ehtiyot bo'lib qoldiramiz: agar
    // eski akkauntda hudud bo'lsa, uni yo'qotmasdan avval
    // qo'lda ko'rib chiqish kerak.
    const safe = legacy.filter(
      (player) => Math.round(Number(player.area) || 0) === 0
    );

    const skipped = legacy.filter(
      (player) => Math.round(Number(player.area) || 0) > 0
    );

    await deletePlayers(safe.map((player) => player.id));

    report.rejim = "o'chirildi";
    report.ochirildi = safe.map(describe);
    report.tegilmadi = skipped.map(describe);

    delete report.ochiriladi;

    return json(res, 200, report);
  } catch (error) {
    console.error("CLEANUP XATOSI:", error);

    return json(res, 500, {
      error: "Serverda xatolik",
      message: error && error.message
    });
  }
}

module.exports = locked("players", handler);
