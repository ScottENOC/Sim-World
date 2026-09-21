import assert from 'node:assert/strict';
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

console.log(`Scenario framework regression passed for ${SCENARIOS.length} scenarios.`);
