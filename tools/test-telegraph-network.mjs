import assert from 'node:assert/strict';
import fs from 'node:fs';
import { telegraphInterceptRisk, telegraphRouteBetween } from '../js/diplomacy/telegraph.js';
import { messageRouteBetween, messageRouteDeliveryTicks } from '../js/diplomacy/messageRouting.js';
import { routeFor } from '../js/diplomacy/couriers.js';

function region(id, neighbors = [], actor = id, { wired = false, seas = [] } = {}) {
  return {
    id, name: id, neighbors, adjacentSeaIds: seas, population: 20000, safetyRating: 1,
    unlockedTechIds: new Set(wired ? ['electrical_telegraphy'] : []),
    governance: { sovereignPolityId: actor },
    occupations: { trader: 0 }, stockpile: { horses: 0 }, areaSqKm: 1000, landQuality: 0.7,
    construction: {
      projects: [], completed: wired ? { telegraph_network: 1 } : {},
      assets: wired ? [{ id: `${id}-wire`, typeId: 'telegraph_network', condition: 1, scale: 1 }] : [],
    },
  };
}

// Pure telegraph: a continuous operational chain delivers in the same simulation tick.
const a = region('a', ['b'], 'state-a', { wired: true });
const b = region('b', ['a','c'], 'transit-state', { wired: true });
const c = region('c', ['b'], 'state-c', { wired: true });
let byId = new Map([[a.id,a],[b.id,b],[c.id,c]]);
const wired = telegraphRouteBetween(a,c,byId);
assert.ok(wired, 'continuous operational land telegraph should create a route');
assert.deepEqual(wired.regionIds, ['a','b','c']);
const allWire = messageRouteBetween(a,c,byId);
assert.equal(allWire.mode, 'telegraph');
assert.deepEqual(allWire.modes, ['telegraph']);
assert.equal(messageRouteDeliveryTicks(allWire), 0, 'all-telegraph routes should deliver within the current simulation tick');
assert.equal(routeFor(a,c,byId).mode, 'telegraph', 'live diplomatic routing should use the multimodal planner');
assert.ok(telegraphInterceptRisk(wired, byId, 'state-a', 'state-c') > 0.015, 'third-country telegraph transit should increase interception exposure');

// Damage breaks the telegraph leg and forces a slower physical fallback rather than deleting the route.
b.construction.assets[0].condition = 0.1;
assert.equal(telegraphRouteBetween(a,c,byId), null, 'severe damage to an intermediate line should break the telegraph network');
const damagedFallback = messageRouteBetween(a,c,byId);
assert.ok(damagedFallback);
assert.ok(damagedFallback.modes.includes('horse'), 'broken wire should fall back to physical courier travel');
assert.ok(messageRouteDeliveryTicks(damagedFallback) >= 1);

// Mixed land routing: horse first/last mile, telegraph through the wired middle.
const m1 = region('m1', ['m2'], 'state-m1');
const m2 = region('m2', ['m1','m3'], 'state-m1', { wired: true });
const m3 = region('m3', ['m2','m4'], 'state-m4', { wired: true });
const m4 = region('m4', ['m3'], 'state-m4');
byId = new Map([m1,m2,m3,m4].map(r => [r.id,r]));
const mixedWire = messageRouteBetween(m1,m4,byId);
assert.equal(mixedWire.mode, 'multimodal');
assert.deepEqual(mixedWire.legs.map(l => l.mode), ['horse','telegraph','horse']);
const m2Wire = m2.construction.assets; const m3Wire = m3.construction.assets;
m2.construction.assets = []; m3.construction.assets = [];
const allHorse = messageRouteBetween(m1,m4,byId);
m2.construction.assets = m2Wire; m3.construction.assets = m3Wire;
assert.ok(mixedWire.days < allHorse.days, 'telegraph middle leg should materially shorten the same physical journey');

// Railway is a real routing leg when an operational endpoint connection exists.
const r1 = region('r1', ['r2'], 'rail-state');
const r2 = region('r2', ['r1'], 'rail-state');
const rail = { lineId: 'rail-1', status: 'operational', effectiveCapacity: 0.8, lengthKm: 240, operatorPolityId: 'rail-state' };
r1.railConnections = { r2: rail }; r2.railConnections = { r1: rail };
byId = new Map([[r1.id,r1],[r2.id,r2]]);
const railRoute = messageRouteBetween(r1,r2,byId);
assert.equal(railRoute.mode, 'rail');
assert.equal(railRoute.legs[0].lineIds[0], 'rail-1');
assert.ok(railRoute.days < 2, 'rail should beat ordinary horse courier timing on a substantial line');

// Sea transfer can be chained between inland horse legs.
const inlandA = region('inland-a', ['port-a'], 'state-a');
const portA = region('port-a', ['inland-a'], 'state-a', { seas: ['sea_north'] });
const portB = region('port-b', ['inland-b'], 'state-b', { seas: ['sea_english_channel'] });
const inlandB = region('inland-b', ['port-b'], 'state-b');
byId = new Map([inlandA,portA,portB,inlandB].map(r => [r.id,r]));
const maritime = messageRouteBetween(inlandA,inlandB,byId);
assert.equal(maritime.mode, 'multimodal');
assert.deepEqual(maritime.legs.map(l => l.mode), ['horse','sea','horse']);
assert.ok(maritime.legs[1].seaIds.length >= 1, 'sea leg should retain the physical maritime route');

const courierSource = fs.readFileSync(new URL('../js/diplomacy/couriers.js', import.meta.url), 'utf8');
assert.match(courierSource, /messageRouteBetween\(origin, target, regionsById\)/, 'courier routing must invoke the multimodal planner');
assert.match(courierSource, /messageRouteDeliveryTicks\(route\)/, 'courier arrival timing must use multimodal route duration');

console.log('Telegraph and multimodal message routing regressions passed.');
