import assert from 'node:assert/strict';
import {
  SHIP_DESIGNS, preferredWarshipDesign, initialiseFleets, fleetShipCounts, tickFleets, deployFleet,
} from '../js/military/fleets.js';
import {
  MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID, STEEL_HULL_TECH_ID,
} from '../js/technology/industrialMarine.js';

function construction(...types) {
  return { projects: [], completed: {}, assets: types.map((typeId, i) => ({ id: `${typeId}-${i}`, typeId, condition: 1, scale: 1 })) };
}
function region(id, techs, { readiness = 0, priority = 'trade', advanced = 3 } = {}) {
  return {
    id, name: id, governance: { sovereignPolityId: id }, controllingActorId: id,
    adjacentSeaIds: ['sea'], isCoastal: true,
    navy: { boats: advanced, advancedBoats: advanced, personnel: advanced * 20 },
    stockpile: { food: 5000, wood: 5000, pitch: 500, textiles: 500, bronze: 500, iron: 500, steel: 500, coal: 500, gunpowder: 100 },
    industrialSupply: { inventory: { machine_components: 500 }, capability: { precision_machining: 0.9, steelmaking: 0.9 } },
    construction: construction('harbour', 'shipyard', 'naval_base'),
    unlockedTechIds: new Set(techs),
    earlyModernMilitary: { naval: { readiness, guns: [] } },
    militaryPolicy: { navalPriority: priority }, relations: new Map(), experience: {},
    knowledge: { knownSubjectIds: new Set(), directContactIds: new Set() },
    treasury: 1000, wallet: 1000, population: 10000,
  };
}

const galleyRegion = region('galley', ['advanced_boatbuilding']);
assert.equal(preferredWarshipDesign(galleyRegion), 'galley');
assert.equal(fleetShipCounts(initialiseFleets([galleyRegion])[0]).galley, 3, 'advanced boatbuilding should produce real galleys, not a generic advanced ship');

const ocean = region('ocean', ['advanced_boatbuilding', 'ocean_sailing']);
assert.equal(preferredWarshipDesign(ocean), 'ocean_sailing_warship');

const powder = region('powder', ['advanced_boatbuilding', 'ocean_sailing', 'gunpowder'], { readiness: 0.2 });
assert.equal(preferredWarshipDesign(powder), 'gunpowder_sailing_warship');

const frigate = region('frigate', ['advanced_boatbuilding', 'ocean_sailing', 'gunpowder'], { readiness: 0.5 });
assert.equal(preferredWarshipDesign(frigate), 'frigate');

const battleFleet = region('battle', ['advanced_boatbuilding', 'ocean_sailing', 'gunpowder'], { readiness: 0.8, priority: 'war', advanced: 6 });
const battleCounts = fleetShipCounts(initialiseFleets([battleFleet])[0]);
assert.ok((battleCounts['ship of the line'] || 0) >= 1, 'war-focused mature sailing navies should include line-of-battle ships');
assert.ok((battleCounts.frigate || 0) >= 1, 'line-of-battle fleets should retain frigates rather than becoming a monoculture');

const steam = region('steam', ['advanced_boatbuilding', 'ocean_sailing', 'gunpowder', MARINE_STEAM_TECH_ID], { readiness: 0.7 });
assert.equal(preferredWarshipDesign(steam), 'paddle_steam_warship');
steam.unlockedTechIds.add(SCREW_PROPULSION_TECH_ID);
assert.equal(preferredWarshipDesign(steam), 'steam_frigate');
steam.unlockedTechIds.add(IRON_HULL_TECH_ID);
assert.equal(preferredWarshipDesign(steam), 'ironclad');
steam.unlockedTechIds.add(STEEL_HULL_TECH_ID);
assert.equal(preferredWarshipDesign(steam), 'steel_warship');

for (const id of ['galley', 'ocean_sailing_warship', 'gunpowder_sailing_warship', 'frigate', 'ship_of_line', 'paddle_steam_warship', 'steam_frigate', 'ironclad', 'steel_warship']) {
  assert.ok(SHIP_DESIGNS[id], `missing ship design ${id}`);
}
assert.ok(SHIP_DESIGNS.ironclad.armour > SHIP_DESIGNS.frigate.armour);
assert.ok(SHIP_DESIGNS.steam_frigate.speed > SHIP_DESIGNS.frigate.speed);

// Existing sailing ships modernise gradually in a real home shipyard and pay resources.
const modern = region('modern', ['advanced_boatbuilding'], { advanced: 2 });
const fleets = initialiseFleets([modern]);
const fleet = fleets[0];
modern.unlockedTechIds.add('ocean_sailing');
fleet.refitProgress = 1;
const woodBefore = modern.stockpile.wood;
tickFleets(fleets, [modern], [{ id: 'sea', adjacentLand: ['modern'], fish: { currentStock: 1, K: 1 } }], [], 1, 7, () => 0.99, { playerActorId: 'modern' });
assert.ok(fleet.ships.some((ship) => ship.designId === 'ocean_sailing_warship'), 'shipyard refit should modernise an older galley');
assert.ok(modern.stockpile.wood < woodBefore, 'modernisation should consume physical shipbuilding inputs');

// Steam ships bunker and consume coal; without coal they remain mobile at their fallback sail/auxiliary speed.
const fuelRegion = region('fuel', ['advanced_boatbuilding', 'ocean_sailing', 'gunpowder', MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID], { readiness: 0.8, advanced: 1 });
const fuelFleet = initialiseFleets([fuelRegion])[0];
const sea = { id: 'sea', adjacentLand: ['fuel'], fish: { currentStock: 1, K: 1 } };
tickFleets([fuelFleet], [fuelRegion], [sea], [], 2, 7, () => 0.99, { playerActorId: 'fuel' });
assert.ok(fuelFleet.coalBunker > 0, 'steam warship should bunker coal in port');
deployFleet(fuelFleet, 'sea', new Map([['fuel', fuelRegion]]), new Map([['sea', sea]]));
const bunkerBefore = fuelFleet.coalBunker;
tickFleets([fuelFleet], [fuelRegion], [sea], [], 3, 7, () => 0.99, { playerActorId: 'fuel' });
assert.ok(fuelFleet.coalBunker < bunkerBefore, 'steam propulsion should consume carried coal at sea');
assert.ok(fuelFleet.steamFuelFraction > 0, 'a fuelled steamship should receive its steam propulsion benefit');
fuelFleet.coalBunker = 0;
tickFleets([fuelFleet], [fuelRegion], [sea], [], 4, 7, () => 0.99, { playerActorId: 'fuel' });
assert.equal(fuelFleet.steamFuelFraction, 0, 'an exhausted bunker should remove the steam speed component without deleting the ship');

console.log('fleet ship progression regressions passed');
