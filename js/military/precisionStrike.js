import { navigationService, SATELLITE_NAVIGATION_TECH_IDS } from '../technology/satelliteNavigation.js?v=20260921-precision-strike1';
import { GUIDED_WEAPON_TECH_ID, layeredAirDefenceEngagement } from './guidedAirDefence.js?v=20260921-precision-strike1';
import { STRATEGIC_MISSILE_TECH_ID } from './strategicDelivery.js?v=20260921-precision-strike1';
import { applyShipHit } from './navalDamage.js?v=20260921-precision-strike1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const PRECISION_STRIKE_TECH_IDS=Object.freeze({
  CRUISE_MISSILE:'terrain_following_cruise_missiles',
  ANTI_SHIP:'sea_skimming_anti_ship_missiles',
  AIR_LAUNCHED:'air_launched_standoff_weapons',
  TERMINAL_SEEKER:'advanced_terminal_missile_seekers',
});

export const PRECISION_MUNITION_TYPES=Object.freeze({
  LAND_ATTACK:'land_attack_cruise_missile',
  ANTI_SHIP:'anti_ship_cruise_missile',
  STANDOFF:'air_launched_standoff_weapon',
});

const SPECS=Object.freeze({
  [PRECISION_MUNITION_TYPES.LAND_ATTACK]:{tech:PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE,cash:42,steel:1.8,machine:1.5,electronics:.8,fuel:.12,range:5,warhead:.72,speed:.55,signature:.32,terrainFollowing:true},
  [PRECISION_MUNITION_TYPES.ANTI_SHIP]:{tech:PRECISION_STRIKE_TECH_IDS.ANTI_SHIP,cash:48,steel:2.0,machine:1.6,electronics:1.0,fuel:.11,range:4,warhead:.80,speed:.64,signature:.27,seaSkimming:true},
  [PRECISION_MUNITION_TYPES.STANDOFF]:{tech:PRECISION_STRIKE_TECH_IDS.AIR_LAUNCHED,cash:34,steel:1.1,machine:1.2,electronics:.7,fuel:.07,range:3,warhead:.56,speed:.70,signature:.25,airLaunched:true},
});

function electronics(region){const c=region?.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radio_navigation||0,c.radar_set||0));}
function precision(region){return clamp(region?.industrialSupply?.capability?.precision_machining||0);}
function manufacture(region){return clamp(region?.structuralTransformation?.capability?.manufacture||0);}
function flightExperience(region){return clamp((region?.aviation?.flightExperience||0)/4200);}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function ensurePrecisionStrike(region){
  region.precisionStrike||={inventory:{},experience:0,totalBuilt:0,totalLaunched:0,totalHits:0};
  region.precisionStrike.inventory||={};
  for(const type of Object.values(PRECISION_MUNITION_TYPES))region.precisionStrike.inventory[type]=Math.max(0,Math.floor(region.precisionStrike.inventory[type]||0));
  return region.precisionStrike;
}

export function tickPrecisionStrikeBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const r of regions||[]){
    r.unlockedTechIds||=new Set();const e=electronics(r),p=precision(r),m=manufacture(r),xp=ensurePrecisionStrike(r).experience;
    if(!has(r,PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE)&&has(r,GUIDED_WEAPON_TECH_ID)&&has(r,STRATEGIC_MISSILE_TECH_ID)&&e>.52&&p>.54&&m>.50){
      if(rng()<annual(.002+e*.011+p*.010+m*.007+xp*.005,elapsedDays)){r.unlockedTechIds.add(PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE);events.push({type:'precision_strike_breakthrough',techId:PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE,regionId:r.id,tick:currentTick,title:'Terrain-following cruise missiles'});continue;}
    }
    if(!has(r,PRECISION_STRIKE_TECH_IDS.ANTI_SHIP)&&has(r,PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE)&&has(r,'radar')&&e>.58&&p>.56){
      if(rng()<annual(.0018+e*.011+p*.008+(r.isCoastal?.007:0),elapsedDays)){r.unlockedTechIds.add(PRECISION_STRIKE_TECH_IDS.ANTI_SHIP);events.push({type:'precision_strike_breakthrough',techId:PRECISION_STRIKE_TECH_IDS.ANTI_SHIP,regionId:r.id,tick:currentTick,title:'Sea-skimming anti-ship missiles'});continue;}
    }
    if(!has(r,PRECISION_STRIKE_TECH_IDS.AIR_LAUNCHED)&&has(r,PRECISION_STRIKE_TECH_IDS.CRUISE_MISSILE)&&has(r,'military_aviation')&&flightExperience(r)>.20){
      if(rng()<annual(.0016+e*.008+p*.008+flightExperience(r)*.010,elapsedDays)){r.unlockedTechIds.add(PRECISION_STRIKE_TECH_IDS.AIR_LAUNCHED);events.push({type:'precision_strike_breakthrough',techId:PRECISION_STRIKE_TECH_IDS.AIR_LAUNCHED,regionId:r.id,tick:currentTick,title:'Air-launched stand-off weapons'});continue;}
    }
    if(!has(r,PRECISION_STRIKE_TECH_IDS.TERMINAL_SEEKER)&&has(r,PRECISION_STRIKE_TECH_IDS.ANTI_SHIP)&&e>.72&&p>.68){
      if(rng()<annual(.0007+e*.006+p*.005+xp*.008,elapsedDays)){r.unlockedTechIds.add(PRECISION_STRIKE_TECH_IDS.TERMINAL_SEEKER);events.push({type:'precision_strike_breakthrough',techId:PRECISION_STRIKE_TECH_IDS.TERMINAL_SEEKER,regionId:r.id,tick:currentTick,title:'Advanced terminal missile seekers'});}
    }
  }
  return events;
}

export function buildPrecisionMunition(region,type,{count=1}={}){
  const spec=SPECS[type],state=ensurePrecisionStrike(region),n=Math.max(1,Math.floor(count));
  if(!spec||!has(region,spec.tech))return{built:false,reason:'technology_not_ready'};
  const inv=region.industrialSupply?.inventory||{};region.stockpile||={};
  const needs={cash:spec.cash*n,steel:spec.steel*n,machine:spec.machine*n,electronics:spec.electronics*n,fuel:spec.fuel*n};
  if(nonNegative(region.treasury)<needs.cash||nonNegative(region.stockpile.steel)<needs.steel||nonNegative(inv.machine_components)<needs.machine||nonNegative(inv.electronics)<needs.electronics||nonNegative(region.stockpile.aviation_fuel)<needs.fuel)return{built:false,reason:'insufficient_inputs'};
  region.treasury-=needs.cash;region.stockpile.steel-=needs.steel;inv.machine_components-=needs.machine;inv.electronics-=needs.electronics;region.stockpile.aviation_fuel-=needs.fuel;
  state.inventory[type]+=n;state.totalBuilt+=n;return{built:true,type,count:n,cost:needs};
}

function guidance(region,type){
  const nav=navigationService(region),e=electronics(region),p=precision(region),integrated=has(region,SATELLITE_NAVIGATION_TECH_IDS.INTEGRATED_NAVIGATION),terminal=has(region,PRECISION_STRIKE_TECH_IDS.TERMINAL_SEEKER);
  const inertial=clamp(.32+e*.20+p*.18+(integrated?.18:0));
  const satellite=clamp(nav.precisionStrike||0);
  const terminalQuality=clamp((type===PRECISION_MUNITION_TYPES.ANTI_SHIP?.18:.10)+e*.18+(terminal?.28:0));
  const accuracy=clamp(inertial*.50+satellite*.34+terminalQuality*.16);
  return{accuracy,inertial,satellite,terminal:terminalQuality,contestedRetention:clamp(integrated?Math.max(inertial*.72,nav.contestedRetention||0):inertial*.48)};
}

function consume(region,type){const s=ensurePrecisionStrike(region);if((s.inventory[type]||0)<1)return false;s.inventory[type]--;s.totalLaunched++;return true;}
function threat(spec){return{type:'cruise_missile',signature:spec.signature,speed:spec.speed,altitude:spec.seaSkimming?.08:.18,replacementValue:spec.cash,damagePotential:spec.warhead,payloadValue:spec.warhead};}

export function conductLandAttackCruiseMissile(attacker,target,{rng=Math.random,currentTick=0}={}){
  const type=PRECISION_MUNITION_TYPES.LAND_ATTACK,spec=SPECS[type];if(!has(attacker,spec.tech))return{launched:false,reason:'technology_not_ready'};if(!consume(attacker,type))return{launched:false,reason:'no_munitions'};
  const defence=layeredAirDefenceEngagement(target,threat(spec),{rng});if(defence.killed)return{launched:true,intercepted:true,hit:false,defenceLayer:defence.layer};
  const g=guidance(attacker,type),hit=rng()<clamp(.24+g.accuracy*.68);let damage=0;if(hit){target.warDamage||={infrastructureDamage:0,bombardmentWeeks:0};damage=.010+spec.warhead*(.008+g.accuracy*.010);target.warDamage.infrastructureDamage+=damage;ensurePrecisionStrike(attacker).totalHits++;}
  ensurePrecisionStrike(attacker).experience=clamp(ensurePrecisionStrike(attacker).experience+.006);
  return{launched:true,intercepted:false,hit,damage,guidance:g,tick:currentTick};
}

export function conductAntiShipMissileStrike(attacker,targetRegion,targetFleet,{count=1,rng=Math.random,currentTick=0}={}){
  const type=PRECISION_MUNITION_TYPES.ANTI_SHIP,spec=SPECS[type],state=ensurePrecisionStrike(attacker),available=Math.min(Math.max(1,Math.floor(count)),state.inventory[type]||0);
  if(!has(attacker,spec.tech))return{launched:false,reason:'technology_not_ready'};if(available<=0)return{launched:false,reason:'no_munitions'};
  const g=guidance(attacker,type),events=[],ships=(targetFleet?.ships||[]).filter(s=>(s.condition??1)>.05);if(!ships.length)return{launched:false,reason:'no_target_ships'};
  let hits=0,intercepted=0;
  for(let i=0;i<available;i++){
    consume(attacker,type);const defence=layeredAirDefenceEngagement(targetRegion,threat(spec),{rng});if(defence.killed){intercepted++;events.push({intercepted:true,layer:defence.layer});continue;}
    if(rng()>=clamp(.20+g.accuracy*.72)){events.push({intercepted:false,hit:false});continue;}
    const live=ships.filter(s=>(s.condition??1)>.05);if(!live.length)break;const capitals=live.filter(s=>s.carrierFacilities||['dreadnought','steel_warship'].includes(s.designId));const pool=capitals.length&&rng()<clamp(.32+g.terminal*.42)?capitals:live;const ship=pool[Math.floor(rng()*pool.length)%pool.length];const damage=clamp(.13+spec.warhead*.18+g.accuracy*.08+rng()*.10,.12,.46);applyShipHit(ship,damage,{rng});hits++;state.totalHits++;events.push({intercepted:false,hit:true,shipId:ship.id,damage});
  }
  state.experience=clamp(state.experience+.006*available);
  return{launched:true,count:available,hits,intercepted,guidance:g,events,tick:currentTick};
}

export function precisionStrikeSummary(region){const s=ensurePrecisionStrike(region);return{inventory:{...s.inventory},experience:s.experience,totalBuilt:s.totalBuilt,totalLaunched:s.totalLaunched,totalHits:s.totalHits,navigation:navigationService(region)};}
