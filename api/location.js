const { player } = require('./_store');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { id, name, lat, lng } = req.body || {};
  if (!id || !name || !Number.isFinite(+lat) || !Number.isFinite(+lng)) {
    return res.status(400).json({ error: 'invalid' });
  }
  player(String(id), name).location = { lat: +lat, lng: +lng, time: Date.now() };
  return res.status(200).json({ ok: true });
};
