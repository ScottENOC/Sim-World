import assert from 'node:assert/strict';
import { applyConstructionLaborMobility, railCommuteProfile, automobileCommuteProfile } from '../js/economy/laborMobility.js';
import { constructionProductivity } from '../js/economy/constructionProductivity.js';
import { startConstruction, prepareConstructionLabor, tickConstruction } from '../js/economy/construction.js';
import { regionalRailElectricityDemand } from '../js/economy/railways.js';
import { electricityDemand } from '../js/economy/electricity.js';

function baseRegion(id, name, polity = 'uk') {
  return {
    id, name, scenarioCountryId: polity, controllingActorId: polity,
    governance: { sovereignPolityId: polity },
    population: 100_000,
    demographics: { workingAge: 60_000 },
    centroid: [0, 51], neighbors: [],
    army: { personnel: 0 }, navy: { personnel: 0 }, emergencyMilitiaPersonnel: 0,
    construction: { projects: [], completed: {}, assets: [], workersReserved: 0, maintenanceWorkersReserved: 0, lastWeek: null },
    stockpile: { stone: 100_000, wood: 100_000, pottery: 100_000 },
    treasury: 100_000, wallet: 0,
    unlockedTechIds: new Set(),
    industrialSupply: { capability: {} }, structuralTransformation: { capability: {} },
    electricity: { industrialService: 0 },
    civilianTransport: { automobiles: 0 },
  };
}

const kent = baseRegion('kent', 'Kent');
const london = baseRegion('london', 'London');
// Force a genuine local labour shortage so the test exercises mobility rather
// than simply satisfying the 200-worker request from Kent itself.
kent.demographics.workingAge = 250;
kent.railConnections = {
  london: {
    status: 'operational', effectiveCapacity: 1.6, passengerCapacity: 1.45,
    lengthKm: 110, maxSpeedKph: 300, highSpeedCapable: true,
    electrification: ['third_rail_750v_dc', 'overhead_25kv_ac'],
    lines: {
      conventional: { lineId: 'conventional', status: 'operational', effectiveCapacity: .8, passengerCapacity: .75, lengthKm: 110, maxSpeedKph: 160, electrification: 'third_rail_750v_dc', rollingStock: { electric: 1 } },
      hs1: { lineId: 'hs1', status: 'operational', effectiveCapacity: .8, passengerCapacity: .7, lengthKm: 110, maxSpeedKph: 300, electrification: 'overhead_25kv_ac', rollingStock: { highSpeedElectric: 1 } },
    },
  },
};
london.railConnections = { kent: kent.railConnections.london };
kent.electricity.industrialService = .95;
london.electricity.industrialService = .95;
const rail = railCommuteProfile(london, kent);
assert.ok(rail && rail.workerShare > 0, 'a fast high-capacity Kent-London rail connection should support commuting');
assert.ok(rail.travelMinutes < 90, 'high-speed rail should keep the modelled Kent-London journey inside the commuting window');
const railGridLoad = regionalRailElectricityDemand(london, 7);
assert.ok(railGridLoad > 0, 'electric railways should create a real regional electricity load');
assert.ok(electricityDemand(london, 7).railElectricityDemand > 0, 'rail traction demand should be included in electricity dispatch demand');
const healthyRailShare = rail.workerShare;
kent.electricity.industrialService = .1;
london.electricity.industrialService = .1;
const constrainedRail = railCommuteProfile(london, kent);
assert.ok(constrainedRail && constrainedRail.workerShare < healthyRailShare * .5, 'electric commuting capacity should fall when the endpoint grids cannot serve traction');
kent.electricity.industrialService = .95;
london.electricity.industrialService = .95;

startConstruction(kent, 'public_granary', 200, 0);
prepareConstructionLabor([kent, london]);
const localOnly = kent.construction.workersReserved;
assert.ok(localOnly < 200, 'fixture should have a real local construction labour shortage');
applyConstructionLaborMobility([kent, london]);
assert.ok(kent.construction.importedWorkersReserved > 0, 'Kent should be able to attract construction labour from London by rail');
assert.equal(kent.laborMobility.incomingConstructionWorkers, london.laborMobility.outgoingConstructionWorkers, 'commuters must be removed from the donor region rather than duplicated');
assert.ok(kent.construction.workersReserved > localOnly, 'commuting should expand the available construction workforce when local labour is short');

const foreign = baseRegion('foreign', 'Foreign', 'france');
foreign.railConnections = { kent: kent.railConnections.london };
const isolatedKent = baseRegion('isolated-kent', 'Kent', 'uk');
isolatedKent.demographics.workingAge = 250;
isolatedKent.railConnections = { foreign: foreign.railConnections.kent };
startConstruction(isolatedKent, 'public_granary', 200, 0);
prepareConstructionLabor([isolatedKent, foreign]);
applyConstructionLaborMobility([isolatedKent, foreign]);
assert.equal(isolatedKent.construction.importedWorkersReserved, 0, 'ordinary construction commuting must not cross sovereign borders');

const roadA = baseRegion('road-a', 'Road A');
const roadB = baseRegion('road-b', 'Road B');
roadA.neighbors = ['road-b']; roadB.neighbors = ['road-a'];
roadA.centroid = [0, 51]; roadB.centroid = [.45, 51];
for (const r of [roadA, roadB]) {
  r.construction.assets.push({ typeId: 'road_network', condition: 1 });
  r.civilianTransport.automobiles = Math.round(r.population * .6);
}
assert.ok(automobileCommuteProfile(roadA, roadB)?.workerShare > 0, 'neighbouring modern road networks with real automobile ownership should support commuting');
roadA.civilianTransport.automobiles = 0;
assert.equal(automobileCommuteProfile(roadA, roadB), null, 'roads alone must not imply mass automobile commuting');

const bronze = baseRegion('bronze', 'Bronze');
const modern = baseRegion('modern', 'Modern');
modern.unlockedTechIds = new Set(['industrial_electrification', 'internal_combustion_tractors']);
modern.electricity.industrialService = .9;
modern.structuralTransformation.capability.manufacture = .84;
modern.industrialSupply.capability.precision_machining = .9;
modern.industrialSupply.capability.railway_engineering = .8;
modern.construction.assets.push({ typeId: 'road_network', condition: 1 }, { typeId: 'telephone_exchange', condition: 1 });
const bronzeProductivity = constructionProductivity(bronze, 'public_granary');
const modernProductivity = constructionProductivity(modern, 'public_granary');
assert.ok(bronzeProductivity >= .99 && bronzeProductivity <= 1.1, 'low-tech construction should remain close to one effective worker-week per worker-week');
assert.ok(modernProductivity >= 2.5, `modern powered construction should materially outperform ancient labour (got ${modernProductivity})`);

function projectRegion(id) {
  const r = baseRegion(id, id);
  r.unlockedTechIds = new Set(modern.unlockedTechIds);
  r.electricity.industrialService = modern.electricity.industrialService;
  r.structuralTransformation.capability.manufacture = modern.structuralTransformation.capability.manufacture;
  r.industrialSupply.capability = { ...modern.industrialSupply.capability };
  r.construction.assets = modern.construction.assets.map((asset) => ({ ...asset }));
  startConstruction(r, 'public_granary', 100, 0);
  prepareConstructionLabor([r]);
  return r;
}
const weekly = projectRegion('weekly');
const daily = projectRegion('daily');
tickConstruction([weekly], 1, 7);
for (let d = 1; d <= 7; d++) tickConstruction([daily], d, 1);
assert.ok(Math.abs(weekly.construction.projects[0].workDone - daily.construction.projects[0].workDone) < 1e-6,
  'seven daily construction ticks should deliver the same work as one seven-day tick when inputs are unchanged');
assert.ok(weekly.construction.lastWeek?.productivity >= 2.5, 'construction reporting should expose the productivity multiplier');

console.log('Rail commuting, rail electricity and modern construction productivity regressions passed.');
