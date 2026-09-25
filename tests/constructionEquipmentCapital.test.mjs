import assert from 'node:assert/strict';
import { constructionProductivity } from '../js/economy/constructionProductivity.js';
import {
  ensureConstructionEquipment,
  seedConstructionEquipment,
  constructionEquipmentFactor,
  tickConstructionEquipment,
} from '../js/economy/constructionEquipment.js';
import {
  ensureGridInterconnectionState,
  proposeElectricityInterconnector,
  registerElectricityRegion,
  flushElectricityInterconnectors,
} from '../js/economy/electricityInterconnectors.js';

function region(id, polity = 'uk') {
  return {
    id, name: id, scenarioCountryId: polity, controllingActorId: polity,
    governance: { sovereignPolityId: polity },
    population: 1_000_000, demographics: { workingAge: 600_000 },
    isCoastal: true, adjacentSeaIds: ['sea'], neighbors: [],
    unlockedTechIds: new Set(['industrial_electrification','internal_combustion_tractors','high_voltage_transmission','submarine_power_cables']),
    electricity: { industrialService: .95, service: .95 },
    structuralTransformation: { capability: { manufacture: .85 } },
    industrialSupply: { capability: { precision_machining: .9, railway_engineering: .8 }, inventory: { machine_components: 50_000 } },
    construction: { projects: [], assets: [{ typeId: 'road_network', condition: 1 }, { typeId: 'telephone_exchange', condition: 1 }, { typeId: 'factory', condition: 1 }, { typeId: 'local_electric_grid', condition: 1 }], completed: { local_electric_grid: 1 } },
    stockpile: { steel: 100_000, copper: 100_000, aluminium: 100_000, industrial_polymers: 100_000, electronic_components: 100_000 },
    treasury: 100_000,
  };
}

const bronze = region('bronze');
bronze.unlockedTechIds = new Set();
bronze.electricity.industrialService = 0;
bronze.structuralTransformation.capability.manufacture = 0;
bronze.industrialSupply.capability = {};
bronze.construction.assets = [];
const ancient = constructionProductivity(bronze, 'road_network', 120);

const modern = region('modern');
seedConstructionEquipment(modern, {
  powerToolSets: 100, excavators: 20, bulldozers: 10, constructionTrucks: 40,
  mobileCranes: 10, concretePlantUnits: 5, tunnelBoringMachines: 1,
});
const modernRoad = constructionProductivity(modern, 'road_network', 120);
assert.ok(modernRoad >= 10, `mature modern road construction should reach double-digit productivity, got ${modernRoad}`);
assert.ok(modernRoad >= ancient * 8, `modern construction should materially exceed ancient labour (${modernRoad} vs ${ancient})`);

const noCrane = region('no-crane');
seedConstructionEquipment(noCrane, { powerToolSets: 100, excavators: 20, bulldozers: 10, constructionTrucks: 40, concretePlantUnits: 5 });
const withCrane = constructionEquipmentFactor(modern, 'harbour', 300).factor;
const withoutCrane = constructionEquipmentFactor(noCrane, 'harbour', 300).factor;
assert.ok(withCrane > withoutCrane * 1.5, 'heavy cranes should be a real heavy-lift bottleneck, not equivalent to a few extra workers');

const noTbm = region('no-tbm');
seedConstructionEquipment(noTbm, { powerToolSets: 100, excavators: 20, bulldozers: 10, constructionTrucks: 40, mobileCranes: 10, concretePlantUnits: 5 });
const hydroWithTbm = constructionProductivity(modern, 'hydroelectric_station', 300);
const hydroWithoutTbm = constructionProductivity(noTbm, 'hydroelectric_station', 300);
assert.ok(hydroWithTbm > hydroWithoutTbm * 2, `TBM should transform tunnel-heavy hydro construction (${hydroWithTbm} vs ${hydroWithoutTbm})`);

const ageing = region('ageing');
seedConstructionEquipment(ageing, { excavators: 10 });
ensureConstructionEquipment(ageing).targets.excavators = 12;
tickConstructionEquipment(ageing, 365.2425);
assert.ok(ageing.constructionEquipment.stock.excavators >= 10, 'industrial plant should replenish ordinary construction capital toward its target');
assert.ok(ageing.constructionEquipment.serviceable.excavators > 0, 'construction equipment should track serviceable capital separately from owned stock');

const a = region('a');
const b = region('b');
ensureGridInterconnectionState(a); ensureGridInterconnectionState(b);
const stalled = proposeElectricityInterconnector(a, b, [a,b], { undersea: true, powerCapacity: 1000 });
registerElectricityRegion(a); registerElectricityRegion(b);
flushElectricityInterconnectors(30, () => .99);
assert.equal(stalled.workDone, 0, 'an undersea cable should not progress merely by adding labour when there is no cable-laying vessel');
assert.equal(stalled.stalledReason, 'cable_laying_vessel_unavailable');

seedConstructionEquipment(a, { cableLayingVessels: 1 });
registerElectricityRegion(a); registerElectricityRegion(b);
flushElectricityInterconnectors(30, () => .99);
assert.ok(stalled.workDone > 0, 'a serviceable cable-laying vessel should unlock real undersea cable progress');

console.log('Construction equipment capital and specialised bottleneck regressions passed.');
