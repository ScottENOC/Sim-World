import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hydrateScenarioForceDeployments, scenarioFormationsForActor, scenarioLandConcentrationForActor } from '../js/core/scenarioForces.js';

const definition = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/force-deployments.json', import.meta.url), 'utf8'));
assert.equal(definition.scenarioId, 'fractured-2027');

const iranFleet = definition.formations.find((f) => f.id === 'usa-iran-forward-fleet');
const greenlandFleet = definition.formations.find((f) => f.id === 'usa-greenland-surge-fleet');
assert.ok(iranFleet && greenlandFleet, 'USA should begin with distinct Iran and Greenland deployments');
assert.equal(iranFleet.theatreId, 'iran-gulf');
assert.ok(iranFleet.deploymentAgeDays > greenlandFleet.deploymentAgeDays);
assert.ok(iranFleet.fatigue > greenlandFleet.fatigue);
assert.ok(iranFleet.readiness < greenlandFleet.readiness);
assert.ok(definition.formations.filter((f) => f.actorId === 'usa').reduce((sum, f) => sum + f.fractionOfDeployablePower, 0) <= 1);

const europeanGreenlandActors = ['uk', 'canada', 'france', 'denmark'];
for (const actorId of europeanGreenlandActors) {
  const formations = definition.formations.filter((f) => f.actorId === actorId && f.theatreId === 'greenland-north-atlantic');
  assert.ok(formations.length > 0, `${actorId} should contribute an opening Greenland/North Atlantic force`);
  assert.ok(formations.every((f) => f.readiness >= 0.8), `${actorId} Greenland response should begin at useful readiness`);
}

const chinaTaiwan = definition.formations.filter((f) => f.actorId === 'china' && f.theatreId === 'taiwan-western-pacific');
assert.equal(chinaTaiwan.length, 3, 'China should begin with blockade forces plus an escalation reserve around Taiwan');
assert.ok(chinaTaiwan.some((f) => f.missions.includes('blockade')));
assert.ok(chinaTaiwan.some((f) => f.missions.includes('amphibious-readiness')));
assert.ok(chinaTaiwan.reduce((sum, f) => sum + f.fractionOfDeployablePower, 0) < 0.6, 'Taiwan posture should not consume all Chinese deployable power');

const taiwanDefence = definition.formations.find((f) => f.id === 'taiwan-island-defence');
assert.ok(taiwanDefence, 'Taiwan should begin with a full-alert island defence formation');
assert.ok(taiwanDefence.readiness >= 0.9);
assert.ok(taiwanDefence.fractionOfDeployablePower >= 0.7);

for (const actorId of ['russia', 'ukraine']) {
  const entry = definition.landConcentration.find((item) => item.actorId === actorId);
  assert.ok(entry, `${actorId} land concentration missing`);
  const total = entry.frontlineManeuverShare + entry.rearManeuverShare + entry.reconstitutionReserveShare;
  assert.ok(Math.abs(total - 1) < 1e-9, `${actorId} force shares must sum to one`);
  assert.ok(entry.frontlineManeuverShare >= 0.8, `${actorId} should be heavily concentrated at the line of contact`);
  assert.ok(entry.rearManeuverShare <= 0.06, `${actorId} should have very little mobile manoeuvre power away from the front`);
  assert.ok(entry.rearStrategicMissions.length > 0, `${actorId} should retain non-manoeuvre rear-area functions`);
}

for (const actorId of ['poland', 'finland', 'germany', 'taiwan']) {
  const entry = definition.landConcentration.find((item) => item.actorId === actorId);
  assert.ok(entry, `${actorId} land concentration missing`);
  const total = entry.frontlineManeuverShare + entry.rearManeuverShare + entry.reconstitutionReserveShare;
  assert.ok(Math.abs(total - 1) < 1e-9, `${actorId} force shares must sum to one`);
  assert.ok(entry.rearStrategicMissions.length > 0, `${actorId} should retain meaningful rear-area functions`);
}

const world = {
  polities: [
    { id: 'polity_us', scenarioActorId: 'usa' },
    { id: 'polity_ru', scenarioActorId: 'russia' },
    { id: 'polity_ua', scenarioActorId: 'ukraine' },
    { id: 'polity_uk', scenarioActorId: 'uk' },
    { id: 'polity_ca', scenarioActorId: 'canada' },
    { id: 'polity_fr', scenarioActorId: 'france' },
    { id: 'polity_dk', scenarioActorId: 'denmark' },
    { id: 'polity_cn', scenarioActorId: 'china' },
    { id: 'polity_tw', scenarioActorId: 'taiwan' },
    { id: 'polity_pl', scenarioActorId: 'poland' },
    { id: 'polity_fi', scenarioActorId: 'finland' },
    { id: 'polity_de', scenarioActorId: 'germany' },
  ],
  scenarioActorToPolityId: {
    usa: 'polity_us', russia: 'polity_ru', ukraine: 'polity_ua', uk: 'polity_uk', canada: 'polity_ca',
    france: 'polity_fr', denmark: 'polity_dk', china: 'polity_cn', taiwan: 'polity_tw', poland: 'polity_pl',
    finland: 'polity_fi', germany: 'polity_de',
  },
};
const report = hydrateScenarioForceDeployments(world, definition);
assert.equal(report.unresolvedActors.length, 0);
assert.equal(report.formationCount, 10);
assert.equal(report.landConcentrationCount, 6);
assert.equal(scenarioFormationsForActor(world, 'usa').length, 2);
assert.equal(scenarioFormationsForActor(world, 'china').length, 3);
assert.equal(scenarioFormationsForActor(world, 'uk').length, 1);
assert.equal(scenarioLandConcentrationForActor(world, 'russia').frontlineManeuverShare, 0.84);
assert.equal(scenarioLandConcentrationForActor(world, 'taiwan').frontlineManeuverShare, 0.78);
assert.equal(world.polities[0].scenarioForcePosture.formations.length, 2);

console.log('Scenario force regression passed: US, European coalition, China/Taiwan and Russia/Ukraine opening deployments hydrate with distinct readiness and concentration.');
