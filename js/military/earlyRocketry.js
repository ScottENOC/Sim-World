const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const EARLY_ROCKETRY_TECH_ID='early_rocketry';
export const ROCKET_ARTILLERY_TECH_ID='rocket_artillery';
export const IMPROVED_ROCKET_PROPELLANT_TECH_ID='improved_rocket_propellant';
export const ROCKET_STABILISATION_TECH_ID='rocket_stabilisation';
export const ROCKET_LAUNCHER_SYSTEMS_TECH_ID='rocket_launcher_systems';

export function rocketArtilleryFrontier(region){
  if(!has(region,EARLY_ROCKETRY_TECH_ID))return null;
  const c=region.industrialPlants?.componentCapability||{};
  const precision=clamp(region.industrialSupply?.capability?.precision_machining||0),steel=clamp(region.steelIndustry?.readiness||0),chem=clamp(region.industrialSupply?.capability?.industrial_chemistry||region.structuralTransformation?.capability?.chemicals||0),chassis=clamp(c.wheeled_chassis||0),gun=clamp(c.gun_system||0),manufacture=clamp(region.structuralTransformation?.capability?.manufacture||0);
  const propellant=clamp(.18+chem*.28+manufacture*.12+(has(region,IMPROVED_ROCKET_PROPELLANT_TECH_ID)?.25:0));
  const casing=clamp(.20+steel*.22+precision*.26+gun*.12+manufacture*.12);
  const stabilisation=clamp(.06+precision*.18+manufacture*.10+(has(region,ROCKET_STABILISATION_TECH_ID)?.38:0));
  const launcher=clamp(.10+chassis*.20+manufacture*.20+(has(region,ROCKET_LAUNCHER_SYSTEMS_TECH_ID)?.35:0));
  const reliability=clamp(.30+propellant*.20+casing*.28+launcher*.14+stabilisation*.08);
  const rangeKm=2.4*(1+propellant*.95+casing*.35+stabilisation*.22);
  const intrinsicAccuracy=clamp(.05+stabilisation*.34+precision*.10+launcher*.08);
  const salvoDensity=clamp(.24+launcher*.46+manufacture*.12);
  const firepower=clamp(.28+propellant*.20+casing*.14+salvoDensity*.30);
  const mobility=clamp(.40+chassis*.34+launcher*.12);
  return {family:'rocket_artillery',rangeKm,intrinsicAccuracy,reliability,salvoDensity,firepower,mobility,propellantConsistency:propellant,casingQuality:casing,stabilisation,launcherQuality:launcher,areaWeapon:true,guided:false};
}

export function rocketArtilleryCombatProfile(region,{launchers=0,logisticsSupply=1,elapsedDays=7,consumeSupplies=true}={}){
  const frontier=rocketArtilleryFrontier(region);if(!frontier||!has(region,ROCKET_ARTILLERY_TECH_ID)||launchers<=0)return{combatMultiplier:1,bombardment:0,areaSuppression:0,precision:0,ammoSupply:1,rocketsUsed:0,rangeKm:0};
  const weeks=Math.max(.1,elapsedDays/7),needed=launchers*(.45+.85*frontier.salvoDensity)*weeks;
  const available=Math.max(0,region.stockpile?.artillery_rockets||0),ammoSupply=Math.min(clamp(logisticsSupply),needed>0?clamp(available/needed):1);
  const rocketsUsed=needed*ammoSupply;if(consumeSupplies&&rocketsUsed>0)region.stockpile.artillery_rockets=Math.max(0,available-rocketsUsed);
  const effective=clamp(ammoSupply*frontier.reliability);
  return {combatMultiplier:1+Math.min(.12,launchers*.008*effective),bombardment:clamp(frontier.firepower*frontier.salvoDensity*effective),areaSuppression:clamp(frontier.salvoDensity*effective*(1-frontier.intrinsicAccuracy*.25)),precision:frontier.intrinsicAccuracy,ammoSupply,rocketsUsed,rangeKm:frontier.rangeKm,reliability:frontier.reliability,salvoDensity:frontier.salvoDensity};
}

export function rocketArtilleryTargetingBonus(region,fireControlProfile={}){
  const f=rocketArtilleryFrontier(region);if(!f)return{effectiveRangeKm:0,precision:0,areaSuppression:0};
  const observation=clamp(fireControlProfile?.observation?.combined||0),technique=clamp(fireControlProfile?.technique||0);
  return {effectiveRangeKm:f.rangeKm*(1+technique*.08),precision:clamp(f.intrinsicAccuracy+observation*.08+technique*.07),areaSuppression:clamp(f.salvoDensity*(1+.12*technique))};
}
