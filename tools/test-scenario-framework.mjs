import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCENARIOS, scenarioById } from '../js/core/scenarios.js';

assert.ok(Array.isArray(SCENARIOS));
assert.equal(new Set(SCENARIOS.map((scenario) => scenario.id)).size, SCENARIOS.length, 'scenario ids must be unique');

const grand = scenarioById('grand-campaign');
assert.ok(grand?.available, 'Grand Campaign must remain playable');
assert.equal(grand.startYear, -1300);
assert.equal(grand.mapBaseUrl, 'data/world/');
assert.equal(grand.victoryModel, 'sustainable-future');

const wwii = scenarioById('wwii-1939');
assert.ok(wwii, 'WWII scenario definition missing');
assert.equal(wwii.startYear, 1939);
assert.equal(wwii.mapBaseUrl, 'data/scenarios/wwii-1939/world/');
assert.equal(wwii.victoryModel, 'military-surrender');
assert.equal(wwii.available, false, 'WWII must stay disabled until its map/state package exists');

const fractured = scenarioById('fractured-2027');
assert.ok(fractured, '2027 scenario definition missing');
assert.equal(fractured.startYear, 2027);
assert.equal(fractured.mapBaseUrl, 'data/scenarios/fractured-2027/world/');
assert.equal(fractured.victoryModel, 'military-control');
assert.equal(fractured.available, false, '2027 must stay disabled until its map/state package exists');

for (const scenario of SCENARIOS) {
  assert.ok(scenario.name);
  assert.ok(scenario.description);
  assert.ok(Number.isFinite(scenario.startYear));
  assert.ok(scenario.mapBaseUrl.endsWith('/'));
  assert.ok(scenario.rulesProfile);
  assert.ok(scenario.technologyProfile);
  assert.ok(scenario.victoryModel);
  assert.ok(scenario.targetRealHours > 0);
  assert.ok(scenario.targetSimYears > 0);
}

const scenarioManifest = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/scenario.json', import.meta.url), 'utf8'));
const initialState = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/initial-state.json', import.meta.url), 'utf8'));
const factionBalance = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/faction-balance.json', import.meta.url), 'utf8'));
const pressureEvents = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/pressure-events.json', import.meta.url), 'utf8'));

assert.equal(scenarioManifest.id, fractured.id);
assert.equal(scenarioManifest.startYear, fractured.startYear);
assert.equal(scenarioManifest.factionBalanceFile, 'faction-balance.json');
assert.equal(scenarioManifest.pressureEventsFile, 'pressure-events.json');
assert.equal(initialState.scenarioId, fractured.id);
assert.equal(factionBalance.scenarioId, fractured.id);
assert.equal(pressureEvents.scenarioId, fractured.id);

const camps = new Map(initialState.strategicCamps.map((camp) => [camp.id, camp]));
assert.equal(camps.size, 3, 'Fractured World should start with three loose strategic camps');
assert.deepEqual(camps.get('american-power')?.members, ['usa']);
assert.ok(camps.get('european-defence-coalition')?.members.includes('canada'));
assert.ok(camps.get('european-defence-coalition')?.members.includes('ukraine'));
assert.ok(camps.get('eurasian-accommodation')?.members.includes('china'));
assert.ok(camps.get('eurasian-accommodation')?.members.includes('russia'));
assert.ok(camps.get('eurasian-accommodation')?.members.includes('iran'));
assert.ok(camps.get('eurasian-accommodation')?.members.includes('north-korea'));
assert.equal(initialState.defaultExternalAlignment.scriptedFutureAlignment, false);

const usaIran = initialState.conflicts.find((conflict) => conflict.id === 'usa-iran-war');
assert.ok(usaIran, 'USA-Iran opening war should be represented');
const taiwan = initialState.conflicts.find((conflict) => conflict.id === 'taiwan-blockade');
assert.equal(taiwan?.automaticWarWithUnitedStates, false);

assert.equal(factionBalance.factions.length, 3);
assert.equal(factionBalance.neutralPowerRule.scriptedAlignment, false);
assert.ok(factionBalance.antiSnowballRules.length >= 5);
assert.equal(pressureEvents.triggerPolicy.scriptedOutcome, false);
assert.ok(pressureEvents.eventFamilies.length >= 6);

console.log(`Scenario framework regression passed for ${SCENARIOS.length} scenarios, including Fractured World balance and event scaffolds.`);
