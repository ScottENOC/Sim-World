import assert from 'node:assert/strict';
import { attemptBribeDiplomat, diplomatCommitDecision, diplomatPublicProfile, ensureDiplomaticService, expelDiplomat, foreignGovernmentTrust, resolveDiplomatAuthorityBreach } from '../js/diplomacy/diplomats.js';
import { attemptTurnDiplomat, diplomatReliability, ensureDiplomatPersonality, recordGovernmentTrust } from '../js/diplomacy/diplomatPersonalities.js';

function region(id){
  return { id, name:id, neighbors:[], adjacentSeaIds:[], controllingActorId:id, governance:{sovereignPolityId:id}, army:{personnel:500}, population:10000, safetyRating:1, diplomacyReport:{}, diplomaticMessages:[] };
}

const a=region('A'), b=region('B'); a.neighbors=['B']; b.neighbors=['A'];
const diplomat=ensureDiplomaticService(a).diplomats[0];
ensureDiplomatPersonality(diplomat);
assert.ok(diplomat.personality && Number.isFinite(diplomat.personality.avarice));
assert.ok(diplomatReliability(diplomat)>0 && diplomatReliability(diplomat)<=1);

// A posted envoy can be turned without home gaining omniscient knowledge of it.
diplomat.status='posted'; diplomat.postedRegionId='B'; diplomat.loyalty=0.1; diplomat.integrity=0.05; diplomat.personality.avarice=1;
const turn=attemptTurnDiplomat(diplomat,'B',100,0.4,()=>0);
assert.equal(turn.success,true);
assert.equal(diplomat.turnedByActorId,'B');
const publicProfile=diplomatPublicProfile(diplomat);
assert.equal('turnedByActorId' in publicProfile,false);

// Exceeding a military mandate is possible for an independent ambitious envoy and creates a reviewable breach.
diplomat.turnedByActorId=null; diplomat.authority='military'; diplomat.maxMilitaryCommitmentFraction=0.2; diplomat.loyalty=0.05; diplomat.personality.independence=1; diplomat.personality.ambition=1;
const decision=diplomatCommitDecision(diplomat,'joint_operation',0.7,100,{urgency:1,rng:()=>0});
assert.equal(decision.canCommit,true);
assert.equal(decision.exceededAuthority,true);
assert.equal(diplomat.authorityBreaches.length>0,true);
diplomat.authorityBreaches.at(-1).reported=true;
const agreements=[{id:'j1',active:true,sourceDiplomatId:diplomat.id,authorityExceeded:true,authorityRatified:false}];
const repudiated=resolveDiplomatAuthorityBreach(a,diplomat.id,'repudiate',agreements,110);
assert.equal(repudiated.resolved,true);
assert.equal(agreements[0].active,false);
assert.equal(diplomat.authority,'observe');

// State-to-state trust remembers behaviour rather than mirroring current attitude.
recordGovernmentTrust(a,'B','promise_kept',10);
recordGovernmentTrust(a,'B','promise_kept',20);
const before=foreignGovernmentTrust(a,'B').score;
recordGovernmentTrust(a,'B','promise_broken',30);
const after=foreignGovernmentTrust(a,'B').score;
assert.ok(before>after);
assert.equal(foreignGovernmentTrust(a,'B').promisesBroken,1);

// Bribery API only works on an actually posted envoy.
diplomat.status='home';
assert.equal(attemptBribeDiplomat(a,diplomat.id,'B',20,0,()=>0).attempted,false);
diplomat.status='posted'; diplomat.postedRegionId='B'; diplomat.loyalty=0; diplomat.integrity=0; diplomat.personality.avarice=1;
assert.equal(attemptBribeDiplomat(a,diplomat.id,'B',50,0,()=>0).success,true);

// Expulsion is distinct from detention: it starts a physical return journey where a route exists.
diplomat.turnedByActorId=null;
const expelled=expelDiplomat(a,diplomat.id,b,[a,b],200,'test');
assert.equal(expelled.expelled,true);
assert.equal(diplomat.status,'returning');
assert.ok(diplomat.arrivalTick>200);

console.log('Diplomatic agent trust regressions passed');
