import { ensureInformationIntegrity, recordInformationIncident, publishCompetingNarrative } from '../diplomacy/informationIntegrity.js?v=20260922-info1';
import { ensureCounterIntelligence } from '../diplomacy/counterIntelligence.js?v=20260917-intervention1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const DAYS_PER_YEAR=365.2425;

export const ELECTION_INTERFERENCE_MODES=Object.freeze({
  covert_funding:{label:'Covert political funding',digital:false,aiScalable:false,disruption:.10,confusion:.12},
  propaganda:{label:'Propaganda campaign',digital:false,aiScalable:true,disruption:.10,confusion:.28},
  hack_and_leak:{label:'Hack and leak',digital:true,aiScalable:true,disruption:.14,confusion:.30},
  synthetic_media:{label:'Synthetic media',digital:true,aiScalable:true,disruption:.08,confusion:.42},
  narrative_flooding:{label:'Narrative flooding',digital:true,aiScalable:true,disruption:.05,confusion:.48},
  voter_suppression:{label:'Voter suppression operation',digital:false,aiScalable:true,disruption:.30,confusion:.18},
  election_infrastructure:{label:'Election infrastructure intrusion',digital:true,aiScalable:true,disruption:.48,confusion:.22},
  false_flag:{label:'False-flag influence operation',digital:false,aiScalable:true,disruption:.12,confusion:.38},
});

function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||null;}
function territoriesFor(polity,regions){return (regions||[]).filter(r=>polityId(r)===polity?.id);}
function capitalRegion(polity,regions){return (regions||[]).find(r=>r.id===polity?.capitalRegionId)||territoriesFor(polity,regions)[0]||null;}

function weightedAverage(regions,fn){
  let total=0,weight=0;
  for(const r of regions){const w=Math.max(1,Number(r.population)||1);total+=clamp(fn(r))*w;weight+=w;}
  return weight?total/weight:0;
}

export function ensureElectionIntegrity(polity){
  polity.electionIntegrity||={};
  const s=polity.electionIntegrity;
  for(const [key,value] of Object.entries({
    administrativeSecurity:.35,publicConfidence:.55,foreignInfluencePressure:0,disinformationPressure:0,
    turnoutSuppressionPressure:0,resultContestationRisk:0,detectedInterference:0,attributedInterference:0,
    lastElectionTick:-Infinity,lastInterferenceTick:-Infinity,
  })) if(!Number.isFinite(s[key]))s[key]=value;
  if(!Array.isArray(s.operations))s.operations=[];
  return s;
}

function electionReadiness(polity){
  const m=polity?.massPolitics||{};
  const franchise=m.policy?.franchise;
  const franchiseFactor=franchise==='universal'?1:franchise==='broad'?.78:franchise==='qualified'?.52:franchise==='restricted'?.24:.05;
  return clamp(franchiseFactor*(.35+.65*clamp(m.effectiveElectorateShare||0)));
}

function sponsorCapability(sponsor,regions,aiAssisted){
  const capital=capitalRegion(sponsor,regions);
  if(!capital)return {tradecraft:.15,digital:.05,ai:0};
  const ci=ensureCounterIntelligence(capital);
  const info=ensureInformationIntegrity(capital);
  const digital=clamp(Math.max(capital.computingIndustry?.capability||0,capital.digitalInfrastructure?.coverage||0,capital.internet?.coverage||0));
  const ai=aiAssisted?clamp(capital.aiLabour?.capability||capital.aiEconomy?.capability||0):0;
  const tradecraft=clamp(.15+ci.codePractice*.18+ci.credentialSecurity*.18+info.crypto.authentication*.14+digital*.18+ai*.17);
  return {tradecraft,digital,ai};
}

function targetDefence(target,regions){
  const territories=territoriesFor(target,regions);
  if(!territories.length)return {security:.2,verification:.15,counterintelligence:.15,pluralism:.25};
  const security=weightedAverage(territories,r=>ensureInformationIntegrity(r).policy.electionSecurity);
  const verification=weightedAverage(territories,r=>{
    const s=ensureInformationIntegrity(r);return s.sourceVerification*.35+s.provenanceCoverage*.25+s.independentCorroboration*.25+s.mediaForensics*.15;
  });
  const counterintelligence=weightedAverage(territories,r=>{
    const ci=ensureCounterIntelligence(r);return ci.credentialSecurity*.42+ci.codePractice*.28+ci.verificationCaution*.30;
  });
  const pluralism=weightedAverage(territories,r=>ensureInformationIntegrity(r).policy.publicMediaIndependence);
  return {security,verification,counterintelligence,pluralism};
}

function legacyInterferencePressure(polity){
  const ops=Object.values(polity.foreignPoliticalIntervention?.operations||{});
  let propaganda=0,exposure=0;
  for(const op of ops){
    propaganda+=clamp(op?.propaganda||0);
    exposure+=clamp(op?.exposure||0);
  }
  // Existing coup/revolution networks and propaganda therefore matter to elections
  // even before digital systems or AI exist.
  return {propaganda:clamp(propogandaScale(propaganda)),exposure:clamp(exposure/Math.max(1,ops.length))};
}
function propogandaScale(value){return 1-Math.exp(-Math.max(0,value));}

function publishElectionInterferenceClaim(target,regions,operation,mode,defence){
  if(!operation.detected)return null;
  const observer=capitalRegion(target,regions);
  if(!observer)return null;
  const digitalEvidence=Boolean(mode.digital);
  const attributionEvidence=operation.attributed
    ? clamp(.58+defence.counterintelligence*.24+defence.verification*.18)
    : clamp(.10+defence.counterintelligence*.12+defence.verification*.10);
  const incident=recordInformationIncident(observer,{
    id:`public-${operation.id}`,
    type:'election_interference',
    headline:`Evidence of ${mode.label.toLowerCase()} targeting the election`,
    tick:operation.currentTick,
    receivedTick:operation.currentTick,
    allegedActorId:operation.claimedActorId||null,
    evidenceType:digitalEvidence?'digital':'mixed',
    sourceReliability:clamp(.44+defence.counterintelligence*.24+defence.verification*.16),
    provenance:clamp(digitalEvidence?defence.verification*.58:defence.counterintelligence*.34),
    corroboration:clamp(.20+defence.counterintelligence*.28),
    forensicSupport:clamp(digitalEvidence?defence.verification*.60:defence.counterintelligence*.28),
    attributionEvidence,
    evidence:[{
      sourceId:`counterintelligence-${target.id}`,
      evidenceType:digitalEvidence?'digital':'document',
      sourceReliability:clamp(.50+defence.counterintelligence*.32),
      provenance:clamp(digitalEvidence?defence.verification*.62:.28+defence.counterintelligence*.24),
      forensicSupport:clamp(digitalEvidence?defence.verification*.64:.18+defence.counterintelligence*.20),
      forensicPotential:digitalEvidence?.82:.48,
      attributionEvidence,
      receivedTick:operation.currentTick,
    }],
  });
  if(operation.claimedActorId&&operation.claimedActorId!=='unknown_third_party'){
    publishCompetingNarrative(observer,incident.id,{
      kind:'denial_actor',
      reach:clamp(.22+operation.effect*.36),
      sourceReliability:.42,
      evidenceSupport:operation.attributed?.12:.28,
      publishedTick:operation.currentTick,
    });
  }
  if(operation.mode==='synthetic_media'||operation.aiAssisted){
    publishCompetingNarrative(observer,incident.id,{
      kind:'denial_synthetic',
      reach:clamp(.18+operation.effect*.30),
      sourceReliability:.34,
      evidenceSupport:.08,
      publishedTick:operation.currentTick,
    });
  }
  if(operation.mode==='false_flag'){
    publishCompetingNarrative(observer,incident.id,{
      kind:'alternative_actor',
      reach:clamp(.34+operation.effect*.28),
      sourceReliability:.45,
      evidenceSupport:.20,
      publishedTick:operation.currentTick,
    });
  }
  return incident;
}

export function launchElectionInterference(sponsor,target,regions,currentTick=0,options={},rng=Math.random){
  const mode=ELECTION_INTERFERENCE_MODES[options.mode||'propaganda'];
  if(!sponsor||!target||sponsor.id===target.id||!mode)return {launched:false,reason:'invalid_parties_or_mode'};
  const readiness=electionReadiness(target);
  if(readiness<.12)return {launched:false,reason:'no_meaningful_mass_election'};
  const capital=capitalRegion(sponsor,regions);
  const spend=Math.max(0,Math.min(Number(options.amount)||10,Number(capital?.treasury)||0));
  if(spend<1)return {launched:false,reason:'insufficient_resources'};
  capital.treasury-=spend;

  const aiAssisted=Boolean(options.aiAssisted);
  const capability=sponsorCapability(sponsor,regions,aiAssisted);
  const defence=targetDefence(target,regions);
  const digitalFit=mode.digital?capability.digital:.45;
  const aiScale=mode.aiScalable&&aiAssisted?(.12+capability.ai*.30):0;
  const scale=clamp(.14+Math.log1p(spend)/8+capability.tradecraft*.30+digitalFit*.18+aiScale);
  const resilience=clamp(defence.security*.28+defence.verification*.28+defence.counterintelligence*.26+defence.pluralism*.18);
  const effect=clamp(scale*(.82-resilience*.56),.01,.72);

  const state=ensureElectionIntegrity(target);
  const confusion=effect*mode.confusion;
  const disruption=effect*mode.disruption;
  state.foreignInfluencePressure=clamp(state.foreignInfluencePressure+effect*.18);
  state.disinformationPressure=clamp(state.disinformationPressure+confusion*.42);
  state.turnoutSuppressionPressure=clamp(state.turnoutSuppressionPressure+(options.mode==='voter_suppression'?disruption*.65:disruption*.14));
  state.resultContestationRisk=clamp(state.resultContestationRisk+confusion*.28+disruption*.24);
  state.publicConfidence=clamp(state.publicConfidence-confusion*.16-disruption*.12);
  state.lastInterferenceTick=currentTick;

  for(const region of territoriesFor(target,regions)){
    const info=ensureInformationIntegrity(region);
    info.foreignInfluencePressure=clamp(info.foreignInfluencePressure+effect*.12);
    info.misinformationPressure=clamp(info.misinformationPressure+confusion*.10);
  }

  // Detecting that an operation exists and proving who ordered it are deliberately separate questions.
  const detectionChance=clamp(.08+defence.counterintelligence*.42+defence.verification*.22+effect*.08-capability.tradecraft*.26-aiScale*.12,.03,.93);
  const detected=rng()<detectionChance;
  const falseFlag=options.mode==='false_flag'||Boolean(options.falseFlagActorId);
  const attributionChance=clamp(.05+defence.counterintelligence*.22+defence.verification*.30+capability.tradecraft*.04-digitalFit*.08-(falseFlag?.22:0),.02,.82);
  const attributed=detected&&rng()<attributionChance;
  if(detected)state.detectedInterference=clamp(state.detectedInterference+effect*.25);
  if(attributed)state.attributedInterference=clamp(state.attributedInterference+effect*.25);

  const operation={
    id:`election-interference:${sponsor.id}:${target.id}:${currentTick}:${state.operations.length}`,
    sponsorPolityId:sponsor.id,targetPolityId:target.id,mode:options.mode||'propaganda',aiAssisted,
    spend,effect,detected,attributed,
    claimedActorId:falseFlag?(options.falseFlagActorId||'unknown_third_party'):sponsor.id,
    actualActorId:sponsor.id,
    detectionChance,attributionChance,currentTick,
  };
  state.operations.push(operation);if(state.operations.length>30)state.operations.shift();
  publishElectionInterferenceClaim(target,regions,operation,mode,defence);
  return {launched:true,...operation};
}

export function tickElectionIntegrity(polities,regions,currentTick=0,elapsedDays=7){
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  for(const polity of polities||[]){
    const territories=territoriesFor(polity,regions);
    if(!territories.length)continue;
    const s=ensureElectionIntegrity(polity);
    const defence=targetDefence(polity,regions);
    const infoConfidence=weightedAverage(territories,r=>ensureInformationIntegrity(r).electionConfidence);
    const postTruth=weightedAverage(territories,r=>ensureInformationIntegrity(r).postTruthPressure);
    const legacy=legacyInterferencePressure(polity);
    s.administrativeSecurity=clamp(defence.security*.44+defence.counterintelligence*.28+defence.verification*.18+clamp(polity.massPolitics?.administrativeCapacity||0)*.10);

    // Old-fashioned political warfare remains relevant; AI changes scale and deniability rather than inventing interference.
    s.foreignInfluencePressure=clamp(s.foreignInfluencePressure+legacy.propaganda*years*.09);
    s.disinformationPressure=clamp(s.disinformationPressure+legacy.propaganda*years*.11);
    s.detectedInterference=clamp(s.detectedInterference+legacy.exposure*years*.035);

    const decay=Math.min(1,years*.30);
    s.foreignInfluencePressure*=1-decay;
    s.disinformationPressure*=1-Math.min(1,years*.24);
    s.turnoutSuppressionPressure*=1-Math.min(1,years*.38);
    s.detectedInterference*=1-Math.min(1,years*.12);
    s.attributedInterference*=1-Math.min(1,years*.10);
    s.resultContestationRisk=clamp(
      s.resultContestationRisk*(1-Math.min(1,years*.22))+
      s.foreignInfluencePressure*.12+s.disinformationPressure*.16+s.turnoutSuppressionPressure*.15+
      postTruth*.12+(1-infoConfidence)*.08
    );
    s.publicConfidence=clamp(s.publicConfidence+(infoConfidence-s.publicConfidence)*Math.min(1,years*.55)-s.resultContestationRisk*years*.08-postTruth*years*.035);
  }
}

export function electionIntegritySummary(polity){
  const s=ensureElectionIntegrity(polity);
  return {
    administrativeSecurity:s.administrativeSecurity,publicConfidence:s.publicConfidence,
    foreignInfluencePressure:s.foreignInfluencePressure,disinformationPressure:s.disinformationPressure,
    turnoutSuppressionPressure:s.turnoutSuppressionPressure,resultContestationRisk:s.resultContestationRisk,
    detectedInterference:s.detectedInterference,attributedInterference:s.attributedInterference,
  };
}
