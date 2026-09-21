import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hydrateScenarioForceDeployments, scenarioFormationsForActor, scenarioLandConcentrationForActor } from '../js/core/scenarioForces.js';

const definition = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/force-deployments.json', import.meta.url), 'utf8'));
assert.equal(definition.scenarioId, 'fractured-2027');

const iranFleet = definition.formations.find((f) => f.id === 'usa-iran-forward-fleet');
const greenlandFleet = definition.formations.find((f) => f.id === 'usa-greenland-surge-fleet');
assert.ok(iranFleet && greenlandFleet, 'USA should begin with distinct Iran and Greenland deployments');
assert.ok(iranFleet.deploymentAgeDays > greenlandFleet.deploymentAgeDays);
assert.ok(iranFleet.fatigue > greenlandFleet.fatigue);
assert.ok(iranFleet.readiness < greenlandFleet.readiness);
assert.ok(definition.formations.filter((f) => f.actorId === 'usa').reduce((sum, f) => sum + f.fractionOfDeployablePower, 0) <= 1);

for (const actorId of ['russia', 'ukraine']) {
  const entry = definition.landConcentration.find((item) => item.actorId === actorId);
  assert.ok(entry, `${actorId} land concentration missing`);
  const total = entry.frontlineManeuverShare + entry.rearManeuverShare + entry.reconstitutionReserveShare;
  assert.ok(Math.abs(total - 1) < 1e-9, `${actorId} force shares must sum to one`);
  assert.ok(entry.frontlineManeuverShare >= 0.8, `${actorId} should be heavily concentrated at the line of contact`);
  assert.ok(entry.rearManeuverShare <= 0.06, `${actorId} should have very little mobile manoeuvre power away from the front`);
  assert.ok(entry.rearStrategicMissions.length > 0, `${actorId} should retain non-manoeuvre rear-area functions`);
}

const world = {
  polities: [
    { id: 'polity_us', scenarioActorId: 'usa' },
    { id: 'polity_ru', scenarioActorId: 'russia' },
    { id: 'polity_ua', scenarioActorId: 'ukraine' },
  ],
  scenarioActorToPolityId: { usa: 'polity_us', russia: 'polity_ru', ukraine: 'polity_ua' },
};
const report = hydrateScenarioForceDeployments(world, definition);
assert.equal(report.unresolvedActors.length, 0);
assert.equal(report.formationCount, 2);
assert.equal(report.landConcentrationCount, 2);
assert.equal(scenarioFormationsForActor(world, 'usa').length, 2);
assert.equal(scenarioLandConcentrationForActor(world, 'russia').frontlineManeuverShare, 0.84);
assert.equal(world.polities[0].scenarioForcePosture.formations.length, 2);

console.log('Scenario force regression passed: US deployments carry distinct readiness/fatigue and Russia/Ukraine begin front-loaded.');
