const { player } = require('./_store');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const { id, name, points, area } = req.body || {};
  if (!id || !name || !Array.isArray(points) || points.length < 3) {
    return res.status(400).json({ error: 'invalid' });
  }
  const item = player(String(id), name);
  const safeArea = Math.max(0, Math.min(+area || 0, 1e8));
  item.territories.push({ points: points.slice(0, 5000), area: safeArea, time: Date.now() });
  item.area = item.territories.reduce((sum, territory) => sum + territory.area, 0);
  return res.status(200).json({ ok: true, area: item.area });
};
