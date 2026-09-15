import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHOKEPOINTS, maritimeNetworkDiagnostics, maritimeReachableSeaIds, maritimeRouteBetween } from '../js/world/chokepoints.js';

const seaMeta = JSON.parse(fs.readFileSync(new URL('../data/world/seaRegions.meta.json', import.meta.url), 'utf8')).seaRegions;
const knownIds = new Set(seaMeta.map((sea) => sea.id));
const diagnostics = maritimeNetworkDiagnostics([...knownIds]);
assert.deepEqual(diagnostics.unknownGraphSeaIds, [], `navigation graph references missing seas: ${diagnostics.unknownGraphSeaIds.join(', ')}`);

const openPlan = JSON.parse(fs.readFileSync(new URL('./global-ocean-sea-plan-v1.json', import.meta.url), 'utf8'));
for (const sea of openPlan.regions) assert(knownIds.has(sea.id), `missing planned open-ocean sea ${sea.id}`);

const deliberatelyEnclosed = new Set([
  'sea_caspian',
  'sea_lake_superior', 'sea_lake_michigan', 'sea_lake_huron', 'sea_lake_erie', 'sea_lake_ontario',
  'sea_lake_winnipeg', 'sea_great_slave', 'sea_great_bear',
]);
const reachable = new Set(maritimeReachableSeaIds('sea_north'));
const disconnectedOcean = [...knownIds].filter((id) => !deliberatelyEnclosed.has(id) && !reachable.has(id));
assert.deepEqual(disconnectedOcean, [], `ocean sea regions disconnected from global navigation: ${disconnectedOcean.join(', ')}`);

function route(from, to) {
  const result = maritimeRouteBetween({ adjacentSeaIds: [from] }, { adjacentSeaIds: [to] });
  assert(result, `expected route ${from} -> ${to}`);
  assert.equal(result.seaIds[0], from);
  assert.equal(result.seaIds.at(-1), to);
  return result;
}

const europeIndia = route('sea_north', 'sea_bay_bengal');
assert(europeIndia.seaIds.includes('sea_cape_waters') || europeIndia.seaIds.includes('sea_southern_red'), 'Europe-India route should use a real ocean approach');

const transPacific = route('sea_pacific_northwest', 'sea_southeast_pacific_sa');
assert(transPacific.seaIds.some((id) => id.startsWith('sea_central_pacific') || id === 'sea_east_pacific_tropical'), 'trans-Pacific route should cross an open-ocean basin');

const malacca = route('sea_andaman', 'sea_south_china');
assert(malacca.passageIds.includes('malacca'), 'Andaman-South China route should use Malacca');
assert(malacca.seaIds.includes('sea_malacca_strait'));

const torres = route('sea_arafura', 'sea_coral');
assert(torres.passageIds.includes('torres'), 'Arafura-Coral route should use Torres Strait');

const panamaBeforeCanal = route('sea_caribbean_west', 'sea_panama_bight');
assert(panamaBeforeCanal.seaIds.length > 6, 'Panama must not act as an always-open ocean shortcut before canal mechanics');

for (const id of ['malacca','sunda','lombok','torres','taiwan','korea','bass','cook']) {
  assert(CHOKEPOINTS[id], `missing strategic passage ${id}`);
}

console.log(JSON.stringify({
  seaRegions: knownIds.size,
  navigableOceanRegions: reachable.size,
  graphEdges: diagnostics.edgeCount,
  europeIndiaHops: europeIndia.seaIds.length - 1,
  transPacificHops: transPacific.seaIds.length - 1,
  preCanalPanamaHops: panamaBeforeCanal.seaIds.length - 1,
}, null, 2));
