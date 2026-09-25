import assert from 'node:assert/strict';
import {
  BATTERY_MATERIAL_TECH_IDS,
  ensureBatterySupplyChain,
  tickBatterySupplyChain,
} from '../js/economy/batterySupplyChain.js';
import {
  GRID_TECH_IDS,
  communicationsCableConnectivity,
  ensureGridInterconnectionState,
  flushElectricityInterconnectors,
  proposeElectricityInterconnector,
  registerElectricityRegion,
  setGridConnectionPolicy,
} from '../js/economy/electricityInterconnectors.js';
import { seedConstructionEquipment } from '../js/economy/constructionEquipment.js';
import { tickLocalCommunications } from '../js/economy/localCommunications.js';
import { buildDrone, DRONE_TECH_IDS, DRONE_TYPES } from '../js/military/drones.js';

function gridRegion(id, polity, neighbors = [], seas = []) {
  return {
    id, name: id, population: 250000,
    governance: { sovereignPolityId: polity },
    neighbors, adjacentSeaIds: seas, isCoastal: seas.length > 0,
    unlockedTechIds: new Set([GRID_TECH_IDS.TRANSMISSION, GRID_TECH_IDS.SUBSEA_POWER]),
    construction: { completed: { local_electric_grid: 1 }, assets: [], projects: [] },
    stockpile: { steel: 10000, copper: 10000, aluminium: 10000, industrial_polymers: 10000, electronic_components: 10000 },
    treasury: 100000,
    tradeEconomy: { weeklyExports: 120, weeklyImports: 120 },
    electricity: {
      generated: 0, delivered: 0, demand: 0, householdDemand: 0, industrialDemand: 0,
      householdService: 0, industrialService: 0, exportableSurplus: 0, importNeed: 0,
      reliability: 1,
    },
  };
}

function completeProject(regions, project, rng = () => 1) {
  for (const region of regions) registerElectricityRegion(region);
  const result = flushElectricityInterconnectors(365 * 4, rng);
  assert.equal(project.status, 'completed', `project ${project.id} should complete with abundant materials, finance and required specialist plant`);
  assert.ok(result.completedProjects.some((link) => link.fromRegionId === project.fromRegionId && link.toRegionId === project.toRegionId));
  return result.completedProjects.find((link) => link.fromRegionId === project.fromRegionId && link.toRegionId === project.toRegionId);
}

// Material chain: modern battery manufacture should require actual processed feedstocks.
{
  const region = {
    id: 'battery-industrial', name: 'Battery Industrial Region', population: 1000000,
    unlockedTechIds: new Set(['lead_acid_batteries','advanced_rechargeable_batteries','lithium_ion_batteries','advanced_factories','industrial_electrification']),
    occupations: { miner: 30000 },
    structuralTransformation: { capability: { manufacture: .95 } },
    industrialSupply: { capability: { precision_machining: .95 }, inventory: { machine_components: 100 } },
    massEducation: { literacy: .9 }, electricity: { industrialService: .95 },
    stockpile: { sulfur: 100, copper: 100, steel: 100, aluminium: 100, electronic_components: 100 },
    resourceDeposits: {
      lead: { depth: 1, remainingFraction: 1 }, lithium: { depth: 1, remainingFraction: 1 },
      cobalt: { depth: 1, remainingFraction: 1 }, nickel: { depth: 1, remainingFraction: 1 }, graphite: { depth: 1, remainingFraction: 1 },
    },
  };
  const state = ensureBatterySupplyChain(region);
  state.facilities.mineralProcessing = 100;
  state.facilities.cellManufacturing = 100;
  region.unlockedTechIds.add(BATTERY_MATERIAL_TECH_IDS.MINERAL_PROCESSING);
  region.unlockedTechIds.add(BATTERY_MATERIAL_TECH_IDS.CELL_MANUFACTURING);
  const output = tickBatterySupplyChain(region, 365);
  assert.ok(output.extracted.lithium_ore > 0 && output.extracted.cobalt_ore > 0 && output.extracted.nickel_ore > 0 && output.extracted.natural_graphite > 0);
  assert.ok(output.processed.battery_grade_lithium > 0 && output.processed.battery_grade_cobalt > 0 && output.processed.battery_grade_nickel > 0 && output.processed.battery_graphite > 0);
  assert.ok(output.cells.lithium_ion_cells > 0, 'processed critical minerals should become lithium-ion cells');
}

// A battery-powered drone must consume a manufactured cell rather than merely having the tech flag.
{
  const region = {
    id: 'drone-maker', population: 100000, treasury: 100,
    unlockedTechIds: new Set([DRONE_TECH_IDS.MULTIROTOR, 'advanced_rechargeable_batteries']),
    stockpile: { steel: 10, advanced_rechargeable_cells: 0 },
    industrialSupply: { inventory: { machine_components: 10 }, capability: { precision_machining: .9 } },
  };
  assert.equal(buildDrone(region, DRONE_TYPES.QUADCOPTER), null, 'battery drone should fail without cells');
  region.stockpile.advanced_rechargeable_cells = 1;
  const before = region.stockpile.advanced_rechargeable_cells;
  const drone = buildDrone(region, DRONE_TYPES.QUADCOPTER);
  assert.ok(drone);
  assert.equal(drone.batteryChemistry, 'advanced_rechargeable');
  assert.ok(region.stockpile.advanced_rechargeable_cells < before, 'drone construction should consume cells');
}

// Land interconnector: surplus should move through the cable subject to loss/capacity.
{
  const a = gridRegion('A', 'P1', ['B']);
  const b = gridRegion('B', 'P1', ['A']);
  const project = proposeElectricityInterconnector(a, b, [a,b], { powerCapacity: 200, ownerType: 'government' });
  assert.equal(project.status, 'active');
  completeProject([a,b], project);
  a.electricity.exportableSurplus = 100;
  b.electricity.importNeed = 50;
  b.electricity.demand = 50;
  b.electricity.householdDemand = 35;
  b.electricity.industrialDemand = 15;
  for (const r of [a,b]) registerElectricityRegion(r);
  flushElectricityInterconnectors(7, () => 1);
  assert.ok(b.electricity.imports > 49 && b.electricity.imports <= 50.0001);
  assert.ok(a.electricity.exports > b.electricity.imports, 'transmission losses should make sent energy exceed delivered energy');
  assert.ok(b.electricity.interconnectorLosses > 0);
  tickLocalCommunications(b, 7);
  assert.ok(b.electricity.householdService > .98, 'imported electricity should restore household service as well as industrial service');
}

// Foreign permission considers indirect topology. A can disconnect B when B later joins C.
{
  const a = gridRegion('A2', 'PA', ['B2']);
  const b = gridRegion('B2', 'PB', ['A2','C2']);
  const c = gridRegion('C2', 'PC', ['B2']);
  const ab = proposeElectricityInterconnector(a, b, [a,b,c], { powerCapacity: 100 });
  assert.equal(ab.status, 'active');
  const abLink = completeProject([a,b,c], ab);
  setGridConnectionPolicy(a, { avoidIndirectPolityIds: ['PC'] });
  const bc = proposeElectricityInterconnector(b, c, [a,b,c], { powerCapacity: 100 });
  assert.equal(bc.status, 'active');
  completeProject([a,b,c], bc);
  const aCopy = ensureGridInterconnectionState(a).links.find((link) => link.id === abLink.id);
  assert.equal(aCopy.status, 'disconnected');
  assert.equal(aCopy.disconnectReason, 'indirect_grid_exposure');
  assert.ok(aCopy.unwantedPolityIds.includes('PC'));
}

// Undersea links require a specialised cable-laying vessel; once available they can carry communications and suffer anchor incidents.
{
  const a = gridRegion('SEA-A', 'PSEA', [], ['sea-1']);
  const b = gridRegion('SEA-B', 'PSEA', [], ['sea-1']);
  seedConstructionEquipment(a, { cableLayingVessels: 1 });
  const project = proposeElectricityInterconnector(a, b, [a,b], { undersea: true, powerCapacity: 120, communicationsCapacity: 200 });
  const link = completeProject([a,b], project, () => 1);
  assert.ok(communicationsCableConnectivity(a) > 0);
  for (const r of [a,b]) registerElectricityRegion(r);
  const result = flushElectricityInterconnectors(365, () => 0);
  const incident = result.incidents.find((item) => item.linkId === link.id && item.cause === 'civilian_anchor_drag');
  assert.ok(incident, 'civilian anchor drag should be a possible subsea cable incident');
  assert.equal(incident.observed, true, 'deterministic zero RNG should exercise the observed branch');
  assert.ok(incident.responseOptions.includes('repair_cable'));
}

console.log('battery supply and electricity interconnector regressions passed');
