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
assert.equal(kent.railConnections[london.id].status, 'operational');
assert.ok(kent.railConnections[london.id].effectiveCapacity > 0.9, 'Kent-London rail should be high-capacity');
assert.equal(london.railConnections[kent.id].lineId, kent.railConnections[london.id].lineId, 'rail link should be bidirectional');
assert.equal(kent.railConnections[eastSussex.id].status, 'operational');
assert.equal(france.construction?.assets?.some((asset) => asset.typeId === 'road_network') || false, false, 'UK-specific calibration must not leak into France');
assert.ok(world.scenarioModernBaseline.seededInfrastructureAssets >= 17);
assert.equal(world.scenarioModernBaseline.seededRailLinks, 2);

const resourceUi = readFileSync(new URL('../js/ui/resourceOverlayUi.js', import.meta.url), 'utf8');
assert.match(resourceUi, /#resource-overlay-controls \{[^}]*pointer-events:auto/s, 'resource control panel must receive pointer events');
assert.match(resourceUi, /event\.stopPropagation\(\)/, 'resource interactions must not bubble through to the map interaction surface');

console.log('Kent 2027 baseline and resource UI interaction regressions passed.');
