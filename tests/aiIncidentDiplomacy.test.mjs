import assert from 'node:assert/strict';
import {
  AI_INCIDENT_TYPES,
  createAiIncident,
  decideAiIncidentDisclosure,
  discoverConcealedAiIncident,
  ensureAiIncidentState,
  joinAiGovernanceAccord,
  requestAiInspection,
  tickAiTreatyPolitics,
  withdrawFromAiGovernanceAccord,
} from '../js/diplomacy/aiIncidentDiplomacy.js';
import { AI_GOVERNANCE_MEASURES, ensureAiGovernance } from '../js/diplomacy/aiStatecraft.js';

function region(id){return {id,name:id.toUpperCase(),population:1_000_000,polityId:id,governance:{sovereignPolityId:id,administrativeControl:.75},unlockedTechIds:new Set(['public_key_cryptography','digital_signatures']),communicationState:{cipherPractice:.5},counterIntelligence:{credentialSecurity:.6,codePractice:.5,verificationCaution:.6,compromisedCredentialActors:[],detectedForgeries:[]},aiLabour:{capability:.8,adoption:.75},aiControl:{monitoringMaturity:.7,evaluationMaturity:.65,incidentPressure:.25,policy:{incidentDisclosure:.5},access:{}},aiSystemicRisk:{systemicRisk:.35,domainRisk:{economy:.2,information:.25,infrastructure:.45,industry:.2,military:.15,nuclearCommand:.08,politicalPower:.12},pressures:{}},computingIndustry:{capability:.8,digitalCapability:.8},digitalInfrastructure:{coverage:.8},informationIntegrity:{policy:{provenanceStandards:.5,publicMediaIndependence:.5,platformTransparency:.5,electionSecurity:.5,foreignInfluenceDisclosure:.5,archivalTransparency:.5},crypto:{confidentiality:.6,authentication:.7,codebreaking:.55,digitalSignatures:.7,publicKeyInfrastructure:.7,postQuantumReadiness:.1},incidents:[]},report:{}};}

{
 const r=region('a'),world={regions:[r],polities:[{id:'a'}],aiGovernanceAccords:[{id:'accord',active:true,memberPolityIds:['a'],measures:[AI_GOVERNANCE_MEASURES.INCIDENT_REPORTING]}]};
 ensureAiGovernance(r).policy={...ensureAiGovernance(r).policy,incidentReporting:.95,transparency:.9,concealment:.05};
 const incident=createAiIncident(r,{type:AI_INCIDENT_TYPES.INFRASTRUCTURE_DISRUPTION,severity:.8,currentTick:10});
 const d=decideAiIncidentDisclosure(world,r,incident,10,()=>0);
 assert.equal(d.reported,true);assert.equal(incident.concealed,false);assert(r.informationIntegrity.incidents.length>0,'reported incident should create public evidence');
}

{
 const r=region('b'),world={regions:[r],polities:[{id:'b'}],aiGovernanceAccords:[{id:'accord',active:true,memberPolityIds:['b'],measures:[AI_GOVERNANCE_MEASURES.INCIDENT_REPORTING]}]};
 ensureAiGovernance(r).policy={...ensureAiGovernance(r).policy,incidentReporting:.05,transparency:.05,concealment:.95};
 const incident=createAiIncident(r,{type:AI_INCIDENT_TYPES.MODEL_COMPROMISE,severity:.7,currentTick:20});
 const d=decideAiIncidentDisclosure(world,r,incident,20,()=>.99);
 assert.equal(d.reported,false);assert.equal(incident.concealed,true);assert(ensureAiIncidentState(r).diplomaticTrustPenalty>0,'concealment under a reporting accord should create latent diplomatic risk');
 const discovered=discoverConcealedAiIncident(world,r,incident,{source:'inspection',confidence:.8,currentTick:30});
 assert.equal(discovered.discovered,true);assert(r.informationIntegrity.incidents.some(x=>x.type==='concealed_ai_incident'));
}

{
 const a=region('a'),b=region('b');
 ensureAiGovernance(b).policy={...ensureAiGovernance(b).policy,inspectionAcceptance:.02,concealment:.95};
 const accord={id:'accord',active:true,memberPolityIds:['a','b'],measures:[AI_GOVERNANCE_MEASURES.INSPECTION_RIGHTS],verificationStrength:.8,inspections:[]};
 const world={regions:[a,b],polities:[{id:'a'},{id:'b'}],aiGovernanceAccords:[accord]};
 const refused=requestAiInspection(world,accord,{requesterPolityId:'a',targetPolityId:'b',currentTick:40,reason:'suspected_violation'},()=>.99);
 assert.equal(refused.accepted,false,'members must be able to refuse inspectors rather than inspections being magical');
 assert(ensureAiIncidentState(b).diplomaticTrustPenalty>0);
}

{
 const a=region('a'),b=region('b');
 ensureAiGovernance(b).policy={...ensureAiGovernance(b).policy,inspectionAcceptance:.95,concealment:.8};
 const hidden=createAiIncident(b,{type:AI_INCIDENT_TYPES.EVALUATION_EVASION,severity:.8,currentTick:45});hidden.concealed=true;ensureAiIncidentState(b).concealedIncidentIds.push(hidden.id);
 const accord={id:'accord',active:true,memberPolityIds:['a','b'],measures:[AI_GOVERNANCE_MEASURES.INSPECTION_RIGHTS],verificationStrength:.95,inspections:[]};
 const world={regions:[a,b],polities:[{id:'a'},{id:'b'}],aiGovernanceAccords:[accord]};
 const draws=[0,0];let i=0;const result=requestAiInspection(world,accord,{requesterPolityId:'a',targetPolityId:'b',currentTick:50,reason:'suspected_violation'},()=>draws[i++]??0);
 assert.equal(result.accepted,true);assert.equal(result.inspection.discrepancyDetected,true);assert.equal(hidden.discovered,true,'successful inspection should be able to uncover concealed incidents');
}

{
 const a=region('a'),b=region('b'),c=region('c');
 const accord={id:'accord',active:true,memberPolityIds:['a','b'],measures:[AI_GOVERNANCE_MEASURES.EMERGENCY_HOTLINE,AI_GOVERNANCE_MEASURES.EVALUATION_STANDARDS],verificationStrength:.4,exportControlCoordination:.1,membershipHistory:[]};
 const world={regions:[a,b,c],polities:[{id:'a'},{id:'b'},{id:'c'}],aiGovernanceAccords:[accord]};
 const joined=joinAiGovernanceAccord(world,accord,'c',60);assert.equal(joined.joined,true);assert(accord.memberPolityIds.includes('c'));
 const withdrawn=withdrawFromAiGovernanceAccord(world,accord,'c',61);assert.equal(withdrawn.withdrawn,true);assert(!accord.memberPolityIds.includes('c'));
 ensureAiGovernance(c).policy={...ensureAiGovernance(c).policy,transparency:.95,concealment:.02};c.aiSystemicRisk.systemicRisk=.8;c.aiCompetitionPressure=.05;
 tickAiTreatyPolitics(world,65,30,()=>0);assert(accord.memberPolityIds.includes('c'),'high-risk transparent AI state should sometimes join a useful accord');
}

console.log('AI incident diplomacy and treaty politics regressions passed.');
