import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hydrateScenarioInitialState, scenarioPlayablePolities, addScenarioWarAim } from '../js/core/scenarioState.js';
import { activePrincipalCampWars, updateFocusedCampaignResolution, evaluateCountryScenarioOutcome, canDeclareFocusedScenarioResult } from '../js/core/scenarioVictory.js';

const load = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const initialState = load('../data/scenarios/fractured-2027/initial-state.json');
const playability = load('../data/scenarios/fractured-2027/playability.json');
const victory = load('../data/scenarios/fractured-2027/victory.json');

assert.equal(playability.policy.allMappedSovereignCountriesPlayable, true);
assert.equal(playability.policy.coalitionsDirectlyPlayable, false);
assert.ok(playability.featuredCountries.includes('australia'));
assert.equal(victory.model, 'country-survival-and-aims');
assert.equal(victory.campaignResolution.requireEveryWorldWarEnded, false);
assert.equal(victory.campaignResolution.peaceStabilityDays, 180);

const actorIds = new Set(initialState.actors.filter((actor) => actor.kind === 'country').map((actor) => actor.id));
const world = {
  polities: [
    ...[...actorIds].map((id) => ({ id, economicHealth: .8, humanSecurity: .9 })),
    { id: 'australia', economicHealth: .8, humanSecurity: .9 },
    { id: 'european-union', kind: 'coalition', isCoalition: true },
  ],
  regions: [
    { id: 'australia-east', governance: { sovereignPolityId: 'australia' }, scenarioSelectors: ['australia'] },
    { id: 'greenland', governance: { sovereignPolityId: 'denmark' }, scenarioSelectors: ['greenland'] },
  ],
  activeWars: [],
};

const report = hydrateScenarioInitialState(world, structuredClone(initialState), { currentTick: 0 });
assert.equal(report.hydrated, true);
assert.ok(world.scenarioState.hydrated);
assert.ok(world.activeWars.some((war) => war.id === 'greenland-war'));
assert.equal(world.regions.find((region) => region.id === 'greenland').controllingActorId, 'usa');
assert.ok(world.scenarioRelationships.some((relationship) => relationship.posture === 'unexpectedly-cooperative'));

const playableIds = scenarioPlayablePolities(world, playability).map((polity) => polity.id);
assert.ok(playableIds.includes('australia'), 'a mapped sovereign country need not be hand-listed in initial-state actors to be playable');
assert.ok(playableIds.includes('usa'));
assert.ok(!playableIds.includes('european-union'));

const principalWars = activePrincipalCampWars(world, victory);
assert.ok(principalWars.length >= 2, 'opening wars across principal camps should block campaign resolution');
let resolution = updateFocusedCampaignResolution(world, victory, 100);
assert.equal(resolution.resolved, false);

for (const war of world.activeWars) war.active = false;
resolution = updateFocusedCampaignResolution(world, victory, 200);
assert.equal(resolution.resolved, false);
resolution = updateFocusedCampaignResolution(world, victory, 379);
assert.equal(resolution.resolved, false);
resolution = updateFocusedCampaignResolution(world, victory, 380);
assert.equal(resolution.resolved, true);

let outcome = evaluateCountryScenarioOutcome(world, 'australia', victory);
assert.equal(outcome.minimumSuccess, true);
assert.ok(outcome.score >= .5);
assert.equal(canDeclareFocusedScenarioResult(world, 'australia', victory).ready, true);

assert.equal(addScenarioWarAim(world, 'australia', { id: 'defend-maritime-access', progress: .25 }).added, true);
outcome = evaluateCountryScenarioOutcome(world, 'australia', victory);
assert.ok(outcome.dimensions['adopted-war-aims'] < 1, 'voluntarily adopted commitments must affect outcome');

world.polities.find((polity) => polity.id === 'australia').permanentlyAnnexed = true;
outcome = evaluateCountryScenarioOutcome(world, 'australia', victory);
assert.equal(outcome.minimumSuccess, false);
assert.equal(outcome.result, 'defeat');

console.log('Focused scenario hydration/victory regression passed, including map-derived playable Australia and sustained-peace resolution.');
