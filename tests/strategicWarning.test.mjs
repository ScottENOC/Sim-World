import assert from 'node:assert/strict';
import { informationIntegritySummary } from '../js/diplomacy/informationIntegrity.js';
import { assessNuclearWarRisk } from '../js/military/nuclearWarRisk.js';
import {
  STRATEGIC_WARNING_TYPES,
  addStrategicWarningEvidence,
  ensureStrategicWarningState,
  queueStrategicSignal,
  recordMilitaryProvocation,
  recordStrategicWarning,
  resolveStrategicWarning,
  strategicWarningSummary,
  tickStrategicWarnings,
} from '../js/diplomacy/strategicWarning.js';

function region(id='a'){
  return {
    id,name:id.toUpperCase(),polityId:id,governance:{sovereignPolityId:id},population:1_000_000,
    publicEducation:{literacy:.8,technicalHumanCapital:.7},computingIndustry:{capability:.7},
    counterIntelligence:{credentialSecurity:.6,codePractice:.5,verificationCaution:.65,compromisedCredentialActors:[],detectedForgeries:[]},
    report:{},unlockedTechIds:new Set(['electronic_computing','computer_networks']),
  };
}
function nuclearRegion(id='n'){
  const r=region(id);
  r.nuclearWeapons={operationalWarheads:120,prototypeCount:1,validationConfidence:.9,tests:[{completed:true}]};
  r.nuclearForces={operationalWarheads:120,reserveWarheads:40};
  r.strategicAi={effects:{warningQuality:.5,falseAlarmFiltering:.5,secondStrikeResilience:.2,commandRisk:.01,humanReleaseAuthority:1}};
  return r;
}

{
  const r=region('observer');
  const warning=recordStrategicWarning(r,{
    type:STRATEGIC_WARNING_TYPES.MISSILE_LAUNCH,
    actualThreat:false,actualActorId:'hidden-actor',allegedActorId:'rival',
    sensorConfidence:.55,sourceReliability:.58,corroboration:.08,
  },100);
  assert.equal(warning.actualThreat,false,'simulation may retain hidden physical truth internally');
  const publicInfo=JSON.stringify(informationIntegritySummary(r));
  const warningInfo=JSON.stringify(strategicWarningSummary(r));
  assert(!publicInfo.includes('hidden-actor'),'public information must not leak the hidden actor');
  assert(!warningInfo.includes('hidden-actor'),'warning report must not leak the hidden actor');
  assert(!warningInfo.includes('actualThreat'),'advisor-facing warning report must not expose hidden truth fields');
  assert(publicInfo.includes('rival'),'an alleged actor may appear when the observed warning actually alleges one');
}

{
  const r=region('evidence');
  const warning=recordStrategicWarning(r,{type:STRATEGIC_WARNING_TYPES.AIRSPACE_INCURSION,allegedActorId:'rival',corroboration:.05,sourceReliability:.5},10);
  const claim=r.informationIntegrity.incidents.find(i=>i.id===warning.publicClaimId);
  const before=claim.assessment.confidence;
  addStrategicWarningEvidence(r,warning.id,{sourceId:'second-radar',sourceType:'independent_sensor',evidenceType:'sensor',sourceReliability:.88,provenance:.82,corroboration:.75,forensicSupport:.7,attributionEvidence:.62},11);
  assert(claim.assessment.confidence>before,'independent corroboration should increase confidence in an ambiguous warning');
}

{
  const r=region('naval');
  const incident=recordMilitaryProvocation(r,{type:STRATEGIC_WARNING_TYPES.NAVAL_INCIDENT,allegedActorId:'rival',actualActorId:'rival',actualThreat:true},20);
  const claim=r.informationIntegrity.incidents.find(i=>i.id===incident.publicClaimId);
  assert(claim.narratives.some(n=>n.kind==='denial_actor'),'an accused actor can publicly deny responsibility for a disputed military encounter');
  assert(claim.narratives.some(n=>n.kind==='misidentification'),'weakly corroborated encounters retain a plausible misidentification account');
}

{
  const r=region('queued');
  queueStrategicSignal(r,{type:STRATEGIC_WARNING_TYPES.BORDER_INCIDENT,allegedActorId:'neighbour',actualThreat:true,sourceReliability:.7,corroboration:.4});
  const events=tickStrategicWarnings([r],30,7,()=>.99);
  assert.equal(ensureStrategicWarningState(r).pendingSignals.length,0,'queued real-world signals should be consumed by the warning tick');
  assert(events.some(e=>e.type==='strategic_warning'),'queued provocations should generate warning events');
}

{
  const fragile=region('fragile');
  fragile.nuclearRisk={nuclearPower:true,crisisPressure:1,policy:{alertPosture:'hair_trigger',earlyWarningQuality:0}};
  fragile.strategicAi={effects:{falseAlarmFiltering:0}};
  const robust=region('robust');
  robust.nuclearRisk={nuclearPower:true,crisisPressure:1,policy:{alertPosture:'hair_trigger',earlyWarningQuality:1}};
  robust.strategicAi={effects:{falseAlarmFiltering:1}};
  const fragileEvents=tickStrategicWarnings([fragile],40,365.2425,()=>.08);
  const robustEvents=tickStrategicWarnings([robust],40,365.2425,()=>.08);
  assert(fragileEvents.some(e=>e.type==='strategic_warning_alert'),'poorly filtered high-crisis warning systems should sometimes generate false alarms');
  assert(!robustEvents.some(e=>e.type==='strategic_warning_alert'),'high-quality filtering should suppress the same marginal false alarm draw');
  const hidden=ensureStrategicWarningState(fragile).incidents.at(-1);
  assert.equal(hidden.actualThreat,false,'automatic false alarms retain hidden physical truth for the simulation');
  assert(!JSON.stringify(strategicWarningSummary(fragile)).includes('actualThreat'),'false-alarm truth is not exposed to the player report');
}

{
  const r=nuclearRegion('decision');
  const warning=recordStrategicWarning(r,{
    type:STRATEGIC_WARNING_TYPES.MISSILE_LAUNCH,
    actualThreat:false,
    sensorConfidence:.8,sourceReliability:.86,provenance:.8,corroboration:.7,forensicSupport:.55,
  },60);
  const during=assessNuclearWarRisk(r,{regions:[r],activeWars:[]});
  assert(during.crisisPressure>0,'commanders should react to a credible observed warning even when the simulation knows it is false');
  const duringRisk=during.miscalculationRisk;
  resolveStrategicWarning(r,warning.id,{kind:'stood_down'},61);
  const after=assessNuclearWarRisk(r,{regions:[r],activeWars:[]});
  assert(after.crisisPressure<during.crisisPressure,'resolving the warning should reduce observed strategic pressure');
  assert(after.miscalculationRisk<duringRisk,'standing down an ambiguous warning should reduce miscalculation risk');
}

console.log('Strategic warning and ambiguous provocation regressions passed.');
