// api/_mail.js
// ============================================================
// EMAIL YUBORISH — Gmail SMTP orqali
// ============================================================
//
// .env da ikkita qiymat kerak:
//
//   MAIL_USER=sizning@gmail.com
//   MAIL_PASS=xxxx xxxx xxxx xxxx     <- Google "App password"
//
// MUHIM: bu Gmail parolingiz EMAS. Google hisobingizda
// 2 bosqichli tasdiqlashni yoqib, so'ng
// https://myaccount.google.com/apppasswords sahifasidan
// 16 belgili maxsus parol yaratasiz. Uni istalgan payt
// bekor qilsangiz — Gmail parolingizga ta'sir qilmaydi.
//
// SOZLANMAGAN BO'LSA
// ------------------------------------------------------------
// Lokalda (npm start) kod EMAIL O'RNIGA terminalga chiqadi —
// shunda email sozlamasdan ham butun oqimni sinab ko'rasiz.
// Vercel'da esa aniq xato qaytadi, chunki u yerda terminalni
// odam ko'rmaydi.
// ============================================================

require("./_env");

// nodemailer ATAYLAB shu yerda talab qilinmaydi.
//
// Bu fayl /api/world ga ham ulangan (mailReport uchun), u esa
// har 3 sekundda chaqiriladi. Kutubxonani faqat haqiqatan xat
// yuborayotganda yuklaymiz — shunda /api/world tezroq ishga
// tushadi.
let nodemailer = null;

const MAIL_USER = String(process.env.MAIL_USER || "").trim();

// Google app password'ni ko'pincha bo'sh joy bilan ko'chiriladi
// ("abcd efgh ijkl mnop") — SMTP uni bo'shliqsiz kutadi.
const MAIL_PASS = String(process.env.MAIL_PASS || "").replace(/\s+/g, "");

// Xat kimdan kelgani ko'rinadi
const MAIL_FROM =
  String(process.env.MAIL_FROM || "").trim() ||
  (MAIL_USER ? '"ZONEX" <' + MAIL_USER + ">" : "");

const CONFIGURED = Boolean(MAIL_USER && MAIL_PASS);

let transport = null;

function getTransport() {
  if (!CONFIGURED) return null;

  if (!transport) {
    if (!nodemailer) nodemailer = require("nodemailer");

    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: MAIL_USER, pass: MAIL_PASS },

      // Vercel funksiyasi uzoq kutib qolmasin
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }

  return transport;
}

// Sozlama holati — /api/world dagi hisobotga qo'shiladi,
// shunda "kod kelmayapti" muammosini tez topasiz.
function mailReport() {
  if (CONFIGURED) return { mode: "gmail", user: maskUser(MAIL_USER) };

  return {
    mode: "off",
    reason:
      "MAIL_USER va MAIL_PASS qo'yilmagan. Vercel: Settings > " +
      "Environment Variables > Production, keyin Redeploy."
  };
}

function maskUser(email) {
  const at = String(email).indexOf("@");

  if (at < 1) return "";

  return email[0] + "***" + email.slice(at);
}

// ============================================================
// XAT MATNI
// ============================================================

function codeHtml(name, code) {
  return `<div style="font-family:Segoe UI,Roboto,Arial,sans-serif;background:#f4f4f7;padding:28px 16px">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e6e6ee">
    <p style="margin:0;font-size:13px;letter-spacing:2px;color:#8a8aa0">ZONEX</p>
    <h1 style="margin:8px 0 4px;font-size:20px;color:#16161d">Parolni tiklash</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#5a5a70">
      Salom, <b>${escapeHtml(name)}</b>! Quyidagi kodni ilovaga kiriting:
    </p>
    <div style="text-align:center;background:#f4f4f7;border-radius:12px;padding:18px 0;margin-bottom:20px">
      <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#16161d">${escapeHtml(
        code
      )}</span>
    </div>
    <p style="margin:0 0 6px;font-size:13px;color:#5a5a70">
      Kod <b>10 daqiqa</b> ichida ishlaydi.
    </p>
    <p style="margin:0;font-size:13px;color:#c02b2b">
      Agar parolni tiklashni siz so'ramagan bo'lsangiz — bu xatni
      e'tiborsiz qoldiring va hech kimga kodni aytmang.
    </p>
  </div>
</div>`;
}

function escapeHtml(text) {
  return String(text == null ? "" : text).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[ch]
  );
}

// ============================================================
// YUBORISH
// ============================================================
//
// Qaytadi: { ok, dev, error, message }
//
//   dev: true — email sozlanmagan, kod terminalga chiqdi
// ============================================================

async function sendResetCode(email, name, code) {
  if (!CONFIGURED) {
    // Vercel'da terminalni odam ko'rmaydi — jim qolish yaramaydi
    if (process.env.VERCEL) {
      return {
        ok: false,
        error: "mail_off",
        message:
          "Email xizmati sozlanmagan. Administrator MAIL_USER va " +
          "MAIL_PASS ni qo'shishi kerak."
      };
    }

    console.log(
      "\n[ZONEX] Email sozlanmagan — kod shu yerda:\n" +
        "        " +
        email +
        "  ->  " +
        code +
        "\n"
    );

    return { ok: true, dev: true };
  }

  try {
    await getTransport().sendMail({
      from: MAIL_FROM,
      to: email,
      subject: "ZONEX — parolni tiklash kodi: " + code,
      text:
        "Salom, " +
        name +
        "!\n\nParolni tiklash kodi: " +
        code +
        "\n\nKod 10 daqiqa ichida ishlaydi.\n" +
        "Agar buni siz so'ramagan bo'lsangiz — xatni e'tiborsiz qoldiring.",
      html: codeHtml(name, code)
    });

    return { ok: true, dev: false };
  } catch (error) {
    console.error("EMAIL YUBORILMADI:", error && error.message);

    return {
      ok: false,
      error: "mail_failed",
      message:
        "Xat yuborilmadi. Email manzilini tekshiring yoki biroz " +
        "kutib qayta urinib ko'ring."
    };
  }
}

module.exports = { sendResetCode, mailReport, MAIL_ON: CONFIGURED };
