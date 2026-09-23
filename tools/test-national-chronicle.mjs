import assert from 'node:assert/strict';
import { appendChronicleEntry, chronicleDateLabel, chronicleEntries, migrateLegacyTechnologyLog } from '../js/history/nationalChronicle.js';
import { createGameSnapshot } from '../js/core/saveGame.js';

const polity = { id: 'player', name: 'Test Realm' };
const world = {
  activePlayerPolityId: 'player',
  polities: [polity],
  clock: { tickIndex: 1, elapsedDays: 0 },
};

assert.equal(chronicleDateLabel(0), '1300 BCE');
assert.equal(chronicleDateLabel(365.2425 * 1299), '1 BCE');
assert.equal(chronicleDateLabel(365.2425 * 1300), '1 CE');

for (let i = 0; i < 150; i += 1) {
  world.clock.tickIndex = i + 1;
  world.clock.elapsedDays = i * 365.2425;
  appendChronicleEntry(world, 'player', {
    category: 'technology',
    kind: i % 2 ? 'foreign' : 'domestic',
    techId: `tech_${i}`,
    title: `Technology ${i}`,
    body: `Record ${i}`,
    tags: ['technology', `tech_${i}`],
  });
}

{
  const records = chronicleEntries(world, 'player', { category: 'technology' });
  assert.equal(records.length, 150, 'national chronicle must not discard old records after 120 entries');
  assert.equal(records[0].title, 'Technology 149', 'newest records should be returned first by default');
  assert.equal(records.at(-1).title, 'Technology 0');
}

{
  const domestic = chronicleEntries(world, 'player', { category: 'technology', kind: 'domestic' });
  assert.equal(domestic.length, 75, 'kind filtering should work without mutating the permanent record');
  const search = chronicleEntries(world, 'player', { category: 'technology', query: 'tech_42' });
  assert.equal(search.length, 1, 'chronicle search should include searchable tags');
  assert.equal(search[0].techId, 'tech_42');
}

{
  const legacy = {
    log: [{ tick: 200, kind: 'foreign', techId: 'steelmaking', sourcePolityId: 'essex', title: 'Foreign steel observed', body: 'Traders brought steel tools.' }],
  };
  const migrated = migrateLegacyTechnologyLog(world, 'player', legacy);
  assert.equal(migrated, 1, 'legacy technology reports should migrate into the permanent chronicle');
  assert.equal(migrateLegacyTechnologyLog(world, 'player', legacy), 0, 'migration should be idempotent');
}

{
  const region = {
    id: 'Kent', name: 'Kent', feature: {}, centroid: [0, 0], areaSqKm: 1, neighbors: [], terrain: 'plains',
    knowledge: { ownerId: 'Kent', observations: [], knownSubjectIds: new Set(), directContactIds: new Set(), _observationByStream: new Map() },
  };
  const snapshot = createGameSnapshot({
    regions: [region], seaRegions: [], polities: [polity], religiousWorld: {}, agreements: [], activeRaids: [], activeCampaigns: [],
    activeWars: [], fleets: [], internationalOrganisations: [],
    clock: { tickIndex: 200, elapsedDays: 1000, resolution: { id: 'month' }, speed: 1, _resumeSpeed: 1, _estimatedTickMs: null },
    playerRegionId: 'Kent', playerPolityId: 'player', fogOfWar: { devMode: false },
  });
  const serialised = JSON.stringify(snapshot);
  assert.match(serialised, /nationalChronicle/, 'national chronicle should be included in ordinary polity save data');
  assert.match(serialised, /Technology 149/, 'full chronicle contents should survive snapshot serialisation');
}

console.log('National chronicle regressions passed.');
