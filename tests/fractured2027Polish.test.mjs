import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';
import { finiteProjectedPoints, modernDateFromElapsed } from '../js/ui/modernScenarioPolish.js';

assert.equal(modernDateFromElapsed(2027, 0), '1 January 2027');
assert.equal(modernDateFromElapsed(2027, 31), '1 February 2027');
assert.equal(modernDateFromElapsed(2027, 364), '31 December 2027');

assert.deepEqual(
  finiteProjectedPoints(
    ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) ? [lon * 2, lat * 3] : [NaN, NaN],
    [
      { centroid: [10, 20] },
      { centroid: null },
      { centroid: [NaN, 5] },
      { centroid: [30, 40] },
    ],
  ),
  [[20, 60], [60, 120]],
  'modern map focus must discard malformed centroids rather than creating a NaN zoom transform',
);
assert.deepEqual(
  finiteProjectedPoints(() => [Infinity, 10], [{ centroid: [1, 2] }]),
  [],
  'non-finite projected coordinates must never reach the map zoom transform',
);

const region = {
  id: 'madagascar-test',
  scenarioCountryId: 'madagascar',
  governance: { sovereignPolityName: 'Madagascar' },
  population: 1000,
  unlockedTechIds: new Set(),
  electricity: {},
  structuralTransformation: { capability: {} },
  industrialSupply: { capability: {}, inventory: {} },
  industrialPlants: { componentCapability: {} },
  stockpile: {},
  army: { personnel: 0, away: 0 },
  cultureGroups: [{ identityId: 'bronze_age_placeholder', share: 1 }],
  cultureState: { identityArchive: [{ id: 'bronze_age_placeholder', label: 'Bronze age placeholder' }] },
};

const world = { regions: [region], scenarioState: { id: 'fractured-2027' } };
const result = applyModernScenarioBaseline(world, {
  scenarioId: 'fractured-2027',
  populationMultiplier: 1,
  commonTechIds: [],
  regionalDefaults: {},
});

assert.equal(result.modernCultureRegions, 1);
assert.equal(region.cultureGroups.length, 1);
assert.equal(region.cultureGroups[0].identityId, 'modern_civic:madagascar');
assert.equal(region.cultureState.identityArchive[0].label, 'Madagascar');
assert.equal(region.cultureGroups.some((group) => group.identityId === 'bronze_age_placeholder'), false);
assert.equal(region._cultureReady, false, 'culture system should rehydrate the scenario identity through the normal registry');

const startupPickerSource = fs.readFileSync(new URL('../js/ui/startupPicker.js', import.meta.url), 'utf8');
const runtimeAutoSource = fs.readFileSync(new URL('../js/ui/scenarioRuntimeAuto.js', import.meta.url), 'utf8');
const polishSource = fs.readFileSync(new URL('../js/ui/modernScenarioPolish.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(startupPickerSource, /Preparing \$\{country\}\./, 'modern startup status should describe the chosen country, not its hidden anchor region');
assert.match(startupPickerSource, /if \(countryFirst\) pickerModal\.classList\.add\('hidden'\)/, 'country selection should retire the visible picker immediately');
assert.match(startupPickerSource, /Country-first modern startup has exactly one owner: scenarioRuntimeAuto/, 'startup picker must not race the modern runtime handoff');
assert.match(runtimeAutoSource, /finishModernCountryStartWhenReady/, 'modern handoff should retry until the hidden legacy callback is ready');
assert.ok(runtimeAutoSource.indexOf('regionButton.click();') < runtimeAutoSource.indexOf('delete window.__pendingStartRegionId;'), 'pending country state must only clear after a successful hidden handoff');
assert.match(runtimeAutoSource, /modernScenarioPolish\.js\?v=20260923-black-map1/, 'runtime should force a fresh copy of the modern map recovery logic');
assert.match(polishSource, /refreshModernMap\(sim\)/, 'modern scenario hydration should force the renderer to rebuild after visibility changes');
assert.match(polishSource, /every\(Number\.isFinite\)/, 'country focusing must reject invalid transforms');
assert.match(indexSource, /startupPicker\.js\?v=20260923-country-only1/);
assert.match(indexSource, /scenarioRuntimeAuto\.js\?v=20260923-country-only1/);
assert.match(indexSource, /main\.js\?v=20260923-country-only1/);

console.log('Fractured 2027 polish regressions passed.');
