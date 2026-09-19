import { militaryExperienceProfile, officerSchoolStatus } from './professionalisation.js?v=20260908-prof1';
import { BREECH_ARTILLERY_TECH_ID, QUICK_FIRE_ARTILLERY_TECH_ID, HEAVY_HOWITZER_TECH_ID } from './modernLandWarfare.js?v=20260918-modern-war1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export function ensureArtilleryFireControl(region){
  region.artilleryFireControl ||= {};
  const s=region.artilleryFireControl;
  const defaults={rangeFinding:0,survey:0,fireDirection:0,predictedFire:0,aerialObservationIntegration:0,counterBattery:0,soundRanging:0,counterBatteryRadar:0,targetIntelligence:0,combatWeeks:0,lessonsCaptured:0};
  for(const [k,v] of Object.entries(defaults)) if(!Number.isFinite(s[k])) s[k]=v;
  return s;
}

function institution(region){
  const p=militaryExperienceProfile(region,null);
  return clamp(.12+p.institutional*.42+(officerSchoolStatus(region).active?.18:0)+(region.massEducation?.literacy||0)*.14+(region.governance?.administrativeControl||0)*.14);
}

export function artilleryObservationProfile(attacker,defender,currentTick=null){
  const recon=attacker?.airRecon?.[defender?.id];
  const age=currentTick==null||!Number.isFinite(recon?.observedTick)?0:Math.max(0,currentTick-recon.observedTick);
  const freshness=Math.exp(-age/6);
  const aerial=clamp((recon?.confidence||0)*freshness);
  const telephone=clamp(attacker?.telephone?.militaryCoordination||attacker?.telephone?.service||0);
  const s=ensureArtilleryFireControl(attacker);
  const ground=clamp(s.targetIntelligence*.45+s.survey*.25+telephone*.30);
  return { aerial, ground, combined:clamp(1-(1-aerial)*(1-ground)) };
}

export function artilleryFireControlProfile(region,defender,{currentTick=null,weeksEngaged=0,train=[]}={}){
  const s=ensureArtilleryFireControl(region), obs=artilleryObservationProfile(region,defender,currentTick);
  const breech=has(region,BREECH_ARTILLERY_TECH_ID), quick=has(region,QUICK_FIRE_ARTILLERY_TECH_ID), heavy=has(region,HEAVY_HOWITZER_TECH_ID);
  if(!breech) return {effectiveRangeKm:3.5,rangeMultiplier:1,precision:0,combatMultiplier:1,observation:obs,counterBatteryEffect:0,commandStrikeChance:0,commandDisruption:0,logisticsInterdiction:0};
  const designed=(train||[]).filter(g=>g?.designStats);
  const avg=(key,fallback)=>designed.length?designed.reduce((sum,g)=>sum+(Number(g.designStats?.[key])||fallback),0)/designed.length:fallback;
  // Physical gun design sets the range/accuracy ceiling. Better doctrine cannot turn
  // a 1914 tube into a later-generation weapon; it only exploits what the hardware can do.
  const baseRangeKm=avg('rangeKm',heavy?5.5:quick?4.8:4.0);
  const intrinsicAccuracy=avg('intrinsicAccuracy',.28);
  const fireControlPotential=avg('fireControlPotential',.30);
  const technique=clamp(s.rangeFinding*.22+s.survey*.20+s.fireDirection*.22+s.predictedFire*.18+s.targetIntelligence*.18);
  const rangeMultiplier=1+technique*(.18+.24*fireControlPotential)+(heavy?s.predictedFire*.08*fireControlPotential:0);
  const effectiveRangeKm=baseRangeKm*rangeMultiplier;
  const precision=clamp(intrinsicAccuracy*.46+s.rangeFinding*.13+s.survey*.13+s.fireDirection*.15+s.predictedFire*.14*fireControlPotential+obs.ground*.10+obs.aerial*(.12+s.aerialObservationIntegration*.10));
  const combatMultiplier=1+Math.min(.16,precision*.08+technique*.07);
  const counterBatteryEffect=clamp((s.counterBattery*.42+s.fireDirection*.20+obs.ground*.16+obs.aerial*.28)*(quick?.85:.62));
  // Aircraft do something ground maps cannot: repeatedly reveal batteries, headquarters,
  // road columns and other targets hidden behind the front. Keep this distinct from accuracy.
  const commandStrikeChance=clamp((precision-.32)*.34+obs.ground*.12+obs.aerial*(.28+s.aerialObservationIntegration*.12)+s.targetIntelligence*.10,0,.56);
  const commandDisruption=clamp(commandStrikeChance*(.30+s.predictedFire*.24+s.fireDirection*.22));
  const logisticsInterdiction=clamp((precision*.28+obs.ground*.16+obs.aerial*.30+s.predictedFire*.20)*(.45+(heavy?.25:0)+(quick?.15:0)));
  return {effectiveRangeKm,rangeMultiplier,precision,combatMultiplier,observation:obs,counterBatteryEffect,commandStrikeChance,commandDisruption,logisticsInterdiction,technique,weeksEngaged};
}

export function artilleryTargetExposure(train=[]){
  if(!train?.length)return{mobility:0,rapidSalvo:0,exposure:.72};
  const mobility=train.reduce((s,g)=>s+clamp(g?.designStats?.mobility??.3),0)/train.length;
  const rapidSalvo=train.reduce((s,g)=>s+clamp(g?.designStats?.salvoDensity??g?.designStats?.rateOfFire??.15),0)/train.length;
  const exposure=clamp(.78-mobility*.62-rapidSalvo*.24,.035,.78);
  return{mobility,rapidSalvo,exposure};
}

export function counterBatteryTargetability(attacker,defender,targetTrain=[],currentTick=null){
  const obs=artilleryObservationProfile(attacker,defender,currentTick),s=ensureArtilleryFireControl(attacker),target=artilleryTargetExposure(targetTrain);
  const known=clamp(attacker?.artilleryIntelligence?.[defender?.id]?.confidence||0);
  const sound=clamp(s.soundRanging||0),radar=clamp(s.counterBatteryRadar||0);
  const activeAcquisition=clamp(1-(1-obs.aerial)*(1-known)*(1-sound*.80)*(1-radar));
  const background=clamp(obs.ground*.18+s.counterBattery*.08);
  const targetability=clamp(target.exposure*.10+activeAcquisition*(.30+.70*target.exposure)+background*target.exposure*.22);
  return{...target,activeAcquisition,background,targetability,observation:obs};
}

export function resolveCounterBatteryFire(attacker,defender,attackerProfile,targetTrain=[],{bombardment=0,rng=Math.random,currentTick=0}={}){
  if(!targetTrain?.length)return{targetability:0,engaged:0,damaged:0,destroyed:0};
  const acquisition=counterBatteryTargetability(attacker,defender,targetTrain,currentTick);
  const fire=clamp(attackerProfile?.counterBatteryEffect||0)*clamp(bombardment)*acquisition.targetability;
  let engaged=0,damaged=0,destroyed=0;
  for(const gun of targetTrain){
    const condition=clamp(gun?.condition??1,0,1);if(condition<=.02)continue;
    const hitChance=clamp(fire*(.36+.28*clamp(attackerProfile?.precision||0)),0,.62);
    if(rng()>=hitChance)continue;engaged++;
    const damage=clamp(.08+fire*.34+rng()*.18,.05,.48);gun.condition=clamp(condition-damage,0,1);damaged++;if(gun.condition<=.08)destroyed++;
  }
  return{...acquisition,fire,engaged,damaged,destroyed};
}

export function resolveArtilleryTargeting(attacker,defender,profile,{bombardment=0,rng=Math.random,currentTick=0}={}){
  const active=clamp(bombardment);
  if(active<=0||profile.precision<=0) return {commandHit:false,commandMultiplier:1,logisticsMultiplier:1,counterBatteryMultiplier:1};
  const commandChance=clamp(profile.commandStrikeChance*active);
  const commandHit=rng()<commandChance;
  const commandSeverity=commandHit?clamp(.10+profile.commandDisruption*.55):0;
  const logisticsSeverity=clamp(profile.logisticsInterdiction*active*.24);
  const counterBatterySeverity=clamp(profile.counterBatteryEffect*active*.32);
  if(commandHit){
    defender.warDamage ||= {infrastructureDamage:0,bombardmentWeeks:0};
    defender.warDamage.commandPostHits=(defender.warDamage.commandPostHits||0)+1;
    defender.warDamage.lastCommandPostHitTick=currentTick;
  }
  return {
    commandHit,
    commandStrikeChance:commandChance,
    commandSeverity,
    commandMultiplier:1-commandSeverity,
    logisticsSeverity,
    logisticsMultiplier:1-logisticsSeverity,
    counterBatterySeverity,
    counterBatteryMultiplier:1-counterBatterySeverity,
  };
}

export function recordArtilleryFireControlLessons(region,defender,{currentTick=0,intensity=0,bombardment=0,enemyArtillery=0}={}){
  const s=ensureArtilleryFireControl(region);
  if(!has(region,BREECH_ARTILLERY_TECH_ID)) return s;
  const inst=institution(region), obs=artilleryObservationProfile(region,defender,currentTick), practice=clamp(.18+intensity*10+bombardment*.65);
  const learn=(.0035+practice*.010)*(.58+inst*.72);
  s.rangeFinding=clamp(s.rangeFinding+learn*1.00*(1-s.rangeFinding));
  s.survey=clamp(s.survey+learn*.82*(1-s.survey));
  s.fireDirection=clamp(s.fireDirection+learn*.78*(1-s.fireDirection));
  s.targetIntelligence=clamp(s.targetIntelligence+learn*(.55+obs.combined*.55)*(1-s.targetIntelligence));
  if(has(region,QUICK_FIRE_ARTILLERY_TECH_ID)) s.predictedFire=clamp(s.predictedFire+learn*.62*(1-s.predictedFire));
  if(obs.aerial>0.05) s.aerialObservationIntegration=clamp(s.aerialObservationIntegration+learn*(.45+obs.aerial)*(1-s.aerialObservationIntegration));
  if(enemyArtillery>0){
    s.counterBattery=clamp(s.counterBattery+learn*(.45+obs.combined*.55)*(1-s.counterBattery));
    s.soundRanging=clamp(s.soundRanging+learn*.34*(1-s.soundRanging));
  }
  s.lessonsCaptured=clamp(s.lessonsCaptured+learn*.55);
  s.combatWeeks+=1;
  return s;
}

export function tickArtilleryFireControl(regions,elapsedDays=7){
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  for(const region of regions||[]){
    const s=ensureArtilleryFireControl(region);
    if(!has(region,BREECH_ARTILLERY_TECH_ID)||s.lessonsCaptured<=0.02) continue;
    const inst=institution(region), study=years*(.006+inst*.018)*s.lessonsCaptured;
    s.survey=clamp(s.survey+study*.72*(1-s.survey));
    s.fireDirection=clamp(s.fireDirection+study*.66*(1-s.fireDirection));
    s.predictedFire=clamp(s.predictedFire+study*.48*(1-s.predictedFire));
    s.targetIntelligence=clamp(s.targetIntelligence+study*.52*(1-s.targetIntelligence));
  }
}
