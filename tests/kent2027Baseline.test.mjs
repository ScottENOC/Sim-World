import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';

const profile = JSON.parse(readFileSync(new URL('../data/scenarios/fractured-2027/modern-start.json', import.meta.url), 'utf8'));

function region(id, name, country = 'united-kingdom') {
  return {
    id,
    name,
    scenarioCountryId: country,
    population: 100,
    unlockedTechIds: new Set(),
    electricity: {},
    structuralTransformation: { capability: {} },
    industrialSupply: { capability: {}, inventory: {} },
    industrialPlants: { componentCapability: {} },
    stockpile: {},
    army: { personnel: 0, away: 0 },
    governance: { sovereignPolityId: country, sovereignPolityName: country },
  };
}

const kent = region('kent-id', 'Kent');
const london = region('london-id', 'London');
const eastSussex = region('east-sussex-id', 'East Sussex');
const yorkshire = region('yorkshire-id', 'North Yorkshire');
const france = region('france-id', 'Nord', 'france');
const world = { regions: [kent, london, eastSussex, yorkshire, france], scenarioState: { id: 'fractured-2027' } };
applyModernScenarioBaseline(world, profile);

assert.equal(kent.population, 1_897_000, 'Kent should use the evidence-based ceremonial-county population share');
for (const ukRegion of [kent, london, eastSussex, yorkshire]) {
  const types = new Set(ukRegion.construction?.assets?.map((asset) => asset.typeId));
  assert.ok(types.has('road_network'), `${ukRegion.name} should start with a modern road network`);
  assert.ok(types.has('local_electric_grid'), `${ukRegion.name} should start with a local electric grid`);
  assert.ok(types.has('telegraph_network'), `${ukRegion.name} should retain mature wired communications infrastructure`);
  assert.ok(types.has('telephone_exchange'), `${ukRegion.name} should start with telephone infrastructure`);
}
assert.ok(kent.construction.assets.some((asset) => asset.typeId === 'harbour'), 'Kent should start with an operational harbour representing Dover/Medway port infrastructure');
assert.equal(kent.construction.completed.harbour, 1);

const kentLondon = kent.railConnections[london.id];
assert.equal(kentLondon.status, 'operational');
assert.ok(kentLondon.effectiveCapacity > 1.4, 'parallel classic and HS1 routes should aggregate Kent-London capacity');
assert.equal(kentLondon.lineIds.length, 2, 'Kent-London should preserve two parallel rail lines');
assert.equal(kentLondon.maxSpeedKph, 300, 'HS1 should set the fastest Kent-London route speed');
assert.equal(kentLondon.highSpeedCapable, true);
assert.ok(kentLondon.electrification.includes('third_rail_750v_dc'), 'classic Kent-London network should retain third-rail electrification');
assert.ok(kentLondon.electrification.includes('overhead_25kv_ac'), 'HS1 should use 25 kV overhead electrification');
assert.deepEqual(new Set(kentLondon.lineIds), new Set(london.railConnections[kent.id].lineIds), 'parallel rail links should be bidirectional');
const hs1 = Object.values(kentLondon.lines).find((line) => line.highSpeedCapable);
assert.equal(hs1.maxSpeedKph, 300);
assert.equal(hs1.electrification, 'overhead_25kv_ac');
assert.ok(hs1.rollingStock.highSpeedElectric > 0.8);

const kentSussex = kent.railConnections[eastSussex.id];
assert.equal(kentSussex.status, 'operational');
assert.equal(kentSussex.maxSpeedKph, 145);
assert.ok(kentSussex.electrification.includes('third_rail_750v_dc'));

assert.equal(france.construction?.assets?.some((asset) => asset.typeId === 'road_network') || false, false, 'UK-specific calibration must not leak into France');
assert.ok(world.scenarioModernBaseline.seededInfrastructureAssets >= 17);
assert.equal(world.scenarioModernBaseline.seededRailLinks, 3);

for (const techId of [
  'internal_combustion_tractors',
  'mechanised_combine_harvesters',
  'industrial_ammonia_synthesis',
  'synthetic_nitrogen_fertiliser',
  'petroleum_refining',
  'petroleum_cracking',
  'integrated_pest_management',
]) {
  assert.ok(kent.unlockedTechIds.has(techId), `2027 Kent should already know ${techId}`);
}

assert.ok(kent.stockpile.food > 200_000, 'Kent should start with a meaningful food distribution stock instead of a Bronze Age pantry');
assert.ok(kent.stockpile.diesel > 10_000, 'Kent should start with diesel/distillate stocks for transport and agriculture');
assert.ok(kent.stockpile.fertiliser > 4_000, 'Kent should start with synthetic fertiliser available to modern agriculture');
assert.ok(kent.stockpile.clothes > 10_000 && kent.stockpile.textiles > 7_000, 'ordinary consumer goods should already exist');
assert.ok(kent.stockpile.stone > 30_000 && kent.stockpile.wood > 20_000, 'modern construction should have ordinary building materials available');
assert.ok(kent.industrialSupply.inventory.machine_components > 2_500, 'modern industry should start with maintenance/components inventory');
assert.ok(kent.agriculturalMachinery.tractors > 3_500, 'Kent should start with an installed tractor fleet');
assert.ok(kent.agriculturalMachinery.combines > 800, 'Kent should start with an installed combine fleet');
assert.equal(kent.agriculturalMachinery.serviceableTractors, kent.agriculturalMachinery.tractors);
assert.equal(Number(kent.stockpile.battery_grade_lithium || 0), 0, 'Kent should not receive arbitrary strategic lithium reserves');
assert.equal(Number(kent.stockpile.cobalt_ore || 0), 0, 'Kent should not receive arbitrary cobalt deposits/stockpiles');
assert.equal(Number(london.stockpile.fertiliser || 0), 0, 'Kent-specific stock calibration should not silently leak to other regions');

for (const modernRegion of [kent, london, eastSussex, yorkshire, france]) {
  assert.ok(modernRegion.constructionEquipment?.stock?.excavators > 0, `${modernRegion.name} should start with ordinary modern earthmoving plant`);
  assert.ok(modernRegion.constructionEquipment?.stock?.constructionTrucks > 0, `${modernRegion.name} should start with construction haulage capacity`);
  assert.ok(modernRegion.constructionEquipment?.stock?.mobileCranes > 0, `${modernRegion.name} should start with some crane capacity`);
}
assert.ok(kent.constructionEquipment.stock.tunnelBoringMachines >= 1, 'Kent calibration should include discrete specialist tunnelling plant');
assert.ok(kent.constructionEquipment.stock.cableLayingVessels >= 1, 'Kent calibration should include access to a specialist cable-laying vessel');
assert.equal(world.scenarioModernBaseline.starterEconomyRegions, 5, 'baseline construction plant makes every fixture region a seeded modern starter economy');

const resourceUi = readFileSync(new URL('../js/ui/resourceOverlayUi.js', import.meta.url), 'utf8');
assert.match(resourceUi, /#resource-overlay-controls \{[^}]*pointer-events:auto/s, 'resource control panel must receive pointer events');
assert.match(resourceUi, /event\.stopPropagation\(\)/, 'resource interactions must not bubble through to the map interaction surface');

console.log('Kent 2027 baseline, construction plant, typed rail and resource UI interaction regressions passed.');
