import { militaryExperienceProfile, officerSchoolStatus } from './professionalisation.js?v=20260908-prof1';
import { BREECH_ARTILLERY_TECH_ID, QUICK_FIRE_ARTILLERY_TECH_ID, HEAVY_HOWITZER_TECH_ID } from './modernLandWarfare.js?v=20260918-modern-war1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export function ensureArtilleryFireControl(region){
  region.artilleryFireControl ||= {};
  const s=region.artilleryFireControl;
  const defaults={rangeFinding:0,survey:0,fireDirection:0,predictedFire:0,aerialObservationIntegration:0,counterBattery:0,targetIntelligence:0,combatWeeks:0,lessonsCaptured:0};
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

export function artilleryFireControlProfile(region,defender,{currentTick=null,weeksEngaged=0}={}){
  const s=ensureArtilleryFireControl(region), obs=artilleryObservationProfile(region,defender,currentTick);
  const breech=has(region,BREECH_ARTILLERY_TECH_ID), quick=has(region,QUICK_FIRE_ARTILLERY_TECH_ID), heavy=has(region,HEAVY_HOWITZER_TECH_ID);
  if(!breech) return {effectiveRangeKm:3.5,rangeMultiplier:1,precision:0,combatMultiplier:1,observation:obs,counterBatteryEffect:0,commandStrikeChance:0,commandDisruption:0,logisticsInterdiction:0};
  const baseRangeKm=heavy?12:quick?8:6;
  const technique=clamp(s.rangeFinding*.22+s.survey*.20+s.fireDirection*.22+s.predictedFire*.18+s.targetIntelligence*.18);
  const rangeMultiplier=1+technique*.42+(heavy?s.predictedFire*.16:0);
  const effectiveRangeKm=baseRangeKm*rangeMultiplier;
  const precision=clamp(.10+s.rangeFinding*.18+s.survey*.17+s.fireDirection*.20+s.predictedFire*.20+obs.ground*.12+obs.aerial*(.12+s.aerialObservationIntegration*.10));
  const combatMultiplier=1+Math.min(.16,precision*.08+technique*.07);
  const counterBatteryEffect=clamp((s.counterBattery*.42+s.fireDirection*.20+obs.ground*.16+obs.aerial*.28)*(quick?.85:.62));
  // Aircraft do something ground maps cannot: repeatedly reveal batteries, headquarters,
  // road columns and other targets hidden behind the front. Keep this distinct from accuracy.
  const commandStrikeChance=clamp((precision-.32)*.34+obs.ground*.12+obs.aerial*(.28+s.aerialObservationIntegration*.12)+s.targetIntelligence*.10,0,.56);
  const commandDisruption=clamp(commandStrikeChance*(.30+s.predictedFire*.24+s.fireDirection*.22));
  const logisticsInterdiction=clamp((precision*.28+obs.ground*.16+obs.aerial*.30+s.predictedFire*.20)*(.45+(heavy?.25:0)+(quick?.15:0)));
  return {effectiveRangeKm,rangeMultiplier,precision,combatMultiplier,observation:obs,counterBatteryEffect,commandStrikeChance,commandDisruption,logisticsInterdiction,technique,weeksEngaged};
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
  if(enemyArtillery>0) s.counterBattery=clamp(s.counterBattery+learn*(.45+obs.combined*.55)*(1-s.counterBattery));
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
