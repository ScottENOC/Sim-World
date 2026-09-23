import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FogOfWar } from '../js/core/fogOfWar.js';
import { applyScenarioRuntimeRules } from '../js/core/scenarioRuntime.js';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';

const regions = [
  { id: 'london', population: 6288, scenarioCountryId: 'united-kingdom', governance: { scenarioCountryId: 'united-kingdom', sovereignPolityName: 'United Kingdom' }, unlockedTechIds: new Set(), electricity: {}, structuralTransformation: { capability: {} }, industrialSupply: { capability: {}, inventory: {} }, industrialPlants: { componentCapability: {} }, stockpile: {}, army: { personnel: 0, away: 0 }, cultureGroups: [], cultureState: {} },
  { id: 'devon', population: 22842, scenarioCountryId: 'united-kingdom', governance: { scenarioCountryId: 'united-kingdom', sovereignPolityName: 'United Kingdom' }, unlockedTechIds: new Set(), electricity: {}, structuralTransformation: { capability: {} }, industrialSupply: { capability: {}, inventory: {} }, industrialPlants: { componentCapability: {} }, stockpile: {}, army: { personnel: 0, away: 0 }, cultureGroups: [], cultureState: {} },
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

const mainSource = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(mainSource, /fogOfWar\.js\?v=20260923-modern-visibility1/, 'main must cache-bust the modern FogOfWar implementation');
assert.match(indexSource, /main\.js\?v=20260923-modern-visibility1/, 'entrypoint must cache-bust main.js so Safari cannot retain the old FogOfWar import graph');

console.log('Fractured 2027 visibility and population regressions passed.');
