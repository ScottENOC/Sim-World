import { batteryMobilityCapability, BATTERY_TECH_IDS } from '../economy/batteryStorage.js?v=20260920-battery1';
import { TELEPHONE_TECH_ID } from '../economy/localCommunications.js?v=20260918-telephone1';
import { RADAR_TECH_ID } from '../military/aviation.js?v=20260918-aviation1';
import { SPACE_TECH_IDS } from './spaceRace.js?v=20260920-space-race1';

const DAYS_PER_YEAR=365.2425;
const PHOTOVOLTAIC_GENERATION_TECH_ID='photovoltaic_generation';
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=(v)=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const polityId=(r)=>r?.governance?.sovereignPolityId||r?.polityId||r?.id;
let nextSatelliteId=1;

export const SATELLITE_ROLES=Object.freeze({
  SCIENTIFIC:'scientific',
  WEATHER:'weather',
  COMMUNICATIONS:'communications',
  RECONNAISSANCE:'reconnaissance',
  NAVIGATION:'navigation',
});

export const SATELLITE_USE=Object.freeze({CIVILIAN:'civilian',MILITARY:'military',DUAL_USE:'dual_use'});

export const SATELLITE_TYPES=Object.freeze({
  [SATELLITE_ROLES.SCIENTIFIC]:{use:SATELLITE_USE.CIVILIAN,cash:95,steel:4,fuel:5,requires:[SPACE_TECH_IDS.ORBITAL_SYSTEMS],weights:{scienceObservation:1}},
  [SATELLITE_ROLES.WEATHER]:{use:SATELLITE_USE.CIVILIAN,cash:130,steel:5,fuel:6,requires:[SPACE_TECH_IDS.ORBITAL_SYSTEMS,RADAR_TECH_ID],weights:{weatherObservation:1,scienceObservation:.25}},
  [SATELLITE_ROLES.COMMUNICATIONS]:{use:SATELLITE_USE.DUAL_USE,cash:160,steel:6,fuel:7,requires:[SPACE_TECH_IDS.ORBITAL_SYSTEMS,TELEPHONE_TECH_ID],weights:{civilianCommunications:.9,militaryCommand:.45,remoteControl:.75}},
  [SATELLITE_ROLES.RECONNAISSANCE]:{use:SATELLITE_USE.MILITARY,cash:185,steel:7,fuel:8,requires:[SPACE_TECH_IDS.ORBITAL_SYSTEMS,RADAR_TECH_ID],weights:{militaryReconnaissance:1,militaryCommand:.15}},
  [SATELLITE_ROLES.NAVIGATION]:{use:SATELLITE_USE.DUAL_USE,cash:220,steel:8,fuel:9,requires:[SPACE_TECH_IDS.ORBITAL_SYSTEMS,'satellite_navigation_systems'],weights:{navigation:1,civilianCommunications:.15,militaryCommand:.2,remoteControl:.35}},
});

function groupedPolities(regions){
  const groups=new Map();
  for(const r of regions||[]){const id=polityId(r);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
  return groups;
}
function carrierRegion(members){
  const withProgramme=members.filter(r=>r.spaceProgramme).sort((a,b)=>(b.spaceProgramme?.completedMilestones?.length||0)-(a.spaceProgramme?.completedMilestones?.length||0));
  return withProgramme[0]||[...members].sort((a,b)=>(b.population||0)-(a.population||0))[0]||null;
}
function ensureOrbitalState(region){
  region.orbitalProgramme||={satellites:[],lastLaunchTick:null,totalLaunches:0,totalFailures:0};
  const state=region.orbitalProgramme;state.satellites||=[];
  state.groundControlCondition=clamp(state.groundControlCondition??1);
  state.launchInfrastructureCondition=clamp(state.launchInfrastructureCondition??1);
  return state;
}
export function syncNextSatelliteId(regions=[]){
  let max=0;
  for(const r of regions)for(const s of r.orbitalProgramme?.satellites||[])max=Math.max(max,Number(String(s.id||'').replace(/\D/g,''))||0);
  nextSatelliteId=max+1;
}
function nationalResources(members){return{treasury:members.reduce((s,r)=>s+nonNegative(r.treasury),0),steel:members.reduce((s,r)=>s+nonNegative(r.stockpile?.steel),0),fuel:members.reduce((s,r)=>s+nonNegative(r.stockpile?.petrol),0)};}
function consumeAcross(members,key,amount){
  let remaining=Math.max(0,amount);
  const available=(r)=>key==='treasury'?nonNegative(r.treasury):nonNegative(r.stockpile?.[key==='fuel'?'petrol':key]);
  for(const r of [...members].sort((a,b)=>available(b)-available(a))){
    if(remaining<=1e-9)break;
    const take=Math.min(available(r),remaining);
    if(key==='treasury')r.treasury=available(r)-take;else{r.stockpile||={};const k=key==='fuel'?'petrol':key;r.stockpile[k]=available(r)-take;}
    remaining-=take;
  }
  return amount-remaining;
}
function technologyAvailable(members,id){return members.some(r=>has(r,id));}
function roleAvailable(members,role){const type=SATELLITE_TYPES[role];return Boolean(type&&(type.requires||[]).every(id=>technologyAvailable(members,id)));}
function batteryCapability(members){
  let best={available:false,satelliteUtility:0,chemistry:null};
  for(const r of members){const b=batteryMobilityCapability(r);if((b.satelliteUtility||0)>(best.satelliteUtility||0))best=b;}
  return best;
}
function powerPackage(members){
  const battery=batteryCapability(members);
  const solar=technologyAvailable(members,PHOTOVOLTAIC_GENERATION_TECH_ID);
  const rechargeable=members.some(r=>has(r,BATTERY_TECH_IDS.LEAD_ACID));
  if(solar&&rechargeable)return{mode:'solar_rechargeable',designLifeDays:DAYS_PER_YEAR*(4.5+(battery.satelliteUtility||.15)*5.5),batteryChemistry:battery.chemistry||'lead_acid'};
  return{mode:'battery_only',designLifeDays:55+(battery.satelliteUtility||.15)*155,batteryChemistry:battery.chemistry||'primary_cells'};
}
function orbitalCapabilityFrom(satellites){
  const raw={scienceObservation:0,weatherObservation:0,civilianCommunications:0,militaryReconnaissance:0,militaryCommand:0,remoteControl:0,navigation:0};
  for(const satellite of satellites){
    if(!satellite.operational)continue;
    const type=SATELLITE_TYPES[satellite.role];if(!type)continue;
    const reliability=clamp(satellite.condition??1);
    for(const [key,weight] of Object.entries(type.weights||{}))raw[key]+=weight*reliability;
  }
  const out={};for(const [key,value] of Object.entries(raw))out[key]=clamp(1-Math.exp(-value*.72));
  out.droneBeyondLineOfSightControl=out.remoteControl;
  out.operationalSatellites=satellites.filter(s=>s.operational).length;
  return out;
}
function applyGroundControl(capability,state){
  const control=clamp(state?.groundControlCondition??1),observation=.45+.55*control;
  capability.civilianCommunications*=control;capability.militaryCommand*=control;capability.remoteControl*=control;capability.droneBeyondLineOfSightControl*=control;capability.navigation*=control;
  capability.militaryReconnaissance*=observation;capability.weatherObservation*=observation;capability.scienceObservation*=observation;
  capability.groundControlCondition=control;capability.launchInfrastructureCondition=clamp(state?.launchInfrastructureCondition??1);
  return capability;
}
function syncSupport(members,satellites,state){const capability=applyGroundControl(orbitalCapabilityFrom(satellites),state);for(const r of members)r.orbitalSupport={...capability};return capability;}

export function orbitalSupport(region){return region?.orbitalSupport||{scienceObservation:0,weatherObservation:0,civilianCommunications:0,militaryReconnaissance:0,militaryCommand:0,remoteControl:0,navigation:0,droneBeyondLineOfSightControl:0,operationalSatellites:0,groundControlCondition:1,launchInfrastructureCondition:1};}

export function launchSatellite(members,role,currentTick,{free=false}= {}){
  const carrier=carrierRegion(members);if(!carrier)return{launched:false,reason:'no_space_programme'};
  if(!roleAvailable(members,role))return{launched:false,reason:'technology_not_ready'};
  const state=ensureOrbitalState(carrier);if(!free&&state.launchInfrastructureCondition<.18)return{launched:false,reason:'launch_infrastructure_disabled'};
  const type=SATELLITE_TYPES[role],resources=nationalResources(members);
  if(!free&&(resources.treasury<type.cash||resources.steel<type.steel||resources.fuel<type.fuel))return{launched:false,reason:'insufficient_resources'};
  if(!free){consumeAcross(members,'treasury',type.cash);consumeAcross(members,'steel',type.steel);consumeAcross(members,'fuel',type.fuel);}
  const power=powerPackage(members);
  const satellite={id:`sat_${nextSatelliteId++}`,role,use:type.use,ownerPolityId:polityId(carrier),launchRegionId:carrier.id,launchedTick:currentTick,powerMode:power.mode,batteryChemistry:power.batteryChemistry,designLifeDays:power.designLifeDays,remainingLifeDays:power.designLifeDays,condition:1,operational:true};
  state.satellites.push(satellite);state.lastLaunchTick=currentTick;state.totalLaunches++;
  syncSupport(members,state.satellites,state);
  return{launched:true,satellite,cost:free?{cash:0,steel:0,fuel:0}:{cash:type.cash,steel:type.steel,fuel:type.fuel}};
}

function chooseNextRole(members,satellites){
  const support=orbitalCapabilityFrom(satellites);
  const candidates=[];
  if(roleAvailable(members,SATELLITE_ROLES.SCIENTIFIC))candidates.push([SATELLITE_ROLES.SCIENTIFIC,support.scienceObservation]);
  if(roleAvailable(members,SATELLITE_ROLES.WEATHER))candidates.push([SATELLITE_ROLES.WEATHER,support.weatherObservation]);
  if(roleAvailable(members,SATELLITE_ROLES.COMMUNICATIONS))candidates.push([SATELLITE_ROLES.COMMUNICATIONS,Math.max(support.civilianCommunications,support.remoteControl)]);
  if(roleAvailable(members,SATELLITE_ROLES.RECONNAISSANCE))candidates.push([SATELLITE_ROLES.RECONNAISSANCE,support.militaryReconnaissance]);
  if(roleAvailable(members,SATELLITE_ROLES.NAVIGATION))candidates.push([SATELLITE_ROLES.NAVIGATION,support.navigation]);
  candidates.sort((a,b)=>a[1]-b[1]);return candidates[0]?.[0]||null;
}
function programmeReady(members){return members.some(r=>r.spaceProgramme?.completedMilestones?.includes?.('first_satellite'))&&technologyAvailable(members,SPACE_TECH_IDS.ORBITAL_SYSTEMS);}
function repairGroundInfrastructure(carrier,state,days){
  if(state.groundControlCondition>=.999&&state.launchInfrastructureCondition>=.999)return;
  const pace=Math.max(.1,days/7),cash=Math.min(nonNegative(carrier.treasury),1.4*pace),steel=Math.min(nonNegative(carrier.stockpile?.steel),.12*pace);
  if(cash<=0||steel<=0)return;
  carrier.treasury-=cash;carrier.stockpile.steel-=steel;
  const repair=.012*pace*Math.min(1,cash/(1.4*pace),steel/(.12*pace));state.groundControlCondition=clamp(state.groundControlCondition+repair);state.launchInfrastructureCondition=clamp(state.launchInfrastructureCondition+repair*.82);
}

export function tickOrbitalSatellites(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[],groups=groupedPolities(regions);syncNextSatelliteId(regions);
  for(const members of groups.values()){
    const carrier=carrierRegion(members);if(!carrier||!programmeReady(members))continue;
    const state=ensureOrbitalState(carrier),days=Math.max(0,Number(elapsedDays)||0);repairGroundInfrastructure(carrier,state,days);
    if(!state.satellites.length){
      const first=launchSatellite(members,SATELLITE_ROLES.SCIENTIFIC,currentTick,{free:true});
      if(first.launched)events.push({type:'satellite_launched',regionId:carrier.id,tick:currentTick,title:'First orbital satellite enters service',satelliteId:first.satellite.id,role:first.satellite.role,use:first.satellite.use});
    }
    for(const satellite of state.satellites){
      if(!satellite.operational)continue;
      satellite.remainingLifeDays=Math.max(0,nonNegative(satellite.remainingLifeDays)-days);
      const lifeFraction=satellite.designLifeDays>0?satellite.remainingLifeDays/satellite.designLifeDays:0;
      satellite.condition=clamp(Math.min(satellite.condition??1,.45+lifeFraction*.55));
      if(satellite.remainingLifeDays<=0){satellite.operational=false;satellite.condition=0;events.push({type:'satellite_end_of_life',regionId:carrier.id,tick:currentTick,satelliteId:satellite.id,role:satellite.role});}
    }
    syncSupport(members,state.satellites,state);
    const since=state.lastLaunchTick===null?99999:Math.max(0,currentTick-state.lastLaunchTick);
    const role=chooseNextRole(members,state.satellites);
    if(!role||since<26)continue;
    const resources=nationalResources(members),type=SATELLITE_TYPES[role];
    const affordability=Math.min(resources.treasury/Math.max(1,type.cash),resources.steel/Math.max(1,type.steel),resources.fuel/Math.max(1,type.fuel));
    const operational=state.satellites.filter(s=>s.operational).length;
    const annualChance=clamp((.10+Math.min(.18,operational*.025)+(affordability>=2?.12:0))*state.launchInfrastructureCondition);
    if(affordability<1||rng()>=1-Math.pow(1-annualChance,days/DAYS_PER_YEAR))continue;
    const launched=launchSatellite(members,role,currentTick);
    if(launched.launched)events.push({type:'satellite_launched',regionId:carrier.id,tick:currentTick,title:`${role} satellite launched`,satelliteId:launched.satellite.id,role,use:launched.satellite.use,cost:launched.cost});
  }
  return events;
}
