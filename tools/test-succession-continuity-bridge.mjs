import assert from 'node:assert/strict';
import { initialisePoliticalContinuity } from '../js/politics/continuity.js?v=20260913-succession-continuity1';
import { linkSuccessionClaimant, reconcileSuccessionContinuity } from '../js/politics/successionContinuityBridge.js?v=20260913-succession-continuity1';

function polity(id, capital, legitimacy = 0.4) {
  return {
    id, name: id, capitalRegionId: capital, rulerRegionId: capital, subjectToPolityId: null,
    administration: { legitimacy, officialdom: 0.4, accounting: 0.4, communications: 0.4, recordKeeping: 0.4, delegation: 0.3, experience: {}, breakthroughs: new Set() },
  };
}

function region(id, sovereign, local, neighbours = []) {
  return {
    id, name: id, polityId: local, population: 10000, neighbors: neighbours, cultureGroups: [{ id: 'culture-a', population: 10000 }],
    governance: { sovereignPolityId: sovereign, localPolityId: local, relationship: sovereign === local ? 'core' : 'delegated', autonomy: sovereign === local ? 0 : 0.6, administrativeControl: sovereign === local ? 1 : 0.4 },
  };
}

const parent = polity('parent', 'r1', 0.45);
const claimant = polity('claimant', 'r2', 0.28);
const host = polity('host', 'r4', 0.7);
const regions = [
  region('r1', 'parent', 'parent', ['r2']),
  region('r2', 'parent', 'claimant', ['r1','r3']),
  region('r3', 'parent', 'local3', ['r2']),
  region('r4', 'host', 'host', []),
];
const polities = [parent, claimant, host, polity('local3', 'r3', 0.2)];
initialisePoliticalContinuity(polities, regions, 0);

const rival = { id: 'parent:military:2', kind: 'military_elite', legitimacy: 0.52 };
linkSuccessionClaimant(parent, claimant, rival, ['r2'], regions, polities, 100);
assert.equal(claimant.continuity.status, 'claimant');
assert.equal(claimant.continuity.successionClaim.parentPolityId, 'parent');
assert.ok(claimant.continuity.claims.r2 >= 0.95);
assert.ok(claimant.continuity.claims.r1 >= 0.65, 'succession claimant should claim the wider realm, not only its first province');
assert.ok(parent.continuity.claims.r2 >= 0.95, 'incumbent continuity claim must survive the breakaway');

parent.succession = { crisis: { escalated: true, claimantPolityId: 'claimant', contested: true } };
regions[1].governance.sovereignPolityId = 'claimant';
assert.equal(reconcileSuccessionContinuity(parent, polities, regions, 110), null, 'civil war remains active while both factions hold territory');

regions[1].governance.sovereignPolityId = 'parent';
const incumbentVictory = reconcileSuccessionContinuity(parent, polities, regions, 120);
assert.equal(incumbentVictory.loserPolityId, 'claimant');
assert.equal(claimant.continuity.status, 'exile');
assert.equal(claimant.continuity.successionClaim.status, 'defeated_exile');
assert.equal(parent.succession.crisis.contested, false);
assert.ok(Object.keys(claimant.continuity.claims).length > 0, 'defeated succession claimant keeps durable restoration claims');

// Mirror case: a claimant wins the territorial war. The old government should
// use exactly the same exile machinery rather than being deleted.
const old = polity('old', 'a1', 0.36);
const victor = polity('victor', 'a2', 0.4);
const neutral = polity('neutral', 'a3', 0.6);
const regions2 = [
  region('a1', 'old', 'old', ['a2']),
  region('a2', 'old', 'victor', ['a1']),
  region('a3', 'neutral', 'neutral', []),
];
const polities2 = [old, victor, neutral];
initialisePoliticalContinuity(polities2, regions2, 0);
linkSuccessionClaimant(old, victor, { id: 'old:provincial:2', kind: 'provincial_claimant', legitimacy: 0.5 }, ['a2'], regions2, polities2, 200);
old.succession = { crisis: { escalated: true, claimantPolityId: 'victor', contested: true } };
regions2[0].governance.sovereignPolityId = 'victor';
regions2[1].governance.sovereignPolityId = 'victor';
const claimantVictory = reconcileSuccessionContinuity(old, polities2, regions2, 220);
assert.equal(claimantVictory.winnerPolityId, 'victor');
assert.equal(old.continuity.status, 'exile');
assert.equal(victor.continuity.status, 'sovereign');

console.log('succession continuity bridge regression passed');
