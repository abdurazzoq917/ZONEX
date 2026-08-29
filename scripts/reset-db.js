// scripts/reset-db.js
// ============================================================
// BAZANI TOZALASH — hamma akkauntlar o'chadi
// ============================================================
//
// Nega kerak: eski akkauntlar qurilma ID bo'yicha yaratilgan
// va ularda parol ham, email ham yo'q. Yangi tizimda kirish
// username + parol bilan bo'ladi, shuning uchun eski yozuvlar
// bilan hech kim kira olmaydi — ular faqat usernameni band
// qilib turadi.
//
// NIMA O'CHADI:
//   zonex:ids          — akkauntlar ro'yxati
//   zonex:player:*     — akkauntlar (hudud, do'stlar, ban)
//   zonex:live:*       — joylashuvlar
//   zonex:avatar:*     — profil rasmlari
//   zonex:chat:*       — yozishmalar
//
// BU AMALNI ORQAGA QAYTARIB BO'LMAYDI.
//
// Ishlatish:
//
//   node scripts/reset-db.js            <- faqat ko'rsatadi
//   node scripts/reset-db.js --yes      <- haqiqatan o'chiradi
// ============================================================

require("../api/_env");

const fs = require("fs");
const path = require("path");

const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const CONFIRM = process.argv.includes("--yes");

const PATTERNS = [
  "zonex:player:*",
  "zonex:live:*",
  "zonex:avatar:*",
  "zonex:chat:*",
  "zonex:lock:*"
];

async function redis(command) {
  const response = await fetch(URL + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command])
  });

  if (!response.ok) {
    throw new Error("Redis javobi: " + response.status);
  }

  const rows = await response.json();

  if (rows[0] && rows[0].error) throw new Error(rows[0].error);

  return rows[0] ? rows[0].result : null;
}

// SCAN bilan kalitlarni yig'amiz (KEYS emas — u katta bazani qotiradi)
async function scanKeys(pattern) {
  const found = [];

  let cursor = "0";

  do {
    const result = await redis(["SCAN", cursor, "MATCH", pattern, "COUNT", 500]);

    cursor = String(result[0]);

    (result[1] || []).forEach((key) => found.push(key));
  } while (cursor !== "0");

  return found;
}

async function resetRedis() {
  const keys = [];

  for (const pattern of PATTERNS) {
    const found = await scanKeys(pattern);

    console.log("  " + pattern.padEnd(18) + found.length + " ta");

    found.forEach((key) => keys.push(key));
  }

  const ids = await redis(["SCARD", "zonex:ids"]);

  console.log("  zonex:ids         " + (ids || 0) + " ta akkaunt");

  if (!CONFIRM) return keys.length;

  // Bo'lib-bo'lib o'chiramiz — bitta so'rov juda katta bo'lmasin
  for (let at = 0; at < keys.length; at += 200) {
    await redis(["DEL"].concat(keys.slice(at, at + 200)));
  }

  await redis(["DEL", "zonex:ids"]);

  return keys.length;
}

function resetFile() {
  const file = path.join(__dirname, "..", "world.json");

  if (!fs.existsSync(file)) {
    console.log("  world.json topilmadi — tozalash shart emas");
    return 0;
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf8") || "{}");

  const count = Array.isArray(raw.players) ? raw.players.length : 0;

  console.log("  world.json        " + count + " ta akkaunt");

  if (!CONFIRM) return count;

  // Zaxira nusxa — o'ylamay ishga tushirilsa ham qaytarib olasiz
  const backup = file + ".backup-" + Date.now();

  fs.copyFileSync(file, backup);

  console.log("  zaxira nusxa:     " + path.basename(backup));

  fs.writeFileSync(
    file,
    JSON.stringify({ players: [], chats: {}, avatars: {}, live: {} }, null, 2)
  );

  return count;
}

async function main() {
  const mode = URL && TOKEN ? "KV (Upstash)" : "world.json (lokal fayl)";

  console.log("");
  console.log("ZONEX — bazani tozalash");
  console.log("Manba: " + mode);
  console.log("");

  const count = URL && TOKEN ? await resetRedis() : resetFile();

  console.log("");

  if (!CONFIRM) {
    console.log("Bu SINOV yurishi — hech narsa o'chirilmadi.");
    console.log("Haqiqatan o'chirish uchun:");
    console.log("");
    console.log("    node scripts/reset-db.js --yes");
    console.log("");
    return;
  }

  console.log("Tozalandi. Endi hamma qaytadan ro'yxatdan o'tadi.");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("XATO:", error.message);
  console.error("");
  process.exitCode = 1;
});
