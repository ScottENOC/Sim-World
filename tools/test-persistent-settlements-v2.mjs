import assert from 'node:assert/strict';
import { ensureSettlements, tickSettlements, recordSettlementDestruction } from '../js/society/settlements.js';
import { buildWorldSpatialGraph, syncRegionSpatialSites } from '../js/world/spatialGraph.js';
import { ensureSubregionalControl } from '../js/military/subregionalControl.js';

function square(x0, y0, x1, y1) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]] } };
}

const a = {
  id: 'a', name: 'Alpha', centroid: [0.5,0.5], feature: square(0,0,1,1), neighbors:['b'], adjacentSeaIds:[], isCoastal:false,
  population: 60000, urbanisation:{urbanPopulation:20000}, governance:{sovereignPolityId:'polity-a'},
  tradePartnerIds:new Set(['b']), construction:{assets:[]}, culturalLife:{reputation:0.2}, deposits:{}, stability:0.8, conflictPressure:0,
};
const b = {
  id: 'b', name: 'Beta', centroid: [1.5,0.5], feature: square(1,0,2,1), neighbors:['a'], adjacentSeaIds:[], isCoastal:false,
  population: 25000, urbanisation:{urbanPopulation:1000}, governance:{sovereignPolityId:'polity-b'},
  tradePartnerIds:new Set(), construction:{assets:[]}, culturalLife:{reputation:0}, deposits:{}, stability:0.8, conflictPressure:0,
};

let ledger = tickSettlements(a, 100, 365.2425, () => 1);
assert.equal(ledger.places.filter(p => !p.isPrincipal && p.status === 'active').length, 3, '20k urban population should sustain three satellite settlements');
assert(ledger.places.every(p => p.id && p.status), 'all settlements should have durable IDs and lifecycle status');

const graph = buildWorldSpatialGraph([a,b], []);
const control = ensureSubregionalControl(a);
syncRegionSpatialSites(graph, a, control.places);
const settlementIds = new Set(ledger.places.map(p => p.id));
for (const place of ledger.places) {
  assert(graph.sites.has(place.id), `spatial graph should contain settlement ${place.id}`);
  assert(Number.isFinite(place.location?.lon) && Number.isFinite(place.location?.lat), 'settlement should receive persistent coordinates');
}
const positionsBefore = new Map(ledger.places.map(p => [p.id, [p.location.lon,p.location.lat]]));

// Conquest changes political ownership but not the physical settlement identity or site.
a.governance.sovereignPolityId = 'polity-conqueror';
tickSettlements(a, 120, 120, () => 1);
ensureSubregionalControl(a);
syncRegionSpatialSites(graph, a, a.subregionalControl.places);
for (const place of a.settlements.places) {
  assert(settlementIds.has(place.id), 'conquest should not replace existing settlement identities');
  assert.deepEqual([place.location.lon,place.location.lat], positionsBefore.get(place.id), 'conquest should not move settlements');
}

// Destruction and rebuilding preserve the same city rather than deleting/recreating it.
const target = a.settlements.places.find(p => !p.isPrincipal);
const originalId = target.id;
const originalPosition = [...positionsBefore.get(originalId)];
recordSettlementDestruction(a, originalId, 130, 'siege');
assert.equal(target.status, 'ruined');
syncRegionSpatialSites(graph, a, a.subregionalControl.places);
assert.equal(graph.sites.get(originalId).type, 'ruins');

tickSettlements(a, 150, 365.2425, () => 1);
assert.equal(target.id, originalId);
assert.equal(target.status, 'active', 'recovered urban economy should rebuild the historical settlement');
syncRegionSpatialSites(graph, a, ensureSubregionalControl(a).places);
assert.deepEqual([target.location.lon,target.location.lat], originalPosition, 'rebuilt settlement should reuse its historical site');

// Deep urban decline leaves historical places in the ledger instead of deleting them.
a.urbanisation.urbanPopulation = 300;
for (let year = 0; year < 7; year++) tickSettlements(a, 200 + year * 52, 365.2425, () => 1);
assert(a.settlements.places.some(p => !p.isPrincipal && p.status === 'abandoned'), 'long decline should abandon satellite settlements');
assert(a.settlements.places.some(p => p.id === originalId), 'abandoned settlement identity should remain in history');

console.log('persistent settlements v2 regression passed');
