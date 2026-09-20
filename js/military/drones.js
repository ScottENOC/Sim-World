import { batteryMobilityCapability, BATTERY_TECH_IDS } from '../economy/batteryStorage.js?v=20260920-battery1';
import { orbitalSupport } from '../technology/orbitalSatellites.js?v=20260920-orbital1';
import { INDUSTRIAL_ELECTRIFICATION_TECH_ID } from '../technology/electrification.js?v=20260917-electric1';
import { airDefenceEngagementRisk } from './preDigitalAirNaval.js?v=20260919-aa-naval1';
import { POWERED_FLIGHT_TECH_ID, MILITARY_AVIATION_TECH_ID, AERIAL_BOMBING_TECH_ID } from './aviation.js?v=20260920-drones1';
import { ROCKET_STABILISATION_TECH_ID } from './earlyRocketry.js?v=20260920-drones1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
let nextDroneId=1;

export const DRONE_TECH_IDS=Object.freeze({
  RADIO_CONTROLLED:'radio_controlled_aircraft',
  RECON_UAV:'unmanned_reconnaissance_aircraft',
  REMOTE_STRIKE:'remotely_piloted_strike_aircraft',
  LOITERING_MUNITION:'loitering_munitions',
  MULTIROTOR:'battery_multirotor_drones',
});

export const DRONE_TYPES=Object.freeze({
  RECON_UAV:'recon_uav',
  STRIKE_UAV:'strike_uav',
  LOITERING_MUNITION:'loitering_munition',
  QUADCOPTER:'quadcopter',
});
export const DRONE_MISSIONS=Object.freeze({IDLE:'idle',RECON:'recon',ATTACK:'attack'});
export const DRONE_CONTROL=Object.freeze({LOCAL:'local_radio',RELAY:'radio_relay',SATELLITE:'satellite',AUTONOMOUS:'autonomous',NONE:'none'});

const TYPE_SPEC=Object.freeze({
  [DRONE_TYPES.RECON_UAV]:{tech:DRONE_TECH_IDS.RECON_UAV,cash:28,steel:3,machine:2,fuel:0.10,reusable:true,satellite:true,signature:.55,recon:.68,payload:0,battery:false},
  [DRONE_TYPES.STRIKE_UAV]:{tech:DRONE_TECH_IDS.REMOTE_STRIKE,cash:46,steel:5,machine:3,fuel:0.16,reusable:true,satellite:true,signature:.65,recon:.42,payload:.42,battery:false},
  [DRONE_TYPES.LOITERING_MUNITION]:{tech:DRONE_TECH_IDS.LOITERING_MUNITION,cash:18,steel:2,machine:1,fuel:0.07,reusable:false,satellite:true,signature:.38,recon:.18,payload:.58,battery:false},
  [DRONE_TYPES.QUADCOPTER]:{tech:DRONE_TECH_IDS.MULTIROTOR,cash:7,steel:.25,machine:.4,fuel:0,reusable:true,satellite:false,signature:.22,recon:.52,payload:.14,battery:true},
});

function electronics(region){const p=region.industrialPlants?.componentCapability||{};return clamp(Math.max(p.electronics||0,p.radio_navigation||0));}
function precision(region){return clamp(region.industrialSupply?.capability?.precision_machining||0);}
function manufacture(region){return clamp(region.structuralTransformation?.capability?.manufacture||0);}
function optics(region){return clamp(region.industrialPlants?.componentCapability?.optics||0);}
function radio(region){return clamp(region.industrialPlants?.componentCapability?.radio_navigation||electronics(region));}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function ensureDrones(region){
  region.droneForces||={inventory:[],experience:0,totalBuilt:0,totalLost:0,totalStrikes:0,totalReconMissions:0};
  region.droneForces.inventory||=[];
  return region.droneForces;
}
export function syncNextDroneId(regions=[]){let max=0;for(const r of regions)for(const d of r.droneForces?.inventory||[])max=Math.max(max,Number(String(d.id||'').replace(/\D/g,''))||0);nextDroneId=max+1;}

export function tickDroneBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const r of regions||[]){
    r.unlockedTechIds||=new Set();const e=electronics(r),rad=radio(r),pre=precision(r),man=manufacture(r),opt=optics(r);
    if(!has(r,DRONE_TECH_IDS.RADIO_CONTROLLED)&&has(r,POWERED_FLIGHT_TECH_ID)&&rad>.18&&pre>.22){
      if(rng()<annual(.004+rad*.018+pre*.010,elapsedDays)){r.unlockedTechIds.add(DRONE_TECH_IDS.RADIO_CONTROLLED);events.push({type:'drone_breakthrough',techId:DRONE_TECH_IDS.RADIO_CONTROLLED,regionId:r.id,tick:currentTick,title:'Radio-controlled aircraft'});continue;}
    }
    if(!has(r,DRONE_TECH_IDS.RECON_UAV)&&has(r,DRONE_TECH_IDS.RADIO_CONTROLLED)&&has(r,MILITARY_AVIATION_TECH_ID)&&opt>.22&&e>.28){
      if(rng()<annual(.003+opt*.014+e*.016+man*.010,elapsedDays)){r.unlockedTechIds.add(DRONE_TECH_IDS.RECON_UAV);events.push({type:'drone_breakthrough',techId:DRONE_TECH_IDS.RECON_UAV,regionId:r.id,tick:currentTick,title:'Unmanned reconnaissance aircraft'});continue;}
    }
    if(!has(r,DRONE_TECH_IDS.REMOTE_STRIKE)&&has(r,DRONE_TECH_IDS.RECON_UAV)&&has(r,AERIAL_BOMBING_TECH_ID)&&e>.36){
      if(rng()<annual(.002+e*.014+rad*.012+pre*.010,elapsedDays)){r.unlockedTechIds.add(DRONE_TECH_IDS.REMOTE_STRIKE);events.push({type:'drone_breakthrough',techId:DRONE_TECH_IDS.REMOTE_STRIKE,regionId:r.id,tick:currentTick,title:'Remotely piloted strike aircraft'});continue;}
    }
    if(!has(r,DRONE_TECH_IDS.LOITERING_MUNITION)&&has(r,DRONE_TECH_IDS.REMOTE_STRIKE)&&has(r,ROCKET_STABILISATION_TECH_ID)&&e>.42){
      if(rng()<annual(.002+e*.015+pre*.008+man*.010,elapsedDays)){r.unlockedTechIds.add(DRONE_TECH_IDS.LOITERING_MUNITION);events.push({type:'drone_breakthrough',techId:DRONE_TECH_IDS.LOITERING_MUNITION,regionId:r.id,tick:currentTick,title:'Loitering munitions'});continue;}
    }
    if(!has(r,DRONE_TECH_IDS.MULTIROTOR)&&has(r,BATTERY_TECH_IDS.ADVANCED)&&has(r,INDUSTRIAL_ELECTRIFICATION_TECH_ID)&&e>.52&&pre>.44){
      if(rng()<annual(.0015+e*.013+pre*.009+man*.008,elapsedDays)){r.unlockedTechIds.add(DRONE_TECH_IDS.MULTIROTOR);events.push({type:'drone_breakthrough',techId:DRONE_TECH_IDS.MULTIROTOR,regionId:r.id,tick:currentTick,title:'Battery multirotor drones'});}
    }
  }
  return events;
}

function spend(region,spec){
  region.stockpile||={};const inv=region.industrialSupply?.inventory||{};
  if(nonNegative(region.treasury)<spec.cash||nonNegative(region.stockpile.steel)<spec.steel||nonNegative(inv.machine_components)<spec.machine)return false;
  region.treasury-=spec.cash;region.stockpile.steel-=spec.steel;inv.machine_components-=spec.machine;return true;
}
export function buildDrone(region,type){
  const spec=TYPE_SPEC[type];if(!spec||!has(region,spec.tech))return null;if(!spend(region,spec))return null;
  const battery=batteryMobilityCapability(region);
  const drone={id:`drone-${nextDroneId++}`,type,mission:DRONE_MISSIONS.IDLE,targetRegionId:null,status:'serviceable',condition:1,fuel:spec.battery?0:1,batteryCharge:spec.battery?1:null,endurance:spec.battery?clamp(.35+(battery.endurance||0)*.65):1,controlMode:DRONE_CONTROL.LOCAL,totalMissions:0};
  ensureDrones(region).inventory.push(drone);region.droneForces.totalBuilt++;return drone;
}

function neighbourDistance(origin,target,byId){
  if(!origin||!target)return Infinity;if(origin.id===target.id)return 0;if((origin.neighbors||[]).includes(target.id))return 1;
  for(const id of origin.neighbors||[])if((byId.get(id)?.neighbors||[]).includes(target.id))return 2;
  return Infinity;
}
export function droneControlAssessment(origin,target,drone,regionsById=new Map()){
  if(!origin||!target||!drone)return{available:false,mode:DRONE_CONTROL.NONE,quality:0};
  const distance=neighbourDistance(origin,target,regionsById),rad=radio(origin);
  if(distance<=1)return{available:true,mode:DRONE_CONTROL.LOCAL,quality:clamp(.55+rad*.42)};
  if(distance<=2&&rad>.42)return{available:true,mode:DRONE_CONTROL.RELAY,quality:clamp(.34+rad*.48)};
  const orbit=orbitalSupport(origin);
  if(TYPE_SPEC[drone.type]?.satellite&&orbit.droneBeyondLineOfSightControl>.10)return{available:true,mode:DRONE_CONTROL.SATELLITE,quality:clamp(.38+orbit.droneBeyondLineOfSightControl*.58)};
  const autonomy=clamp(origin.appliedAI?.droneAutonomy||0);
  if(autonomy>.58)return{available:true,mode:DRONE_CONTROL.AUTONOMOUS,quality:clamp(.30+autonomy*.55)};
  return{available:false,mode:DRONE_CONTROL.NONE,quality:0};
}

export function assignDroneMission(region,droneId,mission,targetRegionId){
  const d=ensureDrones(region).inventory.find(x=>x.id===droneId&&x.status!=='destroyed');if(!d)return{assigned:false,reason:'drone_not_available'};
  if(!Object.values(DRONE_MISSIONS).includes(mission))return{assigned:false,reason:'invalid_mission'};
  const spec=TYPE_SPEC[d.type];if(mission===DRONE_MISSIONS.ATTACK&&!spec.payload)return{assigned:false,reason:'drone_not_armed'};
  d.mission=mission;d.targetRegionId=mission===DRONE_MISSIONS.IDLE?null:targetRegionId;return{assigned:true,drone:d};
}

function missionEnergyAvailable(region,d,spec){
  if(spec.battery)return(d.batteryCharge||0)>=.20;
  return nonNegative(region.stockpile?.aviation_fuel)>=spec.fuel;
}
function consumeMissionEnergy(region,d,spec){
  if(spec.battery){const use=.18/Math.max(.35,d.endurance||.35);d.batteryCharge=clamp((d.batteryCharge||0)-use);return;}
  region.stockpile.aviation_fuel=Math.max(0,nonNegative(region.stockpile?.aviation_fuel)-spec.fuel);d.fuel=clamp((d.fuel??1)-.08);
}
function recoverAtBase(region,d,elapsedDays){
  if(d.status==='destroyed')return;
  if(d.batteryCharge!==null&&d.batteryCharge<1&&(region.electricity?.service||region.electricity?.industrialService||0)>.15)d.batteryCharge=clamp(d.batteryCharge+Math.max(.05,elapsedDays/7*.28));
  if(d.fuel!==null&&d.fuel<1&&nonNegative(region.stockpile?.aviation_fuel)>0){const take=Math.min(1-d.fuel,nonNegative(region.stockpile.aviation_fuel),elapsedDays/7*.25);region.stockpile.aviation_fuel-=take;d.fuel=clamp(d.fuel+take);}
}

export function tickDrones(regions,currentTick,elapsedDays=7,rng=Math.random){
  const events=[],byId=new Map((regions||[]).map(r=>[r.id,r]));syncNextDroneId(regions);
  for(const region of regions||[]){
    const force=ensureDrones(region);
    for(const d of force.inventory){
      recoverAtBase(region,d,elapsedDays);if(d.status==='destroyed'||d.mission===DRONE_MISSIONS.IDLE)continue;
      const target=byId.get(d.targetRegionId);if(!target){d.mission=DRONE_MISSIONS.IDLE;d.targetRegionId=null;continue;}
      const spec=TYPE_SPEC[d.type],control=droneControlAssessment(region,target,d,byId);d.controlMode=control.mode;
      if(!control.available){events.push({type:'drone_mission_aborted_link',regionId:region.id,droneId:d.id,targetRegionId:target.id});d.mission=DRONE_MISSIONS.IDLE;d.targetRegionId=null;continue;}
      if(!missionEnergyAvailable(region,d,spec)){events.push({type:'drone_mission_aborted_energy',regionId:region.id,droneId:d.id,targetRegionId:target.id});d.mission=DRONE_MISSIONS.IDLE;d.targetRegionId=null;continue;}
      consumeMissionEnergy(region,d,spec);d.totalMissions++;force.experience+=1;
      const risk=clamp(airDefenceEngagementRisk(target,null)*spec.signature*(1.08-control.quality*.18));
      if(rng()<risk){d.status='destroyed';d.condition=0;force.totalLost++;events.push({type:'drone_destroyed',regionId:region.id,droneId:d.id,targetRegionId:target.id,controlMode:control.mode});continue;}
      if(d.mission===DRONE_MISSIONS.RECON){
        region.droneRecon||={};const confidence=clamp(.30+spec.recon*.45+control.quality*.22+d.condition*.08);region.droneRecon[target.id]={observedTick:currentTick,confidence,controlMode:control.mode,droneType:d.type};force.totalReconMissions++;events.push({type:'drone_reconnaissance',regionId:region.id,droneId:d.id,targetRegionId:target.id,confidence,controlMode:control.mode});
      }else if(d.mission===DRONE_MISSIONS.ATTACK){
        target.warDamage||={infrastructureDamage:0,bombardmentWeeks:0};const damage=.0035*spec.payload*(.55+control.quality*.45)*(d.type===DRONE_TYPES.LOITERING_MUNITION?1.5:1);target.warDamage.infrastructureDamage+=damage;force.totalStrikes++;events.push({type:'drone_strike',regionId:region.id,droneId:d.id,targetRegionId:target.id,damage,controlMode:control.mode,expendable:!spec.reusable});
      }
      if(!spec.reusable){d.status='destroyed';d.condition=0;force.totalLost++;}
      d.mission=DRONE_MISSIONS.IDLE;d.targetRegionId=null;
    }
    const live=force.inventory.filter(d=>d.status!=='destroyed');
    const conflict=clamp(region.conflictPressure||region.militaryStrategy?.spendingPriority||0),years=Math.max(.001,elapsedDays/DAYS_PER_YEAR);
    if(conflict>.12&&live.length<Math.max(1,Math.floor(nonNegative(region.population)/400000))){
      const preferred=has(region,DRONE_TECH_IDS.MULTIROTOR)?DRONE_TYPES.QUADCOPTER:has(region,DRONE_TECH_IDS.RECON_UAV)?DRONE_TYPES.RECON_UAV:null;
      if(preferred&&rng()<years*(.10+conflict*.18))buildDrone(region,preferred);
    }
  }
  return events;
}

export function droneForceSummary(region){
  const force=ensureDrones(region),live=force.inventory.filter(d=>d.status!=='destroyed');
  const byType={};for(const d of live)byType[d.type]=(byType[d.type]||0)+1;
  return{total:live.length,destroyed:force.inventory.length-live.length,byType,experience:force.experience,totalStrikes:force.totalStrikes,totalReconMissions:force.totalReconMissions,satelliteControl:orbitalSupport(region).droneBeyondLineOfSightControl||0};
}
