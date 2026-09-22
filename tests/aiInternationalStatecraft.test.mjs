import assert from 'node:assert/strict';
import {
  AI_GOVERNANCE_MEASURES,
  AI_STATECRAFT_OPERATIONS,
  conductAiInspection,
  ensureAiGovernance,
  establishAiGovernanceAccord,
  launchAiStatecraftOperation,
  setAiGovernancePolicy,
  tickInternationalAiStatecraft,
} from '../js/diplomacy/aiStatecraft.js';
import { CRYPTOGRAPHY_TECHS, tickCryptographyProgression } from '../js/diplomacy/cryptographyProgression.js';

function region(id,{ai=.75,compute=.8}={}){
  return {
    id,name:id.toUpperCase(),population:1_000_000,polityId:id,governance:{sovereignPolityId:id,administrativeControl:.72},
    unlockedTechIds:new Set(['electrical_telegraphy','radio','electronic_computing','computer_networks','internet','quantum_computing']),
    communicationState:{cipherPractice:.55,sealPractice:.45,challengePhrasePractice:.4,messengerExperience:300},
    counterIntelligence:{credentialSecurity:.62,codePractice:.5,verificationCaution:.62,compromisedCredentialActors:[],detectedForgeries:[]},
    publicEducation:{literacy:.82,technicalHumanCapital:.7},
    computingIndustry:{capability:compute,digitalCapability:compute},digitalInfrastructure:{coverage:compute},
    aiLabour:{capability:ai,adoption:.7,sectors:{research:{},services:{adoption:.6},manufacturing:{adoption:.5},logistics:{adoption:.5}}},
    aiControl:{monitoringMaturity:.68,evaluationMaturity:.62,policy:{},access:{}},
    strategicAi:{policy:{nuclearCommandIntegration:.6}},aiCompetitionPressure:.6,
    informationIntegrity:{policy:{provenanceStandards:.6,publicMediaIndependence:.5,platformTransparency:.5,electionSecurity:.5,foreignInfluenceDisclosure:.5,archivalTransparency:.5},crypto:{confidentiality:.6,authentication:.6,codebreaking:.6,digitalSignatures:.55,publicKeyInfrastructure:.55,postQuantumReadiness:.2},incidents:[]},
    report:{},
  };
}

{
  const r=region('crypto');
  tickCryptographyProgression([r],100,3650,()=>0);
  for(const tech of Object.values(CRYPTOGRAPHY_TECHS))assert(r.unlockedTechIds.has(tech),`long-run capable state should be able to discover ${tech}`);
  assert(r.cryptographyProgression.signalsIntelligence>0,'SIGINT should become a persistent capability rather than a binary tech flag');
  assert(r.cryptographyProgression.keyManagement>0,'key-management institutions should improve through practice');
}

{
  const a=region('a'),b=region('b');
  const world={regions:[a,b],polities:[{id:'a'},{id:'b'}],internationalOrganisations:[{id:'intl-org-1',memberPolityIds:['a','b']}]};
  const result=establishAiGovernanceAccord(world,{organisationId:'intl-org-1',memberPolityIds:['a','b'],measures:[AI_GOVERNANCE_MEASURES.INCIDENT_REPORTING,AI_GOVERNANCE_MEASURES.COMPUTE_REGISTRY,AI_GOVERNANCE_MEASURES.EVALUATION_STANDARDS,AI_GOVERNANCE_MEASURES.NUCLEAR_AI_RESTRICTIONS,AI_GOVERNANCE_MEASURES.MODEL_EXPORT_CONTROLS],reportingStrength:.9,exportControlCoordination:.8},20);
  assert(result.formed,'two AI-capable polities should be able to establish an accord');
  const beforeReporting=ensureAiGovernance(a).policy.incidentReporting,beforeNuclear=a.strategicAi.policy.nuclearCommandIntegration,beforeEval=a.aiControl.evaluationMaturity;
  tickInternationalAiStatecraft(world,21,365,()=>.9);
  assert(ensureAiGovernance(a).policy.incidentReporting>beforeReporting,'incident-reporting agreements should raise actual reporting practice');
  assert(a.aiControl.evaluationMaturity>beforeEval,'evaluation standards should improve evaluation institutions');
  assert(a.strategicAi.policy.nuclearCommandIntegration<beforeNuclear,'nuclear-AI restrictions should reduce command integration over time');
  assert(a.aiModelExportControl>0,'coordinated export controls should create a real policy constraint');
}

{
  const attacker=region('attacker',{ai:.9,compute:.9}),target=region('target',{ai:.75,compute:.8});
  target.counterIntelligence.credentialSecurity=.3;target.counterIntelligence.verificationCaution=.3;target.aiControl.monitoringMaturity=.25;
  const draws=[0,.99,.99];let i=0;
  const undetected=launchAiStatecraftOperation(attacker,target,{type:AI_STATECRAFT_OPERATIONS.MODEL_KNOWLEDGE,intensity:.55},30,()=>draws[i++]??.99);
  assert.equal(undetected.launched,true);
  assert.equal(undetected.success,true,'a sufficiently favourable operation can gain model knowledge');
  assert.equal(undetected.detected,false,'success should not imply detection');
  assert(ensureAiGovernance(attacker).intelligence.foreignModelKnowledge>0,'successful access should create useful intelligence rather than directly gifting core AI capability');
  assert.equal(target.informationIntegrity.incidents.length,0,'an undetected operation must not magically become public knowledge');
}

{
  const attacker=region('intruder',{ai:.7,compute:.7}),target=region('defender',{ai:.8,compute:.9});
  target.counterIntelligence.credentialSecurity=.9;target.counterIntelligence.verificationCaution=.9;target.aiControl.monitoringMaturity=.9;
  const draws=[.1,.1,.99];let i=0;
  const result=launchAiStatecraftOperation(attacker,target,{type:AI_STATECRAFT_OPERATIONS.COMPUTE_MAPPING,intensity:.8},40,()=>draws[i++]??.99);
  assert.equal(result.detected,true,'strong monitoring should be able to detect an intrusion');
  assert.equal(result.attributed,false,'detection and attribution must remain separate questions');
  const incident=target.informationIntegrity.incidents.at(-1);
  assert(incident,'detected intrusion should feed the contested-information system');
  assert.equal(incident.allegedActorId,null,'failed attribution must not leak the hidden attacker');
}

{
  const a=region('member-a'),b=region('member-b');
  setAiGovernancePolicy(b,{concealment:.9,inspectionAcceptance:.8,transparency:.2});
  const world={regions:[a,b],polities:[{id:'member-a'},{id:'member-b'}],internationalOrganisations:[{id:'intl-org-2',memberPolityIds:['member-a','member-b']}]};
  const {accord}=establishAiGovernanceAccord(world,{organisationId:'intl-org-2',memberPolityIds:['member-a','member-b'],measures:[AI_GOVERNANCE_MEASURES.INSPECTION_RIGHTS,AI_GOVERNANCE_MEASURES.COMPUTE_REGISTRY],verificationStrength:.9},50);
  const inspection=conductAiInspection(world,accord,'member-b',51,()=>0);
  assert.equal(inspection.inspected,true);
  assert.equal(inspection.discrepancyDetected,true,'high-concealment state can be caught by a strong inspection regime');
  assert(ensureAiGovernance(b).verification.confidence>0,'inspection should improve verification confidence without producing omniscience');
}

console.log('International AI governance, statecraft and cryptography regressions passed.');
