const { player } = require("./_store");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

module.exports = function handler(req, res) {
  cors(res);

  // CORS tekshiruvi
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Faqat POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();

    const lat = Number(body.lat);
    const lng = Number(body.lng);

    // Ma'lumotlarni tekshirish
    if (!id) {
      return res.status(400).json({
        error: "id kerak"
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "name kerak"
      });
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return res.status(400).json({
        error: "latitude yoki longitude noto'g'ri"
      });
    }

    if (
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        error: "joylashuv chegaradan tashqarida"
      });
    }

    // Player yaratish / topish
    const user = player(id, name);

    // Joylashuvni yangilash
    user.location = {
      lat,
      lng,
      time: Date.now()
    };

    // Javob
    return res.status(200).json({
      ok: true,
      player: {
        id: user.id,
        name: user.name,
        color: user.color,
        location: user.location,
        area: user.area || 0
      }
    });

  } catch (error) {
    console.error(
      "LOCATION ERROR:",
      error
    );

    return res.status(500).json({
      error: "server error"
    });
  }
};