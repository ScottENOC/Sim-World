import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

const packageUrl = new URL('../data/scenarios/fractured-2027/scenario.json', import.meta.url);
const stateUrl = new URL('../data/scenarios/fractured-2027/initial-state.json', import.meta.url);
const packageManifest = JSON.parse(await readFile(packageUrl, 'utf8'));
const initialState = JSON.parse(await readFile(stateUrl, 'utf8'));

assert.equal(packageManifest.id, fractured.id);
assert.equal(packageManifest.startYear, fractured.startYear);
assert.equal(packageManifest.victoryModel, fractured.victoryModel);
assert.equal(packageManifest.fictionalAlternateHistory, true);
assert.equal(packageManifest.initialStateFile, 'initial-state.json');
assert.ok(packageManifest.requiredMapFiles.includes('regions.geo.json'));
assert.ok(packageManifest.requiredMapFiles.includes('seaRegions.geo.json'));

assert.equal(initialState.scenarioId, fractured.id);
assert.equal(initialState.year, fractured.startYear);
assert.equal(initialState.defaultExternalAlignment.state, 'uncommitted');
assert.equal(initialState.defaultExternalAlignment.scriptedFutureAlignment, false);
assert.ok(initialState.conflicts.some((conflict) => conflict.id === 'greenland-war'));
assert.ok(initialState.conflicts.some((conflict) => conflict.id === 'russia-ukraine-war'));
assert.ok(initialState.conflicts.some((conflict) => conflict.id === 'taiwan-blockade'));

console.log(`Scenario framework regression passed for ${SCENARIOS.length} scenarios and the Fractured World scaffold.`);
