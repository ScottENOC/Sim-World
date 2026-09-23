const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||r?.id||null;

export const STRATEGIC_SOURCE_TYPES=Object.freeze({
  INTERNAL_REPORT:'internal_report',
  INDEPENDENT_AUDIT:'independent_audit',
  FREE_PRESS:'free_press',
  PUBLIC_BUDGET:'public_budget',
  HUMAN_INTELLIGENCE:'human_intelligence',
  SIGNALS_INTELLIGENCE:'signals_intelligence',
  SATELLITE:'satellite',
  BATTLEFIELD_OBSERVATION:'battlefield_observation',
  COMMERCIAL_DATA:'commercial_data',
  OFFICIAL_CLAIM:'official_claim',
});

export function ensureStrategicInformationEnvironment(region){
  region.strategicInformationEnvironment||={};
  const s=region.strategicInformationEnvironment;
  const defaults={
    pressFreedom:.45,
    publicBudgetTransparency:.38,
    independentVerification:.42,
    upwardReportingIntegrity:.58,
    badNewsCareerPenalty:.22,
    corruptionPressure:.18,
    auditStrength:.38,
    operationalSecrecy:.48,
    deceptionCapacity:.28,
  };
  for(const [k,v] of Object.entries(defaults))if(!Number.isFinite(s[k]))s[k]=v;
  region.strategicBeliefs||={};
  return s;
}

export function setStrategicInformationEnvironment(region,patch={}){
  const s=ensureStrategicInformationEnvironment(region);
  for(const k of Object.keys(s))if(Number.isFinite(patch[k]))s[k]=clamp(patch[k]);
  return {...s};
}

export function internalEpistemicQuality(region){
  const s=ensureStrategicInformationEnvironment(region);
  return clamp(
    s.upwardReportingIntegrity*.28+
    s.independentVerification*.24+
    s.auditStrength*.18+
    s.pressFreedom*.12+
    (1-s.badNewsCareerPenalty)*.10+
    (1-s.corruptionPressure)*.08
  );
}

export function externalStrategicVisibility(region){
  const s=ensureStrategicInformationEnvironment(region);
  return clamp(
    s.pressFreedom*.34+
    s.publicBudgetTransparency*.24+
    s.independentVerification*.10+
    (1-s.operationalSecrecy)*.22+
    (1-s.deceptionCapacity)*.10
  );
}

function sourceReliability(sourceType){
  return {
    [STRATEGIC_SOURCE_TYPES.INTERNAL_REPORT]:.58,
    [STRATEGIC_SOURCE_TYPES.INDEPENDENT_AUDIT]:.88,
    [STRATEGIC_SOURCE_TYPES.FREE_PRESS]:.66,
    [STRATEGIC_SOURCE_TYPES.PUBLIC_BUDGET]:.72,
    [STRATEGIC_SOURCE_TYPES.HUMAN_INTELLIGENCE]:.58,
    [STRATEGIC_SOURCE_TYPES.SIGNALS_INTELLIGENCE]:.76,
    [STRATEGIC_SOURCE_TYPES.SATELLITE]:.82,
    [STRATEGIC_SOURCE_TYPES.BATTLEFIELD_OBSERVATION]:.78,
    [STRATEGIC_SOURCE_TYPES.COMMERCIAL_DATA]:.68,
    [STRATEGIC_SOURCE_TYPES.OFFICIAL_CLAIM]:.42,
  }[sourceType]??.5;
}

function reportingBias(region,direction='capacity'){
  const s=ensureStrategicInformationEnvironment(region);
  const distortion=clamp(
    s.badNewsCareerPenalty*.34+
    s.corruptionPressure*.24+
    (1-s.upwardReportingIntegrity)*.24+
    (1-s.independentVerification)*.18
  );
  // For capabilities/readiness, bad-news suppression biases reports upward. For losses/costs it biases them downward.
  return direction==='loss'?-distortion:distortion;
}

export function generateInternalStrategicReport(region,{metric,trueValue,direction='capacity',currentTick=0,rng=Math.random}={}){
  const truth=Math.max(0,Number(trueValue)||0),quality=internalEpistemicQuality(region),bias=reportingBias(region,direction);
  const noise=((rng?.()??Math.random())-.5)*2*(1-quality)*.28;
  const scale=Math.max(.01,truth);
  const estimate=Math.max(0,truth*(1+bias*.38+noise));
  const uncertainty=clamp(.08+(1-quality)*.58);
  return {metric,estimate,uncertainty,confidence:clamp(1-uncertainty),asOfTick:currentTick,sourceType:STRATEGIC_SOURCE_TYPES.INTERNAL_REPORT,trueValue:undefined};
}

export function generateExternalStrategicSignal(target,{metric,trueValue,currentTick=0,rng=Math.random,sourceType=null}={}){
  const visibility=externalStrategicVisibility(target),s=ensureStrategicInformationEnvironment(target);
  const type=sourceType||(
    s.pressFreedom>.65?STRATEGIC_SOURCE_TYPES.FREE_PRESS:
    s.publicBudgetTransparency>.6?STRATEGIC_SOURCE_TYPES.PUBLIC_BUDGET:
    STRATEGIC_SOURCE_TYPES.OFFICIAL_CLAIM
  );
  const reliability=sourceReliability(type),noise=((rng?.()??Math.random())-.5)*2*(1-visibility*reliability)*.45;
  const concealmentBias=-s.operationalSecrecy*.18-s.deceptionCapacity*.12;
  const truth=Math.max(0,Number(trueValue)||0);
  const estimate=Math.max(0,truth*(1+noise+concealmentBias));
  const confidence=clamp(.16+visibility*.55+reliability*.24);
  return {metric,estimate,uncertainty:clamp(1-confidence),confidence,asOfTick:currentTick,sourceType:type,targetActorId:actorId(target),trueValue:undefined};
}

function beliefBucket(observer,targetId){
  ensureStrategicInformationEnvironment(observer);
  observer.strategicBeliefs[targetId]||={};
  return observer.strategicBeliefs[targetId];
}

export function updateStrategicBelief(observer,target,{metric,estimate,confidence=.5,uncertainty=null,asOfTick=0,sourceType=STRATEGIC_SOURCE_TYPES.OFFICIAL_CLAIM}={}){
  const targetId=typeof target==='string'?target:actorId(target);
  if(!targetId||!metric||!Number.isFinite(Number(estimate)))return null;
  const bucket=beliefBucket(observer,targetId),prior=bucket[metric],source=sourceReliability(sourceType),c=clamp(confidence)*source;
  const value=Math.max(0,Number(estimate));
  const priorWeight=prior?clamp(prior.confidence)*.75:0;
  const denom=Math.max(.001,priorWeight+c);
  const merged=prior?(prior.estimate*priorWeight+value*c)/denom:value;
  const mergedConfidence=clamp((prior?.confidence||0)*.55+c*.62);
  const entry={
    metric,
    estimate:merged,
    confidence:mergedConfidence,
    uncertainty:uncertainty==null?clamp(1-mergedConfidence):clamp(uncertainty),
    asOfTick,
    sources:[...(prior?.sources||[]).slice(-5),{sourceType,confidence:clamp(confidence),asOfTick,value}],
  };
  bucket[metric]=entry;
  return entry;
}

export function recordOwnStrategicReport(region,report){
  return updateStrategicBelief(region,actorId(region),report);
}

export function strategicBelief(observer,target,metric){
  const targetId=typeof target==='string'?target:actorId(target);
  return observer?.strategicBeliefs?.[targetId]?.[metric]||null;
}

export function decisionEstimate(observer,target,metric,{fallback=null,uncertaintyAversion=.35}={}){
  const b=strategicBelief(observer,target,metric);
  if(!b)return {known:false,value:fallback,confidence:0,uncertainty:1};
  // Decision systems consume beliefs, never target truth. Conservative actors shade uncertain estimates toward a neutral fallback if supplied.
  let value=b.estimate;
  if(Number.isFinite(fallback))value=b.estimate*(1-b.uncertainty*uncertaintyAversion)+Number(fallback)*(b.uncertainty*uncertaintyAversion);
  return {known:true,value,confidence:b.confidence,uncertainty:b.uncertainty,asOfTick:b.asOfTick};
}

export function strategicInformationSummary(region){
  const s=ensureStrategicInformationEnvironment(region);
  return {internalEpistemicQuality:internalEpistemicQuality(region),externalStrategicVisibility:externalStrategicVisibility(region),environment:{...s}};
}
