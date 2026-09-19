import { ensureConstruction } from '../economy/construction.js?v=20260918-modern-war1';
import { damageInfrastructure } from './infrastructureDamage.js?v=20260918-modern-war1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const BREECH_RIFLE_TECH_ID='breech_loading_rifles';
export const MAGAZINE_RIFLE_TECH_ID='magazine_rifles';
export const SMOKELESS_POWDER_TECH_ID='smokeless_powder';
export const MACHINE_GUN_TECH_ID='machine_guns';
export const FIELD_ENTRENCHMENT_TECH_ID='field_entrenchment';
export const BREECH_ARTILLERY_TECH_ID='breech_loading_artillery';
export const QUICK_FIRE_ARTILLERY_TECH_ID='quick_firing_artillery';
export const HEAVY_HOWITZER_TECH_ID='heavy_howitzers';
export const EARLY_ROCKETRY_TECH_ID='early_rocketry';
export const ROCKET_ARTILLERY_TECH_ID='rocket_artillery';
export const IMPROVED_ROCKET_PROPELLANT_TECH_ID='improved_rocket_propellant';
export const ROCKET_STABILISATION_TECH_ID='rocket_stabilisation';
export const ROCKET_LAUNCHER_SYSTEMS_TECH_ID='rocket_launcher_systems';

const TECHS=[
 {id:BREECH_RIFLE_TECH_ID,prereq:['rifling','steelmaking'],base:0.000018,label:'Breech-loading rifles'},
 {id:FIELD_ENTRENCHMENT_TECH_ID,prereq:['rifling','military_drill'],base:0.000026,label:'Modern field entrenchment'},
 {id:BREECH_ARTILLERY_TECH_ID,prereq:['rifling','steelmaking','gunpowder'],base:0.000014,label:'Breech-loading artillery'},
 {id:MAGAZINE_RIFLE_TECH_ID,prereq:[BREECH_RIFLE_TECH_ID],base:0.000015,label:'Magazine rifles'},
 {id:SMOKELESS_POWDER_TECH_ID,prereq:[BREECH_RIFLE_TECH_ID,'steelmaking'],base:0.000011,label:'Smokeless powder'},
 {id:HEAVY_HOWITZER_TECH_ID,prereq:[BREECH_ARTILLERY_TECH_ID,'steelmaking'],base:0.000010,label:'Heavy howitzers'},
 {id:MACHINE_GUN_TECH_ID,prereq:[MAGAZINE_RIFLE_TECH_ID,'steelmaking'],base:0.000009,label:'Machine guns'},
 {id:QUICK_FIRE_ARTILLERY_TECH_ID,prereq:[BREECH_ARTILLERY_TECH_ID,SMOKELESS_POWDER_TECH_ID],base:0.000008,label:'Quick-firing artillery'},
 {id:EARLY_ROCKETRY_TECH_ID,prereq:['gunpowder'],base:0.000012,label:'Early military rocketry'},
 {id:ROCKET_ARTILLERY_TECH_ID,prereq:[EARLY_ROCKETRY_TECH_ID,'steelmaking'],base:0.000010,label:'Rocket artillery'},
 {id:IMPROVED_ROCKET_PROPELLANT_TECH_ID,prereq:[ROCKET_ARTILLERY_TECH_ID,SMOKELESS_POWDER_TECH_ID],base:0.000008,label:'Consistent rocket propellants'},
 {id:ROCKET_STABILISATION_TECH_ID,prereq:[ROCKET_ARTILLERY_TECH_ID,'precision_machining'],base:0.000007,label:'Stabilised artillery rockets'},
 {id:ROCKET_LAUNCHER_SYSTEMS_TECH_ID,prereq:[ROCKET_ARTILLERY_TECH_ID],base:0.000008,label:'Multiple rocket launcher systems'},
];

function connected(region,byId){
 const ids=new Set(region.neighbors||[]);
 for(const id of region.tradePartnerIds||[])ids.add(id);
 if(region.recentTradePartners?.keys)for(const id of region.recentTradePartners.keys())ids.add(id);
 return [...ids].map(id=>byId.get(id)).filter(Boolean);
}
function practice(region){
 const firearms=region.firearms||{};
 const artillery=region.earlyModernMilitary?.artillery||{};
 const guns=(artillery.inventory?.length||0)+(artillery.away?.length||0);
 const industry=clamp(region.steelIndustry?.readiness||0);
 return clamp((firearms.readiness||0)*.28+(firearms.riflingReadiness||0)*.22+(firearms.combatExperience||0)*.12+industry*.18+(1-Math.exp(-guns/8))*.20);
}
export function modernLandBreakthroughChance(region,tech,byId){
 if(has(region,tech.id)||!tech.prereq.every(id=>has(region,id)))return 0;
 const p=practice(region);
 const sources=connected(region,byId).filter(other=>has(other,tech.id)).length;
 return clamp(tech.base*(.25+p*1.75)+sources*.0014*(.2+p*.8),0,.02);
}
export function tickModernLandBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
 const scale=Math.max(.01,elapsedDays/7),byId=new Map(regions.map(r=>[r.id,r])),events=[];
 for(const region of regions){
  for(const tech of TECHS){
   const weekly=modernLandBreakthroughChance(region,tech,byId);
   const chance=1-Math.pow(1-weekly,scale);
   if(chance<=0||rng()>=chance)continue;
   region.unlockedTechIds.add(tech.id);
   events.push({type:'modern_land_warfare_breakthrough',techId:tech.id,regionId:region.id,regionName:region.name,tick:currentTick,title:`${tech.label} developed`});
  }
 }
 return events;
}

function availableShotMetal(region){return Math.max(0,region.stockpile?.iron||0)+Math.max(0,region.stockpile?.steel||0)+Math.max(0,region.stockpile?.bronze||0);}
function consumeShotMetal(region,amount){let left=Math.max(0,amount);for(const key of ['steel','iron','bronze']){const take=Math.min(left,Math.max(0,region.stockpile?.[key]||0));if(take>0)region.stockpile[key]-=take;left-=take;}return amount-left;}

export function modernInfantryProfile(region,personnel,firearmProfile,{role='attacker',elapsedDays=7,logisticsSupply=1,consumeSupplies=true}={}){
 const armed=clamp(firearmProfile?.suppliedShare||0); if(personnel<=0||armed<=0)return{multiplier:1,defenceMultiplier:1,intensityMultiplier:1,ammoSupply:1,powderUsed:0,shotUsed:0};
 const breech=has(region,BREECH_RIFLE_TECH_ID),magazine=has(region,MAGAZINE_RIFLE_TECH_ID),smokeless=has(region,SMOKELESS_POWDER_TECH_ID),mg=has(region,MACHINE_GUN_TECH_ID);
 const weeks=Math.max(.1,elapsedDays/7); const rate=(breech ? .35 : 0)+(magazine ? .75 : 0)+(mg?1.15:0);
 const ammunitionNeeded=personnel*armed*.018*rate*weeks*(smokeless ? .9 : 1);
 const supply=Math.min(clamp(logisticsSupply),ammunitionNeeded>0?clamp((region.stockpile?.small_arms_ammunition||0)/ammunitionNeeded):1);
 let ammunitionUsed=0;if(consumeSupplies&&supply>0){ammunitionUsed=ammunitionNeeded*supply;region.stockpile.small_arms_ammunition=Math.max(0,(region.stockpile.small_arms_ammunition||0)-ammunitionUsed);}
 const firepower=armed*supply*((breech ? .08 : 0)+(magazine ? .11 : 0)+(smokeless ? .07 : 0)+(mg ? .12 : 0));
 const defence=armed*supply*((breech ? .05 : 0)+(magazine ? .08 : 0)+(smokeless ? .05 : 0)+(mg ? .34 : 0));
 return{multiplier:1+firepower,defenceMultiplier:role==='defender'?1+defence:1,intensityMultiplier:1+armed*supply*((magazine ? .12 : 0)+(mg ? .22 : 0)),ammoSupply:supply,ammunitionUsed,powderUsed:0,shotUsed:0,breech,magazine,smokeless,machineGuns:mg};
}

export function entrenchmentDefenceMultiplier(region,weeksEngaged=0){
 if(!has(region,FIELD_ENTRENCHMENT_TECH_ID))return 1;
 const maturity=1-Math.exp(-Math.max(0,weeksEngaged)/3);
 return 1+maturity*.34;
}

export function modernArtilleryProfile(region,baseProfile={}, {elapsedDays=7,logisticsSupply=1,consumeSupplies=true}={}){
 const baseSupplied=clamp(baseProfile.suppliedFraction||0),guns=Math.max(0,baseProfile.guns||0);
 if(!guns||!baseSupplied)return{combatMultiplier:1,bombardment:0,precision:0,ammoMultiplier:1,ammoSupply:1,powderUsed:0,shotUsed:0};
 const breech=has(region,BREECH_ARTILLERY_TECH_ID),quick=has(region,QUICK_FIRE_ARTILLERY_TECH_ID),heavy=has(region,HEAVY_HOWITZER_TECH_ID),smokeless=has(region,SMOKELESS_POWDER_TECH_ID);
 const ammoMultiplier=1+(breech ? .3 : 0)+(quick ? .8 : 0)+(heavy ? .35 : 0);
 const weeks=Math.max(.1,elapsedDays/7);
 const extraFactor=Math.max(0,ammoMultiplier-1);
 const shellsNeeded=guns*.16*extraFactor*weeks;
 const ammoSupply=Math.min(clamp(logisticsSupply),shellsNeeded>0?clamp((region.stockpile?.artillery_shells||0)/shellsNeeded):1);
 let shellsUsed=0;if(consumeSupplies&&ammoSupply>0){shellsUsed=shellsNeeded*ammoSupply;region.stockpile.artillery_shells=Math.max(0,(region.stockpile.artillery_shells||0)-shellsUsed);}
 const supplied=baseSupplied*ammoSupply;
 const combat=1+supplied*((breech ? .05 : 0)+(quick ? .10 : 0)+(heavy ? .05 : 0));
 const bombardment=clamp(supplied*(breech ? .35 : 0)*(1+(heavy ? .45 : 0)+(quick ? .3 : 0)),0,1);
 const precision=clamp((breech ? .25 : 0)+(smokeless ? .12 : 0)+(quick ? .12 : 0));
 return{combatMultiplier:combat,bombardment,precision,ammoMultiplier,ammoSupply,shellsUsed,powderUsed:0,shotUsed:0,breech,quick,heavy};
}

const CONSTRUCTION_TARGETS=['telegraph_network','local_electric_grid','coal_power_station','hydro_power_station','road_network','harbour','shipyard','royal_arsenal','steelworks','factory','refinery','canal','administrative_centre','public_granary'];
const CONSTRUCTION_VULNERABILITY={telegraph_network:.9,local_electric_grid:.92,coal_power_station:.72,hydro_power_station:.62,road_network:.45,harbour:.7,shipyard:.68,royal_arsenal:.65,steelworks:.62,factory:.65,refinery:.7,canal:.55,administrative_centre:.5,public_granary:.55};
function damageConstructionAsset(asset,strength,rng){const vulnerability=CONSTRUCTION_VULNERABILITY[asset.typeId]??.5;const hit=clamp(strength*vulnerability*(.65+clamp(rng())*.7),0,.45);asset.condition=clamp((asset.condition??1)-hit);return hit;}

export function bombardRegionalInfrastructure(attacker,defender,polities,artilleryProfile,{objective='subjugation',rng=Math.random,currentTick=null}={}){
 const modern=modernArtilleryProfile(attacker,artilleryProfile); if(modern.bombardment<=0)return{totalDamage:0,targets:[]};
 const deliberate=objective==='devastation'||objective==='punitive'; const baseStrength=modern.bombardment*(deliberate ? .13 : .055); const targets=[];let totalDamage=0;
 const railLines=(polities||[]).flatMap(p=>p.railways?.lines||[]).filter(line=>line.status!=='destroyed'&&(line.fromRegionId===defender.id||line.toRegionId===defender.id));
 if(railLines.length){const line=[...railLines].sort((a,b)=>(b.effectiveCapacity||b.capacity||0)-(a.effectiveCapacity||a.capacity||0))[0];const damage=damageInfrastructure(line,{combatIntensity:baseStrength,deliberate,artillery:modern.bombardment,precision:modern.precision,rng});if(damage>0){totalDamage+=damage;targets.push({type:'railway',id:line.id,damage});}}
 const assets=ensureConstruction(defender).assets.filter(a=>(a.condition??1)>.05&&CONSTRUCTION_TARGETS.includes(a.typeId));
 const maxTargets=modern.quick?2:1;
 for(let i=0;i<maxTargets&&assets.length;i++){assets.sort((a,b)=>CONSTRUCTION_TARGETS.indexOf(a.typeId)-CONSTRUCTION_TARGETS.indexOf(b.typeId));const asset=assets.shift();const damage=damageConstructionAsset(asset,baseStrength*(deliberate?1.2:.75),rng);if(damage>0){asset.lastBombardedTick=currentTick;totalDamage+=damage;targets.push({type:asset.typeId,id:asset.id,damage});}}
 defender.warDamage ||= {infrastructureDamage:0,bombardmentWeeks:0};defender.warDamage.infrastructureDamage+=totalDamage;defender.warDamage.bombardmentWeeks+=1;
 return{totalDamage,targets,modern};
}
