// api/_auth.js
// ============================================================
// PAROL, SESSIYA VA TASDIQLASH KODI
// ============================================================
//
// Tashqi kutubxona ishlatilmaydi — Node'ning o'z `crypto`si
// yetarli (loyihaning qolgan qismi ham shunday yozilgan).
//
// Nima qayerda saqlanadi:
//
//   player.pass      = { salt, hash }          — parolning o'zi EMAS
//   player.sessions  = [ { hash, at, seen } ]  — token izlari
//   player.reset     = { hash, at, tries, ... } — kod izi
//
// Hech qaysi maydon klientga qaytmaydi — publicPlayer ularni
// olib tashlaydi.
// ============================================================

const crypto = require("crypto");

// ============================================================
// QOIDALAR
// ============================================================

const AUTH = {
  // Parol uzunligi
  PASS_MIN: 6,
  PASS_MAX: 72,

  // Bitta akkauntda bir vaqtda nechta qurilma turishi mumkin
  SESSION_MAX: 5,

  // Sessiya shuncha vaqtdan keyin o'zi o'chadi (30 kun)
  SESSION_MS: 30 * 24 * 60 * 60 * 1000,

  // Emailga ketgan kod shuncha vaqt yashaydi (10 daqiqa)
  CODE_MS: 10 * 60 * 1000,

  // Kodni necha marta xato kiritish mumkin
  CODE_TRIES: 5,

  // Yangi kod so'rashlar orasidagi eng kam vaqt (60 sekund)
  CODE_COOLDOWN_MS: 60 * 1000,

  // Kod tasdiqlangandan keyin yangi parol qo'yish uchun vaqt
  TICKET_MS: 15 * 60 * 1000,

  // Ketma-ket necha marta parolni xato kiritsa — kutish
  LOGIN_TRIES: 8,
  LOGIN_LOCK_MS: 10 * 60 * 1000
};

// Eng ko'p uchraydigan parollar — bulardan foydalanib bo'lmaydi
const COMMON = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "password", "parol", "qwerty", "qwertyui", "asdfgh", "zxcvbn",
  "111111", "000000", "121212", "abc123", "iloveyou", "admin",
  "welcome", "letmein", "monkey", "dragon", "sunshine", "princess",
  "zonex", "zonex123", "salom", "salom123", "parol123", "qwerty123"
]);

// ============================================================
// KICHIK YORDAMCHILAR
// ============================================================

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Ikkita sirni vaqt sizdirmasdan taqqoslaydi.
//
// Oddiy `a === b` birinchi farqda to'xtaydi va shu tufayli
// javob berish vaqti orqali sirni harfma-harf topsa bo'ladi.
// sha256 dan keyin ikkalasi ham bir xil uzunlikda bo'ladi.
function sameHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");

  if (left.length === 0 || left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

// ============================================================
// EMAIL
// ============================================================

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 190);
}

// Email to'g'rimi? Xato bo'lsa — sababi qaytadi.
function emailError(raw) {
  const email = normalizeEmail(raw);

  if (!email) return "Email manzilini yozing";

  // Oddiy, lekin ishonchli tekshiruv: bitta @, ikkala tomonda
  // matn, nuqtali domen, bo'sh joysiz.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "Email manzili noto'g'ri — masalan: ism@gmail.com";
  }

  return "";
}

// Emailni ko'rsatishda yashiramiz: z*****v@gmail.com
//
// Kod qayerga ketganini odam taniydi, lekin begona odam
// to'liq manzilni bila olmaydi.
function maskEmail(raw) {
  const email = normalizeEmail(raw);

  const at = email.indexOf("@");

  if (at < 1) return "";

  const name = email.slice(0, at);
  const domain = email.slice(at);

  if (name.length <= 2) return name[0] + "*" + domain;

  return (
    name[0] +
    "*".repeat(Math.min(name.length - 2, 5)) +
    name.slice(-1) +
    domain
  );
}

// ============================================================
// PAROL KUCHI
// ============================================================
//
// Klientdagi `passwordCheck` (client.js) AYNAN shu qoidalarni
// takrorlaydi. Ikkalasi ham kerak: klientdagisi yozayotganda
// qizil yozuv chiqarish uchun, serverdagisi esa uni chetlab
// o'tishga yo'l qo'ymaslik uchun.
//
// Qaytadi: { error, level, hint }
//
//   error — bo'sh bo'lmasa, parol QABUL QILINMAYDI
//   level — "weak" | "medium" | "strong"
// ============================================================

function passwordCheck(raw, name) {
  const password = String(raw == null ? "" : raw);

  const out = { error: "", level: "weak", hint: "" };

  if (!password) {
    out.error = "Parol yozing";
    return out;
  }

  if (password.length < AUTH.PASS_MIN) {
    out.error =
      "Parol kamida " + AUTH.PASS_MIN + " ta belgidan iborat bo'lsin";
    return out;
  }

  if (password.length > AUTH.PASS_MAX) {
    out.error = "Parol juda uzun";
    return out;
  }

  if (/\s/.test(password)) {
    out.error = "Parolda bo'sh joy bo'lmasin";
    return out;
  }

  // ---- ASOSIY QOIDA: parol faqat raqamdan iborat bo'lmasin ----
  //
  // "1234", "2005", "998901234567" kabi parollar bir necha
  // soniyada topiladi: ular odatda tug'ilgan yil yoki telefon
  // raqami bo'ladi va sizni tanigan har kim taxmin qila oladi.
  if (/^[0-9]+$/.test(password)) {
    out.error =
      "Parol faqat raqamlardan iborat bo'lmasin — kamida bitta harf qo'shing";
    return out;
  }

  if (COMMON.has(password.toLowerCase())) {
    out.error = "Bu parol juda mashhur — boshqasini o'ylab toping";
    return out;
  }

  // Bitta belgining takrori: "aaaaaa"
  if (/^(.)\1+$/.test(password)) {
    out.error = "Parol bitta belgining takroridan iborat bo'lmasin";
    return out;
  }

  const clean = String(name || "").trim().toLowerCase();

  if (clean && password.toLowerCase() === clean) {
    out.error = "Parol username bilan bir xil bo'lmasin";
    return out;
  }

  // ---- Kuch darajasi (bloklamaydi, faqat ko'rsatadi) ----

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSign = /[^A-Za-z0-9]/.test(password);

  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (hasLower && hasUpper) score += 1;
  if (hasDigit) score += 1;
  if (hasSign) score += 1;

  if (score >= 4) {
    out.level = "strong";
    out.hint = "Kuchli parol";
  } else if (score >= 2) {
    out.level = "medium";
    out.hint = "O'rtacha — katta harf yoki belgi qo'shsangiz kuchliroq bo'ladi";
  } else {
    out.level = "weak";
    out.hint = "Zaif — uzunroq qiling va raqam qo'shing";
  }

  return out;
}

// ============================================================
// PAROLNI SAQLASH (scrypt)
// ============================================================
//
// Parolning o'zi hech qayerda saqlanmaydi. Har bir odamga
// alohida "salt" beriladi, shuning uchun ikki kishi bir xil
// parol qo'ysa ham bazadagi izlari boshqa-boshqa bo'ladi.
//
// scrypt ataylab sekin ishlaydi (~100 ms) — bu parolni
// taxmin qilib topishni amalda imkonsiz qiladi.
// ============================================================

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      Buffer.from(salt, "hex"),
      SCRYPT.keylen,
      // scrypt N=16384, r=8 uchun ichki xotira chegarasini
      // oshirib qo'yamiz, aks holda Node xato beradi
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key.toString("hex")))
    );
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  return { salt, hash: await scrypt(password, salt), at: Date.now() };
}

async function verifyPassword(player, password) {
  const pass = player && player.pass;

  if (!pass || !pass.salt || !pass.hash) return false;

  let got;

  try {
    got = await scrypt(password, pass.salt);
  } catch {
    return false;
  }

  return sameHex(got, pass.hash);
}

function hasPassword(player) {
  return Boolean(player && player.pass && player.pass.hash);
}

// ============================================================
// SESSIYA (TOKEN)
// ============================================================
//
// Token faqat BIR MARTA — kirgan payt — klientga beriladi.
// Bazada uning sha256 izi yotadi: baza sizib chiqsa ham
// tokenlarni tiklab bo'lmaydi.
// ============================================================

function cleanSessions(player) {
  const now = Date.now();

  const list = Array.isArray(player.sessions) ? player.sessions : [];

  return list
    .filter(
      (item) =>
        item &&
        typeof item.hash === "string" &&
        item.hash &&
        now - Number(item.at || 0) < AUTH.SESSION_MS
    )
    .slice(-AUTH.SESSION_MAX);
}

// Yangi token yaratadi va uning izini o'yinchi yozuviga qo'yadi
function issueToken(player) {
  const token = randomToken();

  const list = cleanSessions(player);

  list.push({ hash: sha256(token), at: Date.now(), seen: Date.now() });

  player.sessions = list.slice(-AUTH.SESSION_MAX);

  return token;
}

// Token shu odamnikimi?
function tokenValid(player, token) {
  const value = String(token || "");

  if (!value) return false;

  const wanted = sha256(value);

  const now = Date.now();

  return (Array.isArray(player.sessions) ? player.sessions : []).some(
    (item) =>
      item &&
      now - Number(item.at || 0) < AUTH.SESSION_MS &&
      sameHex(item.hash, wanted)
  );
}

function dropToken(player, token) {
  const wanted = sha256(String(token || ""));

  player.sessions = cleanSessions(player).filter(
    (item) => !sameHex(item.hash, wanted)
  );
}

// Barcha qurilmalardan chiqarish — parol o'zgarganda SHART.
//
// Aks holda parolni o'g'irlagan odam parol almashtirilgandan
// keyin ham eski token bilan kirib turaveradi.
function dropAllTokens(player) {
  player.sessions = [];
}

// ============================================================
// TASDIQLASH KODI (parolni tiklash)
// ============================================================

function makeCode() {
  // Har doim 6 xonali (000123 kabi chalkash kod chiqmaydi)
  return String(crypto.randomInt(100000, 1000000));
}

function setResetCode(player) {
  const code = makeCode();

  player.reset = {
    hash: sha256(code),
    at: Date.now(),
    tries: 0,
    ticket: "",
    ticketAt: 0
  };

  return code;
}

// Yangi kod so'rashga ruxsat bormi? (spam'ga qarshi)
// Qaytadi: qancha sekund kutish kerak (0 — ruxsat).
function resetCooldown(player) {
  const at = Number(player && player.reset && player.reset.at) || 0;

  if (!at) return 0;

  const left = AUTH.CODE_COOLDOWN_MS - (Date.now() - at);

  return left > 0 ? Math.ceil(left / 1000) : 0;
}

// Kodni tekshiradi. To'g'ri bo'lsa — bir martalik "chipta"
// qaytadi; yangi parol o'sha chipta bilan qo'yiladi.
//
// Qaytadi: { ok, ticket } yoki { ok: false, error, message }
function checkResetCode(player, code) {
  const reset = player && player.reset;

  if (!reset || !reset.hash) {
    return {
      ok: false,
      error: "no_code",
      message: "Kod so'ralmagan — «Kod yuborish» tugmasini bosing"
    };
  }

  if (Date.now() - Number(reset.at || 0) > AUTH.CODE_MS) {
    player.reset = null;

    return {
      ok: false,
      error: "expired",
      message: "Kodning muddati tugadi — yangisini so'rang"
    };
  }

  if (Number(reset.tries || 0) >= AUTH.CODE_TRIES) {
    player.reset = null;

    return {
      ok: false,
      error: "too_many",
      message: "Kod juda ko'p marta xato kiritildi — yangisini so'rang"
    };
  }

  const clean = String(code || "").replace(/\D/g, "");

  if (clean.length !== 6 || !sameHex(sha256(clean), reset.hash)) {
    reset.tries = Number(reset.tries || 0) + 1;

    const left = AUTH.CODE_TRIES - reset.tries;

    return {
      ok: false,
      error: "bad_code",
      message:
        left > 0
          ? "Kod noto'g'ri — yana " + left + " marta urinib ko'ra olasiz"
          : "Kod noto'g'ri. Yangi kod so'rang."
    };
  }

  const ticket = randomToken();

  // Kod ishlatildi — endi u qayta ishlamaydi (hash bo'shatiladi)
  player.reset = {
    hash: "",
    at: Number(reset.at) || Date.now(),
    tries: 0,
    ticket: sha256(ticket),
    ticketAt: Date.now()
  };

  return { ok: true, ticket };
}

function checkTicket(player, ticket) {
  const reset = player && player.reset;

  const value = String(ticket || "");

  if (!reset || !reset.ticket || !value) return false;

  if (Date.now() - Number(reset.ticketAt || 0) > AUTH.TICKET_MS) return false;

  return sameHex(sha256(value), reset.ticket);
}

// ============================================================
// PAROLNI XATO KIRITISH (brute-force'ga qarshi)
// ============================================================

// Qaytadi: yana necha daqiqa kutish kerak (0 — ruxsat)
function loginLocked(player) {
  const gate = player && player.loginGate;

  if (!gate) return 0;

  if (Number(gate.tries || 0) < AUTH.LOGIN_TRIES) return 0;

  const left = AUTH.LOGIN_LOCK_MS - (Date.now() - Number(gate.at || 0));

  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function loginFailed(player) {
  const gate = player.loginGate || { tries: 0, at: 0 };

  // Qulf muddati o'tgan bo'lsa — noldan sanaymiz
  if (
    Number(gate.tries || 0) >= AUTH.LOGIN_TRIES &&
    Date.now() - Number(gate.at || 0) > AUTH.LOGIN_LOCK_MS
  ) {
    gate.tries = 0;
  }

  gate.tries = Number(gate.tries || 0) + 1;
  gate.at = Date.now();

  player.loginGate = gate;
}

function loginOk(player) {
  player.loginGate = null;
}

// ============================================================
// ENDPOINTLAR UCHUN QO'RIQCHI
// ============================================================
//
// Ilgari har bir so'rovda faqat `id` kelardi — ya'ni birovning
// ID'sini bilgan odam uning nomidan hudud egallashi, xabar
// o'qishi yoki rasm almashtirishi mumkin edi.
//
// Endi ID bilan birga TOKEN ham kerak. Token `x-zonex-token`
// sarlavhasida yuriladi (URL'da emas — URL server jurnallariga
// yozilib qoladi).
// ============================================================

function tokenFrom(req, body) {
  const head =
    req && req.headers ? req.headers["x-zonex-token"] : "";

  if (head) return String(head);

  return String((body && body.token) || "");
}

// Qaytadi: { ok: true, player } yoki { ok: false, status, error, message }
function guard(players, id, req, body) {
  const key = String(id || "").trim();

  if (!key) {
    return { ok: false, status: 400, error: "no_id", message: "ID kerak" };
  }

  const player = players[key];

  if (!player) {
    return {
      ok: false,
      status: 404,
      error: "no_account",
      message: "Akkaunt topilmadi — qaytadan kiring"
    };
  }

  if (!tokenValid(player, tokenFrom(req, body))) {
    return {
      ok: false,
      status: 401,
      error: "bad_token",
      message: "Sessiya muddati tugadi — qaytadan kiring"
    };
  }

  return { ok: true, player };
}

// ============================================================
// MAXFIY MAYDONLARNI SHAKLGA SOLISH
// ============================================================
//
// normalizePlayer har o'qishda shuni chaqiradi — shunda eski
// yoki buzilgan yozuvlar ham to'g'ri shaklga keladi.
// ============================================================

function normalizeAuth(player) {
  const pass = player.pass;

  player.pass =
    pass && typeof pass.salt === "string" && typeof pass.hash === "string"
      ? { salt: pass.salt, hash: pass.hash, at: Number(pass.at) || 0 }
      : null;

  player.email = normalizeEmail(player.email);
  player.emailAt = Number(player.emailAt) || 0;

  player.sessions = cleanSessions(player);

  const reset = player.reset;

  player.reset =
    reset && typeof reset === "object"
      ? {
          hash: String(reset.hash || ""),
          at: Number(reset.at) || 0,
          tries: Number(reset.tries) || 0,
          ticket: String(reset.ticket || ""),
          ticketAt: Number(reset.ticketAt) || 0
        }
      : null;

  const gate = player.loginGate;

  player.loginGate =
    gate && typeof gate === "object"
      ? { tries: Number(gate.tries) || 0, at: Number(gate.at) || 0 }
      : null;

  return player;
}

module.exports = {
  AUTH,

  // email
  normalizeEmail,
  emailError,
  maskEmail,

  // parol
  passwordCheck,
  hashPassword,
  verifyPassword,
  hasPassword,

  // sessiya
  issueToken,
  tokenValid,
  dropToken,
  dropAllTokens,

  // tasdiqlash kodi
  setResetCode,
  resetCooldown,
  checkResetCode,
  checkTicket,

  // qo'riqchi
  guard,
  tokenFrom,

  // urinishlar
  loginLocked,
  loginFailed,
  loginOk,

  normalizeAuth,
  sha256
};
