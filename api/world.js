const { world } = require('./_store');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(world);
};
