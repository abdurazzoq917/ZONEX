const initialWorld = require('../world.json');

const world = globalThis.__zonexWorld || structuredClone(initialWorld);
globalThis.__zonexWorld = world;

function player(id, name) {
  let item = world.players.find((entry) => entry.id === id);
  if (!item) {
    const hue = Math.abs([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 47) % 360;
    item = { id, name, color: `hsl(${hue} 72% 48%)`, area: 0, territories: [] };
    world.players.push(item);
  }
  item.name = String(name || item.name).slice(0, 20);
  return item;
}

module.exports = { world, player };
