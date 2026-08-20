// api/_env.js
// ============================================================
// Lokalda ishlaganda .env faylini o'qiydi.
//
// Vercel'da env o'zgaruvchilari o'zi beriladi — u yerda bu fayl
// hech narsa qilmaydi.
//
// Tashqi kutubxona kerak emas (dotenv o'rnatish shart emas).
// ============================================================

const fs = require("fs");
const path = require("path");

let loaded = false;

function loadEnv() {
  if (loaded) return;

  loaded = true;

  // Vercel'da .env fayl bo'lmaydi
  if (process.env.VERCEL) return;

  const file = path.join(__dirname, "..", ".env");

  let raw;

  try {
    if (!fs.existsSync(file)) return;

    raw = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }

  raw.split(/\r?\n/).forEach((line) => {
    const text = line.trim();

    if (!text || text.startsWith("#")) return;

    const at = text.indexOf("=");

    if (at < 1) return;

    const key = text.slice(0, at).trim();

    let value = text.slice(at + 1).trim();

    // Qo'shtirnoqlarni olib tashlaymiz
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Allaqachon berilgan qiymatni almashtirmaymiz
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnv();

module.exports = { loadEnv };
