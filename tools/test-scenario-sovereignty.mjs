import assert from 'node:assert/strict';
import { consolidateScenarioSovereignty, countryActorId } from '../js/core/scenarioSovereignty.js';

const makeRegion = (id, name, polityId, population) => ({
  id, name, population, polityId, controllingActorId: polityId,
  governance: { sovereignPolityId: polityId, localPolityId: polityId, relationship: 'core', autonomy: 0 },
});
const makePolity = (id, name, regionId) => ({
  id, name, capitalRegionId: regionId, rulerRegionId: regionId,
  administration: { experience: {}, breakthroughs: new Set() }, report: {},
});

const regions = [
  makeRegion('au-east', 'Eastern Australia', 'polity_au-east', 18),
  makeRegion('au-west', 'Western Australia', 'polity_au-west', 4),
  makeRegion('us-east', 'Eastern United States', 'polity_us-east', 170),
  makeRegion('us-west', 'Western United States', 'polity_us-west', 160),
  makeRegion('france', 'France', 'polity_france', 68),
  makeRegion('germany', 'Germany', 'polity_germany', 84),
];
const polities = regions.map((r) => makePolity(r.polityId, `${r.name} polity`, r.id));
const world = { regions, polities };
const navigation = {
  regions: {
    'au-east': [{ continent: 'Oceania', country: 'Australia' }],
    'au-west': [{ continent: 'Oceania', country: 'Australia' }],
    'us-east': [{ continent: 'North America', country: 'United States' }],
    'us-west': [{ continent: 'North America', country: 'United States' }],
    france: [{ continent: 'Europe', country: 'France' }],
    germany: [{ continent: 'Europe', country: 'Germany' }],
  },
};
const sovereignty = {
  actorAliases: { 'United States': 'usa' },
  defaultProvincialAutonomy: .12,
  capitals: { australia: 'au-east', usa: 'us-east' },
};

assert.equal(countryActorId('United States', sovereignty.actorAliases), 'usa');
assert.equal(countryActorId('United Kingdom'), 'united-kingdom');
assert.equal(countryActorId('Türkiye'), 'turkiye');

const result = consolidateScenarioSovereignty(world, navigation, sovereignty);
assert.equal(result.countryCount, 4);
assert.equal(world.polities.length, 4);
assert.deepEqual(new Set(world.polities.map((p) => p.id)), new Set(['australia', 'usa', 'france', 'germany']));
assert.ok(!world.polities.some((p) => p.id === 'european-union'), 'EU must not replace sovereign member countries');

for (const id of ['au-east', 'au-west']) {
  const region = regions.find((r) => r.id === id);
  assert.equal(region.governance.sovereignPolityId, 'australia');
  assert.equal(region.polityId, 'australia');
  assert.ok(region.scenarioSelectors.includes('australia'));
}
assert.equal(regions.find((r) => r.id === 'au-east').governance.relationship, 'core');
assert.equal(regions.find((r) => r.id === 'au-west').governance.relationship, 'integrated');
assert.equal(world.polities.find((p) => p.id === 'australia').capitalRegionId, 'au-east');
assert.equal(world.polities.find((p) => p.id === 'usa').capitalRegionId, 'us-east');
assert.equal(result.unassignedRegionIds.length, 0);

console.log('Scenario sovereignty regression passed: mapped regions consolidate into sovereign countries while EU members remain separate.');
