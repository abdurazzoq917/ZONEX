const {
  getPlayer,
  updateLocation,
  addDistance,
  addTerritory,
  getPlayers
} = require("./data");

const world = {
  get players() {
    return getPlayers();
  }
};

function player(id, name) {
  return getPlayer(id, name);
}

module.exports = {
  world,
  player,
  updateLocation,
  addDistance,
  addTerritory
};