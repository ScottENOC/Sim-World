const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const smooth=(current,target,years,rate=1)=>clamp((Number(current)||0)+(target-(Number(current)||0))*(1-Math.exp(-Math.max(0,years)*rate)));

function hasAny(region,ids=[]){
  const sets=[region.unlockedTechIds,region.breakthroughs,region.technology?.breakthroughs,region.technology?.known];
  return ids.some(id=>sets.some(set=>set?.has?.(id)));
}

function computing(region){
  return clamp(Math.max(
    Number(region.computingIndustry?.capability)||0,
    Number(region.computingIndustry?.digitalCapability)||0,
    Number(region.aiLabour?.adoption)||0,
    Number(region.digitalInfrastructure?.coverage)||0,
    Number(region.internet?.coverage)||0,
  ));
}

function massMedia(region){
  const printing=hasAny(region,['printing_press','mass_printing','newspapers']) ? .18 : 0;
  const telegraph=hasAny(region,['electrical_telegraphy','telegraph']) ? .16 : 0;
  const radio=hasAny(region,['radio','radio_broadcasting','wireless_telegraphy']) ? .20 : 0;
  const television=hasAny(region,['television','television_broadcasting']) ? .18 : 0;
  const digital=computing(region)*.38;
  return clamp(printing+telegraph+radio+television+digital);
}

function professionalVerification(region){
  const literacy=clamp(region.publicEducation?.literacy??region.massEducation?.literacy??region.educationLevel??0);
  const admin=clamp(region.governance?.administrativeControl??region.polityAdministration?.recordKeeping??0);
  const pluralism=clamp(region.media?.pluralism??region.informationEnvironment?.mediaPluralism??.35);
  const science=clamp(region.publicEducation?.technicalHumanCapital??region.researchCapacity??0);
  return clamp(literacy*.25+admin*.20+pluralism*.25+science*.18+massMedia(region)*.12);
}

function verdictFor(confidence){
  return confidence>.76?'well_corroborated':confidence>.52?'probable':confidence>.30?'uncertain':'poorly_supported';
}

function normaliseEvidence(evidence={},fallbackId='evidence'){
  return {
    id:evidence.id||fallbackId,
    sourceId:evidence.sourceId||evidence.source||fallbackId,
    sourceType:evidence.sourceType||'report',
    evidenceType:evidence.evidenceType||'mixed',
    sourceReliability:clamp(evidence.sourceReliability??.5),
    provenance:clamp(evidence.provenance??0),
    forensicSupport:clamp(evidence.forensicSupport??0),
    forensicPotential:clamp(evidence.forensicPotential??evidence.forensicSupport??.35),
    attributionEvidence:clamp(evidence.attributionEvidence??0),
    cryptographicallySigned:Boolean(evidence.cryptographicallySigned),
    verificationProgress:clamp(evidence.verificationProgress??0),
    receivedTick:evidence.receivedTick??null,
  };
}

function normaliseNarrative(narrative={},fallbackId='narrative'){
  return {
    id:narrative.id||fallbackId,
    kind:narrative.kind||'alternative_account',
    actorId:narrative.actorId||null,
    claimedActorId:narrative.claimedActorId||null,
    reach:clamp(narrative.reach??.45),
    sourceReliability:clamp(narrative.sourceReliability??.4),
    evidenceSupport:clamp(narrative.evidenceSupport??0),
    publishedTick:narrative.publishedTick??null,
  };
}

export function ensureInformationIntegrity(region){
  region.informationIntegrity||={};
  const s=region.informationIntegrity;
  s.version=2;
  s.policy||={};
  for(const [key,value] of Object.entries({
    publicMediaIndependence:.45,
    provenanceStandards:.15,
    platformTransparency:.10,
    electionSecurity:.35,
    foreignInfluenceDisclosure:.20,
    archivalTransparency:.35,
  })) if(!Number.isFinite(s.policy[key]))s.policy[key]=value;
  s.crypto||={};
  for(const [key,value] of Object.entries({
    confidentiality:0,authentication:0,codebreaking:0,digitalSignatures:0,publicKeyInfrastructure:0,postQuantumReadiness:0,
  })) if(!Number.isFinite(s.crypto[key]))s.crypto[key]=value;
  for(const [key,value] of Object.entries({
    sourceVerification:.15,mediaForensics:.05,provenanceCoverage:0,independentCorroboration:.15,
    publicTrust:.5,sharedReality:.55,syntheticMediaPressure:0,denialPlausibility:0,misinformationPressure:0,
    attributionConfidence:.25,informationOverload:0,postTruthPressure:0,electionConfidence:.55,
    foreignInfluencePressure:0,lastIncidentTick:-Infinity,nextIncidentId:1,
  })) if(!Number.isFinite(s[key]))s[key]=value;
  if(!Array.isArray(s.incidents))s.incidents=[];
  for(const incident of s.incidents){
    if(!Array.isArray(incident.evidence))incident.evidence=[];
    if(!Array.isArray(incident.narratives))incident.narratives=[];
    if(!Number.isFinite(incident.ageDays))incident.ageDays=0;
  }
  return s;
}

export function setInformationIntegrityPolicy(region,patch={}){
  const s=ensureInformationIntegrity(region);
  for(const key of Object.keys(s.policy))if(Number.isFinite(patch[key]))s.policy[key]=clamp(patch[key]);
  return {...s.policy};
}

export function cryptographicCapabilities(region){
  const s=ensureInformationIntegrity(region);
  const medieval=clamp(region.communicationState?.cipherPractice||0);
  const electricity=clamp(region.electricity?.householdService??region.electricity?.industrialService??0);
  const digital=computing(region);
  const mechanised=hasAny(region,['mechanical_cryptography','electromechanical_computing','radio','wireless_telegraphy'])?1:0;
  const electronic=hasAny(region,['electronic_computing','digital_computing','semiconductors','integrated_circuits'])?1:0;
  const networking=hasAny(region,['computer_networks','internet','packet_switching','digital_communications'])?1:0;
  const modernCrypto=hasAny(region,['modern_cryptography','public_key_cryptography','digital_signatures'])?1:0;
  const pq=hasAny(region,['post_quantum_cryptography','quantum_resistant_cryptography'])?1:0;
  const confidentiality=clamp(medieval*.38+mechanised*.18+electricity*.08+electronic*.14+digital*.16+modernCrypto*.16);
  const authentication=clamp((region.counterIntelligence?.credentialSecurity||0)*.22+medieval*.18+electronic*.10+networking*.15+modernCrypto*.25+s.policy.provenanceStandards*.10);
  const codebreaking=clamp(medieval*.18+mechanised*.20+electronic*.22+digital*.30+clamp(region.aiLabour?.capability||0)*.18);
  const digitalSignatures=clamp((modernCrypto*.55+networking*.15+digital*.18)*(.55+.45*s.policy.provenanceStandards));
  const publicKeyInfrastructure=clamp((modernCrypto*.40+networking*.30+digital*.20)*(.45+.55*clamp(region.governance?.administrativeControl??.4)));
  const postQuantumReadiness=clamp(pq*.65+digital*.10+s.policy.provenanceStandards*.12);
  return {confidentiality,authentication,codebreaking,digitalSignatures,publicKeyInfrastructure,postQuantumReadiness};
}

export function assessPublicClaim(observer,claim={}){
  const s=ensureInformationIntegrity(observer);
  const provenance=clamp(claim.provenance??(claim.cryptographicallySigned?s.provenanceCoverage:0));
  const corroboration=clamp(claim.corroboration??0);
  const sourceReliability=clamp(claim.sourceReliability??.5);
  const forensic=clamp(claim.forensicSupport??0);
  const visual=claim.evidenceType==='image'||claim.evidenceType==='video';
  const syntheticPenalty=visual?s.syntheticMediaPressure*.30:0;
  const denial=claim.deniedAsSynthetic?s.denialPlausibility*.32:0;
  const base=sourceReliability*.27+corroboration*.28+provenance*.23+forensic*.14+s.sourceVerification*.08;
  const confidence=clamp(base-syntheticPenalty-denial-s.misinformationPressure*.08);
  const attribution=clamp((claim.attributionEvidence??0)*.42+s.attributionConfidence*.36+provenance*.14+corroboration*.08-s.denialPlausibility*.15);
  return {
    confidence,
    attributionConfidence:attribution,
    verdict:verdictFor(confidence),
    syntheticMediaCouldExplainEvidence:visual?clamp(s.syntheticMediaPressure*(1-provenance*.7)):0,
    denialPlausibility:clamp(denial+s.denialPlausibility*.45),
    strategicTruthKnown:false,
  };
}

export function addInformationEvidence(region,incidentId,evidence={}){
  const s=ensureInformationIntegrity(region);
  const incident=s.incidents.find(item=>item.id===incidentId);
  if(!incident)return null;
  incident.evidence||=[];
  const entry=normaliseEvidence(evidence,`${incident.id}-e${incident.evidence.length+1}`);
  incident.evidence.push(entry);
  if(incident.evidence.length>24)incident.evidence.shift();
  incident.assessment=informationIncidentAssessment(region,incident);
  return entry;
}

export function publishCompetingNarrative(region,incidentId,narrative={}){
  const s=ensureInformationIntegrity(region);
  const incident=s.incidents.find(item=>item.id===incidentId);
  if(!incident)return null;
  incident.narratives||=[];
  const entry=normaliseNarrative(narrative,`${incident.id}-n${incident.narratives.length+1}`);
  incident.narratives.push(entry);
  if(incident.narratives.length>16)incident.narratives.shift();
  if(entry.kind==='denial_synthetic'||entry.kind==='denial_event'){
    s.misinformationPressure=clamp(s.misinformationPressure+.008+.025*entry.reach*(1-s.provenanceCoverage));
  }
  incident.assessment=informationIncidentAssessment(region,incident);
  return entry;
}

export function informationIncidentAssessment(region,incident){
  const evidence=Array.isArray(incident?.evidence)?incident.evidence:[];
  const narratives=Array.isArray(incident?.narratives)?incident.narratives:[];
  const sourceIds=new Set(evidence.map((entry,index)=>entry.sourceId||`source-${index}`));
  const totalWeight=Math.max(.001,evidence.reduce((sum,entry)=>sum+.25+.75*clamp(entry.sourceReliability),0));
  const weighted=(key)=>evidence.reduce((sum,entry)=>sum+clamp(entry[key])* (.25+.75*clamp(entry.sourceReliability)),0)/totalWeight;
  const sourceReliability=evidence.length?evidence.reduce((sum,entry)=>sum+clamp(entry.sourceReliability),0)/evidence.length:clamp(incident?.sourceReliability??.4);
  const independenceBonus=clamp(Math.max(0,sourceIds.size-1)*.18,0,.54);
  const corroboration=clamp(Math.max(incident?.corroboration||0,weighted('sourceReliability')*.32+independenceBonus));
  const provenance=clamp(Math.max(incident?.provenance||0,weighted('provenance')));
  const forensicSupport=clamp(Math.max(incident?.forensicSupport||0,weighted('forensicSupport')));
  const attributionEvidence=clamp(Math.max(incident?.attributionEvidence||0,weighted('attributionEvidence')));
  const signed=evidence.some(entry=>entry.cryptographicallySigned);
  const visual=evidence.find(entry=>entry.evidenceType==='video'||entry.evidenceType==='image')?.evidenceType||incident?.evidenceType||'mixed';
  const syntheticDenials=narratives.filter(item=>item.kind==='denial_synthetic');
  const deniedAsSynthetic=Boolean(incident?.deniedAsSynthetic)||syntheticDenials.length>0;
  const base=assessPublicClaim(region,{sourceReliability,corroboration,provenance,forensicSupport,attributionEvidence,evidenceType:visual,cryptographicallySigned:signed,deniedAsSynthetic});
  const competing=narratives.filter(item=>!['support','denial_synthetic'].includes(item.kind));
  const narrativePressure=clamp(competing.reduce((sum,item)=>sum+item.reach*(.12+.18*item.sourceReliability+.12*item.evidenceSupport),0),0,.34);
  const confidence=clamp(base.confidence-narrativePressure);
  const denialReach=clamp(syntheticDenials.reduce((sum,item)=>sum+item.reach*.45,0));
  return {
    ...base,
    confidence,
    verdict:verdictFor(confidence),
    evidenceCount:evidence.length,
    independentSourceCount:sourceIds.size,
    narrativeCount:narratives.length,
    provenance,
    corroboration,
    forensicSupport,
    attributionEvidence,
    narrativePressure,
    denialReach,
    strategicTruthKnown:false,
  };
}

export function tickInformationIncidents(region,elapsedDays=7){
  const s=ensureInformationIntegrity(region);
  const days=Math.max(0,Number(elapsedDays)||0);
  const years=days/365.2425;
  const investigationCapacity=clamp(s.sourceVerification*.34+s.mediaForensics*.30+s.provenanceCoverage*.18+s.independentCorroboration*.18);
  for(const incident of s.incidents){
    incident.ageDays=(Number(incident.ageDays)||0)+days;
    incident.evidence||=[];
    incident.narratives||=[];
    for(const evidence of incident.evidence){
      const target=clamp(investigationCapacity*(.45+.55*evidence.forensicPotential));
      evidence.verificationProgress=smooth(evidence.verificationProgress,target,years,2.3);
      const achievable=clamp(Math.max(evidence.forensicSupport,evidence.forensicPotential*(.25+.75*s.mediaForensics)));
      evidence.forensicSupport=smooth(evidence.forensicSupport,achievable,years,1.5);
      if(evidence.cryptographicallySigned){
        const provenanceTarget=clamp(Math.max(evidence.provenance,s.crypto.digitalSignatures*.55+s.crypto.publicKeyInfrastructure*.30+s.provenanceCoverage*.15));
        evidence.provenance=smooth(evidence.provenance,provenanceTarget,years,2.1);
      }
    }
    incident.assessment=informationIncidentAssessment(region,incident);
  }
  return s.incidents;
}

export function tickInformationIntegrity(region,elapsedDays=7){
  const s=ensureInformationIntegrity(region);
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  const crypto=cryptographicCapabilities(region);
  for(const key of Object.keys(s.crypto))s.crypto[key]=smooth(s.crypto[key],crypto[key],years,1.8);

  const professional=professionalVerification(region);
  const aiCapability=clamp(region.aiLabour?.capability||region.aiEconomy?.capability||0);
  const aiAdoption=clamp(region.aiLabour?.adoption||0);
  const aiInfoRisk=clamp(region.aiSystemicRisk?.domainRisk?.information??region.aiInformationIntegrityPressure??0);
  const propaganda=clamp(region.propagandaPressure||region.foreignInfluencePressure||s.foreignInfluencePressure||0);
  const mediaReach=massMedia(region);
  const generatedMedia=clamp(aiCapability*aiAdoption*(.45+.55*mediaReach));

  const provenanceTarget=clamp(s.crypto.digitalSignatures*.34+s.crypto.publicKeyInfrastructure*.22+s.policy.provenanceStandards*.32+professional*.12);
  const forensicTarget=clamp(professional*.42+computing(region)*.20+aiCapability*.18+s.policy.platformTransparency*.20);
  const corroborationTarget=clamp(professional*.42+s.policy.publicMediaIndependence*.28+s.policy.archivalTransparency*.15+mediaReach*.15);
  s.provenanceCoverage=smooth(s.provenanceCoverage,provenanceTarget,years,.9);
  s.mediaForensics=smooth(s.mediaForensics,forensicTarget,years,1.1);
  s.independentCorroboration=smooth(s.independentCorroboration,corroborationTarget,years,.8);
  s.sourceVerification=smooth(s.sourceVerification,clamp(s.crypto.authentication*.33+s.provenanceCoverage*.28+s.independentCorroboration*.24+professional*.15),years,1.2);

  const syntheticTarget=clamp(generatedMedia*.72+aiInfoRisk*.18+propaganda*.10);
  s.syntheticMediaPressure=smooth(s.syntheticMediaPressure,syntheticTarget,years,1.6);
  s.informationOverload=smooth(s.informationOverload,clamp(mediaReach*.28+generatedMedia*.52+propaganda*.20),years,1.1);
  s.misinformationPressure=smooth(s.misinformationPressure,clamp(propaganda*.44+s.syntheticMediaPressure*.34+s.informationOverload*.12+aiInfoRisk*.10),years,1.3);

  // The liar's dividend: once convincing synthetic evidence is commonplace, genuine evidence becomes easier to deny too.
  s.denialPlausibility=smooth(s.denialPlausibility,clamp(s.syntheticMediaPressure*.52+s.misinformationPressure*.24+(1-s.provenanceCoverage)*.16+(1-s.independentCorroboration)*.08),years,1.25);
  const verification=clamp(s.sourceVerification*.30+s.mediaForensics*.20+s.provenanceCoverage*.22+s.independentCorroboration*.28);
  s.postTruthPressure=clamp(s.syntheticMediaPressure*.30+s.denialPlausibility*.26+s.misinformationPressure*.24+s.informationOverload*.20-verification*.38);
  s.sharedReality=smooth(s.sharedReality,clamp(.76+verification*.22-s.postTruthPressure*.62),years,.7);
  s.publicTrust=smooth(s.publicTrust,clamp(.50+s.independentCorroboration*.22+s.policy.publicMediaIndependence*.16-s.postTruthPressure*.42-propaganda*.12),years,.55);
  s.attributionConfidence=smooth(s.attributionConfidence,clamp(.16+s.sourceVerification*.31+s.crypto.authentication*.20+s.mediaForensics*.17+s.provenanceCoverage*.16-s.denialPlausibility*.17),years,.9);
  s.electionConfidence=smooth(s.electionConfidence,clamp(.38+s.policy.electionSecurity*.28+s.sourceVerification*.16+s.crypto.authentication*.10-s.foreignInfluencePressure*.24-s.postTruthPressure*.18),years,.8);

  tickInformationIncidents(region,elapsedDays);
  region.report||={};
  region.report.informationIntegrity=informationIntegritySummary(region);
  return s;
}

export function recordInformationIncident(region,incident={}){
  const s=ensureInformationIntegrity(region);
  const id=incident.id||`info-${s.nextIncidentId++}`;
  const entry={
    id,
    type:incident.type||'contested_event',
    headline:incident.headline||incident.summary||String(incident.type||'Contested report').replaceAll('_',' '),
    tick:incident.tick??null,
    receivedTick:incident.receivedTick??incident.tick??null,
    subjectRegionId:incident.subjectRegionId||null,
    allegedActorId:incident.allegedActorId||null,
    evidenceType:incident.evidenceType||'mixed',
    provenance:clamp(incident.provenance||0),
    corroboration:clamp(incident.corroboration||0),
    forensicSupport:clamp(incident.forensicSupport||0),
    attributionEvidence:clamp(incident.attributionEvidence||0),
    sourceReliability:clamp(incident.sourceReliability??.45),
    deniedAsSynthetic:Boolean(incident.deniedAsSynthetic),
    ageDays:Math.max(0,Number(incident.ageDays)||0),
    evidence:[],
    narratives:[],
    assessment:null,
  };
  const suppliedEvidence=Array.isArray(incident.evidence)?incident.evidence:[];
  if(suppliedEvidence.length){
    entry.evidence=suppliedEvidence.map((item,index)=>normaliseEvidence(item,`${id}-e${index+1}`));
  }else if(incident.evidenceType||incident.provenance||incident.corroboration||incident.sourceReliability){
    entry.evidence.push(normaliseEvidence({
      sourceId:incident.sourceId||`${id}-initial`,evidenceType:entry.evidenceType,
      sourceReliability:entry.sourceReliability,provenance:entry.provenance,
      forensicSupport:entry.forensicSupport,forensicPotential:incident.forensicPotential,
      attributionEvidence:entry.attributionEvidence,cryptographicallySigned:incident.cryptographicallySigned,
      receivedTick:entry.receivedTick,
    },`${id}-e1`));
  }
  if(Array.isArray(incident.narratives))entry.narratives=incident.narratives.map((item,index)=>normaliseNarrative(item,`${id}-n${index+1}`));
  if(entry.deniedAsSynthetic&&!entry.narratives.some(item=>item.kind==='denial_synthetic')){
    entry.narratives.push(normaliseNarrative({kind:'denial_synthetic',reach:.55,sourceReliability:.45,publishedTick:entry.receivedTick},`${id}-n1`));
  }
  entry.assessment=informationIncidentAssessment(region,entry);
  s.incidents.push(entry);if(s.incidents.length>40)s.incidents.shift();
  s.lastIncidentTick=entry.receivedTick??s.lastIncidentTick;
  if(entry.deniedAsSynthetic)s.misinformationPressure=clamp(s.misinformationPressure+.025+.035*(1-entry.provenance));
  return entry;
}

export function informationIntegritySummary(region){
  const s=ensureInformationIntegrity(region);
  const contestedClaims=[...s.incidents].sort((a,b)=>(b.receivedTick??b.tick??-Infinity)-(a.receivedTick??a.tick??-Infinity)).slice(0,8).map(incident=>{
    const assessment=incident.assessment||informationIncidentAssessment(region,incident);
    return {
      id:incident.id,type:incident.type,headline:incident.headline,subjectRegionId:incident.subjectRegionId,
      allegedActorId:incident.allegedActorId,ageDays:incident.ageDays,
      confidence:assessment.confidence,attributionConfidence:assessment.attributionConfidence,verdict:assessment.verdict,
      evidenceCount:assessment.evidenceCount,independentSourceCount:assessment.independentSourceCount,
      narrativeCount:assessment.narrativeCount,provenance:assessment.provenance,corroboration:assessment.corroboration,
      forensicSupport:assessment.forensicSupport,denialPlausibility:assessment.denialPlausibility,
      syntheticMediaCouldExplainEvidence:assessment.syntheticMediaCouldExplainEvidence,strategicTruthKnown:false,
    };
  });
  return {
    crypto:{...s.crypto},
    verification:{source:s.sourceVerification,forensics:s.mediaForensics,provenance:s.provenanceCoverage,corroboration:s.independentCorroboration},
    publicTrust:s.publicTrust,sharedReality:s.sharedReality,syntheticMediaPressure:s.syntheticMediaPressure,
    denialPlausibility:s.denialPlausibility,misinformationPressure:s.misinformationPressure,postTruthPressure:s.postTruthPressure,
    attributionConfidence:s.attributionConfidence,electionConfidence:s.electionConfidence,foreignInfluencePressure:s.foreignInfluencePressure,
    contestedClaims,
    policy:{...s.policy},
  };
}
