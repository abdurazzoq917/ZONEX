// api/auth.js
// ============================================================
// AKKAUNT: RO'YXATDAN O'TISH, KIRISH, PAROLNI TIKLASH
// ============================================================
//
// Hammasi bitta manzilda — POST /api/auth { action, ... }
//
//   action: "register"  { name, email, password }
//           "login"     { login, password }        login: username YOKI email
//           "session"   { id, token }              — ilova ochilganda
//           "logout"    { id, token }
//           "forgot"    { login }                  — emailga kod yuboradi
//           "verify"    { login, code }            — kodni tekshiradi
//           "reset"     { login, ticket, password }— yangi parol
//           "change"    { id, token, oldPassword, password }
//
// Muvaffaqiyatli javob: { ok: true, id, token, player }
//
//   token — shu qurilma uchun kalit. Klient uni saqlaydi va
//           har bir so'rovga qo'shadi. Server tokenni EMAS,
//           uning sha256 izini saqlaydi.
// ============================================================

const { json, preflight, readBody } = require("./_http");
const { locked } = require("./_lock");

const {
  readPlayers,
  writePlayers,
  createPlayer,
  publicPlayer,
  newPlayerId,
  normalizeName,
  usernameError,
  isNameTaken,
  findByName,
  findByEmail,
  isEmailTaken
} = require("./_store");

const auth = require("./_auth");
const { sendResetCode } = require("./_mail");

// ============================================================
// YORDAMCHILAR
// ============================================================

// Kirish maydoniga username ham, email ham yozilishi mumkin
function findAccount(players, login) {
  const raw = String(login || "").trim();

  if (!raw) return null;

  if (raw.includes("@")) return findByEmail(players, raw);

  return findByName(players, raw);
}

// Kirish/ro'yxatdan o'tish javobi — hamma joyda bir xil
function accountReply(res, player, token) {
  return json(res, 200, {
    ok: true,
    id: player.id,
    token,
    player: publicPlayer(player, player.id)
  });
}

function fail(res, status, error, message) {
  return json(res, status, { error, message });
}

// ============================================================
// RO'YXATDAN O'TISH
// ============================================================

async function doRegister(res, body) {
  const name = normalizeName(body.name);
  const email = auth.normalizeEmail(body.email);
  const password = String(body.password == null ? "" : body.password);

  const nameProblem = usernameError(body.name);

  if (nameProblem) return fail(res, 400, "invalid_name", nameProblem);

  const emailProblem = auth.emailError(email);

  if (emailProblem) return fail(res, 400, "invalid_email", emailProblem);

  const passProblem = auth.passwordCheck(password, name).error;

  if (passProblem) return fail(res, 400, "weak_password", passProblem);

  const players = await readPlayers();

  if (isNameTaken(players, name, null)) {
    return fail(
      res,
      409,
      "name_taken",
      "Bu username band. Boshqasini tanlang."
    );
  }

  if (isEmailTaken(players, email, null)) {
    return fail(
      res,
      409,
      "email_taken",
      "Bu email allaqachon ishlatilgan. Kirish oynasidan foydalaning."
    );
  }

  const player = createPlayer(newPlayerId(), name);

  player.email = email;
  player.emailAt = Date.now();
  player.pass = await auth.hashPassword(password);

  const token = auth.issueToken(player);

  await writePlayers(player);

  return accountReply(res, player, token);
}

// ============================================================
// KIRISH
// ============================================================

async function doLogin(res, body) {
  const password = String(body.password == null ? "" : body.password);

  const players = await readPlayers();

  const player = findAccount(players, body.login);

  // Akkaunt yo'q bo'lsa ham parolni tekshirgandek vaqt ketsin —
  // aks holda javob tezligi username bor-yo'qligini sotib qo'yadi.
  if (!player) {
    await auth.hashPassword(password);

    return fail(
      res,
      404,
      "no_account",
      "Bunday akkaunt topilmadi — username yoki emailni tekshiring"
    );
  }

  const waitMinutes = auth.loginLocked(player);

  if (waitMinutes) {
    return fail(
      res,
      429,
      "locked",
      "Parol juda ko'p marta xato kiritildi. " +
        waitMinutes +
        " daqiqadan keyin urinib ko'ring yoki parolni tiklang."
    );
  }

  if (!auth.hasPassword(player)) {
    return fail(
      res,
      409,
      "no_password",
      "Bu akkauntda parol yo'q. «Parolni unutdingizmi?» orqali parol qo'ying."
    );
  }

  const okPassword = await auth.verifyPassword(player, password);

  if (!okPassword) {
    auth.loginFailed(player);

    await writePlayers(player);

    return fail(res, 401, "bad_password", "Parol noto'g'ri");
  }

  auth.loginOk(player);

  const token = auth.issueToken(player);

  await writePlayers(player);

  return accountReply(res, player, token);
}

// ============================================================
// SESSIYA — ilova ochilganda tekshiriladi
// ============================================================

async function doSession(res, body) {
  const id = String(body.id || "").trim();

  const players = await readPlayers();

  const player = players[id];

  if (!player) {
    return fail(res, 404, "no_account", "Akkaunt topilmadi — qaytadan kiring");
  }

  if (!auth.tokenValid(player, body.token)) {
    return fail(
      res,
      401,
      "bad_token",
      "Sessiya muddati tugadi — qaytadan kiring"
    );
  }

  // Token amal qiladi — yangisini bermaymiz, eskisi qoladi
  return accountReply(res, player, String(body.token));
}

async function doLogout(res, body) {
  const id = String(body.id || "").trim();

  const players = await readPlayers();

  const player = players[id];

  if (!player) return json(res, 200, { ok: true });

  auth.dropToken(player, body.token);

  await writePlayers(player);

  return json(res, 200, { ok: true });
}

// ============================================================
// PAROLNI UNUTDIM — 1-qadam: emailga kod
// ============================================================

async function doForgot(res, body) {
  const players = await readPlayers();

  const player = findAccount(players, body.login);

  if (!player) {
    return fail(
      res,
      404,
      "no_account",
      "Bunday akkaunt topilmadi — username yoki emailni tekshiring"
    );
  }

  if (!player.email) {
    return fail(
      res,
      409,
      "no_email",
      "Bu akkauntga email biriktirilmagan — parolni tiklab bo'lmaydi"
    );
  }

  const wait = auth.resetCooldown(player);

  if (wait) {
    return fail(
      res,
      429,
      "cooldown",
      "Kod endigina yuborildi. " + wait + " sekunddan keyin qayta so'rang."
    );
  }

  const code = auth.setResetCode(player);

  const sent = await sendResetCode(player.email, player.name, code);

  if (!sent.ok) {
    // Xat ketmadi — kodni bazada qoldirishning ma'nosi yo'q
    player.reset = null;

    await writePlayers(player);

    return fail(res, 502, sent.error, sent.message);
  }

  await writePlayers(player);

  return json(res, 200, {
    ok: true,
    // Kod qaysi manzilga ketganini odam taniydi, lekin to'liq
    // manzil ko'rinmaydi
    email: auth.maskEmail(player.email),
    name: player.name,

    // Lokalda email sozlanmagan bo'lsa — kod terminalga chiqdi.
    // Kodning O'ZI hech qachon javobga qo'shilmaydi.
    dev: Boolean(sent.dev)
  });
}

// ============================================================
// 2-qadam: kodni tekshirish
// ============================================================

async function doVerify(res, body) {
  const players = await readPlayers();

  const player = findAccount(players, body.login);

  if (!player) {
    return fail(res, 404, "no_account", "Akkaunt topilmadi");
  }

  const result = auth.checkResetCode(player, body.code);

  // Urinishlar soni o'zgardi — natijadan qat'i nazar saqlaymiz
  await writePlayers(player);

  if (!result.ok) {
    return fail(res, 400, result.error, result.message);
  }

  return json(res, 200, { ok: true, ticket: result.ticket });
}

// ============================================================
// 3-qadam: yangi parol
// ============================================================

async function doReset(res, body) {
  const password = String(body.password == null ? "" : body.password);

  const players = await readPlayers();

  const player = findAccount(players, body.login);

  if (!player) {
    return fail(res, 404, "no_account", "Akkaunt topilmadi");
  }

  if (!auth.checkTicket(player, body.ticket)) {
    return fail(
      res,
      401,
      "bad_ticket",
      "Tasdiqlash muddati tugadi — kodni qaytadan so'rang"
    );
  }

  const problem = auth.passwordCheck(password, player.name).error;

  if (problem) return fail(res, 400, "weak_password", problem);

  player.pass = await auth.hashPassword(password);
  player.reset = null;

  auth.loginOk(player);

  // Parol o'zgardi — hamma eski qurilmalar chiqarib yuboriladi.
  // Akkauntni kimdir egallab olgan bo'lsa, shu yerda uziladi.
  auth.dropAllTokens(player);

  const token = auth.issueToken(player);

  await writePlayers(player);

  return accountReply(res, player, token);
}

// ============================================================
// PAROLNI ALMASHTIRISH (ichkarida, eski parolni bilgan holda)
// ============================================================

async function doChange(res, body) {
  const id = String(body.id || "").trim();

  const password = String(body.password == null ? "" : body.password);

  const players = await readPlayers();

  const player = players[id];

  if (!player || !auth.tokenValid(player, body.token)) {
    return fail(res, 401, "bad_token", "Qaytadan kiring");
  }

  const okOld = await auth.verifyPassword(player, body.oldPassword);

  if (!okOld) {
    return fail(res, 401, "bad_password", "Eski parol noto'g'ri");
  }

  const problem = auth.passwordCheck(password, player.name).error;

  if (problem) return fail(res, 400, "weak_password", problem);

  player.pass = await auth.hashPassword(password);

  auth.dropAllTokens(player);

  const token = auth.issueToken(player);

  await writePlayers(player);

  return accountReply(res, player, token);
}

// ============================================================
// MARSHRUT
// ============================================================

const ACTIONS = {
  register: doRegister,
  login: doLogin,
  session: doSession,
  logout: doLogout,
  forgot: doForgot,
  verify: doVerify,
  reset: doReset,
  change: doChange
};

async function handler(req, res) {
  if (preflight(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Faqat POST so'rovi" });
  }

  try {
    const body = await readBody(req);

    const action = String(body.action || "").trim();

    const run = Object.prototype.hasOwnProperty.call(ACTIONS, action)
      ? ACTIONS[action]
      : null;

    if (!run) {
      return fail(res, 400, "bad_action", "Noma'lum amal: " + action);
    }

    return await run(res, body);
  } catch (error) {
    console.error("AUTH API XATOSI:", error);

    return json(res, (error && error.status) || 500, {
      error: error && error.status ? error.message : "Serverda xatolik",
      message: error && error.message
    });
  }
}

// Bazani o'zgartiradi — navbatga qo'yiladi
module.exports = locked("players", handler);
