import assert from 'node:assert/strict';
import { registerInternationalCrisis } from '../js/diplomacy/internationalCrises.js';
import { harvestInternationalCrisisSignals } from '../js/diplomacy/internationalCrisisBridge.js';
import { tickInternationalCrisisBodies } from '../js/diplomacy/internationalCrisisBodies.js';
import {
  PEACE_TERM_TYPES,
  buildPeaceConferenceTerms,
  createPeaceConferenceProposal,
  respondPeaceConferenceProposal,
  tickPeaceConferences,
} from '../js/diplomacy/peaceConferences.js';

function polity(id, capitalRegionId, weariness=.7){return{id,name:id,capitalRegionId,administration:{legitimacy:.55},warSociety:{warWeariness:weariness}};}
function region(id,pid,treasury=300){return{id,name:id,population:100000,treasury,wallet:100,army:{personnel:600},governance:{sovereignPolityId:pid,administrativeControl:.7,vipStatus:{}},relations:new Map(),religion:{shares:{}}};}
function hostileParticipant(actorId,enemyId){return{actorId,sideId:actorId,warAim:'defeat',stances:{[enemyId]:'hostile'},enemyPriorities:{[enemyId]:1},surrenderPolicy:{},occupationPreferences:{}};}

// Live war participant objects must bridge to actor IDs and expose the contested region.
{
  const a=polity('a','a1'),b=polity('b','b1'); const a1=region('a1','a'),b1=region('b1','b');
  const war={id:'war-9',active:true,participants:[hostileParticipant('a','b'),hostileParticipant('b','a')],history:[]};
  const campaign={id:1,warId:'war-9',attackerId:'a1',defenderId:'b1',completed:false,withdrawRequested:false};
  const world={polities:[a,b],regions:[a1,b1],activeWars:[war],activeCampaigns:[campaign],internationalOrganisations:[]};
  harvestInternationalCrisisSignals(world,10);
  const crisis=world.internationalCrises.find(c=>c.key==='war:war-9');
  assert.equal(crisis.sideAActorId,'a');
  assert.equal(crisis.sideBActorId,'b');
  assert.deepEqual(crisis.disputedRegionIds,['b1']);
}

// A sufficiently dangerous mediated war should produce concrete, mixed settlement terms.
{
  const a=polity('a','a1'),b=polity('b','b1'); const a1=region('a1','a',500),b1=region('b1','b',200);
  a1.specialForces={captives:[{id:'vip-b',role:'ruler',capturedFromRegionId:'b1'}]};
  const war={id:'war-1',active:true,participants:[hostileParticipant('a','b'),hostileParticipant('b','a')],history:[]};
  const campaign={id:2,warId:'war-1',attackerId:'a1',defenderId:'b1',completed:false,withdrawRequested:false};
  const world={polities:[a,b],regions:[a1,b1],activeWars:[war],activeCampaigns:[campaign],internationalOrganisations:[]};
  const crisis=registerInternationalCrisis(world,{key:'war:war-1',type:'war',sourceId:'war-1',sideAActorId:'a',sideBActorId:'b',allegedAggressorActorId:'a',severity:.9,humanitarianRisk:.8,nuclearRisk:.6},20);
  crisis.mediation=.7; crisis.pressureA=.75; crisis.pressureB=.2; crisis.disputedRegionIds=['b1'];
  tickInternationalCrisisBodies(world,21,()=>1); // normalises real captive origin; no conference until age >= 2.
  const terms=buildPeaceConferenceTerms(crisis,world,{mediator:{type:'state',id:'m'}});
  const types=new Set(terms.map(t=>t.type));
  for(const expected of [PEACE_TERM_TYPES.CEASEFIRE,PEACE_TERM_TYPES.WITHDRAWAL,PEACE_TERM_TYPES.PRISONER_EXCHANGE,PEACE_TERM_TYPES.HUMANITARIAN_CORRIDOR,PEACE_TERM_TYPES.INSPECTIONS,PEACE_TERM_TYPES.OBSERVERS,PEACE_TERM_TYPES.TERRITORIAL_STATUS_QUO,PEACE_TERM_TYPES.REPARATIONS]) assert.ok(types.has(expected),`missing ${expected}`);
  assert.equal(a1.specialForces.captives[0].homeActorId,'b');
}

// Mutual acceptance must end the actual war, order live campaigns home, release VIPs and transfer reparations.
{
  const a=polity('a','a1'),b=polity('b','b1'); const a1=region('a1','a',500),b1=region('b1','b',100);
  a1.specialForces={captives:[{id:'vip-b',capturedFromRegionId:'b1',homeActorId:'b'}]};
  const war={id:'war-2',active:true,participants:[hostileParticipant('a','b'),hostileParticipant('b','a')],history:[]};
  const campaign={id:3,warId:'war-2',attackerId:'a1',defenderId:'b1',completed:false,withdrawRequested:false};
  const world={polities:[a,b],regions:[a1,b1],activeWars:[war],activeCampaigns:[campaign],internationalOrganisations:[]};
  const crisis=registerInternationalCrisis(world,{key:'war:war-2',type:'war',sourceId:'war-2',sideAActorId:'a',sideBActorId:'b',severity:.9,humanitarianRisk:.7,nuclearRisk:.5},30);
  crisis.mediation=.8; crisis.pressureA=.8; crisis.pressureB=.3; crisis.disputedRegionIds=['b1'];
  const proposal=createPeaceConferenceProposal(crisis,world,32,{mediator:{type:'state',id:'neutral'}});
  assert.ok(proposal);
  respondPeaceConferenceProposal(proposal,crisis,world,'a','accept',32);
  const result=respondPeaceConferenceProposal(proposal,crisis,world,'b','accept',32);
  assert.equal(result.enacted,true);
  assert.equal(war.active,false);
  assert.equal(war.endReason,'negotiated_settlement');
  assert.equal(campaign.withdrawRequested,true);
  assert.equal(a1.specialForces.captives.length,0);
  assert.equal(b1.governance.vipStatus['vip-b'].status,'released');
  assert.ok(b1.treasury>100);
  assert.ok(a1.treasury<500);
  assert.equal(crisis.status,'settled');
  assert.ok(crisis.observerMission?.active);
  assert.ok(crisis.humanitarianCorridor?.active);
  assert.ok(crisis.inspectionRegime);
}

// Player participants get a resolvable proposal rather than an automatic decision.
{
  const a=polity('a','a1',.9),b=polity('b','b1',.9); const a1=region('a1','a'),b1=region('b1','b');
  const world={polities:[a,b],regions:[a1,b1],activeWars:[],activeCampaigns:[],internationalOrganisations:[]};
  const crisis=registerInternationalCrisis(world,{type:'blockade',sideAActorId:'a',sideBActorId:'b',severity:.8,humanitarianRisk:.6,nuclearRisk:.3},40);
  crisis.mediation=.8; crisis.restraint=.5; crisis.pressureA=.8; crisis.pressureB=.8;
  const events=tickInternationalCrisisBodies(world,43,()=>0,{playerPolityId:'a'});
  const available=events.find(event=>event.type==='peace_conference_proposal_available'&&event.actorId==='a');
  assert.ok(available);
  assert.equal(typeof available.resolveDecision,'function');
  const resolution=available.resolveDecision('accept');
  assert.equal(resolution.changed,true);
}

// Rejected talks must not immediately reopen every week.
{
  const a=polity('a','a1',0),b=polity('b','b1',0); const a1=region('a1','a'),b1=region('b1','b');
  const world={polities:[a,b],regions:[a1,b1],activeWars:[],activeCampaigns:[],internationalOrganisations:[]};
  const crisis=registerInternationalCrisis(world,{type:'territorial_dispute',sideAActorId:'a',sideBActorId:'b',severity:.3},50);
  crisis.mediation=.8;
  const proposal=createPeaceConferenceProposal(crisis,world,52,{mediator:{type:'state',id:'m'}});
  respondPeaceConferenceProposal(proposal,crisis,world,'a','reject',52);
  const countBefore=crisis.peaceConferences.length;
  tickInternationalCrisisBodies(world,53,()=>0);
  assert.equal(crisis.peaceConferences.length,countBefore);
  assert.ok(crisis.peaceConferenceCooldownUntilTick>53);
}

console.log('peace conference regressions passed');
