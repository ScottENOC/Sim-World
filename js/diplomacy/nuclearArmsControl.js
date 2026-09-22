import { nuclearDeterrentStatus, ensureNuclearWeaponState } from '../military/nuclearWeaponisation.js?v=20260923-nuclear-hotpath1';
import { ensureStrategicDelivery, secondStrikeAssessment, STRATEGIC_POSTURES } from '../military/strategicDelivery.js?v=20260920-arms-control1';
import { measureActivePerformanceDetail, recordActivePerformanceMetric } from '../core/performanceProfiler.js?v=20260912-deep-profiler1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;
const actorKey=(r)=>String(actorId(r)??'');

export const NUCLEAR_TREATY_TYPES=Object.freeze({
  NON_PROLIFERATION:'non_proliferation',
  TEST_BAN:'test_ban',
  MATERIAL_SAFEGUARDS:'material_safeguards',
  ARMS_LIMITATION:'arms_limitation',
  DISARMAMENT:'disarmament'
});

export const COMPLIANCE_POSTURES=Object.freeze({
  COMPLY:'comply',
  HEDGE:'hedge',
  VIOLATE:'violate',
  WITHDRAW:'withdraw'
});

export function ensureNuclearArmsControl(region){
  region.nuclearArmsControl ||= {};
  const s=region.nuclearArmsControl;
  s.treaties ||= {};
  s.history ||= [];
  s.armsRace ||= {threatPressure:0,lastAssessmentTick:null,desiredPosture:STRATEGIC_POSTURES.MINIMAL};
  if(!Number.isFinite(s.verificationCapacity))s.verificationCapacity=clamp(region.governance?.administrativeControl||.25);
  if(!Number.isFinite(s.treatyReliability))s.treatyReliability=.62;
  return s;
}

function normaliseTerms(type,terms={}){
  return {
    prohibitAcquisition:Boolean(terms.prohibitAcquisition??type===NUCLEAR_TREATY_TYPES.NON_PROLIFERATION),
    prohibitTesting:Boolean(terms.prohibitTesting??type===NUCLEAR_TREATY_TYPES.TEST_BAN),
    safeguards:Boolean(terms.safeguards??type===NUCLEAR_TREATY_TYPES.MATERIAL_SAFEGUARDS),
    prohibitForeignNuclearBasing:Boolean(terms.prohibitForeignNuclearBasing??false),
    maxLandLaunchers:Number.isFinite(terms.maxLandLaunchers)?Math.max(0,Math.round(terms.maxLandLaunchers)):null,
    maxStrategicSubmarines:Number.isFinite(terms.maxStrategicSubmarines)?Math.max(0,Math.round(terms.maxStrategicSubmarines)):null,
    maxPrototypes:Number.isFinite(terms.maxPrototypes)?Math.max(0,Math.round(terms.maxPrototypes)):(type===NUCLEAR_TREATY_TYPES.DISARMAMENT?0:null),
    verification:clamp(terms.verification??(type===NUCLEAR_TREATY_TYPES.MATERIAL_SAFEGUARDS?.8:.55)),
    inspectionAccess:clamp(terms.inspectionAccess??.5),
    withdrawalNoticeDays:Math.max(0,Number(terms.withdrawalNoticeDays??180)||0),
    sanctionsSeverity:clamp(terms.sanctionsSeverity??.55),
    securityAssurance:clamp(terms.securityAssurance??0)
  };
}

export function joinNuclearTreaty(region,{id,name=null,type=NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms={},currentTick=null}={}){
  if(!id||!Object.values(NUCLEAR_TREATY_TYPES).includes(type))return null;
  const s=ensureNuclearArmsControl(region);
  const membership={id,name:name||id,type,terms:normaliseTerms(type,terms),status:'active',joinedTick:currentTick,withdrawalTick:null,compliance:COMPLIANCE_POSTURES.COMPLY,suspicion:0,lastInspectionTick:null,detectedViolations:0};
  s.treaties[id]=membership;
  s.history.push({tick:currentTick,type:'treaty_joined',treatyId:id});
  return structuredClone(membership);
}

export function leaveNuclearTreaty(region,treatyId,{currentTick=null,immediate=false}={}){
  const s=ensureNuclearArmsControl(region),m=s.treaties[treatyId];if(!m||m.status!=='active')return null;
  const notice=immediate?0:m.terms.withdrawalNoticeDays;
  m.status=notice>0?'withdrawing':'withdrawn';
  m.withdrawalTick=currentTick;
  m.withdrawalEffectiveTick=Number.isFinite(currentTick)?currentTick+notice:null;
  m.compliance=COMPLIANCE_POSTURES.WITHDRAW;
  s.history.push({tick:currentTick,type:'treaty_withdrawal_announced',treatyId,noticeDays:notice});
  return structuredClone(m);
}

function activeTreatiesFromState(s){
  const active=[];
  for(const t of Object.values(s?.treaties||{}))if(t.status==='active'||t.status==='withdrawing')active.push(t);
  return active;
}
function activeTreaties(region){return activeTreatiesFromState(ensureNuclearArmsControl(region));}

function constraintsFromMemberships(active){
  const out={prohibitAcquisition:false,prohibitTesting:false,safeguards:false,prohibitForeignNuclearBasing:false,maxLandLaunchers:null,maxStrategicSubmarines:null,maxPrototypes:null,verification:0,inspectionAccess:0,securityAssurance:0};
  for(const m of active||[]){const t=m.terms;out.prohibitAcquisition ||= t.prohibitAcquisition;out.prohibitTesting ||= t.prohibitTesting;out.safeguards ||= t.safeguards;out.prohibitForeignNuclearBasing ||= t.prohibitForeignNuclearBasing;out.verification=Math.max(out.verification,t.verification);out.inspectionAccess=Math.max(out.inspectionAccess,t.inspectionAccess);out.securityAssurance=Math.max(out.securityAssurance,t.securityAssurance);for(const k of ['maxLandLaunchers','maxStrategicSubmarines','maxPrototypes'])if(t[k]!=null)out[k]=out[k]==null?t[k]:Math.min(out[k],t[k]);}
  return out;
}

export function nuclearTreatyConstraints(region){return constraintsFromMemberships(activeTreaties(region));}

function strategicThreatBase(deterrent,strike){
  const device=deterrent==='demonstrated_device_capability'?1:deterrent==='untested_device_capability'?.55:0;
  return clamp(device*.45+clamp(strike?.retaliationConfidence||0)*.35);
}

function insertActorBest(map,key,entry){
  const list=map.get(key);
  if(!list){map.set(key,[entry]);return;}
  if(entry.base>list[0].base){list.unshift(entry);if(list.length>2)list.length=2;return;}
  if(list.length<2||entry.base>list[1].base){list[1]=entry;if(list.length>2)list.length=2;}
}

function explicitRelationshipKeys(region){
  const keys=new Set(Object.keys(region.relations||{}));
  for(const key of Object.keys(region.diplomacy?.relations||{}))keys.add(key);
  return keys;
}

function strongestExcluding(list,region){
  if(!list?.length)return null;
  if(list[0].region!==region)return list[0];
  return list[1]||null;
}

function observedRivalPressure(region,rivals=[],context=null){
  if(context?.rankedThreats&&context?.actorBest){
    const primary=region.relations||{},secondary=region.diplomacy?.relations||{},explicit=explicitRelationshipKeys(region);
    let pressure=0;

    // Every rival actor without an explicit relationship uses the same default
    // hostility (.3), so one ranked world list gives the exact best candidate.
    for(const entry of context.rankedThreats){
      context.defaultCandidatesScanned++;
      if(entry.region===region||explicit.has(entry.actorKey))continue;
      pressure=clamp(entry.base+.3*.35);
      break;
    }

    // Explicit relationships can raise or lower hostility. All regions for the
    // same actor share that hostility lookup, so only that actor's strongest
    // strategic baseline can possibly win the max calculation.
    for(const key of explicit){
      const entry=strongestExcluding(context.actorBest.get(String(key)),region);
      if(!entry)continue;
      context.explicitRelationshipsEvaluated++;
      const hostility=clamp(primary?.[key]?.hostility??secondary?.[key]?.hostility??.3);
      pressure=Math.max(pressure,clamp(entry.base+hostility*.35));
    }
    return pressure;
  }

  let pressure=0;
  for(const rival of rivals||[]){
    if(!rival||rival===region)continue;
    const deterrent=context?.statusByRegion?.get(rival)??nuclearDeterrentStatus(rival);
    const strike=context?.strikeByRegion?.get(rival)??secondStrikeAssessment(rival,{fleets:rival.fleets||[]});
    const hostility=clamp(region.relations?.[actorId(rival)]?.hostility??region.diplomacy?.relations?.[actorId(rival)]?.hostility??.3);
    pressure=Math.max(pressure,clamp(strategicThreatBase(deterrent,strike)+hostility*.35));
  }
  return pressure;
}

export function npcStrategicArmsDecision(region,{rivals=[],currentTick=null,context=null,memberships=null,constraints=null}={}){
  const arms=ensureNuclearArmsControl(region),delivery=ensureStrategicDelivery(region);
  memberships ||= activeTreatiesFromState(arms);
  constraints ||= constraintsFromMemberships(memberships);
  const threat=observedRivalPressure(region,rivals,context),own=context?.strikeByRegion?.get(region)??secondStrikeAssessment(region,{fleets:region.fleets||[]});
  const assurance=clamp(Math.max(constraints.securityAssurance,region.nuclearAlliance?.extendedDeterrenceAssurance||0));
  const effectiveThreat=clamp(threat*(1-assurance*.55));
  const riskTolerance=clamp(region.nuclearDeterrence?.riskTolerance??.28);
  let desired=STRATEGIC_POSTURES.MINIMAL;
  if(effectiveThreat>.7||own.firstStrikeVulnerability>.72&&effectiveThreat>.45)desired=STRATEGIC_POSTURES.SURVIVABLE;
  else if(effectiveThreat>.35)desired=STRATEGIC_POSTURES.BALANCED;

  const temptation=clamp(effectiveThreat*.58+riskTolerance*.24+(1-arms.treatyReliability)*.18);
  const detectionRisk=clamp(constraints.verification*.55+constraints.inspectionAccess*.45);
  let treatyPosture=COMPLIANCE_POSTURES.COMPLY;
  if(memberships.length&&temptation>.72&&detectionRisk<.45)treatyPosture=COMPLIANCE_POSTURES.VIOLATE;
  else if(memberships.length&&temptation>.48)treatyPosture=COMPLIANCE_POSTURES.HEDGE;

  arms.armsRace={threatPressure:effectiveThreat,lastAssessmentTick:currentTick,desiredPosture:desired,treatyPosture};
  delivery.policy.posture=desired;
  delivery.policy.bomberAlert=clamp(desired===STRATEGIC_POSTURES.SURVIVABLE?.55:desired===STRATEGIC_POSTURES.BALANCED?.34:.18);
  delivery.policy.bomberDispersal=clamp(desired===STRATEGIC_POSTURES.SURVIVABLE?.72:desired===STRATEGIC_POSTURES.BALANCED?.42:.2);
  delivery.policy.landDispersal=clamp(desired===STRATEGIC_POSTURES.SURVIVABLE?.76:desired===STRATEGIC_POSTURES.BALANCED?.46:.22);
  delivery.policy.submarinePatrolRate=clamp(desired===STRATEGIC_POSTURES.SURVIVABLE?.68:desired===STRATEGIC_POSTURES.BALANCED?.48:.3);

  let target=desired===STRATEGIC_POSTURES.SURVIVABLE?12:desired===STRATEGIC_POSTURES.BALANCED?6:2;
  let seaTarget=desired===STRATEGIC_POSTURES.SURVIVABLE?4:desired===STRATEGIC_POSTURES.BALANCED?2:1;
  if(treatyPosture===COMPLIANCE_POSTURES.COMPLY){
    if(constraints.maxLandLaunchers!=null)target=Math.min(target,constraints.maxLandLaunchers);
    if(constraints.maxStrategicSubmarines!=null)seaTarget=Math.min(seaTarget,constraints.maxStrategicSubmarines);
    if(constraints.prohibitAcquisition&&(region.nuclearWeapons?.prototypeCount||0)===0){target=0;seaTarget=0;}
  } else if(treatyPosture===COMPLIANCE_POSTURES.HEDGE){target=Math.min(target,Math.max(1,constraints.maxLandLaunchers??target));seaTarget=Math.min(seaTarget,Math.max(0,constraints.maxStrategicSubmarines??seaTarget));}
  delivery.procurement.landTarget=target;delivery.procurement.seaTarget=seaTarget;delivery.procurement.mobileShare=desired===STRATEGIC_POSTURES.SURVIVABLE?.72:.4;
  return {threatPressure:effectiveThreat,desiredPosture:desired,treatyPosture,landTarget:target,seaTarget,detectionRisk};
}

export function inspectNuclearTreaty(inspector,subject,treatyId,{currentTick=null,rng=Math.random}={}){
  const m=ensureNuclearArmsControl(subject).treaties[treatyId];if(!m||m.status==='withdrawn')return{performed:false,reason:'no_active_treaty'};
  const c=nuclearTreatyConstraints(subject),delivery=ensureStrategicDelivery(subject),weapons=ensureNuclearWeaponState(subject);
  const land=delivery.land.fixedLaunchers+delivery.land.mobileLaunchers;
  const sea=delivery.sea.platformIds.length;
  const violations=[];
  if(c.prohibitAcquisition&&weapons.prototypeCount>0)violations.push('prohibited_nuclear_acquisition');
  if(c.prohibitTesting&&weapons.tests?.some(t=>t.completed&&(!m.joinedTick||t.tick>=m.joinedTick)))violations.push('prohibited_nuclear_test');
  if(c.maxLandLaunchers!=null&&land>c.maxLandLaunchers)violations.push('land_launcher_ceiling');
  if(c.maxStrategicSubmarines!=null&&sea>c.maxStrategicSubmarines)violations.push('strategic_submarine_ceiling');
  if(c.maxPrototypes!=null&&weapons.prototypeCount>c.maxPrototypes)violations.push('prototype_ceiling');
  if(c.prohibitForeignNuclearBasing&&Object.values(subject.nuclearAlliance?.deployments||{}).some(d=>d.role==='host'&&d.status==='active'))violations.push('foreign_nuclear_basing_prohibited');
  const concealment=clamp(weapons.policy?.secrecy??.5);
  const capability=clamp((inspector?.nuclearArmsControl?.verificationCapacity??.35)*.35+c.verification*.35+c.inspectionAccess*.3);
  const detectChance=clamp(.08+capability*.82-concealment*.42);
  const detected=violations.filter(()=>rng()<detectChance);
  m.lastInspectionTick=currentTick;m.suspicion=clamp(m.suspicion+(violations.length-detected.length)*.08-(detected.length?.03:.08));
  m.detectedViolations+=detected.length;
  return{performed:true,violations,detected,detectChance,clean:violations.length===0};
}

function applyCompliantReductions(region,currentTick,elapsedDays,memberships=null,constraints=null){
  const events=[],years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  if(years<=0)return events;
  memberships ||= activeTreaties(region);
  if(!memberships.length||!memberships.every(m=>m.compliance===COMPLIANCE_POSTURES.COMPLY||m.status==='withdrawing'))return events;
  constraints ||= constraintsFromMemberships(memberships);
  if(constraints.maxLandLaunchers!=null){
    const delivery=ensureStrategicDelivery(region),landTotal=delivery.land.fixedLaunchers+delivery.land.mobileLaunchers;
    if(landTotal>constraints.maxLandLaunchers){
      const remove=Math.min(landTotal-constraints.maxLandLaunchers,Math.max(1,Math.floor(years*8)));
      let left=remove;const fromFixed=Math.min(left,delivery.land.fixedLaunchers);delivery.land.fixedLaunchers-=fromFixed;left-=fromFixed;delivery.land.mobileLaunchers=Math.max(0,delivery.land.mobileLaunchers-left);events.push({type:'nuclear_disarmament',regionId:region.id,tick:currentTick,category:'land_launchers',removed:remove});
    }
  }
  if(constraints.maxPrototypes!=null){
    const weapons=ensureNuclearWeaponState(region);
    if(weapons.prototypeCount>constraints.maxPrototypes){const remove=Math.min(weapons.prototypeCount-constraints.maxPrototypes,Math.max(1,Math.floor(years*2)));weapons.prototypeCount-=remove;events.push({type:'nuclear_disarmament',regionId:region.id,tick:currentTick,category:'prototype_devices',removed:remove});}
  }
  return events;
}

export function tickNuclearArmsControl(regions,currentTick,elapsedDays=7){
  const events=[],world=regions||[],statusByRegion=new Map(),strikeByRegion=new Map(),actorBest=new Map();
  const rankedThreats=measureActivePerformanceDetail('Nuclear arms control · strategic context',()=>{
    const ranked=[];
    for(const region of world){
      const status=nuclearDeterrentStatus(region),strike=secondStrikeAssessment(region,{fleets:region.fleets||[]}),entry={region,actorKey:actorKey(region),base:strategicThreatBase(status,strike)};
      statusByRegion.set(region,status);strikeByRegion.set(region,strike);ranked.push(entry);insertActorBest(actorBest,entry.actorKey,entry);
    }
    ranked.sort((a,b)=>b.base-a.base);
    return ranked;
  });
  const context={statusByRegion,strikeByRegion,actorBest,rankedThreats,defaultCandidatesScanned:0,explicitRelationshipsEvaluated:0};
  let activeMemberships=0;

  measureActivePerformanceDetail('Nuclear arms control · rival decisions',()=>{
    for(const region of world){
      const s=ensureNuclearArmsControl(region);
      for(const m of Object.values(s.treaties)){if(m.status==='withdrawing'&&Number.isFinite(m.withdrawalEffectiveTick)&&currentTick>=m.withdrawalEffectiveTick){m.status='withdrawn';events.push({type:'nuclear_treaty_withdrawal_effective',regionId:region.id,treatyId:m.id,tick:currentTick});}}
      const memberships=activeTreatiesFromState(s);activeMemberships+=memberships.length;
      const constraints=constraintsFromMemberships(memberships);
      npcStrategicArmsDecision(region,{rivals:world,currentTick,context,memberships,constraints});
      events.push(...applyCompliantReductions(region,currentTick,elapsedDays,memberships,constraints));
    }
  });

  recordActivePerformanceMetric('Nuclear arms control active treaty memberships',activeMemberships);
  recordActivePerformanceMetric('Nuclear arms control explicit rival relationships',context.explicitRelationshipsEvaluated);
  recordActivePerformanceMetric('Nuclear arms control default rival candidates scanned',context.defaultCandidatesScanned);
  return events;
}
