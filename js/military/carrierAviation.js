import { AIR_MISSIONS, ensureAviation, airDefenceRisk } from './aviation.js?v=20260919-carriers1';
import { aircraftCrewReadiness, recordAircraftCrewPractice, resolveAircraftCrewLoss } from './qualifiedPersonnel.js?v=20260919-personnel1';
import { operationalInfrastructure } from '../economy/construction.js?v=20260919-carriers1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=r=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.polityId||r?.id||null;

export const NAVAL_AVIATION_TECH_ID='naval_aviation';
export const AIRCRAFT_CARRIER_TECH_ID='aircraft_carrier';

function shipSpec(ship){return ship?.designStats||{};}
export function carrierShips(fleet){return (fleet?.ships||[]).filter(s=>s.designId==='aircraft_carrier'&&(s.condition??1)>.12);}
export function fleetOilers(fleet){return (fleet?.ships||[]).filter(s=>s.designId==='fleet_oiler'&&(s.condition??1)>.12);}
export function fleetAviationFuelCapacity(fleet){
  return (fleet?.ships||[]).reduce((sum,ship)=>sum+Math.max(0,Number(shipSpec(ship).aviationFuelCapacity)||0),0);
}
export function ensureFleetAviationFuel(fleet){
  const capacity=fleetAviationFuelCapacity(fleet);
  if(!Number.isFinite(fleet.aviationFuel))fleet.aviationFuel=0;
  fleet.aviationFuel=Math.max(0,Math.min(capacity,fleet.aviationFuel));
  return {capacity,fuel:fleet.aviationFuel,fraction:capacity>0?clamp(fleet.aviationFuel/capacity):1};
}
export function serviceFleetAviationFuel(fleet,sourceRegion){
  const state=ensureFleetAviationFuel(fleet),need=Math.max(0,state.capacity-state.fuel),available=Math.max(0,sourceRegion?.stockpile?.aviation_fuel||0),loaded=Math.min(need,available);
  if(loaded>0){sourceRegion.stockpile.aviation_fuel-=loaded;fleet.aviationFuel+=loaded;}
  return {loaded,...ensureFleetAviationFuel(fleet)};
}

function registryAircraft(regions){return regions.flatMap(r=>(r.aviation?.aircraft||[]).map(a=>({region:r,aircraft:a})));}
function embarkedOnCarrier(regions,carrierId){return registryAircraft(regions).filter(x=>x.aircraft.baseType==='carrier'&&x.aircraft.carrierId===carrierId&&x.aircraft.status!=='destroyed');}
export function carrierAirCapacity(carrier){return Math.max(0,Math.round(Number(shipSpec(carrier).airCapacity)||0));}
export function carrierAirWingSummary(regions,fleet){
  const rows=[];let total=0,capacity=0;
  for(const carrier of carrierShips(fleet)){
    const aircraft=embarkedOnCarrier(regions,carrier.id).map(x=>x.aircraft),cap=carrierAirCapacity(carrier);total+=aircraft.length;capacity+=cap;
    rows.push({carrierId:carrier.id,name:carrier.modelName||carrier.classLabel||'aircraft carrier',count:aircraft.length,capacity:cap,aircraft});
  }
  const fuel=ensureFleetAviationFuel(fleet);
  return {total,capacity,carriers:rows,aviationFuel:fuel.fuel,aviationFuelCapacity:fuel.capacity,oilers:fleetOilers(fleet).length};
}

function carrierCompatible(aircraft,carrier){
  if(!aircraft||aircraft.ownerType!=='military'||aircraft.status==='destroyed')return false;
  if(['transport'].includes(aircraft.role))return false;
  const deck=clamp(shipSpec(carrier).flightDeckRating||0),payload=clamp(aircraft.designStats?.payload||0);
  if(aircraft.role==='bomber'&&(deck<.62||payload>.58))return false;
  return ['fighter','interceptor','recon','bomber'].includes(aircraft.role);
}
export function embarkAircraftOnCarrier(region,fleet,aircraftId,carrierId){
  if(!region||!fleet||fleet.locationType!=='port'||fleet.portRegionId!==region.id)return{embarked:false,reason:'carrier_not_in_port'};
  if(actorId(region)!==fleet.ownerActorId)return{embarked:false,reason:'wrong_owner'};
  const carrier=carrierShips(fleet).find(s=>s.id===carrierId);if(!carrier)return{embarked:false,reason:'missing_carrier'};
  const a=ensureAviation(region).aircraft.find(x=>x.id===aircraftId);if(!a)return{embarked:false,reason:'missing_aircraft'};
  if(!carrierCompatible(a,carrier))return{embarked:false,reason:'aircraft_not_carrier_compatible'};
  const used=embarkedOnCarrier([region],carrier.id).length;
  if(used>=carrierAirCapacity(carrier))return{embarked:false,reason:'air_group_full'};
  a.baseType='carrier';a.baseRegionId=null;a.carrierId=carrier.id;a.carrierFleetId=fleet.id;a.mission=AIR_MISSIONS.IDLE;a.targetRegionId=null;a.status=a.condition<.42?'damaged':'serviceable';
  a.carrierQualified=true;
  return{embarked:true,aircraft:a,carrierId:carrier.id,fleetId:fleet.id};
}
export function disembarkAircraftFromCarrier(region,fleet,aircraftId){
  if(!region||!fleet||fleet.locationType!=='port'||fleet.portRegionId!==region.id)return{disembarked:false,reason:'carrier_not_in_port'};
  if(!operationalInfrastructure(region,'airfield'))return{disembarked:false,reason:'no_airfield'};
  const a=ensureAviation(region).aircraft.find(x=>x.id===aircraftId&&x.baseType==='carrier'&&x.carrierFleetId===fleet.id);if(!a)return{disembarked:false,reason:'aircraft_not_embarked'};
  a.baseType='airfield';a.baseRegionId=region.id;a.carrierId=null;a.carrierFleetId=null;a.mission=AIR_MISSIONS.IDLE;a.targetRegionId=null;a.status=a.condition<.42?'damaged':'serviceable';
  return{disembarked:true,aircraft:a};
}

function launchSeas(fleet,regionsById){
  if(fleet.locationType==='sea'&&fleet.seaRegionId)return[fleet.seaRegionId];
  if(fleet.locationType==='port')return regionsById.get(fleet.portRegionId)?.adjacentSeaIds||[];
  return[];
}
function carrierTargetReachable(fleet,target,aircraft,regionsById,seaRegionsById){
  if(!target)return false;const seas=launchSeas(fleet,regionsById),coastal=new Set();
  for(const id of seas)for(const landId of seaRegionsById.get(id)?.adjacentLand||[])coastal.add(landId);
  if(coastal.has(target.id))return true;
  const range=clamp(aircraft?.designStats?.range||0);if(range<.28)return false;
  if((target.neighbors||[]).some(id=>coastal.has(id)))return true;
  if(range<.62)return false;
  for(const n of target.neighbors||[])if((regionsById.get(n)?.neighbors||[]).some(id=>coastal.has(id)))return true;
  return false;
}
export function assignCarrierAircraftMission(region,fleet,aircraftId,mission,targetRegionId,regions=[],seaRegions=[]){
  const a=ensureAviation(region).aircraft.find(x=>x.id===aircraftId&&x.baseType==='carrier'&&x.carrierFleetId===fleet.id);if(!a||a.status==='destroyed'||a.condition<.42)return{assigned:false,reason:'unserviceable'};
  if(aircraftCrewReadiness(a)<.35)return{assigned:false,reason:'no_qualified_aircrew'};
  if(![AIR_MISSIONS.SCOUT,AIR_MISSIONS.INTERCEPT,AIR_MISSIONS.ATTACK,AIR_MISSIONS.IDLE].includes(mission))return{assigned:false,reason:'unsupported_carrier_mission'};
  const byId=new Map(regions.map(r=>[r.id,r])),seaById=new Map(seaRegions.map(s=>[s.id,s]));
  if(mission!==AIR_MISSIONS.IDLE&&!carrierTargetReachable(fleet,byId.get(targetRegionId),a,byId,seaById))return{assigned:false,reason:'target_out_of_carrier_range'};
  a.mission=mission;a.targetRegionId=mission===AIR_MISSIONS.IDLE?null:targetRegionId;a.status=mission===AIR_MISSIONS.IDLE?'serviceable':'assigned';return{assigned:true,aircraft:a};
}

function sortieFuel(mission,a){
  const base=mission===AIR_MISSIONS.INTERCEPT?.13:mission===AIR_MISSIONS.SCOUT?.18:mission===AIR_MISSIONS.ATTACK?.24:.09;
  const efficiency=clamp((a?.designStats?.range||0)*.30+(a?.designStats?.enginePower||0)*.10,0,.32);return base*(1-efficiency);
}
function damageAircraft(region,a,amount,rng){
  const reliability=clamp(a.designStats?.reliability||0),damage=Math.max(0,amount)*(1-reliability*.20);a.condition=clamp((a.condition??1)-damage);a.repairNeed=Math.max(a.repairNeed||0,1-a.condition);
  if(a.condition<=.12){a.status='destroyed';a.mission=AIR_MISSIONS.IDLE;resolveAircraftCrewLoss(region,a,{rng});}
  else if(a.condition<.42){a.status='damaged';a.mission=AIR_MISSIONS.IDLE;}return a.status;
}
function carrierForAircraft(fleet,a){return carrierShips(fleet).find(s=>s.id===a.carrierId)||null;}

export function tickCarrierAviation(regions,fleets,seaRegions,currentTick,elapsedDays=7,rng=Math.random){
  const byId=new Map(regions.map(r=>[r.id,r])),seaById=new Map(seaRegions.map(s=>[s.id,s])),events=[],weeks=Math.max(.01,elapsedDays/7);
  const fleetById=new Map(fleets.map(f=>[f.id,f]));
  for(const region of regions){
    for(const a of ensureAviation(region).aircraft){
      if(a.baseType!=='carrier'||a.status==='destroyed')continue;
      const fleet=fleetById.get(a.carrierFleetId),carrier=fleet?carrierForAircraft(fleet,a):null;
      if(!fleet||!carrier){a.status='grounded';events.push({type:'carrier_aircraft_stranded',aircraftId:a.id,regionId:region.id});continue;}
      const spec=shipSpec(carrier),maintenance=clamp(spec.carrierMaintenance||.3),deck=clamp(spec.flightDeckRating||.3),sortieRate=Math.max(.15,Number(spec.sortieRate)||.6);
      if(a.condition<.999&&a.condition>.12&&fleet.supply>.25){const repair=Math.min(1-a.condition,.012*weeks*maintenance*(.65+.35*(carrier.condition??1)));a.condition=clamp(a.condition+repair);a.repairNeed=1-a.condition;if(a.condition>=.42&&a.status==='damaged')a.status='serviceable';fleet.supply=clamp(fleet.supply-repair*.02);}
      if(a.mission===AIR_MISSIONS.IDLE)continue;
      const target=byId.get(a.targetRegionId);if(!carrierTargetReachable(fleet,target,a,byId,seaById)){a.status='grounded';events.push({type:'carrier_aircraft_out_of_range',aircraftId:a.id,fleetId:fleet.id,targetRegionId:a.targetRegionId});continue;}
      const embarked=embarkedOnCarrier(regions,carrier.id).length,weeklyCapacity=Math.max(1,Math.round(sortieRate*carrierAirCapacity(carrier)*weeks));
      carrier._sortiesThisTick=carrier._sortieTick===currentTick?(carrier._sortiesThisTick||0):0;carrier._sortieTick=currentTick;
      if(carrier._sortiesThisTick>=weeklyCapacity){a.status='assigned';continue;}
      const need=sortieFuel(a.mission,a);ensureFleetAviationFuel(fleet);if(fleet.aviationFuel<need){a.status='grounded';events.push({type:'carrier_aircraft_grounded_no_fuel',aircraftId:a.id,fleetId:fleet.id});continue;}
      fleet.aviationFuel-=need;carrier._sortiesThisTick++;a.totalFlights=(a.totalFlights||0)+1;a.fuel=clamp((a.fuel??1)-need*.15);recordAircraftCrewPractice(a,1);
      const crew=aircraftCrewReadiness(a),deckRisk=(1-deck)*.035,risk=clamp(airDefenceRisk(target,a)*(1.12-.12*crew)+deckRisk);
      if(rng()<risk){const status=damageAircraft(region,a,.18+rng()*.58,rng);events.push({type:status==='destroyed'?'carrier_aircraft_shot_down':'carrier_aircraft_damaged',aircraftId:a.id,fleetId:fleet.id,targetRegionId:target.id});}
      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.SCOUT){region.airRecon||={};region.airRecon[target.id]={observedTick:currentTick,confidence:clamp(.38+(a.pilotExperience||0)*.25+a.condition*.17+crew*.15+deck*.05)};events.push({type:'carrier_aerial_reconnaissance',aircraftId:a.id,fleetId:fleet.id,targetRegionId:target.id});}
      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.ATTACK){const payload=clamp(a.designStats?.payload??.18),firepower=clamp(a.designStats?.firepower??.15);target.warDamage||={infrastructureDamage:0,bombardmentWeeks:0};target.warDamage.infrastructureDamage+=.006*a.condition*(.42+payload*1.55+firepower*.35)*(.68+.32*crew);events.push({type:'carrier_air_strike',aircraftId:a.id,fleetId:fleet.id,targetRegionId:target.id,payload});}
      if(a.status!=='destroyed'&&a.mission!==AIR_MISSIONS.INTERCEPT){a.mission=AIR_MISSIONS.IDLE;a.status=a.condition<.42?'damaged':'serviceable';a.targetRegionId=null;}
      region.aviation.flightExperience=(region.aviation.flightExperience||0)+1;region.navalAviationExperience=(region.navalAviationExperience||0)+1+embarked*.002;
    }
  }
  return events;
}
