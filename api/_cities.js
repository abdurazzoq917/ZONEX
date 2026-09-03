// api/_cities.js
// ============================================================
// SHAHARNI ANIQLASH
// ============================================================
//
// Shahar reytingi ("Toshkent vs Samarqand vs Buxoro") uchun
// o'yinchining shahri kerak. Uni tashqi xizmatdan so'ramaymiz:
// koordinata jadvaldagi eng yaqin shaharga solishtiriladi.
//
// Shahar UY manzilidan olinadi (uni o'yinchi o'zi belgilaydi),
// uy belgilanmagan bo'lsa — oxirgi joylashuvdan.
//
// Jadvalda yo'q joydan o'ynasa — shahri "boshqa" bo'ladi va u
// baribir global va davlat reytingida qatnashadi.
// ============================================================

const CITIES = [
  { id: "tashkent", name: "Toshkent", lat: 41.3111, lng: 69.2797 },
  { id: "samarkand", name: "Samarqand", lat: 39.627, lng: 66.975 },
  { id: "bukhara", name: "Buxoro", lat: 39.7686, lng: 64.4556 },
  { id: "namangan", name: "Namangan", lat: 40.9983, lng: 71.6726 },
  { id: "andijan", name: "Andijon", lat: 40.7821, lng: 72.3442 },
  { id: "fergana", name: "Farg'ona", lat: 40.3864, lng: 71.7864 },
  { id: "nukus", name: "Nukus", lat: 42.4531, lng: 59.6103 },
  { id: "qarshi", name: "Qarshi", lat: 38.8606, lng: 65.7891 },
  { id: "kokand", name: "Qo'qon", lat: 40.5286, lng: 70.9425 },
  { id: "margilan", name: "Marg'ilon", lat: 40.4711, lng: 71.7244 },
  { id: "urgench", name: "Urganch", lat: 41.5506, lng: 60.6317 },
  { id: "jizzakh", name: "Jizzax", lat: 40.1158, lng: 67.8422 },
  { id: "termez", name: "Termiz", lat: 37.2242, lng: 67.2783 },
  { id: "navoiy", name: "Navoiy", lat: 40.0844, lng: 65.3792 },
  { id: "gulistan", name: "Guliston", lat: 40.4897, lng: 68.7842 },
  { id: "nurafshon", name: "Nurafshon", lat: 41.0167, lng: 69.35 },
  { id: "chirchiq", name: "Chirchiq", lat: 41.4689, lng: 69.5822 },
  { id: "angren", name: "Angren", lat: 41.0167, lng: 70.1436 },
  { id: "bekabad", name: "Bekobod", lat: 40.2206, lng: 69.2686 },
  { id: "shahrisabz", name: "Shahrisabz", lat: 39.0578, lng: 66.8342 }
];

const OTHER = { id: "other", name: "Boshqa shahar" };

// Shahar shu masofadan uzoq bo'lsa — "boshqa" hisoblanadi (km)
const MAX_KM = 70;

function distanceKm(a, b, lat, lng) {
  const R = 6371;

  const toRad = (value) => (value * Math.PI) / 180;

  const dLat = toRad(lat - a);
  const dLng = toRad(lng - b);

  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a)) * Math.cos(toRad(lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Koordinatadan shahar. Topilmasa — null.
function cityAt(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  let best = null;
  let bestKm = Infinity;

  CITIES.forEach((city) => {
    const km = distanceKm(a, b, city.lat, city.lng);

    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  });

  return best && bestKm <= MAX_KM ? best : null;
}

function cityById(id) {
  const key = String(id || "");

  if (key === OTHER.id) return OTHER;

  return CITIES.find((city) => city.id === key) || null;
}

function cityName(id) {
  const city = cityById(id);

  return city ? city.name : OTHER.name;
}

// O'yinchining shahri: uy bo'lsa uydan, bo'lmasa joylashuvdan
function cityOf(player) {
  const home = player && player.home;

  if (home && Number.isFinite(Number(home.lat))) {
    const found = cityAt(home.lat, home.lng);

    return found ? found.id : OTHER.id;
  }

  const location = player && player.location;

  if (location && Number.isFinite(Number(location.lat))) {
    const found = cityAt(location.lat, location.lng);

    return found ? found.id : OTHER.id;
  }

  return "";
}

module.exports = {
  CITIES,
  OTHER,
  MAX_KM,
  distanceKm,
  cityAt,
  cityById,
  cityName,
  cityOf
};
