import assert from 'node:assert/strict';
import {
  FLAG_MODES, FLEET_MISSIONS, deployFleet, dockFleet, fleetEventInvolvesActor, fleetShipCounts, formatShipOutcome,
  identifyFleet, initialiseFleets, orderFleetHome, orderFleetToSea, portAccessLevel, resolveFleetBattle, setFleetFlag,
  setFleetMission, tickFleets,
} from '../js/military/fleets.js';
import { createGameSnapshot } from '../js/core/saveGame.js';

function construction(...types) {
  return { projects: [], completed: {}, assets: types.map((typeId, i) => ({ id: `${typeId}-${i}`, typeId, condition: 1, scale: 1 })) };
}
function region(id, actor, seaId, boats = 0, advanced = 0, infra = []) {
  return {
    id, name: id, governance: { sovereignPolityId: actor }, controllingActorId: actor,
    adjacentSeaIds: seaId ? [seaId] : [], isCoastal: Boolean(seaId),
    navy: { boats, advancedBoats: advanced, personnel: boats * 10 },
    stockpile: { food: 500, wood: 500, bronze: 50, iron: 20 },
    treasury: 500, wallet: 500, population: 10000,
    construction: construction(...infra),
    unlockedTechIds: new Set(['advanced_boatbuilding', 'naval_warfare']),
    militaryPolicy: { navalPriority: 'trade' }, relations: new Map(),
    experience: {}, neighbors: [], centroid: [0, 0], areaSqKm: 1000, feature: {}, terrain: {},
    knowledge: { ownerId: id, observations: [], knownSubjectIds: new Set(), directContactIds: new Set(), _observationByStream: new Map() },
  };
}
const sea = { id: 'sea_black', name: 'Black Sea', adjacentLand: ['essex', 'kent', 'ally'], fish: { currentStock: 1, K: 1 } };
const aegeanSea = { id: 'sea_aegean', name: 'Aegean Sea', adjacentLand: ['aegean_port'], fish: { currentStock: 1, K: 1 } };
const marmaraSea = { id: 'sea_marmara', name: 'Sea of Marmara', adjacentLand: [], fish: { currentStock: 1, K: 1 } };
const essex = region('essex', 'polity_essex', sea.id, 8, 2, ['harbour','shipyard','naval_base','coastal_fortifications']);
const kent = region('kent', 'polity_kent', sea.id, 7, 1, ['harbour']);
const ally = region('ally', 'polity_ally', sea.id, 0, 0, ['harbour','shipyard']);
const aegeanPort = region('aegean_port', 'polity_aegean', aegeanSea.id, 0, 0, ['harbour']);
essex.knowledge.knownSubjectIds.add('kent');
essex.knowledge.knownSubjectIds.add('ally');
const regions = [essex, kent, ally, aegeanPort];
const regionsById = new Map(regions.map((r) => [r.id, r]));
const allSeas = [sea, aegeanSea, marmaraSea];
const seasById = new Map(allSeas.map((s) => [s.id, s]));
const agreements = [{ id: 1, type: 'military_support', fromId: 'essex', toId: 'ally', active: true, personnel: 50 }];
const fleets = initialiseFleets(regions);
const essexFleet = fleets.find((f) => f.ownerRegionId === 'essex');
const kentFleet = fleets.find((f) => f.ownerRegionId === 'kent');
assert.equal(essexFleet.ships.length, 8);
assert.equal(fleetShipCounts(essexFleet)['advanced warship'], 2);

// Own-faction registry beats deceptive flags: Essex cannot be tricked by an
// outsider merely painting an Essex flag on its ships.
kentFleet.flag = { mode: FLAG_MODES.FALSE, actorId: 'polity_essex' };
let id = identifyFleet(essexFleet, kentFleet, regionsById, () => 0.99);
assert.equal(id.imposterOfObserver, true);
assert.equal(id.falseFlagDetected, true);
assert.equal(id.actualActorId, null, 'perfect self knowledge need not magically reveal who the impostor really is');

// False flags can only imitate a known polity when ordered through the API.
let flag = setFleetFlag(essexFleet, FLAG_MODES.FALSE, 'polity_kent', regionsById);
assert.equal(flag.changed, true);
flag = setFleetFlag(essexFleet, FLAG_MODES.FALSE, 'polity_unknown', regionsById);
assert.equal(flag.changed, false);

// Allied ports provide victuals and shore leave, but not serious repair.
assert.equal(portAccessLevel(essexFleet, ally, regionsById, agreements), 'ally');
essexFleet.locationType = 'port'; essexFleet.portRegionId = 'ally'; essexFleet.seaRegionId = null;
essexFleet.supply = 0.25; essexFleet.condition = 0.5; essexFleet.fatigue = 0.7;
const beforeAllyFood = ally.stockpile.food;
tickFleets(fleets, regions, allSeas, agreements, 10, 7, () => 0.99, { playerActorId: 'polity_essex' });
assert.ok(essexFleet.supply > 0.25);
assert.ok(ally.stockpile.food < beforeAllyFood);
const allyRepair = essexFleet.condition - 0.5;
assert.ok(allyRepair > 0 && allyRepair < 0.01, `allied repair should be minor, got ${allyRepair}`);

// Home naval infrastructure repairs much faster.
essexFleet.locationType = 'port'; essexFleet.portRegionId = 'essex'; essexFleet.condition = 0.5;
tickFleets(fleets, regions, allSeas, agreements, 20, 7, () => 0.99, { playerActorId: 'polity_essex' });
assert.ok(essexFleet.condition - 0.5 > allyRepair * 5);

// Multiple fleets can occupy the same sea. A patrol can detect another fleet
// without either side automatically owning the whole basin.
deployFleet(essexFleet, sea.id, regionsById, seasById);
deployFleet(kentFleet, sea.id, regionsById, seasById);
setFleetMission(essexFleet, FLEET_MISSIONS.PATROL);
setFleetMission(kentFleet, FLEET_MISSIONS.HIDE);
essexFleet.flag = { mode: FLAG_MODES.OWN, actorId: 'polity_essex' };
kentFleet.flag = { mode: FLAG_MODES.FALSE, actorId: 'polity_essex' };
const tick = tickFleets(fleets, regions, allSeas, agreements, 30, 28, () => 0, { playerActorId: 'polity_essex' });
const contact = tick.events.find((e) => e.type === 'fleet_contact' && e.observerFleetId === essexFleet.id);
assert.ok(contact, 'player patrol should detect a foreign fleet with favourable detection roll');
assert.match(contact.description, /impostors dared to falsely imitate us/i);

// A blockade creates coastal pressure without claiming that traffic is
// mathematically impossible.
setFleetMission(essexFleet, FLEET_MISSIONS.BLOCKADE, { targetId: 'kent' });
tickFleets(fleets, regions, allSeas, agreements, 40, 7, () => 0.99, { playerActorId: 'polity_essex' });
assert.ok(kent.navalBlockadePressure > 0 && kent.navalBlockadePressure <= 1);

// Port defence is a major multiplier. Use cloned fleet state so the first
// battle cannot affect the comparison.
function cloneFleet(f) { return structuredClone(f); }
const a1 = cloneFleet(essexFleet); const d1 = cloneFleet(kentFleet);
a1.locationType = 'sea'; d1.locationType = 'sea'; d1.portRegionId = null;
const seaFight = resolveFleetBattle(a1, d1, regionsById, () => 0.91);
const a2 = cloneFleet(essexFleet); const d2 = cloneFleet(kentFleet);
d2.locationType = 'port'; d2.portRegionId = 'kent';
const portFight = resolveFleetBattle(a2, d2, regionsById, () => 0.91, { defenderInPort: true });
assert.ok(portFight.attackerShare < seaFight.attackerShare, 'fleet in port should be much harder to attack');

// Ship outcomes retain exact class labels: the system never reduces a future
// carrier/frigate distinction to generic "one boat" text.
assert.equal(formatShipOutcome({ 'advanced warship': 1, 'war boat': 2 }), '1 advanced warship, 2 war boats');
const bespoke = cloneFleet(essexFleet);
bespoke.ships[0].classLabel = 'aircraft carrier';
assert.equal(fleetShipCounts(bespoke)['aircraft carrier'], 1);

// Docking API respects alliance access.
essexFleet.locationType = 'sea'; essexFleet.seaRegionId = sea.id; essexFleet.portRegionId = null;
let docked = dockFleet(essexFleet, 'ally', regionsById, agreements);
assert.equal(docked.docked, true);
kentFleet.locationType = 'sea'; kentFleet.seaRegionId = sea.id; kentFleet.portRegionId = null;
docked = dockFleet(kentFleet, 'ally', regionsById, agreements);
assert.equal(docked.docked, false);

// Fleets move through the actual sea/chokepoint graph. Aegean -> Black Sea
// necessarily passes through Marmara, and docking cannot teleport from the
// Black Sea back into an Aegean port.
const routeFleet = cloneFleet(essexFleet);
routeFleet.id = 'fleet-route-test'; routeFleet.ownerRegionId = 'aegean_port'; routeFleet.ownerActorId = 'polity_aegean';
routeFleet.homePortRegionId = 'aegean_port'; routeFleet.locationType = 'port'; routeFleet.portRegionId = 'aegean_port'; routeFleet.seaRegionId = null;
const routeOrder = orderFleetToSea(routeFleet, 'sea_black', regionsById, seasById, FLEET_MISSIONS.PATROL);
assert.equal(routeOrder.ordered, true);
assert.deepEqual(routeOrder.route, ['sea_aegean', 'sea_marmara', 'sea_black']);
routeFleet.locationType = 'sea'; routeFleet.seaRegionId = 'sea_black'; routeFleet.portRegionId = null; routeFleet.routeSeaIds = [];
docked = dockFleet(routeFleet, 'aegean_port', regionsById, agreements);
assert.equal(docked.docked, false);
assert.equal(docked.reason, 'port_not_on_this_sea');
const homeOrder = orderFleetHome(routeFleet, regionsById, seasById);
assert.equal(homeOrder.ordered, true);
assert.deepEqual(homeOrder.route, ['sea_black', 'sea_marmara', 'sea_aegean']);

// Important fleet events carry actor IDs directly, so a sunk final ship or
// worn-out lone vessel still notifies its owner after that fleet is removed.
assert.equal(fleetEventInvolvesActor({ type: 'fleet_ship_worn_out', ownerActorId: 'polity_essex' }, 'polity_essex', []), true);
assert.equal(fleetEventInvolvesActor({ type: 'fleet_battle', attackerOwnerActorId: 'polity_essex', defenderOwnerActorId: 'polity_kent' }, 'polity_essex', []), true);

// New saves persist the actual fleet/ship state. Old saves without this field
// remain version-1 compatible and are migrated by main.js from region totals.
const snapshot = createGameSnapshot({
  regions, seaRegions: allSeas, polities: [], religiousWorld: {}, agreements,
  activeRaids: [], activeCampaigns: [], fleets,
  clock: { tickIndex: 50, elapsedDays: 350, resolution: { id: 'month' }, speed: 0, _resumeSpeed: 1, _estimatedTickMs: 10 },
  playerRegionId: 'essex', playerPolityId: 'polity_essex', fogOfWar: { devMode: false },
});
assert.equal(snapshot.fleets.length, fleets.length);
assert.equal(snapshot.fleets.find((f) => f.id === essexFleet.id).ships.length, essexFleet.ships.length);
assert.equal(snapshot.fleets.find((f) => f.id === essexFleet.id).flag.mode, essexFleet.flag.mode);

console.log('persistent fleet regression tests passed');
