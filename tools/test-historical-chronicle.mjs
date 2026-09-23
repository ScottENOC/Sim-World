import assert from 'node:assert/strict';
import { classifyHistoricalEvent, recordHistoricalPlayerEvent } from '../js/history/historicalEventChronicle.js';

const cases = [
  ['War declared', 'Our armies have entered Essex.', 'war'],
  ['Peace treaty signed', 'The war is over.', 'war'],
  ['Kent annexed', 'The region has been annexed into our realm.', 'territory'],
  ['A new ruler', 'Queen Aelfwyn has been crowned.', 'government'],
  ['General election', 'A new parliament has been elected.', 'politics'],
  ['State religion adopted', 'The court has established the new faith.', 'religion'],
  ['Catastrophic flood', 'A major flood has devastated the valley.', 'disaster'],
  ['First nuclear test', 'Our first nuclear weapon has been detonated.', 'nuclear'],
  ['First satellite', 'Our first satellite has reached orbit.', 'space'],
  ['State formed', 'A new independent state has been proclaimed.', 'state'],
  ['National grid completed', 'The national grid now links the country.', 'infrastructure'],
];
for (const [title, body, category] of cases) assert.equal(classifyHistoricalEvent(title, body)?.category, category, title);
assert.equal(classifyHistoricalEvent('Monthly market report', 'Routine market prices changed this month.'), null);
assert.equal(classifyHistoricalEvent('Steelmaking breakthrough', 'Smiths have developed steelmaking.'), null, 'technology uses structured chronicle path');

const world = {
  activePlayerPolityId: 'kent',
  clock: { tickIndex: 40, elapsedDays: 3650 },
  polities: [{ id: 'kent', name: 'Kent' }],
};
const first = recordHistoricalPlayerEvent(world, { title: 'War declared', body: 'War has begun with Essex.', advisor: 'marshal' });
assert.ok(first);
assert.equal(first.category, 'war');
assert.equal(first.kind, 'war');
assert.equal(first.advisor, 'marshal');
assert.equal(world.polities[0].nationalChronicle.entries.length, 1);
const duplicate = recordHistoricalPlayerEvent(world, { title: 'War declared', body: 'War has begun with Essex.', advisor: 'marshal' });
assert.equal(duplicate, null, 'same report in same short tick window should deduplicate');
assert.equal(world.polities[0].nationalChronicle.entries.length, 1);
world.clock.tickIndex = 50;
const later = recordHistoricalPlayerEvent(world, { title: 'Peace treaty signed', body: 'The war with Essex has ended.', advisor: 'envoy' });
assert.ok(later);
assert.equal(world.polities[0].nationalChronicle.entries.length, 2);

console.log('Historical chronicle regressions passed.');
