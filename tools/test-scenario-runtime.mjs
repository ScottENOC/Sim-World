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
  sovereignty: load('../data/scenarios/fractured-2027/sovereignty.json'),
  navigation: {
    regions: {
      'australia-east': [{ continent: 'Oceania', country: 'Australia' }],
      greenland: [{ continent: 'North America', country: 'Denmark' }],
      'usa-east': [{ continent: 'North America', country: 'United States' }],
    },
  },
};

assert.equal(scenarioPackageRoot(scenario), 'data/scenarios/fractured-2027/');
assert.equal(scenarioPackageRoot(scenarioById('grand-campaign')), null);

const regions = [
  { id: 'australia-east', name: 'Eastern Australia', polityId: 'polity_australia-east', governance: { sovereignPolityId: 'polity_australia-east', sovereignPolityName: 'Australia' }, scenarioSelectors: ['australia'] },
  { id: 'greenland', name: 'Greenland', polityId: 'polity_greenland', governance: { sovereignPolityId: 'polity_greenland', sovereignPolityName: 'Denmark' }, scenarioSelectors: ['greenland'] },
  { id: 'usa-east', name: 'United States East', polityId: 'polity_usa-east', governance: { sovereignPolityId: 'polity_usa-east', sovereignPolityName: 'United States' }, scenarioSelectors: ['usa'] },
];
const sim = {
  regions,
  seaRegions: [],
  activeWars: [],
  activeCampaigns: [],
  clock: { elapsedDays: 0 },
};

const adapter = scenarioWorldAdapter(sim);
assert.equal(adapter.usesPolityFacade, true);
assert.ok(adapter.polities.some((polity) => polity.id === 'polity_australia-east'));

const result = attachScenarioPackage(sim, scenario, pkg, { currentTick: 0 });
assert.equal(result.attached, true);
assert.equal(result.usedPolityFacade, true);
assert.equal(result.sovereignty.countryCount, 3);
assert.equal(result.sovereignty.actorToPolityId.australia, 'polity_australia-east');
assert.equal(sim.scenarioState.scenarioId, 'fractured-2027');
assert.ok(sim.activeWars.some((war) => war.id === 'greenland-war'));
assert.equal(regions.find((region) => region.id === 'greenland').controllingActorId, 'polity_usa-east');
assert.ok(result.playablePolityIds.includes('australia'), 'mapped neutral countries should be playable without being hand-listed as opening actors');
assert.equal(sim.scenarioPackage.victory.model, 'country-survival-and-aims');
assert.equal(typeof sim.updateScenarioResolution, 'function');
assert.equal(typeof sim.scenarioOutcomeFor, 'function');

const regionalRegions = [
  { id: 'au-east', name: 'Eastern Australia', population: 20, polityId: 'polity_au-east', controllingActorId: 'polity_au-east', governance: { sovereignPolityId: 'polity_au-east', localPolityId: 'polity_au-east' } },
  { id: 'au-west', name: 'Western Australia', population: 5, polityId: 'polity_au-west', controllingActorId: 'polity_au-west', governance: { sovereignPolityId: 'polity_au-west', localPolityId: 'polity_au-west' } },
];
const realPolitySim = {
  regions: regionalRegions,
  seaRegions: [], activeWars: [], activeCampaigns: [], clock: { elapsedDays: 0 },
  polities: regionalRegions.map((region) => ({ id: region.polityId, name: region.name, capitalRegionId: region.id, administration: { breakthroughs: new Set() }, report: {} })),
};
const minimalPkg = {
  ...pkg,
  initialState: { scenarioId: 'fractured-2027', year: 2027, actors: [], strategicCamps: [], conflicts: [], defaultExternalAlignment: {} },
  navigation: { regions: { 'au-east': [{ continent: 'Oceania', country: 'Australia' }], 'au-west': [{ continent: 'Oceania', country: 'Australia' }] } },
};
const realResult = attachScenarioPackage(realPolitySim, scenario, minimalPkg, { currentTick: 0 });
assert.equal(realResult.usedPolityFacade, false);
assert.equal(realResult.sovereignty.countryCount, 1);
assert.equal(realResult.sovereignty.actorToPolityId.australia, 'polity_au-east');
assert.deepEqual(realPolitySim.polities.map((polity) => polity.id), ['polity_au-east']);
assert.ok(realPolitySim.regions.every((region) => region.governance.sovereignPolityId === 'polity_au-east'));
assert.equal(realPolitySim.polities[0].scenarioActorId, 'australia');

console.log('Scenario runtime regression passed: facade and live-polity modes both consolidate countries behind stable modern actor aliases.');
