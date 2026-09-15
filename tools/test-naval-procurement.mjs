import assert from 'node:assert/strict';
import { desiredWarshipComposition, ensureNavalProcurement, refreshNavalProcurementTargets } from '../js/military/fleets.js';
import { buildWarshipClass } from '../js/economy/laborCore.js';
import { MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID } from '../js/technology/industrialMarine.js';

function region(techs, targetNavySize = 6, priority = 'war', readiness = 0.8) {
  return {
    id: 'test', targetNavySize, navy: { boats: 0, advancedBoats: 0, personnel: 0 },
    unlockedTechIds: new Set(techs), militaryPolicy: { navalPriority: priority },
    earlyModernMilitary: { naval: { readiness } },
    construction: { projects: [], completed: {}, assets: [
      { id: 'harbour', typeId: 'harbour', condition: 1, scale: 1 },
      { id: 'shipyard', typeId: 'shipyard', condition: 1, scale: 1 },
      { id: 'naval-base', typeId: 'naval_base', condition: 1, scale: 1 },
    ] },
    stockpile: { wood: 10000, pitch: 1000, textiles: 1000, bronze: 1000, iron: 1000, steel: 1000, coal: 1000, gunpowder: 1000 },
    industrialSupply: { inventory: { machine_components: 1000 } },
  };
}

const bronze = region(['advanced_boatbuilding'], 4);
assert.deepEqual(desiredWarshipComposition(bronze), { galley: 4 });

const sail = region(['advanced_boatbuilding', 'ocean_sailing', 'gunpowder'], 6);
const sailTargets = refreshNavalProcurementTargets(sail, 10);
assert.equal(sailTargets.ship_of_line, 2, 'mature battle fleet should explicitly order line ships');
assert.equal(sailTargets.frigate, 4, 'mature battle fleet should explicitly order frigates');
assert.equal(ensureNavalProcurement(sail).lastDecisionTick, 10);

const steam = region(['advanced_boatbuilding', 'ocean_sailing', 'gunpowder', MARINE_STEAM_TECH_ID], 3);
assert.deepEqual(desiredWarshipComposition(steam), { paddle_steam_warship: 3 });
steam.unlockedTechIds.add(SCREW_PROPULSION_TECH_ID);
assert.deepEqual(desiredWarshipComposition(steam), { steam_frigate: 3 });
steam.unlockedTechIds.add(IRON_HULL_TECH_ID);
assert.deepEqual(desiredWarshipComposition(steam), { ironclad: 3 });

const builder = region(['advanced_boatbuilding', 'ocean_sailing', 'gunpowder'], 1);
const woodBefore = builder.stockpile.wood;
const powderBefore = builder.stockpile.gunpowder;
const line = buildWarshipClass(builder, 'ship_of_line', 1, 1000);
assert.equal(line.built, 1);
assert.equal(builder.stockpile.wood, woodBefore - 1100);
assert.equal(builder.stockpile.gunpowder, powderBefore - 10);
assert.ok(line.makers > 100, 'capital ships should consume substantially more shipyard labour than small craft');

const industrial = region(['advanced_boatbuilding', MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID], 1);
const ironBefore = industrial.stockpile.iron;
const machineBefore = industrial.industrialSupply.inventory.machine_components;
const ironclad = buildWarshipClass(industrial, 'ironclad', 1, 1000);
assert.equal(ironclad.built, 1);
assert.equal(industrial.stockpile.iron, ironBefore - 150);
assert.equal(industrial.industrialSupply.inventory.machine_components, machineBefore - 24);

console.log('naval procurement regressions passed');
