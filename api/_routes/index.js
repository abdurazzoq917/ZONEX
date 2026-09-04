// api/_routes/index.js
// ============================================================
// YO'NALISHLAR JADVALI — YAGONA MANBA
// ============================================================
//
// Bu papkadagi fayllar Vercel'da ALOHIDA funksiya BO'LMAYDI,
// chunki papka nomi "_" bilan boshlanadi. Ularning hammasini
// bitta `api/[...route].js` funksiyasi chaqiradi.
//
// Nega shunday? Vercel'ning bepul (Hobby) rejasida bitta
// deploy'da 12 tadan ortiq funksiya bo'lishi mumkin emas.
// Bizda 17 ta endpoint bor edi — shuning uchun deploy
// "Deploying outputs..." dan keyin to'xtab qolardi va sayt
// eski versiyada muzlab turardi.
//
// Manzillar o'zgarmadi: /api/world, /api/shop, /api/rank ...
// Yangi endpoint qo'shish uchun faylni shu papkaga qo'ying
// va pastdagi jadvalga bitta qator qo'shing.
// ============================================================

module.exports = {
  admin: require("./admin"),
  auth: require("./auth"),
  avatar: require("./avatar"),
  challenges: require("./challenges"),
  clans: require("./clans"),
  friends: require("./friends"),
  location: require("./location"),
  messages: require("./messages"),
  moderate: require("./moderate"),
  notify: require("./notify"),
  places: require("./places"),
  plus: require("./plus"),
  profile: require("./profile"),
  rank: require("./rank"),
  shop: require("./shop"),
  territory: require("./territory"),
  world: require("./world"),
};
