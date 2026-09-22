import { recordMilitaryProvocation, STRATEGIC_WARNING_TYPES } from '../diplomacy/strategicWarning.js?v=20260922-warning1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.polityId||r?.id||null;
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const AIRSPACE_PROBE_PURPOSES=Object.freeze({
  PROBE:'probe',
  PRESSURE:'pressure',
  NORMALISE:'normalise_presence',
  SIGNAL:'signal',
  FEINT:'feint',
});

export const AIRSPACE_RESPONSE_POSTURES=Object.freeze({
  IGNORE:'ignore',
  MONITOR:'monitor',
  SHADOW:'shadow',
  INTERCEPT:'intercept',
  AGGRESSIVE:'aggressive',
});

const RESPONSE_INTENSITY=Object.freeze({ignore:.03,monitor:.18,shadow:.42,intercept:.72,aggressive:1});

export function ensureAirspaceSecurity(region){
  region.airspaceSecurity||={};
  const s=region.airspaceSecurity;
  s.policy||={};
  if(!Object.values(AIRSPACE_RESPONSE_POSTURES).includes(s.policy.responsePosture))s.policy.responsePosture=AIRSPACE_RESPONSE_POSTURES.INTERCEPT;
  if(!Number.isFinite(s.policy.identificationThreshold))s.policy.identificationThreshold=.48;
  if(!Number.isFinite(s.alertness))s.alertness=.45;
  if(!Number.isFinite(s.training))s.training=.25;
  if(!Number.isFinite(s.fatigue))s.fatigue=0;
  if(!Number.isFinite(s.scrambleBurden))s.scrambleBurden=0;
  if(!s.byActor||typeof s.byActor!=='object')s.byActor={};
  if(!Array.isArray(s.incidents))s.incidents=[];
  return s;
}

export function setAirspaceResponsePolicy(region,patch={}){
  const s=ensureAirspaceSecurity(region);
  if(Object.values(AIRSPACE_RESPONSE_POSTURES).includes(patch.responsePosture))s.policy.responsePosture=patch.responsePosture;
  if(Number.isFinite(patch.identificationThreshold))s.policy.identificationThreshold=clamp(patch.identificationThreshold);
  return {...s.policy};
}

function actorState(region,intruderActorId){
  const s=ensureAirspaceSecurity(region);
  const id=intruderActorId||'unknown';
  s.byActor[id]||={encounters:0,habituation:0,hostilityExpectation:.15,lastSeenTick:null};
  return s.byActor[id];
}

function surveillanceQuality(region){
  const radar=has(region,'radar') ? .42 : 0;
  const aew=clamp(region.airborneEarlyWarning?.coverage||region.airborneEarlyWarning?.capability||0)*.28;
  const airDef=clamp(region.airDefence?.detection||region.airDefence?.readiness||region.airDefenceIndustry?.readiness||0)*.18;
  const intelligence=clamp(region.militaryIntelligence?.airSurveillance||region.intelligence?.airSurveillance||0)*.12;
  return clamp(.08+radar+aew+airDef+intelligence);
}

function availableIntruderAircraft(region){
  return (region.aviation?.aircraft||[]).filter(a=>a.aircraftType!=='helicopter'&&a.ownerType==='military'&&a.status!=='destroyed'&&(a.condition??1)>=.42&&(a.fuel??1)>.12);
}

function defenderInterceptorCount(region){
  return (region.aviation?.aircraft||[]).filter(a=>a.aircraftType!=='helicopter'&&a.ownerType==='military'&&['fighter','interceptor','recon'].includes(a.role)&&a.status!=='destroyed'&&(a.condition??1)>=.42&&(a.fuel??1)>.12).length;
}

function probeStealth(aircraft=[]){
  if(!aircraft.length)return 0;
  return clamp(aircraft.reduce((sum,a)=>sum+clamp(a.designStats?.stealth||0),0)/aircraft.length);
}

function spendSortieFuel(region,aircraft,count,depth){
  const used=aircraft.slice(0,count);
  const per=.055+.045*clamp(depth);
  const required=per*used.length;
  if((region.stockpile?.aviation_fuel||0)<required)return null;
  region.stockpile.aviation_fuel-=required;
  for(const a of used){a.fuel=clamp((a.fuel??1)-per*.18);a.totalFlights=(a.totalFlights||0)+1;a.condition=clamp((a.condition??1)-.0015-.0015*clamp(depth));}
  return used;
}

function responseCost(defender,intensity,interceptors,elapsedSorties=1){
  const sorties=Math.max(0,Math.min(interceptors,Math.ceil(1+intensity*3)))*elapsedSorties;
  const fuelNeed=sorties*(.025+.035*intensity);
  const fuel=Math.min(Math.max(0,defender.stockpile?.aviation_fuel||0),fuelNeed);
  if(defender.stockpile)defender.stockpile.aviation_fuel=Math.max(0,(defender.stockpile.aviation_fuel||0)-fuel);
  const s=ensureAirspaceSecurity(defender);
  s.scrambleBurden+=sorties;
  s.fatigue=clamp(s.fatigue+.006*sorties+.015*intensity);
  s.training=clamp(s.training+.009*sorties*(1-s.training));
  return{sorties,fuelUsed:fuel};
}

export function airspaceReactionMultiplier(defender,intruderActorId,{hostile=false}={}){
  const s=ensureAirspaceSecurity(defender),a=actorState(defender,intruderActorId);
  const habituation=clamp(a.habituation);
  const readiness=clamp(s.alertness*.45+s.training*.40+(1-s.fatigue)*.15);
  const hostility=hostile?clamp(a.hostilityExpectation):0;
  return clamp(.78+readiness*.40+hostility*.18-habituation*.30,.58,1.35);
}

export function airspaceProbeIntelligence(attacker,defender){
  const id=defender?.id;
  if(!id)return null;
  attacker.airspaceIntelligence||={};
  return attacker.airspaceIntelligence[id]||null;
}

export function conductAirspaceProbe(attacker,defender,options={},currentTick=0,rng=Math.random){
  if(!attacker||!defender||actorId(attacker)===actorId(defender))return{conducted:false,reason:'invalid_target'};
  const purpose=Object.values(AIRSPACE_PROBE_PURPOSES).includes(options.purpose)?options.purpose:AIRSPACE_PROBE_PURPOSES.PROBE;
  const depth=clamp(options.depth??.35),requested=Math.max(1,Math.floor(options.aircraftCount||1));
  const eligible=availableIntruderAircraft(attacker);
  if(!eligible.length)return{conducted:false,reason:'no_serviceable_aircraft'};
  const used=spendSortieFuel(attacker,eligible,Math.min(requested,eligible.length),depth);
  if(!used)return{conducted:false,reason:'insufficient_fuel'};

  const ds=ensureAirspaceSecurity(defender),as=actorState(defender,actorId(attacker));
  const surveillance=surveillanceQuality(defender),stealth=probeStealth(used);
  const detectionChance=clamp(.16+surveillance*.64+depth*.22+ds.alertness*.18-stealth*.28-ds.fatigue*.08);
  const detected=(rng?.()??Math.random())<detectionChance;
  let response={sorties:0,fuelUsed:0},warning=null,intelligenceGain=0,incidentRisk=0;

  as.encounters++;
  as.lastSeenTick=currentTick;
  if(detected){
    const posture=ds.policy.responsePosture,intensity=RESPONSE_INTENSITY[posture]??.72;
    const interceptors=defenderInterceptorCount(defender);
    const identify=clamp(surveillance*.55+intensity*.25+ds.training*.20-ds.fatigue*.12);
    const responds=posture!==AIRSPACE_RESPONSE_POSTURES.IGNORE&&interceptors>0;
    if(responds)response=responseCost(defender,intensity,interceptors);

    const routinePattern=purpose===AIRSPACE_PROBE_PURPOSES.NORMALISE||purpose===AIRSPACE_PROBE_PURPOSES.PROBE;
    const habituationDelta=(routinePattern ? .035 : .012)*(1-intensity*.55)*(1+depth*.25);
    as.habituation=clamp(as.habituation+habituationDelta);
    if(purpose===AIRSPACE_PROBE_PURPOSES.SIGNAL||purpose===AIRSPACE_PROBE_PURPOSES.FEINT)as.hostilityExpectation=clamp(as.hostilityExpectation+.04+.04*depth);
    else if(routinePattern)as.hostilityExpectation=clamp(as.hostilityExpectation-.008);
    ds.alertness=clamp(ds.alertness+.018*intensity+.012*depth-.006*as.habituation);

    attacker.airspaceIntelligence||={};
    const intel=attacker.airspaceIntelligence[defender.id]||={radarMapping:0,responseKnowledge:0,roeKnowledge:0,lastProbeTick:null};
    intelligenceGain=clamp(.025+surveillance*.07+(responds ? .08 : .025)+depth*.04);
    intel.radarMapping=clamp(intel.radarMapping+intelligenceGain*(.7+.3*identify));
    intel.responseKnowledge=clamp(intel.responseKnowledge+intelligenceGain*(responds?1:.45));
    intel.roeKnowledge=clamp(intel.roeKnowledge+intelligenceGain*(posture===AIRSPACE_RESPONSE_POSTURES.AGGRESSIVE?1:.65));
    intel.lastProbeTick=currentTick;

    incidentRisk=clamp(.005+depth*.035+intensity*.045+(posture===AIRSPACE_RESPONSE_POSTURES.AGGRESSIVE ? .04 : 0));
    warning=recordMilitaryProvocation(defender,{
      type:STRATEGIC_WARNING_TYPES.AIRSPACE_INCURSION,
      allegedActorId:identify>=ds.policy.identificationThreshold?actorId(attacker):null,
      actualActorId:actorId(attacker),actualThreat:false,
      subjectRegionId:defender.id,subjectRegionName:defender.name,
      sourceReliability:clamp(.42+surveillance*.42),
      provenance:clamp(.45+surveillance*.35),
      corroboration:clamp(.12+response.sorties*.06+surveillance*.18),
      forensicSupport:clamp(.10+identify*.35),
      attributionEvidence:clamp(identify*.78),
      headline:`Military aircraft reported in ${defender.name}'s airspace`,
    },currentTick);

    if(purpose===AIRSPACE_PROBE_PURPOSES.SIGNAL){
      defender.strategicCrisisPressure=clamp((defender.strategicCrisisPressure||0)+.025+.035*depth);
    }
    if(purpose===AIRSPACE_PROBE_PURPOSES.PRESSURE&&responds){
      ds.fatigue=clamp(ds.fatigue+.025+.018*response.sorties);
    }
  }

  const incident={tick:currentTick,intruderActorId:actorId(attacker),purpose,depth,aircraftCount:used.length,detected,responseSorties:response.sorties,intelligenceGain,incidentRisk,warningId:warning?.id||null};
  ds.incidents.push(incident);if(ds.incidents.length>80)ds.incidents.shift();
  return{conducted:true,...incident,responseFuelUsed:response.fuelUsed,reactionMultiplier:airspaceReactionMultiplier(defender,actorId(attacker),{hostile:false})};
}

export function tickAirspaceSecurity(regions,elapsedDays=7){
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  for(const region of regions||[]){
    const s=ensureAirspaceSecurity(region);
    s.fatigue=clamp(s.fatigue*Math.pow(.5,years/.18));
    s.alertness=clamp(.35+(s.alertness-.35)*Math.pow(.5,years/.7));
    for(const a of Object.values(s.byActor)){
      a.habituation=clamp(a.habituation*Math.pow(.5,years/1.2));
      a.hostilityExpectation=clamp(.15+(a.hostilityExpectation-.15)*Math.pow(.5,years/1.5));
    }
    region.report||={};
    region.report.airspaceSecurity=airspaceSecuritySummary(region);
  }
}

export function airspaceSecuritySummary(region){
  const s=ensureAirspaceSecurity(region);
  return{
    responsePosture:s.policy.responsePosture,
    alertness:s.alertness,training:s.training,fatigue:s.fatigue,scrambleBurden:s.scrambleBurden,
    recentIncidents:s.incidents.slice(-8).map(i=>({...i})),
    actorPatterns:Object.fromEntries(Object.entries(s.byActor).map(([id,a])=>[id,{encounters:a.encounters,habituation:a.habituation,hostilityExpectation:a.hostilityExpectation,lastSeenTick:a.lastSeenTick}])),
  };
}
