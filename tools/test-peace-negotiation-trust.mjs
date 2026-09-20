import assert from 'node:assert/strict';
import { registerInternationalCrisis } from '../js/diplomacy/internationalCrises.js';
import { ensureDiplomacy, relationToward } from '../js/diplomacy/relations.js';
import {
  createPeaceConferenceProposal,
  PEACE_TERM_TYPES,
} from '../js/diplomacy/peaceConferences.js';
import {
  WITHDRAWAL_SEQUENCES,
  VERIFICATION_MODES,
  bilateralPeaceTrust,
  configureImplementationTerms,
  counterPeaceConferenceProposal,
  signPeaceFramework,
  resolveImplementationAction,
} from '../js/diplomacy/peaceNegotiations.js';

function polity(id, capitalRegionId, reliability=.58){return{id,name:id,capitalRegionId,diplomaticReliability:reliability,administration:{legitimacy:.6},warSociety:{warWeariness:.45}};}
function region(id,pid){return{id,name:id,population:100000,treasury:500,wallet:100,army:{personnel:800,away:0},governance:{sovereignPolityId:pid},relations:new Map(),specialForces:{captives:[]}};}
function worldFixture(){
  const a=polity('a','a1'),b=polity('b','b1');
  const a1=region('a1','a'),b1=region('b1','b'); ensureDiplomacy(a1);ensureDiplomacy(b1);
  relationToward(a1,'b1').attitude=-.85; relationToward(b1,'a1').attitude=-.85;
  const war={id:'war-1',active:true,participants:[
    {actorId:'a',stances:{b:'hostile'},enemyPriorities:{b:1}},
    {actorId:'b',stances:{a:'hostile'},enemyPriorities:{a:1}},
  ],history:[]};
  const campaigns=[
    {id:1,warId:'war-1',attackerId:'a1',defenderId:'b1',phase:'engaged',completed:false,withdrawRequested:false},
    {id:2,warId:'war-1',attackerId:'b1',defenderId:'a1',phase:'engaged',completed:false,withdrawRequested:false},
  ];
  const world={polities:[a,b],regions:[a1,b1],activeWars:[war],activeCampaigns:campaigns,internationalCrises:[]};
  const crisis=registerInternationalCrisis(world,{key:'war:war-1',type:'war',sourceId:'war-1',sideAActorId:'a',sideBActorId:'b',severity:.7,evidence:1},10);
  crisis.mediation=.6; crisis.restraint=.4;
  return {world,crisis,a,b,a1,b1,war,campaigns};
}

{
  const {world,crisis}=worldFixture();
  const proposal=createPeaceConferenceProposal(crisis,world,12,{mediator:{type:'state',id:'m'}});
  configureImplementationTerms(proposal,crisis,world);
  const withdrawal=proposal.terms.find(t=>t.type===PEACE_TERM_TYPES.WITHDRAWAL);
  assert.ok(bilateralPeaceTrust(world,'a','b')<.62);
  assert.equal(withdrawal.implementation.sequence,WITHDRAWAL_SEQUENCES.RECIPROCAL_STEPS);
  assert.equal(withdrawal.implementation.verification,VERIFICATION_MODES.OBSERVERS);
}

{
  const {world,crisis}=worldFixture();
  const proposal=createPeaceConferenceProposal(crisis,world,12,{mediator:{type:'state',id:'m'}});
  configureImplementationTerms(proposal,crisis,world);
  proposal.responses.a={response:'accept'};
  const result=counterPeaceConferenceProposal(proposal,crisis,world,'b',{
    withdrawalSequence:WITHDRAWAL_SEQUENCES.SIDE_A_FIRST,
    verification:VERIFICATION_MODES.INSPECTIONS,
  },13);
  assert.equal(result.changed,true);
  assert.deepEqual(proposal.responses,{});
  const withdrawal=proposal.terms.find(t=>t.type===PEACE_TERM_TYPES.WITHDRAWAL);
  assert.equal(withdrawal.implementation.sequence,WITHDRAWAL_SEQUENCES.SIDE_A_FIRST);
  assert.equal(withdrawal.implementation.verification,VERIFICATION_MODES.INSPECTIONS);
}

{
  const {world,crisis,campaigns}=worldFixture();
  const proposal=createPeaceConferenceProposal(crisis,world,12,{mediator:{type:'state',id:'m'}});
  configureImplementationTerms(proposal,crisis,world);
  const withdrawal=proposal.terms.find(t=>t.type===PEACE_TERM_TYPES.WITHDRAWAL);
  withdrawal.implementation={sequence:WITHDRAWAL_SEQUENCES.SIDE_A_FIRST,verification:VERIFICATION_MODES.TRUST,phases:1,intervalTicks:1};
  signPeaceFramework(proposal,crisis,world,13);
  const aOb=proposal.implementation.obligations.find(o=>o.actorId==='a');
  const bOb=proposal.implementation.obligations.find(o=>o.actorId==='b');
  assert.equal(bOb.dependsOn,aOb.id);
  const lie=resolveImplementationAction('a',aOb,proposal,crisis,world,'deceive',14,()=>1);
  assert.equal(lie.detected,false);
  assert.equal(aOb.reportedStatus,'fulfilled');
  assert.equal(aOb.status,'defected');
  const trustedMove=resolveImplementationAction('b',bOb,proposal,crisis,world,'comply',15,()=>1);
  assert.equal(trustedMove.changed,true);
  assert.equal(campaigns.find(c=>c.attackerId==='b1').withdrawRequested,true);
  assert.equal(campaigns.find(c=>c.attackerId==='a1').withdrawRequested,false);
}

{
  const {world,crisis}=worldFixture();
  const proposal=createPeaceConferenceProposal(crisis,world,12,{mediator:{type:'international_organisation',id:'org'}});
  configureImplementationTerms(proposal,crisis,world);
  const withdrawal=proposal.terms.find(t=>t.type===PEACE_TERM_TYPES.WITHDRAWAL);
  withdrawal.implementation={sequence:WITHDRAWAL_SEQUENCES.SIDE_A_FIRST,verification:VERIFICATION_MODES.OBSERVERS,phases:1,intervalTicks:1};
  signPeaceFramework(proposal,crisis,world,13);
  const aOb=proposal.implementation.obligations.find(o=>o.actorId==='a');
  const bOb=proposal.implementation.obligations.find(o=>o.actorId==='b');
  const lie=resolveImplementationAction('a',aOb,proposal,crisis,world,'deceive',14,()=>0);
  assert.equal(lie.detected,true);
  assert.equal(proposal.implementation.status,'breached');
  const blocked=resolveImplementationAction('b',bOb,proposal,crisis,world,'comply',15,()=>0);
  assert.equal(blocked.changed,false);
  assert.equal(blocked.reason,'dependency_not_satisfied');
  assert.ok(world.polities.find(p=>p.id==='a').diplomaticReliability<.58);
}

console.log('peace negotiation trust regressions passed');
