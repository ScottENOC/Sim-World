import assert from 'node:assert/strict';
import { registerInternationalCrisis } from '../js/diplomacy/internationalCrises.js';
import { ensureDiplomacy, relationToward } from '../js/diplomacy/relations.js';
import { createPeaceConferenceProposal, PEACE_TERM_TYPES } from '../js/diplomacy/peaceConferences.js';
import {
  WITHDRAWAL_SEQUENCES,
  VERIFICATION_MODES,
  configureImplementationTerms,
  signPeaceFramework,
  resolveImplementationAction,
} from '../js/diplomacy/peaceNegotiations.js';
import {
  ARMISTICE_VIOLATIONS,
  recordArmisticeViolation,
  releaseArmistice,
  resumeCampaignAfterArmisticeViolation,
} from '../js/diplomacy/armistices.js';

function polity(id, capitalRegionId){return{id,name:id,capitalRegionId,diplomaticReliability:.58,warSociety:{warWeariness:.4}};}
function region(id,pid){return{id,name:id,population:100000,treasury:400,wallet:100,army:{personnel:1000,away:0},governance:{sovereignPolityId:pid},relations:new Map(),specialForces:{captives:[]}};}
function fixture(){
  const a=polity('a','a1'),b=polity('b','b1');
  const a1=region('a1','a'),b1=region('b1','b'); ensureDiplomacy(a1);ensureDiplomacy(b1);
  relationToward(a1,'b1').attitude=-.9; relationToward(b1,'a1').attitude=-.9;
  const war={id:'war-1',active:true,participants:[{actorId:'a',stances:{b:'hostile'}},{actorId:'b',stances:{a:'hostile'}}],history:[]};
  const campaigns=[
    {id:1,warId:'war-1',attackerId:'a1',defenderId:'b1',phase:'engaged',stage:'skirmishing',lastProcessedTick:10,completed:false,withdrawRequested:false},
    {id:2,warId:'war-1',attackerId:'b1',defenderId:'a1',phase:'travelling',stage:'marching',departTick:8,arriveTick:16,completed:false,withdrawRequested:false},
  ];
  const world={polities:[a,b],regions:[a1,b1],activeWars:[war],activeCampaigns:campaigns,internationalCrises:[]};
  const crisis=registerInternationalCrisis(world,{key:'war:war-1',type:'war',sourceId:'war-1',sideAActorId:'a',sideBActorId:'b',severity:.72,nuclearRisk:.2,evidence:1},10);
  crisis.mediation=.7; crisis.restraint=.5;
  const proposal=createPeaceConferenceProposal(crisis,world,11,{mediator:{type:'international_organisation',id:'org'}});
  configureImplementationTerms(proposal,crisis,world);
  const withdrawal=proposal.terms.find(term=>term.type===PEACE_TERM_TYPES.WITHDRAWAL);
  withdrawal.implementation={sequence:WITHDRAWAL_SEQUENCES.SIDE_A_FIRST,verification:VERIFICATION_MODES.OBSERVERS,phases:1,intervalTicks:1};
  proposal.armisticePlan={verification:VERIFICATION_MODES.OBSERVERS,freezeFronts:true,dmzWidthKm:10};
  signPeaceFramework(proposal,crisis,world,12);
  return{world,crisis,proposal,campaigns,a,b};
}

// Signing an armistice freezes both live fronts in place without ending the war.
{
  const {world,proposal,campaigns}=fixture();
  assert.equal(world.activeWars[0].active,true);
  assert.equal(world.activeArmistices.length,1);
  assert.equal(world.activeArmistices[0].dmzWidthKm,10);
  assert.equal(world.activeArmistices[0].fronts.length,2);
  assert.equal(campaigns[0].phase,'ceasefire_hold');
  assert.equal(campaigns[1].phase,'ceasefire_hold');
  assert.equal(campaigns[0].ceasefireHold.frozenPhase,'engaged');
  assert.equal(campaigns[1].ceasefireHold.frozenPhase,'travelling');
  assert.equal(proposal.implementation.armisticeId,world.activeArmistices[0].id);
}

// A phased withdrawal releases only the campaign whose side is due to move.
{
  const {world,crisis,proposal,campaigns}=fixture();
  const aOb=proposal.implementation.obligations.find(ob=>ob.actorId==='a');
  const result=resolveImplementationAction('a',aOb,proposal,crisis,world,'comply',13,()=>1);
  assert.equal(result.changed,true);
  assert.equal(campaigns[0].phase,'engaged');
  assert.equal(campaigns[0].withdrawRequested,true);
  assert.equal(campaigns[1].phase,'ceasefire_hold');
  assert.equal(campaigns[1].withdrawRequested,false);
}

// A detected DMZ violation raises crisis pressure and damages reliability but need not restart combat.
{
  const {world,crisis,campaigns,a}=fixture();
  const armistice=world.activeArmistices[0];
  const beforeSeverity=crisis.severity, beforeReliability=a.diplomaticReliability;
  const result=recordArmisticeViolation(world,armistice,'a',ARMISTICE_VIOLATIONS.INCURSION,14,{campaignId:1,public:true},()=>0);
  assert.equal(result.violation.detected,true);
  assert.ok(crisis.severity>beforeSeverity);
  assert.ok(a.diplomaticReliability<beforeReliability);
  assert.equal(campaigns[0].phase,'ceasefire_hold');
  assert.equal(armistice.status,'strained');
}

// Deliberately renewing an advance breaches the armistice and restores that campaign to combat state.
{
  const {world,campaigns}=fixture();
  const result=resumeCampaignAfterArmisticeViolation(world,campaigns[0],'a',14,ARMISTICE_VIOLATIONS.ADVANCE,()=>0);
  assert.equal(result.resumed,true);
  assert.equal(campaigns[0].phase,'engaged');
  assert.equal(world.activeArmistices[0].status,'breached');
  assert.equal(world.activeArmistices[0].breachedByActorId,'a');
}

// Ending an armistice restores held campaigns, including halted marches, without fast-forwarding lost time.
{
  const {world,campaigns}=fixture();
  const travelling=campaigns[1];
  releaseArmistice(world,world.activeArmistices[0],20,'talks_collapsed');
  assert.equal(campaigns[0].phase,'engaged');
  assert.equal(travelling.phase,'travelling');
  assert.ok(travelling.arriveTick>20);
  assert.equal(world.activeArmistices[0].status,'ended');
}

console.log('armistice frozen-front regressions passed');
