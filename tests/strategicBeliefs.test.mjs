import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STRATEGIC_SOURCE_TYPES,
  decisionEstimate,
  externalStrategicVisibility,
  generateExternalStrategicSignal,
  generateInternalStrategicReport,
  internalEpistemicQuality,
  setStrategicInformationEnvironment,
  strategicBelief,
  updateStrategicBelief,
} from '../js/diplomacy/strategicBeliefs.js';
import { applyScenarioStrategicInformation } from '../js/core/scenarioStrategicInformation.js';

function actor(id){return{id,name:id,governance:{sovereignPolityId:id}};}

{
  const open=actor('open'),closed=actor('closed');
  setStrategicInformationEnvironment(open,{pressFreedom:.88,publicBudgetTransparency:.82,independentVerification:.86,upwardReportingIntegrity:.90,badNewsCareerPenalty:.08,corruptionPressure:.08,auditStrength:.84,operationalSecrecy:.34,deceptionCapacity:.22});
  setStrategicInformationEnvironment(closed,{pressFreedom:.10,publicBudgetTransparency:.20,independentVerification:.25,upwardReportingIntegrity:.34,badNewsCareerPenalty:.76,corruptionPressure:.62,auditStrength:.30,operationalSecrecy:.86,deceptionCapacity:.68});
  assert(externalStrategicVisibility(open)>externalStrategicVisibility(closed),'free press and public budgets should make an open state easier for outsiders to assess');
  assert(internalEpistemicQuality(open)>internalEpistemicQuality(closed),'independent verification and honest upward reporting should improve self-knowledge');

  const openLoss=generateInternalStrategicReport(open,{metric:'air_defence_depletion',trueValue:.8,direction:'loss',rng:()=>.5});
  const closedLoss=generateInternalStrategicReport(closed,{metric:'air_defence_depletion',trueValue:.8,direction:'loss',rng:()=>.5});
  assert(closedLoss.estimate<openLoss.estimate,'bad-news suppression should make leadership understate its own losses/depletion');

  const openCapacity=generateInternalStrategicReport(open,{metric:'air_defence_readiness',trueValue:.2,direction:'capacity',rng:()=>.5});
  const closedCapacity=generateInternalStrategicReport(closed,{metric:'air_defence_readiness',trueValue:.2,direction:'capacity',rng:()=>.5});
  assert(closedCapacity.estimate>openCapacity.estimate,'optimistic reporting should overstate remaining capacity');

  const openSignal=generateExternalStrategicSignal(open,{metric:'air_defence_readiness',trueValue:.2,rng:()=>.5});
  const closedSignal=generateExternalStrategicSignal(closed,{metric:'air_defence_readiness',trueValue:.2,rng:()=>.5});
  assert(openSignal.confidence>closedSignal.confidence,'outsiders should have more confidence in estimates of transparent states');
  assert(Math.abs(openSignal.estimate-.2)<Math.abs(closedSignal.estimate-.2),'secrecy and deception should make a closed state harder to estimate externally');
}

{
  const observer=actor('observer'),target=actor('target');
  updateStrategicBelief(observer,target,{metric:'air_defence_readiness',estimate:.72,confidence:.7,sourceType:STRATEGIC_SOURCE_TYPES.SIGNALS_INTELLIGENCE,asOfTick:100});
  const before=strategicBelief(observer,target,'air_defence_readiness');
  target.actualAirDefenceReadiness=.03;
  const decision=decisionEstimate(observer,target,'air_defence_readiness');
  assert.equal(decision.value,before.estimate,'strategic decisions must consume the observer belief, not target hidden truth');
  assert(decision.value>.5,'a state can remain deterred by an enemy whose actual air defence is nearly exhausted if it does not know that');
}

{
  const scenario=JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/initial-state.json',import.meta.url),'utf8'));
  const russia=scenario.actors.find(a=>a.id==='russia');
  assert(russia?.strategicInformationEnvironment,'2027 Russia should initialise an information environment');
  assert(russia.strategicInformationEnvironment.operationalSecrecy>.75,'scenario Russia should be comparatively difficult for outsiders to assess');
  assert(russia.strategicInformationEnvironment.badNewsCareerPenalty>.65,'scenario should represent strong incentives to filter bad news upward');
  assert(russia.strategicInformationEnvironment.upwardReportingIntegrity<.5,'scenario leadership should begin with a degraded internal reporting chain');
  assert.equal(russia.informationCalibration.notPermanentNationalTrait,true,'calibration must be an institutional starting condition, not an immutable country trait');

  const world={polities:[{id:'russia',scenarioActorId:'russia'}],regions:[{id:'ru-1',scenarioCountryId:'russia',governance:{sovereignPolityId:'russia'}}]};
  const applied=applyScenarioStrategicInformation(world,scenario);
  assert.equal(applied.actorsApplied,1);
  assert.equal(applied.regionsApplied,1);
  assert.equal(world.polities[0].strategicInformationEnvironment.badNewsCareerPenalty,.72,'scenario profile should reach the live polity');
  assert.equal(world.regions[0].strategicInformationEnvironment.operationalSecrecy,.82,'scenario profile should reach live regions used by simulation systems');
}

console.log('Strategic belief and reporting-distortion regressions passed.');
