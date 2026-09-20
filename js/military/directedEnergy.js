import { BATTERY_TECH_IDS } from '../economy/batteryStorage.js?v=20260920-battery1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const DIRECTED_ENERGY_TECH_IDS=Object.freeze({
  HIGH_ENERGY_LASER_RESEARCH:'high_energy_laser_weapon_research',
  SHIPBORNE_LASER:'shipborne_high_energy_laser',
  COMPACT_POWER_THERMAL:'compact_laser_power_and_thermal_systems',
  VEHICLE_LASER:'vehicle_mounted_laser_weapons',
  AIRBORNE_LASER:'airborne_laser_weapons',
});

function electronics(region){const c=region.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radar_set||0,c.radio_navigation||0));}
function precision(region){return clamp(region.industrialSupply?.capability?.precision_machining||0);}
function electric(region){return clamp(region.electricity?.industrialService||region.electricity?.service||0);}
function manufacture(region){return clamp(region.structuralTransformation?.capability?.manufacture||0);}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}
function experience(region){
  const air=region.guidedAirDefence||{};
  return clamp(Math.max(region.droneThreatExperience||0,(air.gunEngagements||0)/45,(air.samShots||0)/28,(air.samKills||0)/18));
}

export function ensureDirectedEnergyDefence(region){
  region.directedEnergyDefence||={groundSystems:0,capacitorCharge:0,shots:0,kills:0,experience:0,shipFits:0,vehicleFits:0,aircraftFits:0};
  return region.directedEnergyDefence;
}

export function tickDirectedEnergyBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set();const e=electronics(region),p=precision(region),grid=electric(region),m=manufacture(region),xp=experience(region);
    if(!has(region,DIRECTED_ENERGY_TECH_IDS.HIGH_ENERGY_LASER_RESEARCH)&&has(region,'surface_to_air_missiles')&&xp>.08&&e>.58&&grid>.55){
      const chance=.0008+e*.006+grid*.005+xp*.012;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(DIRECTED_ENERGY_TECH_IDS.HIGH_ENERGY_LASER_RESEARCH);events.push({type:'military_breakthrough',techId:DIRECTED_ENERGY_TECH_IDS.HIGH_ENERGY_LASER_RESEARCH,regionId:region.id,tick:currentTick,title:'High-energy laser weapon research'});continue;}
    }
    if(!has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER)&&has(region,DIRECTED_ENERGY_TECH_IDS.HIGH_ENERGY_LASER_RESEARCH)&&xp>.16&&e>.66&&grid>.66&&p>.58){
      const chance=.0005+e*.005+p*.004+grid*.005+xp*.014;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER);events.push({type:'military_breakthrough',techId:DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER,regionId:region.id,tick:currentTick,title:'Ship-scale high-energy laser defence'});continue;}
    }
    if(!has(region,DIRECTED_ENERGY_TECH_IDS.COMPACT_POWER_THERMAL)&&has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER)&&xp>.28&&e>.72&&p>.68&&m>.66&&has(region,BATTERY_TECH_IDS.LITHIUM_ION)){
      const chance=.00025+e*.004+p*.004+m*.003+xp*.014;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(DIRECTED_ENERGY_TECH_IDS.COMPACT_POWER_THERMAL);events.push({type:'military_breakthrough',techId:DIRECTED_ENERGY_TECH_IDS.COMPACT_POWER_THERMAL,regionId:region.id,tick:currentTick,title:'Compact laser power and thermal systems'});continue;}
    }
    if(!has(region,DIRECTED_ENERGY_TECH_IDS.VEHICLE_LASER)&&has(region,DIRECTED_ENERGY_TECH_IDS.COMPACT_POWER_THERMAL)&&xp>.38&&e>.78&&p>.72){
      const chance=.0002+e*.0035+p*.0035+xp*.012;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(DIRECTED_ENERGY_TECH_IDS.VEHICLE_LASER);events.push({type:'military_breakthrough',techId:DIRECTED_ENERGY_TECH_IDS.VEHICLE_LASER,regionId:region.id,tick:currentTick,title:'Vehicle-mounted laser defence'});continue;}
    }
    if(!has(region,DIRECTED_ENERGY_TECH_IDS.AIRBORNE_LASER)&&has(region,DIRECTED_ENERGY_TECH_IDS.VEHICLE_LASER)&&has(region,'jet_propulsion')&&xp>.50&&e>.84&&p>.82&&m>.78){
      const chance=.00012+e*.0028+p*.0028+m*.002+xp*.010;if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(DIRECTED_ENERGY_TECH_IDS.AIRBORNE_LASER);events.push({type:'military_breakthrough',techId:DIRECTED_ENERGY_TECH_IDS.AIRBORNE_LASER,regionId:region.id,tick:currentTick,title:'Airborne laser weapon systems'});}
    }
  }
  return events;
}

export function buildGroundLaserDefence(region,{count=1}={}){
  if(!has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER))return{built:false,reason:'laser_not_mature'};
  const n=Math.max(1,Math.floor(count)),state=ensureDirectedEnergyDefence(region),inv=region.industrialSupply?.inventory||{};region.stockpile||={};
  const cash=140*n,steel=7*n,machine=5*n;
  if(nonNegative(region.treasury)<cash||nonNegative(region.stockpile.steel)<steel||nonNegative(inv.machine_components)<machine)return{built:false,reason:'insufficient_inputs'};
  region.treasury-=cash;region.stockpile.steel-=steel;inv.machine_components-=machine;state.groundSystems+=n;state.capacitorCharge=Math.max(state.capacitorCharge,n);
  return{built:true,count:n,cost:{cash,steel,machine}};
}

export function fitShipLaser(region,ship){
  if(!ship||!has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER))return{fitted:false,reason:'technology_or_ship_missing'};
  const tier=Number(ship.designStats?.tier??ship.tier??0);if(tier<9||ship.designStats?.submersible)return{fitted:false,reason:'platform_too_small'};
  const inv=region.industrialSupply?.inventory||{};region.stockpile||={};const cash=90,steel=5,machine=4;
  if(nonNegative(region.treasury)<cash||nonNegative(region.stockpile.steel)<steel||nonNegative(inv.machine_components)<machine)return{fitted:false,reason:'insufficient_inputs'};
  region.treasury-=cash;region.stockpile.steel-=steel;inv.machine_components-=machine;ship.directedEnergyDefence={type:'laser',platform:'ship',powerReserve:1,thermalState:0};ensureDirectedEnergyDefence(region).shipFits++;return{fitted:true};
}

export function fitVehicleLaser(region,design){
  if(!design||!has(region,DIRECTED_ENERGY_TECH_IDS.VEHICLE_LASER))return{fitted:false,reason:'technology_or_platform_missing'};
  const onboard=clamp(design.stats?.onboardPower||0),integration=clamp(design.stats?.integration||0);if(onboard<.42||integration<.36)return{fitted:false,reason:'insufficient_power_or_integration'};
  design.stats.directedEnergyDefence={type:'laser',platform:'vehicle',powerBurden:.34,thermalBurden:.38};ensureDirectedEnergyDefence(region).vehicleFits++;return{fitted:true};
}

export function fitAircraftLaser(region,design){
  if(!design||!has(region,DIRECTED_ENERGY_TECH_IDS.AIRBORNE_LASER))return{fitted:false,reason:'technology_or_platform_missing'};
  const onboard=clamp(design.stats?.onboardPower||0),reliability=clamp(design.stats?.reliability||0);if(onboard<.58||reliability<.55)return{fitted:false,reason:'insufficient_airborne_power_or_reliability'};
  design.stats.directedEnergyDefence={type:'laser',platform:'aircraft',powerBurden:.42,thermalBurden:.48,payloadPenalty:.12};ensureDirectedEnergyDefence(region).aircraftFits++;return{fitted:true};
}

export function tickDirectedEnergyDefence(region,elapsedDays=7){
  const state=ensureDirectedEnergyDefence(region);if(state.groundSystems<=0)return state;
  const grid=electric(region),rate=state.groundSystems*(.18+.72*grid)*Math.max(.2,elapsedDays/7);
  state.capacitorCharge=Math.min(state.groundSystems*1.6,state.capacitorCharge+rate);return state;
}

export function laserDefenceLayer(region,threat){
  const state=ensureDirectedEnergyDefence(region);if(state.groundSystems<=0||!has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER)||state.capacitorCharge<.08)return{available:false,killChance:0,cashPerEngagement:0,powerCost:0};
  const e=electronics(region),p=precision(region),grid=electric(region),xp=clamp(state.experience*.55+experience(region)*.45);
  const slow=1-clamp(threat.speed||.3),signature=clamp(threat.signature||.4);
  const kill=clamp(.20+e*.22+p*.12+grid*.12+xp*.16+slow*.20+signature*.05,0,.90);
  return{available:true,killChance:kill,cashPerEngagement:.045,powerCost:.065};
}

export function engageLaserDefence(region,threat,{rng=Math.random}={}){
  const layer=laserDefenceLayer(region,threat),state=ensureDirectedEnergyDefence(region);if(!layer.available)return{engaged:false,killed:false,layer:'laser',...layer};
  state.capacitorCharge=Math.max(0,state.capacitorCharge-layer.powerCost);state.shots++;state.experience=clamp(state.experience+.003*(1-state.experience));
  const killed=rng()<layer.killChance;if(killed)state.kills++;return{engaged:true,killed,layer:'laser',...layer};
}

export function directedEnergyPlatformCapability(region,platform){
  if(platform==='ship')return{available:has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER),massBurden:.34,powerBurden:.46,thermalBurden:.52};
  if(platform==='vehicle')return{available:has(region,DIRECTED_ENERGY_TECH_IDS.VEHICLE_LASER),massBurden:.18,powerBurden:.34,thermalBurden:.38};
  if(platform==='aircraft')return{available:has(region,DIRECTED_ENERGY_TECH_IDS.AIRBORNE_LASER),massBurden:.14,powerBurden:.42,thermalBurden:.48};
  return{available:false,massBurden:1,powerBurden:1,thermalBurden:1};
}
