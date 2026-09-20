import { engageLaserDefence, laserDefenceLayer } from './directedEnergy.js?v=20260920-laser1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const GUIDED_WEAPON_TECH_ID='guided_missile_guidance';
export const SURFACE_TO_AIR_MISSILE_TECH_ID='surface_to_air_missiles';
export const RADAR_GUIDED_SAM_TECH_ID='radar_guided_surface_to_air_missiles';

function electronics(region){const c=region.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radio_navigation||0));}
function radar(region){const c=region.industrialPlants?.componentCapability||{};return clamp(c.radar_set||0);}
function precision(region){return clamp(region.industrialSupply?.capability?.precision_machining||0);}
function manufacture(region){return clamp(region.structuralTransformation?.capability?.manufacture||0);}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function ensureGuidedAirDefence(region){
  region.guidedAirDefence||={samInventory:0,radarSamInventory:0,experience:0,gunExperience:0,samExperience:0,gunEngagements:0,samShots:0,samKills:0,missileSpend:0};
  return region.guidedAirDefence;
}

export function tickGuidedAirDefenceBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set();const e=electronics(region),p=precision(region),m=manufacture(region),r=radar(region);
    if(!has(region,GUIDED_WEAPON_TECH_ID)&&has(region,'rocket_stabilisation')&&e>.34&&p>.38){
      const chance=.0025+e*.016+p*.011+m*.006;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(GUIDED_WEAPON_TECH_ID);events.push({type:'military_breakthrough',techId:GUIDED_WEAPON_TECH_ID,regionId:region.id,tick:currentTick,title:'Guided missile control'});continue;}
    }
    if(!has(region,SURFACE_TO_AIR_MISSILE_TECH_ID)&&has(region,GUIDED_WEAPON_TECH_ID)&&has(region,'radar')&&e>.42){
      const chance=.002+e*.014+r*.012+p*.008;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(SURFACE_TO_AIR_MISSILE_TECH_ID);events.push({type:'military_breakthrough',techId:SURFACE_TO_AIR_MISSILE_TECH_ID,regionId:region.id,tick:currentTick,title:'Surface-to-air missiles'});continue;}
    }
    if(!has(region,RADAR_GUIDED_SAM_TECH_ID)&&has(region,SURFACE_TO_AIR_MISSILE_TECH_ID)&&r>.50&&e>.55){
      const chance=.0015+r*.014+e*.012+p*.007;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(RADAR_GUIDED_SAM_TECH_ID);events.push({type:'military_breakthrough',techId:RADAR_GUIDED_SAM_TECH_ID,regionId:region.id,tick:currentTick,title:'Radar-guided area air defence'});}
    }
  }
  return events;
}

export function buildSurfaceToAirMissile(region,{radarGuided=false,count=1}={}){
  const state=ensureGuidedAirDefence(region),n=Math.max(1,Math.floor(count));
  if(!has(region,SURFACE_TO_AIR_MISSILE_TECH_ID))return{built:false,reason:'sam_technology_not_ready'};
  if(radarGuided&&!has(region,RADAR_GUIDED_SAM_TECH_ID))return{built:false,reason:'radar_sam_technology_not_ready'};
  const unit=radarGuided?{cash:62,steel:2.2,machine:1.7}:{cash:38,steel:1.4,machine:1.0};
  const inv=region.industrialSupply?.inventory||{};region.stockpile||={};
  if(nonNegative(region.treasury)<unit.cash*n||nonNegative(region.stockpile.steel)<unit.steel*n||nonNegative(inv.machine_components)<unit.machine*n)return{built:false,reason:'insufficient_inputs'};
  region.treasury-=unit.cash*n;region.stockpile.steel-=unit.steel*n;inv.machine_components-=unit.machine*n;
  if(radarGuided)state.radarSamInventory+=n;else state.samInventory+=n;
  return{built:true,count:n,radarGuided,cost:{cash:unit.cash*n,steel:unit.steel*n,machine:unit.machine*n}};
}

export function tickGuidedAirDefenceIndustry(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[],years=Math.max(.001,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  for(const region of regions||[]){
    if(!has(region,SURFACE_TO_AIR_MISSILE_TECH_ID))continue;
    const s=ensureGuidedAirDefence(region),pressure=clamp((region.conflictPressure||0)*1.4+(region.droneThreatExperience||0)*.7+(region.militaryStrategy?.spendingPriority||0)*.35);
    const protectedValue=estimateProtectedTargetValue(region),desired=Math.max(2,Math.ceil(Math.log1p(protectedValue)/1.9+pressure*8));
    const total=s.samInventory+s.radarSamInventory;
    if(total>=desired||rng()>=years*(.18+pressure*.52))continue;
    const radarGuided=has(region,RADAR_GUIDED_SAM_TECH_ID)&&s.radarSamInventory<Math.ceil(desired*.35)&&rng()<.55;
    const built=buildSurfaceToAirMissile(region,{radarGuided,count:1});
    if(built.built)events.push({type:'sam_produced',regionId:region.id,tick:currentTick,radarGuided,cost:built.cost});
  }
  return events;
}

function cheapGunLayer(region,threat){
  const aa=region.airDefenceIndustry||{};let guns=0,quality=0;
  for(const [id,countRaw] of Object.entries(aa.inventoryByDesign||{})){
    const count=Math.max(0,Number(countRaw)||0),design=(aa.designs||[]).find(d=>d.id===id);if(!design||count<=0)continue;
    guns+=count;quality+=count*((design.stats?.lethality||0)*.34+(design.stats?.rateOfFire||0)*.28+(design.stats?.fireControl||0)*.24+(design.stats?.traverse||0)*.14);
  }
  quality=guns?clamp(quality/guns):0;
  const legacy=has(region,'machine_guns')?.10:0;
  const coverage=clamp(1-Math.exp(-guns*.16));
  const slowBonus=clamp(1-(threat.speed||.3))*.24;
  const smallPenalty=(1-clamp(threat.signature||.5))*.12;
  return{available:guns>0||legacy>0,killChance:clamp(legacy+coverage*quality*.55+slowBonus-smallPenalty,0,.78),cashPerEngagement:guns>0?.18:.08};
}
function samLayer(region,threat,{radarGuided=false}={}){
  const s=ensureGuidedAirDefence(region),stock=radarGuided?s.radarSamInventory:s.samInventory;
  if(stock<=0)return{available:false,killChance:0,cashPerEngagement:0};
  const e=electronics(region),r=radar(region),p=precision(region),exp=clamp(s.samExperience);
  const base=radarGuided?.62:.48,signature=clamp(threat.signature||.5),speed=clamp(threat.speed||.35);
  const kill=clamp(base+e*.12+p*.07+(radarGuided?r*.15:0)+exp*.08+signature*.05-speed*.03,0,.94);
  return{available:true,killChance:kill,cashPerEngagement:radarGuided?62:38,radarGuided};
}

export function estimateProtectedTargetValue(region){
  const publicAssets=(region.construction?.assets||[]).filter(a=>(a.condition??1)>.15);
  const corporate=(region.corporateInfrastructure?.assets||[]).filter(a=>a.status==='operational'&&(a.condition??1)>.15);
  const strategic=(region.nuclearPower?.reactors?.length||0)*420+(region.industrialPlants?.plants?.length||0)*95+(region.electricity?.generationCapacity||0)*.12;
  return Math.max(25,publicAssets.length*45+corporate.length*55+strategic+Math.log1p(nonNegative(region.population))*8);
}

export function layeredAirDefenceEngagement(region,threat,{rng=Math.random,targetValue=null}={}){
  const state=ensureGuidedAirDefence(region),value=Math.max(0,targetValue??estimateProtectedTargetValue(region));
  const gun=cheapGunLayer(region,threat),laser=laserDefenceLayer(region,threat),short=has(region,SURFACE_TO_AIR_MISSILE_TECH_ID)?samLayer(region,threat):{available:false},radarSam=has(region,RADAR_GUIDED_SAM_TECH_ID)?samLayer(region,threat,{radarGuided:true}):{available:false};
  const result={engaged:false,killed:false,layer:'none',targetValue:value,interceptorCost:0,gun,laser,shortSam:short,radarSam};
  if(gun.available&&gun.killChance>.08){
    result.engaged=true;result.layer='gun';result.interceptorCost=gun.cashPerEngagement;state.gunEngagements++;state.gunExperience=clamp(state.gunExperience+.0015*(1-state.gunExperience));
    if(rng()<gun.killChance){result.killed=true;return result;}
  }
  if(laser.available){
    const shot=engageLaserDefence(region,threat,{rng});result.engaged=true;result.layer='laser';result.interceptorCost=shot.cashPerEngagement;
    if(shot.killed){result.killed=true;return result;}
  }
  const incomingValue=Math.max(1,nonNegative(threat.replacementValue||threat.payloadValue||1));
  const consequence=value*Math.max(.08,clamp(threat.damagePotential||.2));
  const missileJustified=consequence>=Math.max(18,incomingValue*2.5);
  if(!missileJustified)return result;
  const selected=(radarSam.available&&(threat.speed>.55||threat.altitude>.55||!short.available))?radarSam:short.available?short:radarSam.available?radarSam:null;
  if(!selected)return result;
  result.engaged=true;result.layer=selected.radarGuided?'radar_sam':'sam';result.interceptorCost=selected.cashPerEngagement;state.samShots++;state.missileSpend+=selected.cashPerEngagement;
  if(selected.radarGuided)state.radarSamInventory--;else state.samInventory--;
  state.samExperience=clamp(state.samExperience+.0025*(1-state.samExperience));
  if(rng()<selected.killChance){result.killed=true;state.samKills++;}
  return result;
}

export function guidedAirDefenceSummary(region){const s=ensureGuidedAirDefence(region);return{...s,protectedTargetValue:estimateProtectedTargetValue(region)};}
