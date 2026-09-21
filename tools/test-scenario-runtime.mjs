import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scenarioById } from '../js/core/scenarios.js';
import { scenarioPackageRoot, attachScenarioPackage, scenarioWorldAdapter } from '../js/core/scenarioRuntime.js';

const load = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const scenario = scenarioById('fractured-2027');
const pkg = {
  manifest: load('../data/scenarios/fractured-2027/scenario.json'),
  initialState: load('../data/scenarios/fractured-2027/initial-state.json'),
  factionBalance: load('../data/scenarios/fractured-2027/faction-balance.json'),
  pressureEvents: load('../data/scenarios/fractured-2027/pressure-events.json'),
  playability: load('../data/scenarios/fractured-2027/playability.json'),
  victory: load('../data/scenarios/fractured-2027/victory.json'),
};

assert.equal(scenarioPackageRoot(scenario), 'data/scenarios/fractured-2027/');
assert.equal(scenarioPackageRoot(scenarioById('grand-campaign')), null);

const regions = [
  { id: 'australia-east', name: 'Eastern Australia', governance: { sovereignPolityId: 'australia', sovereignPolityName: 'Australia' }, scenarioSelectors: ['australia'] },
  { id: 'greenland', name: 'Greenland', governance: { sovereignPolityId: 'denmark', sovereignPolityName: 'Denmark' }, scenarioSelectors: ['greenland'] },
  { id: 'usa-east', name: 'United States East', governance: { sovereignPolityId: 'usa', sovereignPolityName: 'United States' }, scenarioSelectors: ['usa'] },
];
const sim = {
  regions,
  seaRegions: [],
  activeWars: [],
  activeCampaigns: [],
  clock: { elapsedDays: 0 },
};

const adapter = scenarioWorldAdapter(sim);
assert.ok(adapter.polities.some((polity) => polity.id === 'australia'), 'runtime should infer mapped sovereign countries when main does not expose polities');

const result = attachScenarioPackage(sim, scenario, pkg, { currentTick: 0 });
assert.equal(result.attached, true);
assert.equal(sim.scenarioState.scenarioId, 'fractured-2027');
assert.ok(sim.activeWars.some((war) => war.id === 'greenland-war'));
assert.equal(regions.find((region) => region.id === 'greenland').controllingActorId, 'usa');
assert.ok(result.playablePolityIds.includes('australia'), 'mapped neutral countries should be playable without being hand-listed as opening actors');
assert.equal(sim.scenarioPackage.victory.model, 'country-survival-and-aims');
assert.equal(typeof sim.updateScenarioResolution, 'function');
assert.equal(typeof sim.scenarioOutcomeFor, 'function');

console.log('Scenario runtime regression passed: package attaches, mapped sovereign countries stay playable, and opening conflicts hydrate.');
