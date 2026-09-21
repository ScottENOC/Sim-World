import assert from 'node:assert/strict';
import {
  buildElectricGridMapIndex,
  electricGridConditionClass,
  electricGridEffectivePowerCapacity,
  electricGridFlowDirection,
  electricGridLinkDetail,
  electricGridOverlaySummary,
  electricGridUtilisation,
  uniqueElectricGridLinks,
  visibleElectricGridProjects,
} from '../js/ui/electricGridMapView.js';

const makeRegion = (id, name, polityId) => ({ id, name, polityId, centroid:[0, 0], gridInterconnection:{ links:[], projects:[], incidents:[] } });
const a = makeRegion('a', 'Alpha', 'polity-a');
const b = makeRegion('b', 'Beta', 'polity-b');
const c = makeRegion('c', 'Gamma', 'polity-b');

const link = {
  id:'grid-link-1', fromRegionId:'a', toRegionId:'b', fromPolityId:'polity-a', toPolityId:'polity-b',
  ownerType:'government', undersea:true, powerCapacity:1000, communicationsCapacity:120, condition:0.8,
  status:'active', updatedSequence:4,
  lastFlow:{ fromRegionId:'b', toRegionId:'a', sent:400, delivered:370, losses:30 },
  damageHistory:[{ cause:'civilian_anchor_drag', damage:0.2, observed:true }],
};
a.gridInterconnection.links.push({ ...link, updatedSequence:3, condition:1 });
b.gridInterconnection.links.push(link);

assert.equal(uniqueElectricGridLinks([a,b]).length, 1, 'duplicate endpoint copies should collapse to one link');
assert.equal(uniqueElectricGridLinks([a,b])[0].updatedSequence, 4, 'newest synced copy should win');
assert.equal(electricGridConditionClass(link), 'operational');
assert.equal(electricGridEffectivePowerCapacity(link), 800);
assert.equal(electricGridUtilisation(link), 0.5);
assert.deepEqual(electricGridFlowDirection(link), { fromRegionId:'b', toRegionId:'a' });

const detail = electricGridLinkDetail(link, new Map([[a.id,a],[b.id,b]]));
assert.equal(detail.fromName, 'Alpha');
assert.equal(detail.toName, 'Beta');
assert.equal(detail.international, true);
assert.equal(detail.undersea, true);
assert.equal(detail.communicationsCapacity, 120);
assert.equal(detail.lastDamage.cause, 'civilian_anchor_drag');

const damaged = { ...link, condition:0.55 };
assert.equal(electricGridConditionClass(damaged), 'degraded');
assert.equal(electricGridEffectivePowerCapacity(damaged), 550);
assert.equal(electricGridConditionClass({ ...link, condition:0.18 }), 'offline');
assert.equal(electricGridConditionClass({ ...link, status:'disconnected' }), 'disconnected');
assert.equal(electricGridEffectivePowerCapacity({ ...link, status:'disconnected' }), 0);

const project = {
  id:'grid-project-7', fromRegionId:'b', toRegionId:'c', ownerType:'private', undersea:false,
  powerCapacity:600, communicationsCapacity:0, status:'active', workRequired:200, workDone:50,
};
b.gridInterconnection.projects.push(project);
assert.equal(visibleElectricGridProjects([a,b,c]).length, 1);
const index = buildElectricGridMapIndex([a,b,c]);
assert.equal(index.links.length, 1);
assert.equal(index.projects.length, 1);
assert.equal(index.projects[0].progress, 0.25);

const summary = electricGridOverlaySummary(b);
assert.equal(summary.active, 1);
assert.equal(summary.powerCapacity, 800);
assert.equal(summary.communicationsCapacity, 96);

console.log('electric grid map regressions passed');
