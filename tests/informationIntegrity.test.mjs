import assert from 'node:assert/strict';
import {
  addInformationEvidence,
  assessPublicClaim,
  cryptographicCapabilities,
  ensureInformationIntegrity,
  informationIntegritySummary,
  publishCompetingNarrative,
  recordInformationIncident,
  setInformationIntegrityPolicy,
  tickInformationIntegrity,
} from '../js/diplomacy/informationIntegrity.js';
import {
  ensureElectionIntegrity,
  launchElectionInterference,
  tickElectionIntegrity,
} from '../js/politics/electionInterference.js';
import { assessMassPolitics, ensureMassPolitics } from '../js/politics/massPolitics.js';

function region(id='r', polityId='p', overrides={}){
  return {
    id,name:id,population:1_000_000,polityId,
    governance:{sovereignPolityId:polityId,administrativeControl:.75},
    communicationState:{cipherPractice:.15,breakthroughs:['cipher_conventions'],sealPractice:.3,challengePhrasePractice:.2},
    counterIntelligence:{credentialSecurity:.55,codePractice:.35,verificationCaution:.6,compromisedCredentialActors:[],detectedForgeries:[]},
    publicEducation:{literacy:.85,technicalHumanCapital:.65},
    electricity:{industrialService:.9,householdService:.85},
    computingIndustry:{capability:.75,digitalCapability:.8},
    unlockedTechIds:new Set(),
    stockpile:{computers:100},
    treasury:500,
    report:{},
    ...overrides,
  };
}
function polity(id='p',capitalRegionId='r'){
  return {id,name:id,capitalRegionId,massPolitics:{policy:{franchise:'universal',associations:'legal'},effectiveElectorateShare:.8,administrativeCapacity:.75}};
}

{
  const medieval=region('medieval','m',{computingIndustry:{capability:0,digitalCapability:0},electricity:{industrialService:0,householdService:0},publicEducation:{literacy:.15,technicalHumanCapital:0}});
  const c=cryptographicCapabilities(medieval);
  assert(c.confidentiality>0,'medieval cipher practice contributes to confidentiality');
  assert(c.digitalSignatures<.05,'medieval ciphers do not magically provide digital signatures');
}

{
  const modern=region();
  modern.unlockedTechIds=new Set(['electronic_computing','computer_networks','public_key_cryptography','digital_signatures']);
  setInformationIntegrityPolicy(modern,{provenanceStandards:.9,platformTransparency:.8,publicMediaIndependence:.8});
  for(let i=0;i<8;i++)tickInformationIntegrity(modern,365.2425);
  assert(modern.informationIntegrity.crypto.authentication>.45,'modern cryptography improves authentication');
  assert(modern.informationIntegrity.provenanceCoverage>.35,'provenance standards create usable public verification');
}

{
  const preAi=region('pre','p');
  preAi.unlockedTechIds=new Set(['electronic_computing','computer_networks','public_key_cryptography']);
  preAi.aiLabour={capability:0,adoption:0};
  const ai=region('ai','p');
  ai.unlockedTechIds=new Set(['electronic_computing','computer_networks','public_key_cryptography']);
  ai.aiLabour={capability:.95,adoption:.9};
  ai.aiSystemicRisk={domainRisk:{information:.35}};
  for(let i=0;i<5;i++){tickInformationIntegrity(preAi,365.2425);tickInformationIntegrity(ai,365.2425);}
  assert(ai.informationIntegrity.syntheticMediaPressure>preAi.informationIntegrity.syntheticMediaPressure+.25,'advanced AI sharply raises synthetic-media pressure');
  assert(ai.informationIntegrity.denialPlausibility>preAi.informationIntegrity.denialPlausibility,'synthetic media creates a liar’s dividend');
}

{
  const observer=region('observer','o');
  const s=ensureInformationIntegrity(observer);
  Object.assign(s,{syntheticMediaPressure:.8,denialPlausibility:.75,misinformationPressure:.55,sourceVerification:.7,attributionConfidence:.55});
  const viral=assessPublicClaim(observer,{evidenceType:'video',sourceReliability:.55,corroboration:.1,provenance:.05,forensicSupport:.1});
  const verified=assessPublicClaim(observer,{evidenceType:'video',sourceReliability:.8,corroboration:.85,provenance:.9,forensicSupport:.8,cryptographicallySigned:true});
  const denied=assessPublicClaim(observer,{evidenceType:'video',sourceReliability:.8,corroboration:.85,provenance:.9,forensicSupport:.8,cryptographicallySigned:true,deniedAsSynthetic:true});
  assert(verified.confidence>viral.confidence+.35,'corroboration and provenance still distinguish strong evidence from viral media');
  assert(denied.confidence<verified.confidence,'claiming genuine evidence is synthetic can reduce confidence');
  assert.equal(denied.strategicTruthKnown,false,'the player is never handed omniscient truth');
}

{
  const observer=region('claims','c');
  observer.unlockedTechIds=new Set(['electronic_computing','computer_networks','public_key_cryptography','digital_signatures']);
  setInformationIntegrityPolicy(observer,{provenanceStandards:.85,platformTransparency:.75,publicMediaIndependence:.85,archivalTransparency:.8});
  for(let i=0;i<4;i++)tickInformationIntegrity(observer,365.2425);
  const incident=recordInformationIncident(observer,{
    id:'school-strike',type:'civilian_strike',headline:'Reports say a school was struck',tick:100,subjectRegionId:'city',allegedActorId:'foreign',
    evidence:[{sourceId:'viral-video',evidenceType:'video',sourceReliability:.45,provenance:.05,forensicPotential:.65}],
  });
  const initial=incident.assessment.confidence;
  assert(initial<.55,'a single low-provenance viral video should remain uncertain');
  addInformationEvidence(observer,incident.id,{sourceId:'hospital',sourceType:'witness',sourceReliability:.82,evidenceType:'report',provenance:.45,forensicPotential:.6});
  addInformationEvidence(observer,incident.id,{sourceId:'news-wire',sourceType:'journalism',sourceReliability:.88,evidenceType:'image',provenance:.72,forensicPotential:.8});
  addInformationEvidence(observer,incident.id,{sourceId:'satellite-provider',sourceType:'remote_sensing',sourceReliability:.92,evidenceType:'image',provenance:.9,forensicPotential:.9,cryptographicallySigned:true,attributionEvidence:.55});
  const corroborated=incident.assessment.confidence;
  assert(corroborated>initial+.2,'independent corroboration and provenance should materially improve confidence');
  const forensicBefore=incident.assessment.forensicSupport;
  tickInformationIntegrity(observer,180);
  assert(incident.assessment.forensicSupport>forensicBefore,'forensic verification should improve over time when capability exists');
  const beforeDenial=incident.assessment.confidence;
  publishCompetingNarrative(observer,incident.id,{kind:'denial_synthetic',actorId:'foreign',reach:.9,sourceReliability:.65});
  assert(incident.assessment.confidence<beforeDenial,'an AI-fake denial can reduce confidence even in a real-looking event');
  publishCompetingNarrative(observer,incident.id,{kind:'alternative_account',actorId:'foreign',reach:.8,sourceReliability:.6,evidenceSupport:.35});
  assert(incident.assessment.narrativePressure>0,'competing accounts create explicit narrative pressure');
  assert.equal(incident.assessment.strategicTruthKnown,false,'claim lifecycle never exposes hidden truth');
  const summary=informationIntegritySummary(observer);
  assert.equal(summary.contestedClaims[0].id,'school-strike','contested claims are exposed through the normal report summary');
  assert(summary.contestedClaims[0].evidenceCount>=4,'report summary carries evidence depth for advisor/UI use');
}

{
  const sponsor=polity('s','sr'),target=polity('t','tr');
  const sr=region('sr','s',{treasury:500});
  const tr=region('tr','t');
  const regions=[sr,tr];
  const conventional=launchElectionInterference(sponsor,target,regions,10,{mode:'propaganda',amount:20,aiAssisted:false},()=>.99);
  assert(conventional.launched&&conventional.effect>0,'election interference works without AI');
  sr.treasury=500;sr.aiLabour={capability:.95,adoption:.9};
  const assisted=launchElectionInterference(sponsor,target,regions,11,{mode:'propaganda',amount:20,aiAssisted:true},()=>.99);
  assert(assisted.effect>conventional.effect,'AI can increase the scale of propaganda without being required for it');
}

{
  const sponsor=polity('s','sr'),target=polity('t','tr');
  const sr=region('sr','s',{treasury:500});
  const tr=region('tr','t');
  setInformationIntegrityPolicy(tr,{electionSecurity:.9,provenanceStandards:.8,publicMediaIndependence:.8});
  const draws=[0,0.99];let i=0;
  const op=launchElectionInterference(sponsor,target,[sr,tr],30,{mode:'false_flag',amount:25,falseFlagActorId:'third'},()=>draws[i++]??.99);
  assert(op.detected,'defenders may detect that interference occurred');
  assert.equal(op.attributed,false,'detection need not prove who ordered the operation');
  assert.equal(op.actualActorId,'s');
  assert.equal(op.claimedActorId,'third','false flags preserve a distinct claimed actor');
}

{
  const target=polity('t','tr');
  const tr=region('tr','t');
  target.foreignPoliticalIntervention={operations:{'s:revolution':{propaganda:.8,exposure:.3}}};
  const before=ensureElectionIntegrity(target).foreignInfluencePressure;
  tickElectionIntegrity([target],[tr],50,365.2425);
  assert(target.electionIntegrity.foreignInfluencePressure>before,'existing non-AI foreign propaganda feeds election integrity');
}

{
  const p=polity('p','r');
  const r=region('r','p');
  ensureMassPolitics(p);
  p.massPolitics.policy.franchise='universal';p.massPolitics.policy.associations='legal';p.massPolitics.effectiveElectorateShare=.8;
  p.institutions={parliament:{established:true,strength:.7,independence:.7,representation:.7}};
  p.administration={recordKeeping:.8,officialdom:.8,accounting:.8,communications:.8};
  const e=ensureElectionIntegrity(p);e.turnoutSuppressionPressure=0;e.resultContestationRisk=0;e.publicConfidence=.9;
  const healthy=assessMassPolitics(p,[r]);
  e.turnoutSuppressionPressure=.8;e.resultContestationRisk=.75;e.publicConfidence=.2;e.disinformationPressure=.7;
  const attacked=assessMassPolitics(p,[r]);
  assert(attacked.effectiveElectorateShare<healthy.effectiveElectorateShare,'suppression lowers realised participation without changing the legal franchise');
  assert(attacked.peacefulParticipation<healthy.peacefulParticipation,'contested elections reduce peaceful political participation');
}

console.log('Information integrity and election interference regressions passed.');
