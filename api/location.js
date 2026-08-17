const {
  updateLocation,
  addDistance
} = require("./_store");

function cors(res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

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

    if (!id || !name) {
      return res.status(400).json({
        error: "id va name kerak"
      });
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return res.status(400).json({
        error: "location noto'g'ri"
      });
    }

    if (
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return res.status(400).json({
        error: "location chegaradan tashqarida"
      });
    }

    const user = updateLocation(
      id,
      name,
      lat,
      lng
    );

    // Client yuborgan masofani ham saqlaymiz
    if (
      body.distance !== undefined
    ) {
      const distance = Number(
        body.distance
      );

      if (
        Number.isFinite(distance) &&
        distance > 0
      ) {
        addDistance(
          id,
          name,
          distance
        );
      }
    }

    return res.status(200).json({
      ok: true,
      player: user
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