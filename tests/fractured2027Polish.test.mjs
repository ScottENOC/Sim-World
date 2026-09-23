import assert from 'node:assert/strict';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';
import { modernDateFromElapsed } from '../js/ui/modernScenarioPolish.js';

assert.equal(modernDateFromElapsed(2027, 0), '1 January 2027');
assert.equal(modernDateFromElapsed(2027, 31), '1 February 2027');
assert.equal(modernDateFromElapsed(2027, 364), '31 December 2027');

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

console.log('Fractured 2027 polish regressions passed.');
