import { nuclearDeterrentStatus } from './nuclearWeaponisation.js?v=20260923-nuclear-hotpath1';
import { tickStrategicWarnings } from '../diplomacy/strategicWarning.js?v=20260922-warning1';
import { measureActivePerformanceDetail, recordActivePerformanceMetric } from '../core/performanceProfiler.js?v=20260912-deep-profiler1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=(v)=>Math.max(0,Number(v)||0);

export const NUCLEAR_ALERT_POSTURES=Object.freeze({LOW:'low',NORMAL:'normal',HIGH:'high',HAIR_TRIGGER:'hair_trigger'});
export const NUCLEAR_DOCTRINES=Object.freeze({NO_FIRST_USE:'no_first_use',RETALIATORY:'retaliatory',AMBIGUOUS:'ambiguous',FIRST_USE:'first_use'});

const ALERT_LEVEL=Object.freeze({low:.12,normal:.35,high:.68,hair_trigger:.95});
const DOCTRINE_RISK=Object.freeze({no_first_use:.10,retaliatory:.28,ambiguous:.58,first_use:.85});

function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||region?.id||null;}

export function ensureNuclearRiskState(region){
  region.nuclearRisk||={};
  const s=region.nuclearRisk;
  s.policy||={};
  if(!Object.values(NUCLEAR_ALERT_POSTURES).includes(s.policy.alertPosture))s.policy.alertPosture=NUCLEAR_ALERT_POSTURES.NORMAL;
  if(!Object.values(NUCLEAR_DOCTRINES).includes(s.policy.doctrine))s.policy.doctrine=NUCLEAR_DOCTRINES.RETALIATORY;
  for(const [key,value] of Object.entries({
    launchOnWarning:.15,
    delegatedRelease:.05,
    commandReliability:.72,
    earlyWarningQuality:.55,
    forceSurvivability:.35,
    dispersal:.30,
    armsControlConfidence:.20,
    crisisHotline:.20,
  }))if(!Number.isFinite(s.policy[key]))s.policy[key]=value;
  for(const [key,value] of Object.entries({
    nuclearPower:false,
    destructiveCapacity:0,
    secureSecondStrike:0,
    firstStrikeVulnerability:0,
    crisisPressure:0,
    multipolarPressure:0,
    accidentRisk:0,
    miscalculationRisk:0,
    commandRisk:0,
    deterrenceStability:0,
    annualCatastrophicExchangeRisk:0,
    durableControlMargin:0,
  }))if(typeof value==='boolean'?typeof s[key]!=='boolean':!Number.isFinite(s[key]))s[key]=value;
  return s;
}

export function setNuclearRiskPolicy(region,patch={}){
  const s=ensureNuclearRiskState(region);
  if(patch.alertPosture&&Object.values(NUCLEAR_ALERT_POSTURES).includes(patch.alertPosture))s.policy.alertPosture=patch.alertPosture;
  if(patch.doctrine&&Object.values(NUCLEAR_DOCTRINES).includes(patch.doctrine))s.policy.doctrine=patch.doctrine;
  for(const key of ['launchOnWarning','delegatedRelease','commandReliability','earlyWarningQuality','forceSurvivability','dispersal','armsControlConfidence','crisisHotline']){
    if(Number.isFinite(patch[key]))s.policy[key]=clamp(patch[key]);
  }
  return {...s.policy};
}

function destructiveCapacity(region){
  // Read-only hot path. Do not initialise nuclear/strategic state merely to
  // discover that a dormant region has zero destructive capacity.
  const weapons=region?.nuclearWeapons;
  const operational=nonNegative(region?.nuclearForces?.operationalWarheads||weapons?.operationalWarheads||0);
  const reserve=nonNegative(region?.nuclearForces?.reserveWarheads||0);
  const explicit=clamp(Math.log1p(operational+reserve)/Math.log(501));
  const status=nuclearDeterrentStatus(region);
  const demonstrated=status==='demonstrated_device_capability'?.22:status==='untested_device_capability'?.10:0;
  return clamp(Math.max(explicit,demonstrated,clamp(weapons?.prototypeCount||0)*.08));
}

function observedWarningPressure(region){
  const warnings=(region.strategicWarning?.incidents||[]).filter(i=>i.status==='unresolved');
  if(!warnings.length)return 0;
  const claims=new Map((region.informationIntegrity?.incidents||[]).map(i=>[i.id,i]));
  let pressure=0;
  for(const warning of warnings){
    const claim=claims.get(warning.publicClaimId);
    const confidence=clamp(claim?.assessment?.confidence??warning.sensorConfidence??0);
    const typeWeight=warning.type==='missile_launch'?1:warning.type==='airspace_incursion'?.72:warning.type==='naval_incident'?.62:warning.type==='border_incident'?.58:.42;
    pressure=Math.max(pressure,confidence*typeWeight);
  }
  return clamp(pressure);
}

function crisisPressureFor(region,activeWars=[]){
  const id=polityId(region);
  let pressure=clamp(region.strategicCrisisPressure||region.internationalCrisis?.pressure||0);
  for(const war of activeWars||[]){
    const participants=new Set([
      ...(war.participantPolityIds||[]),...(war.attackerPolityIds||[]),...(war.defenderPolityIds||[]),
      war.attackerPolityId,war.defenderPolityId,war.attackerId,war.defenderId,
    ].filter(Boolean));
    if(participants.has(id)||participants.has(region.id))pressure=Math.max(pressure,.72);
  }
  pressure=Math.max(pressure,clamp(region.hostilityPressure||region.militaryStrategy?.threatPressure||0)*.75);
  pressure=Math.max(pressure,observedWarningPressure(region));
  return clamp(pressure);
}

function secondStrike(region,s){
  const p=s.policy;
  const strategicAi=region.strategicAi?.effects||{};
  const aiResilience=clamp(strategicAi.secondStrikeResilience||0);
  const submarine=clamp(region.submarineForce?.strategicSurvivability||region.nuclearForces?.submarineSurvivability||0);
  const mobile=clamp(region.nuclearForces?.mobileSurvivability||0);
  const hardened=clamp(region.nuclearForces?.hardening||0);
  const physical=clamp(p.forceSurvivability*.42+p.dispersal*.23+submarine*.16+mobile*.11+hardened*.08);
  return clamp(physical*.76+aiResilience*.24);
}

function commandQuality(region,s){
  const ai=region.strategicAi?.effects||{};
  const warning=clamp(Math.max(s.policy.earlyWarningQuality,ai.warningQuality||0));
  const filtering=clamp(ai.falseAlarmFiltering||0);
  const reliability=clamp(s.policy.commandReliability);
  return {warning,filtering,reliability,quality:clamp(reliability*.52+warning*.28+filtering*.20)};
}

export function assessNuclearWarRisk(region,context={}){
  const s=ensureNuclearRiskState(region),p=s.policy;
  const capacity=context.capacityByRegion?.get(region)??destructiveCapacity(region);
  const nuclearPower=capacity>0;
  const nuclearPowers=Number.isFinite(context.nuclearPowerCount)
    ? context.nuclearPowerCount
    : (context.regions||[]).filter(r=>destructiveCapacity(r)>0).length;
  const crisis=crisisPressureFor(region,context.activeWars||[]);
  const second=secondStrike(region,s);
  const vulnerability=clamp(1-second);
  const cmd=commandQuality(region,s);
  const alert=ALERT_LEVEL[p.alertPosture]??ALERT_LEVEL.normal;
  const doctrine=DOCTRINE_RISK[p.doctrine]??DOCTRINE_RISK.retaliatory;
  const lowHuman=clamp(1-(region.strategicAi?.effects?.humanReleaseAuthority??1));
  const aiCommandRisk=clamp(region.strategicAi?.effects?.commandRisk||0);
  const launchOnWarning=clamp(p.launchOnWarning);
  const delegated=clamp(p.delegatedRelease);
  const safeguards=clamp(cmd.quality*(1-delegated*.30)*(1-lowHuman*.22));

  const accident=clamp(capacity*(.002+.018*alert+.026*launchOnWarning+.020*delegated)*(1-safeguards*.78)+aiCommandRisk*.035);
  const miscalc=clamp(capacity*crisis*(.015+.050*alert+.060*launchOnWarning+.025*doctrine)*(1-cmd.filtering*.38)*(1-p.crisisHotline*.32));
  const firstStrikePressure=clamp(capacity*crisis*vulnerability*(.020+.045*doctrine+.035*alert));
  const multipolar=nuclearPower?clamp(Math.max(0,nuclearPowers-2)/6):0;
  const armsControl=clamp(p.armsControlConfidence);
  const deterrence=clamp(second*(.42+.36*capacity)+safeguards*.22-crisis*.20-launchOnWarning*.13-multipolar*.08);

  const base=accident+miscalc+firstStrikePressure+aiCommandRisk*capacity*.025+multipolar*capacity*.008;
  const stabilisers=clamp(.15+deterrence*.48+armsControl*.20+p.crisisHotline*.10+(p.doctrine===NUCLEAR_DOCTRINES.NO_FIRST_USE?.07:0));
  const annualRisk=nuclearPower?clamp(base*(1-stabilisers),0,.35):0;

  Object.assign(s,{
    nuclearPower,destructiveCapacity:capacity,secureSecondStrike:second,firstStrikeVulnerability:vulnerability,
    crisisPressure:crisis,multipolarPressure:multipolar,accidentRisk:accident,miscalculationRisk:miscalc,
    commandRisk:aiCommandRisk,deterrenceStability:deterrence,annualCatastrophicExchangeRisk:annualRisk,
    durableControlMargin:clamp(1-annualRisk/.002),
  });
  return s;
}

export function tickNuclearWarRisk(regions,activeWars=[],currentTick=0,elapsedDays=7,rng=Math.random){
  const events=[];
  const world=regions||[];
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const {capacityByRegion,nuclearPowerCount}=measureActivePerformanceDetail('Nuclear economy · capability index',()=>{
    const capacityByRegion=new Map();let nuclearPowerCount=0;
    for(const region of world){const capacity=destructiveCapacity(region);capacityByRegion.set(region,capacity);if(capacity>0)nuclearPowerCount++;}
    return {capacityByRegion,nuclearPowerCount};
  });
  recordActivePerformanceMetric('Nuclear economy regions evaluated',world.length);
  recordActivePerformanceMetric('Nuclear economy nuclear powers',nuclearPowerCount);
  measureActivePerformanceDetail('Nuclear economy · risk assessment',()=>{
    const context={regions:world,activeWars,capacityByRegion,nuclearPowerCount};
    for(const region of world){
      const previous=ensureNuclearRiskState(region).annualCatastrophicExchangeRisk;
      const s=assessNuclearWarRisk(region,context);
      region.report||={};
      region.report.nuclearRisk=nuclearRiskSummary(region);
      if(!s.nuclearPower)continue;
      const crossedHigh=previous<.01&&s.annualCatastrophicExchangeRisk>=.01;
      const materiallyWorse=s.annualCatastrophicExchangeRisk>=.004&&s.annualCatastrophicExchangeRisk>Math.max(previous*1.5,previous+.002);
      if(crossedHigh||materiallyWorse){
        events.push({type:'nuclear_risk_warning',regionId:region.id,regionName:region.name,polityId:polityId(region),tick:currentTick,playerRelevant:false,
          title:'Nuclear command risk rising',message:`${region.name}'s nuclear posture is becoming less stable as crisis, alert and command pressures reinforce one another.`});
      }
      s.periodExchangeProbability=clamp(1-Math.pow(1-s.annualCatastrophicExchangeRisk,years));
      s.riskSample=(rng?.()??Math.random());
    }
  });
  events.push(...measureActivePerformanceDetail('Nuclear economy · strategic warnings',()=>tickStrategicWarnings(world,currentTick,elapsedDays,rng)));
  return events;
}

export function nuclearRiskSummary(region){
  const s=ensureNuclearRiskState(region);
  return {
    nuclearPower:s.nuclearPower,
    destructiveCapacity:s.destructiveCapacity,
    secureSecondStrike:s.secureSecondStrike,
    firstStrikeVulnerability:s.firstStrikeVulnerability,
    crisisPressure:s.crisisPressure,
    accidentRisk:s.accidentRisk,
    miscalculationRisk:s.miscalculationRisk,
    commandRisk:s.commandRisk,
    deterrenceStability:s.deterrenceStability,
    annualCatastrophicExchangeRisk:s.annualCatastrophicExchangeRisk,
    durableControlMargin:s.durableControlMargin,
    policy:{...s.policy},
  };
}
