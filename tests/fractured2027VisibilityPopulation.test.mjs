import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FogOfWar } from '../js/core/fogOfWar.js';
import { applyScenarioRuntimeRules } from '../js/core/scenarioRuntime.js';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';

const regions = [
  { id: 'london', name: 'London', population: 6288, scenarioCountryId: 'united-kingdom', governance: { scenarioCountryId: 'united-kingdom', sovereignPolityName: 'United Kingdom' }, unlockedTechIds: new Set(), electricity: {}, structuralTransformation: { capability: {} }, industrialSupply: { capability: {}, inventory: {} }, industrialPlants: { componentCapability: {} }, stockpile: {}, army: { personnel: 0, away: 0 }, cultureGroups: [], cultureState: {} },
  { id: 'devon', name: 'Devon', population: 22842, scenarioCountryId: 'united-kingdom', governance: { scenarioCountryId: 'united-kingdom', sovereignPolityName: 'United Kingdom' }, unlockedTechIds: new Set(), electricity: {}, structuralTransformation: { capability: {} }, industrialSupply: { capability: {}, inventory: {} }, industrialPlants: { componentCapability: {} }, stockpile: {}, army: { personnel: 0, away: 0 }, cultureGroups: [], cultureState: {} },
];
const fogOfWar = new FogOfWar(regions);
const sim = { regions, fogOfWar, clock: { setWorldTempo() {}, elapsedDays: 0 } };
const scenario = { id: 'fractured-2027', rulesProfile: 'modern-crisis' };
const runtime = applyScenarioRuntimeRules(sim, scenario, { manifest: { pacing: { preferredStrategicTurnUnit: 'day' } } });
assert.equal(runtime.physicalWorldKnown, true);
assert.equal(fogOfWar.physicalWorldKnown, true, '2027 hydration must make the physical world visible');
assert.equal(fogOfWar.visibleRegions().length, regions.length, 'all physical regions should be drawable in 2027');

const profile = {
  scenarioId: 'fractured-2027',
  populationMultiplier: 24,
  countryPopulationTargets: { 'united-kingdom': 70000000 },
  regionalPopulationWeights: { london: 0.13 },
  regionalDefaults: {},
  commonTechIds: [],
};
const result = applyModernScenarioBaseline({ regions, scenarioState: { id: 'fractured-2027' } }, profile);
assert.equal(result.populationModel, 'country-targets');
const total = regions.reduce((sum, region) => sum + region.population, 0);
assert.ok(Math.abs(total - 70000000) <= 2, 'country population should match the modern scenario target');
assert.ok(regions[0].population > 8000000, 'London should be in a modern metropolitan order of magnitude');
assert.equal(regions[0].scenarioPopulationSource, 'country_target');

const runtimeSource = fs.readFileSync(new URL('../js/core/scenarioRuntime.js', import.meta.url), 'utf8');
const runtimeAutoSource = fs.readFileSync(new URL('../js/ui/scenarioRuntimeAuto.js', import.meta.url), 'utf8');
const modernStart = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/modern-start.json', import.meta.url), 'utf8'));
assert.match(runtimeSource, /fogOfWar\.isVisible = \(region\) => fogOfWar\.physicalWorldKnown/, 'modern runtime must not depend on a fresh FogOfWar module to expose the physical map');
assert.match(runtimeAutoSource, /resetModernMapView/, 'runtime should reset stale zoom/compositor state before focusing the selected country');
assert.ok(modernStart.countryPopulationTargets.madagascar >= 30000000, 'Madagascar observer runs should start with a modern-scale population');
assert.ok(modernStart.countryPopulationTargets['united-kingdom'] >= 65000000);

console.log('Fractured 2027 visibility and population regressions passed.');
