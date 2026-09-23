import { produceRocketPropellant, ROCKET_PROPELLANT_GOOD_ID } from './rocketPropellant.js?v=20260924-rocket-propellant1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=(v)=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const SPACE_TECH_IDS=Object.freeze({
  SPACEFLIGHT_ROCKETRY:'spaceflight_rocketry',
  ORBITAL_SYSTEMS:'orbital_spaceflight_systems',
  CREWED_SPACEFLIGHT:'crewed_spaceflight',
  ORBITAL_HABITATION:'orbital_habitation',
  LUNAR_OPERATIONS:'lunar_operations',
  MARS_OPERATIONS:'mars_operations',
});

export const SPACE_MILESTONES=Object.freeze([
  {id:'first_rocket_space',label:'first rocket in space',body:'earth',prestige:8,cashCost:120,steelCost:18,fuelCost:10,requiresTech:['strategic_missile_systems'],unlocks:SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY},
  {id:'first_satellite',label:'first artificial satellite',body:'earth',prestige:12,cashCost:180,steelCost:22,fuelCost:16,requires:['first_rocket_space'],requiresTech:[SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY],unlocks:SPACE_TECH_IDS.ORBITAL_SYSTEMS},
  {id:'first_animal_space',label:'first animal in space',body:'earth',prestige:9,cashCost:150,steelCost:16,fuelCost:12,requires:['first_rocket_space'],requiresTech:[SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY]},
  {id:'first_human_space',label:'first human in space',body:'earth',prestige:16,cashCost:260,steelCost:26,fuelCost:20,requires:['first_animal_space'],requiresTech:[SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY],unlocks:SPACE_TECH_IDS.CREWED_SPACEFLIGHT},
  {id:'first_human_orbit',label:'first human to complete a full orbit',body:'earth',prestige:20,cashCost:340,steelCost:30,fuelCost:26,requires:['first_human_space','first_satellite'],requiresTech:[SPACE_TECH_IDS.ORBITAL_SYSTEMS,SPACE_TECH_IDS.CREWED_SPACEFLIGHT]},
  {id:'first_permanent_space_station',label:'first permanently occupied space station',body:'earth',prestige:24,cashCost:850,steelCost:72,fuelCost:50,requires:['first_human_orbit'],requiresTech:[SPACE_TECH_IDS.ORBITAL_HABITATION]},
  {id:'first_lunar_flyby',label:'first spacecraft around the Moon',body:'moon',prestige:15,cashCost:430,steelCost:34,fuelCost:34,requires:['first_satellite'],requiresTech:['lunar_navigation']},
  {id:'first_lunar_probe',label:'first probe on the Moon',body:'moon',prestige:18,cashCost:520,steelCost:38,fuelCost:40,requires:['first_lunar_flyby'],requiresTech:['lunar_landing_systems']},
  {id:'first_human_lunar_flyby',label:'first human trip around the Moon',body:'moon',prestige:25,cashCost:690,steelCost:52,fuelCost:52,requires:['first_human_orbit','first_lunar_flyby'],requiresTech:['lunar_navigation',SPACE_TECH_IDS.CREWED_SPACEFLIGHT]},
  {id:'first_human_moon',label:'first human on the Moon',body:'moon',prestige:38,cashCost:980,steelCost:80,fuelCost:76,requires:['first_human_lunar_flyby','first_lunar_probe'],requiresTech:['lunar_landing_systems',SPACE_TECH_IDS.CREWED_SPACEFLIGHT],unlocks:SPACE_TECH_IDS.LUNAR_OPERATIONS},
  {id:'first_moon_base',label:'first permanently occupied Moon base',body:'moon',prestige:45,cashCost:1750,steelCost:145,fuelCost:110,requires:['first_human_moon','first_permanent_space_station'],requiresTech:['lunar_surface_habitation',SPACE_TECH_IDS.LUNAR_OPERATIONS]},
  {id:'first_mars_flyby',label:'first spacecraft to Mars',body:'mars',prestige:20,cashCost:760,steelCost:44,fuelCost:62,requires:['first_lunar_flyby'],requiresTech:['interplanetary_navigation']},
  {id:'first_mars_orbit',label:'first spacecraft to orbit Mars',body:'mars',prestige:23,cashCost:880,steelCost:50,fuelCost:70,requires:['first_mars_flyby'],requiresTech:['interplanetary_navigation']},
  {id:'first_mars_probe',label:'first probe on Mars',body:'mars',prestige:28,cashCost:1050,steelCost:58,fuelCost:82,requires:['first_mars_orbit'],requiresTech:['mars_landing_systems']},
  {id:'first_human_mars_orbit',label:'first human trip around Mars',body:'mars',prestige:42,cashCost:2200,steelCost:150,fuelCost:155,requires:['first_human_moon','first_mars_orbit'],requiresTech:['deep_space_life_support','interplanetary_navigation']},
  {id:'first_human_mars',label:'first human on Mars',body:'mars',prestige:60,cashCost:3400,steelCost:230,fuelCost:230,requires:['first_human_mars_orbit','first_mars_probe'],requiresTech:['mars_landing_systems','deep_space_life_support'],unlocks:SPACE_TECH_IDS.MARS_OPERATIONS},
  {id:'first_mars_base',label:'first permanently occupied Mars base',body:'mars',prestige:75,cashCost:6200,steelCost:480,fuelCost:360,requires:['first_human_mars','first_moon_base'],requiresTech:['mars_surface_habitation',SPACE_TECH_IDS.MARS_OPERATIONS]},
]);

const MILESTONE_BY_ID=new Map(SPACE_MILESTONES.map(m=>[m.id,m]));

function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||region?.id;}
function industrialScore(region){
  const c=region?.industrialSupply?.capability||{},p=region?.industrialPlants?.componentCapability||{};
  return clamp((c.precision_machining||0)*.25+(region?.structuralTransformation?.capability?.manufacture||0)*.25+(p.electronics||p.radio_navigation||0)*.20+(p.engine||0)*.15+(region?.electricity?.industrialService||0)*.15);
}
function ensureProgramme(region){
  region.spaceProgramme||={completedMilestones:[],claimedFirsts:[],projects:{},history:[],totalSpent:0,prestigeEarned:0};
  const s=region.spaceProgramme;
  if(!Array.isArray(s.completedMilestones))s.completedMilestones=[];
  if(!Array.isArray(s.claimedFirsts))s.claimedFirsts=[];
  if(!Array.isArray(s.history))s.history=[];
  s.projects||={};
  s.totalSpent=nonNegative(s.totalSpent);s.prestigeEarned=nonNegative(s.prestigeEarned);
  return s;
}
function completedSet(programme){return new Set(programme.completedMilestones||[]);}
function claimedWorldFirsts(regions){
  const out=new Map();
  for(const r of regions||[])for(const h of r?.spaceProgramme?.history||[])if(h.worldFirst&&!out.has(h.milestoneId))out.set(h.milestoneId,h);
  return out;
}
function groupedPolities(regions){
  const groups=new Map();
  for(const r of regions||[]){const id=polityId(r);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
  return groups;
}
function programmeRegion(members){
  const existing=members.filter(r=>r.spaceProgramme).sort((a,b)=>(b.spaceProgramme.completedMilestones?.length||0)-(a.spaceProgramme.completedMilestones?.length||0))[0];
  if(existing)return existing;
  return [...members].sort((a,b)=>(b.population||0)-(a.population||0)||(b.treasury||0)-(a.treasury||0))[0];
}
function nationalResources(members){
  return {
    treasury:members.reduce((s,r)=>s+nonNegative(r.treasury),0),
    steel:members.reduce((s,r)=>s+nonNegative(r.stockpile?.steel),0),
    rocketPropellant:members.reduce((s,r)=>s+nonNegative(r.stockpile?.[ROCKET_PROPELLANT_GOOD_ID]),0),
  };
}
function consumeAcross(members,key,amount){
  let remaining=Math.max(0,amount);
  const ordered=[...members].sort((a,b)=>nonNegative(b[key==='treasury'?'treasury':`stockpile`]?.[key])-nonNegative(a[key==='treasury'?'treasury':`stockpile`]?.[key]));
  for(const r of ordered){
    if(remaining<=1e-9)break;
    if(key==='treasury'){
      const take=Math.min(nonNegative(r.treasury),remaining);r.treasury=nonNegative(r.treasury)-take;remaining-=take;
    }else{
      r.stockpile||={};const take=Math.min(nonNegative(r.stockpile[key]),remaining);r.stockpile[key]=nonNegative(r.stockpile[key])-take;remaining-=take;
    }
  }
  return amount-remaining;
}
function techAvailable(members,techId){return members.some(r=>has(r,techId));}
function milestoneAvailable(m,members,done){
  if((m.requires||[]).some(id=>!done.has(id)))return false;
  return (m.requiresTech||[]).every(id=>techAvailable(members,id));
}
function nextMilestone(members,programme){
  const done=completedSet(programme);
  return SPACE_MILESTONES.find(m=>!done.has(m.id)&&milestoneAvailable(m,members,done))||null;
}
function nationalStrength(members){
  const population=members.reduce((s,r)=>s+nonNegative(r.population),0);
  const treasury=members.reduce((s,r)=>s+nonNegative(r.treasury),0);
  const industry=members.reduce((s,r)=>s+industrialScore(r)*(r.population||1),0)/Math.max(1,population);
  return Math.log1p(population)*.18+Math.log1p(treasury)*.16+industry*2.4;
}
function rivalryPressure(groupId,targetId,groups,claimed){
  let pressure=0;
  for(const [otherId,members] of groups){
    if(otherId===groupId)continue;
    const carrier=programmeRegion(members),p=carrier?.spaceProgramme;if(!p)continue;
    if(p.completedMilestones?.includes(targetId))pressure=Math.max(pressure,.75);
    const project=p.projects?.[targetId];if(project?.progress>0)pressure=Math.max(pressure,clamp(.25+project.progress*.65));
  }
  if(claimed.has(targetId))pressure*=.35;
  return pressure;
}

export function ensureNationalReputation(region){
  region.nationalReputation||={spacePrestige:0,internationalRespect:0,migrationPull:1,cooperationPull:1,historicalFirsts:[]};
  return region.nationalReputation;
}
export function nationalReputationEffects(region){
  const r=ensureNationalReputation(region);
  return {spacePrestige:nonNegative(r.spacePrestige),internationalRespect:clamp(r.internationalRespect),migrationPull:Math.max(1,Number(r.migrationPull)||1),cooperationPull:Math.max(1,Number(r.cooperationPull)||1)};
}
function syncReputation(members,programme){
  const prestige=nonNegative(programme.prestigeEarned);
  const respect=clamp(Math.log1p(prestige)/4.8);
  const migrationPull=1+respect*.16;
  const cooperationPull=1+respect*.11;
  for(const r of members){
    const rep=ensureNationalReputation(r);
    rep.spacePrestige=prestige;rep.internationalRespect=respect;rep.migrationPull=migrationPull;rep.cooperationPull=cooperationPull;
    rep.historicalFirsts=[...(programme.claimedFirsts||[])];
  }
}
function completeMilestone(carrier,members,m,currentTick,claimed){
  const p=ensureProgramme(carrier);
  if(!p.completedMilestones.includes(m.id))p.completedMilestones.push(m.id);
  const worldFirst=!claimed.has(m.id);
  if(worldFirst){
    const record={type:'historical_world_first',worldFirst:true,milestoneId:m.id,label:m.label,body:m.body,polityId:polityId(carrier),regionId:carrier.id,regionName:carrier.name,tick:currentTick,prestige:m.prestige};
    claimed.set(m.id,record);p.history.push(record);p.claimedFirsts.push(m.id);p.prestigeEarned+=m.prestige;
  }else p.history.push({type:'space_milestone_completed',worldFirst:false,milestoneId:m.id,label:m.label,body:m.body,polityId:polityId(carrier),regionId:carrier.id,regionName:carrier.name,tick:currentTick,prestige:0});
  if(m.unlocks)for(const r of members){r.unlockedTechIds||=new Set();r.unlockedTechIds.add(m.unlocks);}
  syncReputation(members,p);
  return p.history[p.history.length-1];
}

export function spaceMilestoneCost(milestoneId){
  const m=MILESTONE_BY_ID.get(milestoneId);return m?{cash:m.cashCost,steel:m.steelCost,fuel:m.fuelCost,propellant:m.fuelCost}:null;
}

export function tickSpaceRace(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[],groups=groupedPolities(regions),claimed=claimedWorldFirsts(regions);
  const strengths=[...groups.entries()].map(([id,members])=>[id,nationalStrength(members)]).sort((a,b)=>b[1]-a[1]);
  const strengthRank=new Map(strengths.map(([id],i)=>[id,i]));
  for(const [id,members] of groups){
    const carrier=programmeRegion(members);if(!carrier)continue;
    const p=ensureProgramme(carrier);syncReputation(members,p);
    const target=nextMilestone(members,p);if(!target)continue;
    const rank=strengthRank.get(id)??999;
    const topPower=rank<Math.max(2,Math.ceil(groups.size*.18));
    const rivalPressure=rivalryPressure(id,target.id,groups,claimed);
    const ambition=clamp((topPower?.42:.12)+industrialScore(carrier)*.34+rivalPressure*.44);
    if(ambition<.20&&!p.projects[target.id])continue;
    const project=p.projects[target.id]||={milestoneId:target.id,progress:0,cashSpent:0,steelSpent:0,fuelSpent:0,propellantSpent:0,startedTick:currentTick};
    p.projects[target.id]=project;
    const interval=Math.max(.05,Number(elapsedDays)||0)/7;
    const desiredProgress=clamp((.018+ambition*.05+rivalPressure*.045)*interval,0,.16);
    const remaining=1-project.progress;
    const step=Math.min(remaining,desiredProgress);
    if(step<=0)continue;

    // Propellant manufacture is an explicit physical step. Petroleum or hydrogen
    // can be feedstock, but milestones only consume the resulting propellant stock.
    const propellantTarget=Math.max(0,target.fuelCost*step-nationalResources(members).rocketPropellant);
    if(propellantTarget>0){
      let remainingTarget=propellantTarget;
      for(const region of [...members].sort((a,b)=>industrialScore(b)-industrialScore(a))){
        if(remainingTarget<=1e-9)break;
        const made=produceRocketPropellant(region,remainingTarget,elapsedDays).produced;
        remainingTarget-=made;
      }
    }

    const resources=nationalResources(members);
    const cashNeed=target.cashCost*step,steelNeed=target.steelCost*step,fuelNeed=target.fuelCost*step;
    const affordability=Math.min(1,resources.treasury/Math.max(.001,cashNeed),resources.steel/Math.max(.001,steelNeed),resources.rocketPropellant/Math.max(.001,fuelNeed));
    if(affordability<.08)continue;
    const actualStep=step*affordability*(.92+rng()*.16);
    const cash=consumeAcross(members,'treasury',target.cashCost*actualStep);
    const steel=consumeAcross(members,'steel',target.steelCost*actualStep);
    const fuel=consumeAcross(members,ROCKET_PROPELLANT_GOOD_ID,target.fuelCost*actualStep);
    const realised=Math.min(cash/Math.max(.001,target.cashCost),steel/Math.max(.001,target.steelCost),fuel/Math.max(.001,target.fuelCost));
    if(realised<=0)continue;
    project.progress=clamp(project.progress+realised);project.cashSpent+=cash;project.steelSpent+=steel;project.fuelSpent+=fuel;project.propellantSpent=nonNegative(project.propellantSpent)+fuel;p.totalSpent+=cash;
    if(project.progress>=.999){
      project.progress=1;project.completedTick=currentTick;
      const record=completeMilestone(carrier,members,target,currentTick,claimed);
      events.push({type:record.worldFirst?'historical_world_first':'space_milestone_completed',milestoneId:target.id,polityId:id,regionId:carrier.id,regionName:carrier.name,tick:currentTick,title:record.worldFirst?`World first: ${target.label}`:`${target.label} achieved`,message:record.worldFirst?`${carrier.name}'s country has achieved the ${target.label}, earning lasting international prestige.`:`${carrier.name}'s country has achieved the ${target.label}.`,prestige:record.prestige,cost:spaceMilestoneCost(target.id)});
    }
  }
  return events;
}
