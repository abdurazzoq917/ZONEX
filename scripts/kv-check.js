// scripts/kv-check.js
// ============================================================
// Upstash / Vercel KV ulanganini tekshiradi.
//
//   npm run kv
//
// Nima qiladi:
//   1. Env o'zgaruvchilari bormi — ko'rsatadi
//   2. Redis'ga yozib, o'qib, o'chirib ko'radi
//   3. Bazada nechta o'yinchi borligini aytadi
// ============================================================

require("../api/_env");

const store = require("../api/_store");

const URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";

const TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

function line() {
  console.log("------------------------------------------------------------");
}

function hide(value) {
  if (!value) return "(yo'q)";

  return value.slice(0, 6) + "..." + value.slice(-4);
}

async function main() {
  line();
  console.log("ZONEX — ma'lumot bazasini tekshirish");
  line();

  console.log("KV_REST_API_URL   :", URL || "(yo'q)");
  console.log("KV_REST_API_TOKEN :", hide(TOKEN));
  console.log("Rejim             :", store.USE_REDIS ? "KV (Redis)" : "FAYL");

  line();

  if (!store.USE_REDIS) {
    console.log("Hozir hudud va akkauntlar oddiy faylda saqlanmoqda.");
    console.log("");
    console.log("Vercel'da bu vaqtinchalik — bir necha soatdan keyin");
    console.log("ma'lumot yo'qolishi mumkin.");
    console.log("");
    console.log("Qilish kerak:");
    console.log("  1. Vercel loyihasi -> Storage -> Upstash Redis -> Create");
    console.log("  2. Uni ZONEX loyihasiga Connect qiling");
    console.log("  3. Redeploy qiling");
    console.log("");
    console.log("Lokalda sinash uchun .env fayl yarating:");
    console.log("  KV_REST_API_URL=https://xxxx.upstash.io");
    console.log("  KV_REST_API_TOKEN=Axxxx...");
    line();

    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------
  // Haqiqiy yozish / o'qish testi
  // ---------------------------------------------------------

  const id = "zonex-test-" + Date.now();

  try {
    console.log("1) Sinov o'yinchisini yozamiz...");

    const player = store.createPlayer(id, "KV Test");

    // Kichik kvadrat hudud (maydon hududlardan hisoblanadi)
    const points = [
      [41.311, 69.2797],
      [41.3114, 69.2797],
      [41.3114, 69.2803],
      [41.311, 69.2803]
    ];

    player.territories.push({
      id: "t-kv-test",
      ownerId: id,
      ownerName: player.name,
      color: player.color,
      points,
      area: Math.round(store.polygonArea(points)),
      createdAt: Date.now()
    });

    store.rebuildArea(player);

    const expected = Math.round(player.area);

    await store.writePlayers(player);

    console.log("   yozildi ✓  (" + expected + " m2)");

    console.log("2) Qayta o'qiymiz...");

    const players = await store.readPlayers();

    const back = players[id];

    if (!back) throw new Error("yozilgan yozuv qaytib kelmadi");

    if (Math.round(back.area) !== expected) {
      throw new Error(
        "maydon buzilib qaytdi: " + back.area + " (kutilgan " + expected + ")"
      );
    }

    if (!back.territories.length) {
      throw new Error("hudud qaytib kelmadi");
    }

    console.log("   o'qildi ✓  (" + back.name + " = " + back.area + " m2)");

    console.log("3) Tozalaymiz...");

    await fetch(URL + "/pipeline", {
      method: "POST",

      headers: {
        Authorization: "Bearer " + TOKEN,
        "Content-Type": "application/json"
      },

      body: JSON.stringify([
        ["DEL", "zonex:player:" + id],
        ["SREM", "zonex:ids", id]
      ])
    });

    console.log("   tozalandi ✓");

    line();

    const world = await store.getWorld();

    console.log("HAMMASI ISHLAYAPTI ✓");
    console.log("");
    console.log("Bazadagi o'yinchilar :", world.players.length, "ta");

    console.log(
      "Umumiy hududlar      :",
      world.players.reduce(
        (sum, p) => sum + (p.territories ? p.territories.length : 0),
        0
      ),
      "ta"
    );

    line();

    process.exitCode = 0;
  } catch (error) {
    line();
    console.error("XATO:", error.message);
    console.error("");
    console.error("Tekshiring:");
    console.error("  - URL https://... bilan boshlanadimi");
    console.error("  - Token to'liq ko'chirilganmi");
    console.error("  - Upstash bazasi ochiqmi (Active holatda)");
    line();

    process.exitCode = 1;
  }
}

main();
