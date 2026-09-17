import assert from 'node:assert/strict';
import fs from 'node:fs';
import { telegraphDeliveryTicks, telegraphInterceptRisk, telegraphRouteBetween } from '../js/diplomacy/telegraph.js';
import { routeFor } from '../js/diplomacy/couriers.js';

function region(id, neighbors = [], actor = id) {
  return {
    id, name: id, neighbors, population: 20000, safetyRating: 1,
    unlockedTechIds: new Set(['electrical_telegraphy']),
    governance: { sovereignPolityId: actor },
    construction: { projects: [], completed: { telegraph_network: 1 }, assets: [{ id: `${id}-wire`, typeId: 'telegraph_network', condition: 1, scale: 1 }] },
  };
}

const a = region('a', ['b'], 'state-a');
const b = region('b', ['a','c'], 'transit-state');
const c = region('c', ['b'], 'state-c');
const byId = new Map([[a.id,a],[b.id,b],[c.id,c]]);

const wired = telegraphRouteBetween(a,c,byId);
assert.ok(wired, 'continuous operational land telegraph should create a route');
assert.equal(wired.mode, 'telegraph');
assert.deepEqual(wired.regionIds, ['a','b','c']);
assert.equal(telegraphDeliveryTicks(wired), 0, 'telegraph should deliver within the current simulation tick');
assert.equal(routeFor(a,c,byId).mode, 'telegraph', 'live diplomatic routing should prefer telegraph over courier travel');
assert.ok(telegraphInterceptRisk(wired, byId, 'state-a', 'state-c') > 0.015, 'third-country telegraph transit should increase interception exposure');

b.construction.assets[0].condition = 0.1;
assert.equal(telegraphRouteBetween(a,c,byId), null, 'severe damage to an intermediate line should break the network');

b.construction.assets[0].condition = 1;
c.construction.assets = [];
assert.equal(telegraphRouteBetween(a,c,byId), null, 'an unwired endpoint must not receive telegraph service');

const courierSource = fs.readFileSync(new URL('../js/diplomacy/couriers.js', import.meta.url), 'utf8');
assert.match(courierSource, /telegraphRouteBetween\(origin, target, regionsById\)/, 'courier routing must invoke the physical telegraph network');
assert.match(courierSource, /telegraphDeliveryTicks\(route\)/, 'courier arrival timing must support same-tick telegraph delivery');

console.log('Telegraph network regressions passed.');
