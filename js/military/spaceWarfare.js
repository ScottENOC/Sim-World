import { DIRECTED_ENERGY_TECH_IDS } from './directedEnergy.js?v=20260920-directed-energy1';
import { SPACE_TECH_IDS } from '../technology/spaceRace.js?v=20260920-space-race1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
const polityId=r=>r?.governance?.sovereignPolityId||r?.polityId||r?.id;

export const SPACE_WARFARE_TECH_IDS=Object.freeze({
  ELECTRONIC_ATTACK:'orbital_electronic_attack',
  OPTICAL_DAZZLING:'orbital_optical_dazzling',
  KINETIC_ASAT:'kinetic_anti_satellite_weapons',
  ORBITAL_WEAPONS:'orbital_weapons_platforms',
});

export const SPACE_ATTACK_TYPES=Object.freeze({
  JAM:'electronic_jamming',
  DAZZLE:'optical_dazzling',
  KINETIC:'kinetic_asat',
  ORBITAL_LASER:'orbital_laser_attack',
});

function electronics(region){const c=region?.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radio_navigation||0,c.radar_set||0));}
function precision(region){return clamp(region?.industrialSupply?.capability?.precision_machining||0);}
function grid(region){return clamp(region?.electricity?.industrialService||region?.electricity?.service||0);}
function spaceExperience(region){const p=region?.spaceProgramme;return clamp(((p?.completedMilestones?.length||0)*.08)+((region?.orbitalProgramme?.totalLaunches||0)*.04));}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function tickSpaceWarfareBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set();const e=electronics(region),p=precision(region),g=grid(region),xp=spaceExperience(region);
    if(!has(region,SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK)&&has(region,SPACE_TECH_IDS.ORBITAL_SYSTEMS)&&has(region,'radar')&&e>.58&&xp>.12){
      if(rng()<annual(.0007+e*.005+xp*.006,elapsedDays)){region.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK);events.push({type:'space_warfare_breakthrough',techId:SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK,regionId:region.id,tick:currentTick,title:'Orbital electronic attack'});continue;}
    }
    if(!has(region,SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING)&&has(region,SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK)&&has(region,DIRECTED_ENERGY_TECH_IDS.HIGH_ENERGY_LASER_RESEARCH)&&e>.68&&p>.62&&g>.62){
      if(rng()<annual(.00045+e*.004+p*.004+xp*.006,elapsedDays)){region.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING);events.push({type:'space_warfare_breakthrough',techId:SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING,regionId:region.id,tick:currentTick,title:'Satellite optical dazzling'});continue;}
    }
    if(!has(region,SPACE_WARFARE_TECH_IDS.KINETIC_ASAT)&&has(region,SPACE_TECH_IDS.ORBITAL_SYSTEMS)&&has(region,'strategic_missile_systems')&&e>.66&&p>.68&&xp>.20){
      if(rng()<annual(.00032+e*.003+p*.004+xp*.006,elapsedDays)){region.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.KINETIC_ASAT);events.push({type:'space_warfare_breakthrough',techId:SPACE_WARFARE_TECH_IDS.KINETIC_ASAT,regionId:region.id,tick:currentTick,title:'Kinetic anti-satellite weapon'});continue;}
    }
    if(!has(region,SPACE_WARFARE_TECH_IDS.ORBITAL_WEAPONS)&&has(region,SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING)&&has(region,SPACE_WARFARE_TECH_IDS.KINETIC_ASAT)&&has(region,DIRECTED_ENERGY_TECH_IDS.SHIPBORNE_LASER)&&e>.78&&p>.76&&g>.75&&xp>.32){
      if(rng()<annual(.00016+e*.0025+p*.0025+g*.002+xp*.005,elapsedDays)){region.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.ORBITAL_WEAPONS);events.push({type:'space_warfare_breakthrough',techId:SPACE_WARFARE_TECH_IDS.ORBITAL_WEAPONS,regionId:region.id,tick:currentTick,title:'Orbital weapons platforms'});}
    }
  }
  return events;
}

function programmeRegion(regions,actor){return (regions||[]).filter(r=>polityId(r)===actor).sort((a,b)=>(b.orbitalProgramme?.satellites?.length||0)-(a.orbitalProgramme?.satellites?.length||0))[0]||null;}
function satellitesFor(regions,actor){const carrier=programmeRegion(regions,actor);return carrier?.orbitalProgramme?.satellites||[];}
function bestRegion(regions,actor){return (regions||[]).filter(r=>polityId(r)===actor).sort((a,b)=>electronics(b)-electronics(a))[0]||null;}

export function spaceAttackAssessment(regions,attackerActorId,targetActorId,attackType,targetSatelliteId=null){
  const attacker=bestRegion(regions,attackerActorId),targets=satellitesFor(regions,targetActorId).filter(s=>s.operational);
  const target=targetSatelliteId?targets.find(s=>s.id===targetSatelliteId):targets.sort((a,b)=>(b.use==='military'?1:0)-(a.use==='military'?1:0))[0];
  if(!attacker||!target)return{possible:false,reason:'missing_attacker_or_target'};
  const tech=attackType===SPACE_ATTACK_TYPES.JAM?SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK:attackType===SPACE_ATTACK_TYPES.DAZZLE?SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING:attackType===SPACE_ATTACK_TYPES.KINETIC?SPACE_WARFARE_TECH_IDS.KINETIC_ASAT:SPACE_WARFARE_TECH_IDS.ORBITAL_WEAPONS;
  if(!has(attacker,tech))return{possible:false,reason:'technology_not_ready'};
  const e=electronics(attacker),p=precision(attacker),xp=spaceExperience(attacker);
  const chance=attackType===SPACE_ATTACK_TYPES.JAM?clamp(.38+e*.32+xp*.16):attackType===SPACE_ATTACK_TYPES.DAZZLE?clamp(.28+e*.22+p*.18+xp*.18):attackType===SPACE_ATTACK_TYPES.KINETIC?clamp(.22+e*.18+p*.28+xp*.16):clamp(.20+e*.22+p*.22+xp*.18);
  const cash=attackType===SPACE_ATTACK_TYPES.JAM?18:attackType===SPACE_ATTACK_TYPES.DAZZLE?32:attackType===SPACE_ATTACK_TYPES.KINETIC?145:58;
  return{possible:true,attacker,target,chance,cash};
}

function addDebris(regions,amount,currentTick,cause){
  const density=clamp(Math.max(...(regions||[]).map(r=>r.orbitalEnvironment?.debrisDensity||0),0)+amount,0,5);
  for(const r of regions||[])r.orbitalEnvironment={...(r.orbitalEnvironment||{}),debrisDensity:density,lastDebrisTick:currentTick,lastDebrisCause:cause};
  return density;
}

export function conductSpaceAttack(regions,attackerActorId,targetActorId,attackType,{targetSatelliteId=null,currentTick=0,rng=Math.random}={}){
  const a=spaceAttackAssessment(regions,attackerActorId,targetActorId,attackType,targetSatelliteId);if(!a.possible)return{attacked:false,reason:a.reason};
  if(nonNegative(a.attacker.treasury)<a.cash)return{attacked:false,reason:'insufficient_resources'};
  a.attacker.treasury-=a.cash;const success=rng()<a.chance,target=a.target;
  let debrisDensity=Math.max(...(regions||[]).map(r=>r.orbitalEnvironment?.debrisDensity||0),0);
  if(success){
    if(attackType===SPACE_ATTACK_TYPES.JAM){target.jammedFraction=Math.max(target.jammedFraction||0,.72);target.jammedDaysRemaining=Math.max(target.jammedDaysRemaining||0,30);}
    else if(attackType===SPACE_ATTACK_TYPES.DAZZLE){target.dazzledFraction=Math.max(target.dazzledFraction||0,.62);target.dazzledDaysRemaining=Math.max(target.dazzledDaysRemaining||0,60);}
    else if(attackType===SPACE_ATTACK_TYPES.ORBITAL_LASER){target.condition=clamp((target.condition??1)-(.18+rng()*.28));target.dazzledFraction=Math.max(target.dazzledFraction||0,.48);target.dazzledDaysRemaining=Math.max(target.dazzledDaysRemaining||0,45);if(target.condition<.14)target.operational=false;}
    else if(attackType===SPACE_ATTACK_TYPES.KINETIC){target.condition=0;target.operational=false;target.destroyedBy={actorId:attackerActorId,attackType,tick:currentTick};debrisDensity=addDebris(regions,.12+rng()*.16,currentTick,'kinetic_asat');}
  }
  return{attacked:true,success,attackType,attackerActorId,targetActorId,targetSatelliteId:target.id,cost:{cash:a.cash},debrisDensity,chance:a.chance,event:{type:'space_attack',tick:currentTick,attackType,attackerActorId,targetActorId,targetSatelliteId:target.id,success,debrisDensity}};
}

export function fitOrbitalWeapon(region,satellite,weaponType){
  if(!region||!satellite||!satellite.operational)return{fitted:false,reason:'platform_unavailable'};
  const required=weaponType===SPACE_ATTACK_TYPES.JAM?SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK:weaponType===SPACE_ATTACK_TYPES.DAZZLE?SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING:SPACE_WARFARE_TECH_IDS.ORBITAL_WEAPONS;
  if(!has(region,required))return{fitted:false,reason:'technology_not_ready'};
  const cash=weaponType===SPACE_ATTACK_TYPES.JAM?85:weaponType===SPACE_ATTACK_TYPES.DAZZLE?135:240,steel=weaponType===SPACE_ATTACK_TYPES.JAM?2:4;
  region.stockpile||={};if(nonNegative(region.treasury)<cash||nonNegative(region.stockpile.steel)<steel)return{fitted:false,reason:'insufficient_resources'};
  region.treasury-=cash;region.stockpile.steel-=steel;satellite.weaponSystems||=[];if(!satellite.weaponSystems.includes(weaponType))satellite.weaponSystems.push(weaponType);satellite.use='military';satellite.designLifeDays*=.88;satellite.remainingLifeDays=Math.min(satellite.remainingLifeDays,satellite.designLifeDays);return{fitted:true,cost:{cash,steel}};
}

function applySuppressedOrbitalSupport(regions){
  const groups=new Map();for(const r of regions||[]){const id=polityId(r);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
  for(const [actor,members] of groups){
    const satellites=satellitesFor(regions,actor).filter(s=>s.operational);if(!satellites.length)continue;
    const roleSuppression={communications:0,reconnaissance:0,navigation:0,weather:0,scientific:0};
    for(const s of satellites){const jam=clamp(s.jammedFraction||0),dazzle=clamp(s.dazzledFraction||0);const suppression=clamp(1-(1-jam)*(1-dazzle));roleSuppression[s.role]=Math.max(roleSuppression[s.role]||0,suppression);}
    for(const r of members){const o=r.orbitalSupport;if(!o)continue;
      const comm=1-(roleSuppression.communications||0),recon=1-(roleSuppression.reconnaissance||0),nav=1-(roleSuppression.navigation||0),weather=1-(roleSuppression.weather||0),science=1-(roleSuppression.scientific||0);
      o.civilianCommunications*=comm;o.remoteControl*=comm;o.droneBeyondLineOfSightControl*=comm;o.militaryCommand*=Math.min(comm,Math.max(.35,recon));
      o.militaryReconnaissance*=recon;o.navigation*=nav;o.weatherObservation*=weather;o.scienceObservation*=science;
    }
  }
}

export function tickSpaceWarfare(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[],days=Math.max(0,Number(elapsedDays)||0),density=Math.max(...(regions||[]).map(r=>r.orbitalEnvironment?.debrisDensity||0),0);
  for(const r of regions||[]){if(r.orbitalEnvironment)r.orbitalEnvironment.debrisDensity=Math.max(0,density-days/DAYS_PER_YEAR*.0025);}
  const seen=new Set();
  for(const r of regions||[])for(const sat of r.orbitalProgramme?.satellites||[]){
    if(seen.has(sat.id)){continue;}seen.add(sat.id);
    sat.jammedDaysRemaining=Math.max(0,nonNegative(sat.jammedDaysRemaining)-days);if(sat.jammedDaysRemaining<=0)sat.jammedFraction=0;
    sat.dazzledDaysRemaining=Math.max(0,nonNegative(sat.dazzledDaysRemaining)-days);if(sat.dazzledDaysRemaining<=0)sat.dazzledFraction=0;
    if(!sat.operational||density<=0)continue;
    const collisionChance=clamp(density*.00045*Math.max(.05,days/7),0,.08);
    if(rng()<collisionChance){const damage=.08+rng()*.32;sat.condition=clamp((sat.condition??1)-damage);if(sat.condition<.10){sat.operational=false;addDebris(regions,.025+rng()*.05,currentTick,'debris_collision');}events.push({type:'orbital_debris_collision',tick:currentTick,satelliteId:sat.id,damage,operational:sat.operational,debrisDensity:density});}
  }
  applySuppressedOrbitalSupport(regions);
  return events;
}
