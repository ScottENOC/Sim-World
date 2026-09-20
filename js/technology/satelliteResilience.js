import { SPACE_TECH_IDS } from './spaceRace.js?v=20260920-space-race1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const polityId=r=>r?.governance?.sovereignPolityId||r?.polityId||r?.id;

export const SATELLITE_RESILIENCE_TECH_IDS=Object.freeze({
  FREQUENCY_AGILE_LINKS:'frequency_agile_satellite_links',
  MANOEUVRABLE_SPACECRAFT:'manoeuvrable_satellite_buses',
  REDUNDANT_GROUND_CONTROL:'redundant_orbital_ground_control',
  RAPID_REPLACEMENT_LAUNCH:'rapid_replacement_launch',
  PROLIFERATED_LEO:'proliferated_low_earth_orbit_constellations',
});

function electronics(region){const c=region?.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radio_navigation||0,c.radar_set||0));}
function precision(region){return clamp(region?.industrialSupply?.capability?.precision_machining||0);}
function manufacture(region){return clamp(region?.structuralTransformation?.capability?.manufacture||0);}
function spaceExperience(region){const p=region?.spaceProgramme;return clamp(((p?.completedMilestones?.length||0)*.07)+((region?.orbitalProgramme?.totalLaunches||0)*.035));}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function ensureSatelliteResilience(region){
  region.satelliteResilience||={groundStations:1,mobileGroundStations:0,replacementReserve:0,lessons:0};
  const s=region.satelliteResilience;
  s.groundStations=Math.max(1,Math.floor(Number(s.groundStations)||1));
  s.mobileGroundStations=Math.max(0,Math.floor(Number(s.mobileGroundStations)||0));
  s.replacementReserve=clamp(s.replacementReserve||0,0,3);
  s.lessons=clamp(s.lessons||0);
  return s;
}

export function tickSatelliteResilienceBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set();const e=electronics(region),p=precision(region),m=manufacture(region),xp=spaceExperience(region),lessons=ensureSatelliteResilience(region).lessons;
    if(!has(region,SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS)&&has(region,SPACE_TECH_IDS.ORBITAL_SYSTEMS)&&e>.58&&xp>.14){
      if(rng()<annual(.001+e*.006+xp*.006+lessons*.008,elapsedDays)){region.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS);events.push({type:'space_resilience_breakthrough',techId:SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS,regionId:region.id,tick:currentTick,title:'Frequency-agile satellite links'});continue;}
    }
    if(!has(region,SATELLITE_RESILIENCE_TECH_IDS.MANOEUVRABLE_SPACECRAFT)&&has(region,SPACE_TECH_IDS.ORBITAL_SYSTEMS)&&p>.62&&e>.60&&xp>.18){
      if(rng()<annual(.00075+p*.005+e*.004+xp*.006,elapsedDays)){region.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.MANOEUVRABLE_SPACECRAFT);events.push({type:'space_resilience_breakthrough',techId:SATELLITE_RESILIENCE_TECH_IDS.MANOEUVRABLE_SPACECRAFT,regionId:region.id,tick:currentTick,title:'Manoeuvrable satellite buses'});continue;}
    }
    if(!has(region,SATELLITE_RESILIENCE_TECH_IDS.REDUNDANT_GROUND_CONTROL)&&has(region,SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS)&&e>.66&&m>.58&&xp>.20){
      if(rng()<annual(.0006+e*.0045+m*.004+lessons*.009,elapsedDays)){region.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.REDUNDANT_GROUND_CONTROL);events.push({type:'space_resilience_breakthrough',techId:SATELLITE_RESILIENCE_TECH_IDS.REDUNDANT_GROUND_CONTROL,regionId:region.id,tick:currentTick,title:'Redundant orbital ground control'});continue;}
    }
    if(!has(region,SATELLITE_RESILIENCE_TECH_IDS.RAPID_REPLACEMENT_LAUNCH)&&has(region,SATELLITE_RESILIENCE_TECH_IDS.MANOEUVRABLE_SPACECRAFT)&&m>.70&&p>.68&&xp>.28){
      if(rng()<annual(.0004+m*.004+p*.004+lessons*.010,elapsedDays)){region.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.RAPID_REPLACEMENT_LAUNCH);events.push({type:'space_resilience_breakthrough',techId:SATELLITE_RESILIENCE_TECH_IDS.RAPID_REPLACEMENT_LAUNCH,regionId:region.id,tick:currentTick,title:'Rapid replacement launch'});continue;}
    }
    if(!has(region,SATELLITE_RESILIENCE_TECH_IDS.PROLIFERATED_LEO)&&has(region,SATELLITE_RESILIENCE_TECH_IDS.RAPID_REPLACEMENT_LAUNCH)&&has(region,SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS)&&e>.78&&m>.76&&p>.72&&xp>.36){
      if(rng()<annual(.00018+e*.003+m*.003+p*.0025+lessons*.010,elapsedDays)){region.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.PROLIFERATED_LEO);events.push({type:'space_resilience_breakthrough',techId:SATELLITE_RESILIENCE_TECH_IDS.PROLIFERATED_LEO,regionId:region.id,tick:currentTick,title:'Proliferated low-Earth-orbit constellations'});}
    }
  }
  return events;
}

export function nationalSatelliteResilience(members=[]){
  const frequency=members.some(r=>has(r,SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS));
  const manoeuvre=members.some(r=>has(r,SATELLITE_RESILIENCE_TECH_IDS.MANOEUVRABLE_SPACECRAFT));
  const redundant=members.some(r=>has(r,SATELLITE_RESILIENCE_TECH_IDS.REDUNDANT_GROUND_CONTROL));
  const rapid=members.some(r=>has(r,SATELLITE_RESILIENCE_TECH_IDS.RAPID_REPLACEMENT_LAUNCH));
  const proliferated=members.some(r=>has(r,SATELLITE_RESILIENCE_TECH_IDS.PROLIFERATED_LEO));
  const state=members.map(ensureSatelliteResilience).sort((a,b)=>(b.groundStations+b.mobileGroundStations)-(a.groundStations+a.mobileGroundStations))[0]||{groundStations:1,mobileGroundStations:0,replacementReserve:0};
  return {
    frequencyAgility:frequency?.58:0,
    manoeuvreEvasion:manoeuvre?.28:0,
    debrisAvoidance:manoeuvre?.38:0,
    groundControlRedundancy:redundant?clamp(.28+Math.min(.42,(state.groundStations-1)*.10+state.mobileGroundStations*.14)):0,
    rapidReplacement:rapid?.52:0,
    proliferatedLeo:proliferated,
    constellationDilution:proliferated?.68:0,
    groundStations:state.groundStations,
    mobileGroundStations:state.mobileGroundStations,
    replacementReserve:state.replacementReserve,
  };
}

export function buildResilientGroundStation(region,{mobile=false}={}){
  const state=ensureSatelliteResilience(region);region.stockpile||={};const inv=region.industrialSupply?.inventory||{};
  if(!has(region,SATELLITE_RESILIENCE_TECH_IDS.REDUNDANT_GROUND_CONTROL))return{built:false,reason:'technology_not_ready'};
  const cash=mobile?70:95,steel=mobile?3:6,electronicsNeed=mobile?3:4;
  if((region.treasury||0)<cash||(region.stockpile.steel||0)<steel||(inv.electronics||0)<electronicsNeed)return{built:false,reason:'insufficient_inputs'};
  region.treasury-=cash;region.stockpile.steel-=steel;inv.electronics-=electronicsNeed;
  if(mobile)state.mobileGroundStations++;else state.groundStations++;
  return{built:true,mobile,cost:{cash,steel,electronics:electronicsNeed}};
}

export function addResilienceLesson(region,amount=.04){const s=ensureSatelliteResilience(region);s.lessons=clamp(s.lessons+Math.max(0,amount)*(1-s.lessons));return s.lessons;}
export function resilienceForActor(regions,actor){return nationalSatelliteResilience((regions||[]).filter(r=>polityId(r)===actor));}
