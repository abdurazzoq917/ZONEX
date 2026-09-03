// scripts/build-native-www.js
// ============================================================
// Native (Capacitor/Android) ilova uchun "public/" papkasini
// tayyorlaydi: index.html, styles.css, client.js shu yerga
// nusxalanadi va index.html'ga native-config.js ulanadi.
//
// api/, node_modules/ va h.k. native ilovaga KIRMAYDI — ular
// serverda (Vercel'da) qoladi, ilova esa ZONEX_API_BASE orqali
// o'sha serverga ulanadi.
//
// Ishlatish: npm run build:native
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

fs.mkdirSync(PUBLIC, { recursive: true });

// Native ilovaga ko'chiriladigan fayllar
["styles.css", "client.js", "qr.js", "game.js"].forEach((name) => {
  fs.copyFileSync(path.join(ROOT, name), path.join(PUBLIC, name));
});

// window.Capacitor.registerPlugin ni yoqadi — bu bo'lmasa
// BackgroundGeolocation plaginiga murojaat qilib bo'lmaydi.
fs.copyFileSync(
  path.join(ROOT, "node_modules", "@capacitor", "core", "dist", "capacitor.js"),
  path.join(PUBLIC, "capacitor.js")
);

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

if (!html.includes("native-config.js")) {
  html = html.replace(
    '<script src="client.js"></script>',
    '<script src="capacitor.js"></script>\n  <script src="native-config.js"></script>\n  <script src="client.js"></script>'
  );
}

fs.writeFileSync(path.join(PUBLIC, "index.html"), html);

// Birinchi marta ishga tushganda native-config.js hali bo'lmasa —
// bo'sh (web bilan bir xil, nisbiy /api/...) qiladigan andoza qo'yamiz.
const configPath = path.join(PUBLIC, "native-config.js");

if (!fs.existsSync(configPath)) {
  fs.writeFileSync(
    configPath,
    "// build:native buni QAYTA YOZMAYDI — qo'lda tahrirlang.\n" +
      "// ZONEX serveringiz manzilini shu yerga yozing, masalan:\n" +
      '// window.ZONEX_API_BASE = "https://zonex.vercel.app";\n' +
      'window.ZONEX_API_BASE = "";\n'
  );
}

console.log("public/ tayyor:", PUBLIC);
