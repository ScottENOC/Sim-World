import { operationalInfrastructure } from '../economy/construction.js?v=20260918-aviation1';
import { EQUIPMENT_FAMILIES, ensureCurrentAircraftDesign } from './equipmentGenerations.js?v=20260919-aircraft-industry2';
import { takeFinishedEquipment } from '../economy/industrialPlant.js?v=20260919-aircraft-industry2';
import { airDefenceEngagementRisk, tickAirDefenceIndustry, tickAntiAircraftBreakthrough } from './preDigitalAirNaval.js?v=20260919-aa-naval1';
import { assignAircraftCrew, aircraftCrewReadiness, recordAircraftCrewPractice, resolveAircraftCrewLoss, tickAirPersonnel, qualifiedPersonnelSummary } from './qualifiedPersonnel.js?v=20260919-personnel1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.polityId||r?.id||null;
let nextAircraftId=1;

export const POWERED_FLIGHT_TECH_ID='powered_flight';
export const MILITARY_AVIATION_TECH_ID='military_aviation';
export const AIRCRAFT_ARMAMENT_TECH_ID='aircraft_armament';
export const AERIAL_BOMBING_TECH_ID='aerial_bombing';
export const TRANSPORT_AIRCRAFT_TECH_ID='transport_aircraft';
export const RADAR_TECH_ID='radar';
export const JET_PROPULSION_TECH_ID='jet_propulsion';
export const AERIAL_REFUELLING_TECH_ID='aerial_refuelling';

export const AIR_MISSIONS=Object.freeze({IDLE:'idle',SCOUT:'scout',INTERCEPT:'intercept',ATTACK:'attack',COURIER:'courier',TRANSPORT:'transport',REBASE:'rebase'});

export function syncNextAircraftId(regions=[]){
  let max=0; for(const region of regions) for(const a of region.aviation?.aircraft||[]) max=Math.max(max,Number(String(a.id||'').replace(/\D/g,''))||0);
  nextAircraftId=max+1;
}

export function ensureAviation(region){
  region.aviation ||= {aircraft:[],flightExperience:0,lastBreakthroughs:[],civilianDemand:0};
  region.aviation.aircraft ||= [];
  return region.aviation;
}

export function serviceableAircraft(region,{ownerType=null,mission=null}={}){
  return ensureAviation(region).aircraft.filter(a=>a.status!=='destroyed'&&(a.condition??1)>=0.42&&(a.fuel??0)>0.08&&(a.ownerType!=='military'||aircraftCrewReadiness(a)>=.35)&&(!ownerType||a.ownerType===ownerType)&&(!mission||a.mission===mission));
}

function industrialReadiness(region){
  const c=region.industrialSupply?.capability||{};
  return clamp((c.precision_machining||0)*.45+(c.steelmaking||0)*.15+(region.structuralTransformation?.capability?.manufacture||0)*.25+(region.electricity?.industrialService||0)*.15);
}

function connectedSources(region,regionsById,techId){
  const ids=new Set(region.neighbors||[]); for(const id of region.tradePartnerIds||[])ids.add(id);
  if(region.recentTradePartners?.keys)for(const id of region.recentTradePartners.keys())ids.add(id);
  return [...ids].filter(id=>regionsById.get(id)?.unlockedTechIds?.has?.(techId)).length;
}

export function tickAviationBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const years=Math.max(.0001,elapsedDays/DAYS_PER_YEAR),byId=new Map(regions.map(r=>[r.id,r])),events=[];
  for(const region of regions){
    const a=ensureAviation(region),industry=industrialReadiness(region),marine=clamp(region.industrialMarine?.marineEngineering||0),engines=clamp(region.industrialMarine?.steamEngineering||0);
    const components=region.industrialPlants?.componentCapability||{},aircraftEngine=clamp(components.aircraft_engine||0),radio=clamp(components.radio_navigation||0),optics=clamp(components.optics||0);
    const electricity=clamp(region.electricity?.industrialService||region.electricity?.service||0);
    const practice=clamp(industry*.55+marine*.15+engines*.15+Math.min(1,a.flightExperience/250)*.15);
    const sources=connectedSources(region,byId,POWERED_FLIGHT_TECH_ID);
    if(!has(region,POWERED_FLIGHT_TECH_ID)&&has(region,'steelmaking')&&industry>.28){
      const annual=clamp(.002+practice*.018+sources*.025,0,.22); if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(POWERED_FLIGHT_TECH_ID);events.push({type:'aviation_breakthrough',techId:POWERED_FLIGHT_TECH_ID,regionId:region.id,title:'Practical powered flight'});}
    }
    if(has(region,POWERED_FLIGHT_TECH_ID)&&!has(region,MILITARY_AVIATION_TECH_ID)&&a.aircraft.length){
      const annual=clamp(.01+Math.min(.08,a.flightExperience/5000)+connectedSources(region,byId,MILITARY_AVIATION_TECH_ID)*.02,0,.18); if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(MILITARY_AVIATION_TECH_ID);events.push({type:'aviation_breakthrough',techId:MILITARY_AVIATION_TECH_ID,regionId:region.id,title:'Military aviation organisation'});}
    }
    if(has(region,MILITARY_AVIATION_TECH_ID)&&!has(region,RADAR_TECH_ID)&&electricity>.34&&radio>.24&&optics>.20){
      const annual=clamp(.003+electricity*.012+radio*.018+optics*.010+connectedSources(region,byId,RADAR_TECH_ID)*.025,0,.14);
      if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(RADAR_TECH_ID);events.push({type:'aviation_breakthrough',techId:RADAR_TECH_ID,regionId:region.id,title:'Radar detection'});}
    }
    if(has(region,TRANSPORT_AIRCRAFT_TECH_ID)&&!has(region,AERIAL_REFUELLING_TECH_ID)&&aircraftEngine>.48&&radio>.22&&industry>.52&&a.flightExperience>90){
      const annual=clamp(.002+aircraftEngine*.014+radio*.010+industry*.010+connectedSources(region,byId,AERIAL_REFUELLING_TECH_ID)*.018,0,.10);
      if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(AERIAL_REFUELLING_TECH_ID);events.push({type:'aviation_breakthrough',techId:AERIAL_REFUELLING_TECH_ID,regionId:region.id,title:'Aerial refuelling'});}
    }
    if(has(region,POWERED_FLIGHT_TECH_ID)&&!has(region,JET_PROPULSION_TECH_ID)&&aircraftEngine>.54&&industry>.58&&a.flightExperience>120){
      const annual=clamp(.002+aircraftEngine*.018+industry*.012+connectedSources(region,byId,JET_PROPULSION_TECH_ID)*.020,0,.12);
      if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(JET_PROPULSION_TECH_ID);events.push({type:'aviation_breakthrough',techId:JET_PROPULSION_TECH_ID,regionId:region.id,title:'Jet propulsion'});}
    }
    for(const event of tickAntiAircraftBreakthrough(region,rng,elapsedDays))events.push({...event,regionId:region.id});
  }
  return events;
}

function canBuild(region){return has(region,POWERED_FLIGHT_TECH_ID)&&operationalInfrastructure(region,'airfield')&&industrialReadiness(region)>.24;}
function spendBuildInputs(region,cost){
  region.stockpile ||= {}; const inv=region.industrialSupply?.inventory||{};
  if((region.stockpile.wood||0)<cost.wood||(region.stockpile.textiles||0)<cost.textiles||(region.stockpile.steel||0)<cost.steel||(inv.machine_components||0)<cost.machine||(region.treasury||0)<cost.cash)return false;
  region.stockpile.wood-=cost.wood;region.stockpile.textiles-=cost.textiles;region.stockpile.steel-=cost.steel;inv.machine_components-=cost.machine;region.treasury-=cost.cash;region.wallet=(region.wallet||0)+cost.cash;return true;
}

function familyForRole(role){return role==='bomber'?EQUIPMENT_FAMILIES.BOMBER:['fighter','interceptor'].includes(role)?EQUIPMENT_FAMILIES.FIGHTER:null;}
function productForRole(role){return role==='bomber'?'bomber':['fighter','interceptor'].includes(role)?'fighter':null;}

export function buildAircraft(region,{ownerType='civilian',role='recon'}={}){
  if(!canBuild(region))return null;
  if(ownerType==='military'&&!has(region,MILITARY_AVIATION_TECH_ID))return null;
  if(role==='transport'&&!has(region,TRANSPORT_AIRCRAFT_TECH_ID))return null;
  if(role==='tanker'&&(!has(region,TRANSPORT_AIRCRAFT_TECH_ID)||!has(region,AERIAL_REFUELLING_TECH_ID)))return null;
  if(['fighter','interceptor'].includes(role)&&!has(region,AIRCRAFT_ARMAMENT_TECH_ID))return null;
  if(role==='bomber'&&!has(region,AERIAL_BOMBING_TECH_ID))return null;
  const family=ownerType==='military'?familyForRole(role):null,productId=productForRole(role),foundingMilitaryCadre=ownerType==='military'&&!region.qualifiedMilitaryPersonnel;
  let design=null;
  if(family&&productId){
    design=takeFinishedEquipment(region,productId,1);
    if(!design){region.industrialOrders ||= {};region.industrialOrders[productId]=Math.max(region.industrialOrders[productId]||0,1);return null;}
  } else {
    const cost=['transport','tanker'].includes(role)?{wood:40,textiles:24,steel:18,machine:10,cash:22}:{wood:26,textiles:18,steel:10,machine:7,cash:14};
    if(!spendBuildInputs(region,cost))return null;
    if(family)design=ensureCurrentAircraftDesign(region,family);
  }
  const aircraft={id:`air-${nextAircraftId++}`,ownerType,ownerActorId:actorId(region),role,baseType:'airfield',homeBaseRegionId:region.id,baseRegionId:region.id,carrierId:null,condition:1,fuel:1,status:'serviceable',mission:AIR_MISSIONS.IDLE,targetRegionId:null,pilotExperience:0,totalFlights:0,repairNeed:0,designId:design?.id||null,modelName:design?.name||null,designSequence:design?.sequence||null,designStats:design?.stats?{...design.stats}:null};
  ensureAviation(region).aircraft.push(aircraft); if(ownerType==='military')assignAircraftCrew(region,aircraft,{bootstrap:foundingMilitaryCadre}); return aircraft;
}

export function aviationBasingRelationship(aircraft,hostRegion,agreements=[],regionsById=new Map()){
  if(!aircraft||!hostRegion||!operationalInfrastructure(hostRegion,'airfield'))return{allowed:false,repair:false,reason:'no_airfield'};
  const hostActor=actorId(hostRegion),owner=aircraft.ownerActorId||actorId(regionsById.get(aircraft.homeBaseRegionId));
  if(!owner||hostActor===owner)return{allowed:true,repair:true,relationship:'own_base'};
  const ownerRegions=[...regionsById.values()].filter(r=>actorId(r)===owner).map(r=>r.id);
  const hostRegions=[...regionsById.values()].filter(r=>actorId(r)===hostActor).map(r=>r.id);
  const related=(agreements||[]).find(a=>a?.active&&['military_support','joint_operation','war_commitment','air_basing'].includes(a.type)&&
    ((ownerRegions.includes(a.fromId)&&hostRegions.includes(a.toId))||(ownerRegions.includes(a.toId)&&hostRegions.includes(a.fromId))||
     (a.proposerActorId===owner&&a.partnerActorId===hostActor)||(a.proposerActorId===hostActor&&a.partnerActorId===owner)||
     (a.fromActorId===owner&&a.toActorId===hostActor)||(a.fromActorId===hostActor&&a.toActorId===owner)));
  if(!related)return{allowed:false,repair:false,reason:'no_basing_rights'};
  return{allowed:true,repair:Boolean(related.aviationMaintenanceSupport||related.maintenanceSupport),relationship:'allied_base',agreementId:related.id};
}

export function rebaseAircraft(origin,target,aircraftId,agreements=[],regionsById=new Map([[origin?.id,origin],[target?.id,target]])){
  const a=ensureAviation(origin).aircraft.find(x=>x.id===aircraftId);if(!a||a.status==='destroyed'||a.condition<.42)return{rebased:false,reason:'unserviceable'};
  const rights=aviationBasingRelationship(a,target,agreements,regionsById);if(!rights.allowed)return{rebased:false,reason:rights.reason};
  const fuelNeed=.14;if((origin.stockpile?.aviation_fuel||0)<fuelNeed)return{rebased:false,reason:'insufficient_fuel'};
  origin.stockpile.aviation_fuel-=fuelNeed;a.fuel=clamp((a.fuel??1)-fuelNeed*.2);a.totalFlights++;a.mission=AIR_MISSIONS.IDLE;a.status='serviceable';a.targetRegionId=null;
  origin.aviation.aircraft=origin.aviation.aircraft.filter(x=>x!==a);a.baseRegionId=target.id;ensureAviation(target).aircraft.push(a);
  return{rebased:true,aircraft:a,rights};
}

export function airDefenceRisk(region,aircraft=null){return airDefenceEngagementRisk(region,aircraft);}


export function aerialRefuellingSupport(region){
  const aircraft=ensureAviation(region).aircraft||[];
  const tankers=aircraft.filter(a=>a.ownerType==='military'&&a.role==='tanker'&&a.status!=='destroyed'&&(a.condition??1)>=.42&&aircraftCrewReadiness(a)>=.35).length;
  const fuel=Math.max(0,region.stockpile?.aviation_fuel||0);
  const enabled=has(region,AERIAL_REFUELLING_TECH_ID)&&tankers>0&&fuel>.25;
  return {enabled,tankers,rangeSupport:enabled?clamp(1+Math.min(.75,tankers*.12)):1,fuelReserve:fuel};
}

function missionFuel(mission,a=null){
  const base=mission===AIR_MISSIONS.INTERCEPT?.12:mission===AIR_MISSIONS.SCOUT?.18:mission===AIR_MISSIONS.COURIER?.16:mission===AIR_MISSIONS.ATTACK?.22:.08;
  const efficiency=clamp((a?.designStats?.range||0)*.32+(a?.designStats?.enginePower||0)*.12,0,.35);
  return base*(1-efficiency);
}
function damageAircraft(a,amount){a.condition=clamp((a.condition??1)-Math.max(0,amount));a.repairNeed=Math.max(a.repairNeed||0,1-a.condition);if(a.condition<=.12){a.status='destroyed';a.mission=AIR_MISSIONS.IDLE;}else if(a.condition<.42){a.status='damaged';a.mission=AIR_MISSIONS.IDLE;}return a.status;}

export function assignAircraftMission(region,aircraftId,mission,targetRegionId=null){
  const a=ensureAviation(region).aircraft.find(x=>x.id===aircraftId); if(!a||a.status==='destroyed'||a.condition<.42)return{assigned:false,reason:'unserviceable'};
  if(a.ownerType==='military'&&aircraftCrewReadiness(a)<.35)return{assigned:false,reason:'no_qualified_aircrew'};
  if(mission===AIR_MISSIONS.ATTACK&&!has(region,AERIAL_BOMBING_TECH_ID))return{assigned:false,reason:'no_air_attack_capability'};
  if(mission===AIR_MISSIONS.TRANSPORT&&!has(region,TRANSPORT_AIRCRAFT_TECH_ID))return{assigned:false,reason:'no_transport_aircraft'};
  a.mission=mission;a.targetRegionId=targetRegionId;a.status='assigned';return{assigned:true,aircraft:a};
}

function repairAtBase(region,a,elapsedDays,agreements=[],regionsById=new Map()) {
  const rights=aviationBasingRelationship(a,region,agreements,regionsById);
  if(a.status==='destroyed'||a.condition>=.999||a.baseRegionId!==region.id||!rights.allowed||!rights.repair)return;
  const need=1-a.condition,scale=Math.min(need,elapsedDays/DAYS_PER_YEAR*.8),cash=scale*20,wood=scale*16,textiles=scale*12,steel=scale*5;
  if((region.treasury||0)<cash||(region.stockpile?.wood||0)<wood||(region.stockpile?.textiles||0)<textiles||(region.stockpile?.steel||0)<steel)return;
  region.treasury-=cash;region.wallet=(region.wallet||0)+cash;region.stockpile.wood-=wood;region.stockpile.textiles-=textiles;region.stockpile.steel-=steel;a.condition=clamp(a.condition+scale);a.repairNeed=1-a.condition;if(a.condition>=.42&&a.status==='damaged')a.status='serviceable';
}

export function tickAviation(regions,currentTick,elapsedDays=7,rng=Math.random,options={}){
  const byId=new Map(regions.map(r=>[r.id,r])),agreements=options.agreements||[],events=[];
  for(const region of regions){
    tickAirDefenceIndustry(region,elapsedDays);
    const av=ensureAviation(region);tickAirPersonnel(region,av.aircraft,elapsedDays);
    for(const a of av.aircraft){
      repairAtBase(region,a,elapsedDays,agreements,byId);
      if(a.status!=='destroyed'&&a.baseRegionId===region.id&&aviationBasingRelationship(a,region,agreements,byId).allowed&&(a.fuel??0)<1){
        const need=Math.max(0,1-(a.fuel||0)); const available=Math.max(0,region.stockpile?.aviation_fuel||0); const take=Math.min(need,available);
        if(take>0){region.stockpile.aviation_fuel-=take;a.fuel=clamp((a.fuel||0)+take);if(a.status==='grounded'&&a.fuel>.12)a.status='serviceable';}
      }
      if(a.status==='destroyed'||a.mission===AIR_MISSIONS.IDLE||a.mission===AIR_MISSIONS.COURIER)continue;
      const target=byId.get(a.targetRegionId)||region,need=missionFuel(a.mission,a); if((a.fuel||0)<need){a.status='grounded';events.push({type:'aircraft_grounded_no_fuel',aircraftId:a.id,regionId:region.id});continue;}
      const fuelStock=region.stockpile?.aviation_fuel||0;if(fuelStock<need){a.status='grounded';events.push({type:'aircraft_grounded_no_fuel',aircraftId:a.id,regionId:region.id});continue;}
      region.stockpile.aviation_fuel-=need;a.fuel=clamp((a.fuel||1)-need*.15);a.totalFlights++;recordAircraftCrewPractice(a,1);av.flightExperience+=1;
      const crewReadiness=aircraftCrewReadiness(a),risk=clamp(airDefenceRisk(target,a)*(1.12-.12*crewReadiness)); if(rng()<risk){const reliability=clamp(a.designStats?.reliability||0),damage=(.18+rng()*.62)*(1-reliability*.22);const status=damageAircraft(a,damage);if(status==='destroyed')resolveAircraftCrewLoss(region,a,{rng});events.push({type:status==='destroyed'?'aircraft_shot_down':'aircraft_damaged',aircraftId:a.id,targetRegionId:target.id,damage});}
      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.SCOUT){const nav=clamp(a.designStats?.radioNavigation||0),range=clamp(a.designStats?.range||0),crew=aircraftCrewReadiness(a);region.airRecon ||= {};region.airRecon[target.id]={observedTick:currentTick,confidence:clamp((.35+a.pilotExperience*.30+a.condition*.20+nav*.10+range*.05)*(.72+.28*crew))};events.push({type:'aerial_reconnaissance',aircraftId:a.id,targetRegionId:target.id});}
      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.ATTACK&&has(region,AERIAL_BOMBING_TECH_ID)){const payload=clamp(a.designStats?.payload??.18),firepower=clamp(a.designStats?.firepower??.15),crew=aircraftCrewReadiness(a);target.warDamage ||= {infrastructureDamage:0,bombardmentWeeks:0};target.warDamage.infrastructureDamage+=.006*a.condition*(.45+payload*1.6+firepower*.35)*(.68+.32*crew);events.push({type:'aerial_attack',aircraftId:a.id,targetRegionId:target.id,payload});}
      if(a.status!=='destroyed'&&a.mission!==AIR_MISSIONS.INTERCEPT){a.mission=AIR_MISSIONS.IDLE;a.status=a.condition<.42?'damaged':'serviceable';a.targetRegionId=null;}
    }
    const civil=av.aircraft.filter(a=>a.ownerType==='civilian'&&a.status!=='destroyed').length;
    if(canBuild(region)&&civil<Math.max(1,Math.floor(Math.log10(Math.max(10,region.population||0))-3))){
      const wealth=clamp(Math.log1p(Math.max(0,region.wallet||0))/12),industry=industrialReadiness(region); if(rng()<elapsedDays/DAYS_PER_YEAR*.08*wealth*industry)buildAircraft(region,{ownerType:'civilian',role:'mail'});
    }
    const military=av.aircraft.filter(a=>a.ownerType==='military'&&a.status!=='destroyed').length;
    const militaryCap=Math.max(1,Math.floor(Math.max(0,region.population||0)/250000));
    if(canBuild(region)&&has(region,MILITARY_AVIATION_TECH_ID)&&military<militaryCap){
      const urgency=clamp(.2+(region.conflictPressure||0)*1.5+(region.militaryStrategy?.spendingPriority||0)*.35),industry=industrialReadiness(region);
      if(rng()<elapsedDays/DAYS_PER_YEAR*.12*urgency*industry)buildAircraft(region,{ownerType:'military',role:'recon'});
    }
  }
  return events;
}

export function availableAircraftCourier(origin,target){
  if(!operationalInfrastructure(origin,'airfield')||!operationalInfrastructure(target,'airfield'))return null;
  return serviceableAircraft(origin).filter(a=>a.mission===AIR_MISSIONS.IDLE&&['mail','recon'].includes(a.role)).sort((a,b)=>(b.condition??1)-(a.condition??1))[0]||null;
}

export function reserveAircraftCourier(origin,target){
  const a=availableAircraftCourier(origin,target); if(!a)return null;
  const fuelNeed=missionFuel(AIR_MISSIONS.COURIER,a);if((origin.stockpile?.aviation_fuel||0)<fuelNeed)return null;
  origin.stockpile.aviation_fuel-=fuelNeed;a.mission=AIR_MISSIONS.COURIER;a.status='assigned';a.targetRegionId=target.id;a.totalFlights++;ensureAviation(origin).flightExperience+=1;
  return {mode:'air',days:.65,fromRegionId:origin.id,toRegionId:target.id,regionIds:[origin.id,target.id],aircraftId:a.id};
}

export function completeAircraftCourier(route,regionsById,{lost=false,rng=Math.random}={}){
  const origin=regionsById.get(route?.fromRegionId),target=regionsById.get(route?.toRegionId);if(!origin||!route?.aircraftId)return;
  const a=ensureAviation(origin).aircraft.find(x=>x.id===route.aircraftId);if(!a)return;
  if(lost){const status=damageAircraft(a,.55+rng()*.55);if(status==='destroyed')resolveAircraftCrewLoss(origin,a,{rng});return;}
  a.mission=AIR_MISSIONS.IDLE;a.status=a.condition<.42?'damaged':'serviceable';a.targetRegionId=null;
  if(target&&a.status!=='destroyed'){
    origin.aviation.aircraft=origin.aviation.aircraft.filter(x=>x!==a);a.baseRegionId=target.id;ensureAviation(target).aircraft.push(a);
  }
}

export function aviationSummary(region){
  const a=ensureAviation(region).aircraft;
  const models=new Map();for(const x of a){if(x.status==='destroyed'||!x.designId)continue;const row=models.get(x.designId)||{designId:x.designId,name:x.modelName||'Unknown model',count:0,stats:x.designStats||{}};row.count++;models.set(x.designId,row);}
  return{total:a.filter(x=>x.status!=='destroyed').length,civilian:a.filter(x=>x.ownerType==='civilian'&&x.status!=='destroyed').length,military:a.filter(x=>x.ownerType==='military'&&x.status!=='destroyed').length,destroyed:a.filter(x=>x.status==='destroyed').length,models:[...models.values()],personnel:qualifiedPersonnelSummary(region,a,[])};
}