import { tickSpaceRace } from './spaceRace.js?v=20260920-space-race1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const polityId=r=>r?.governance?.sovereignPolityId||r?.polityId||r?.id;
const SPACE_ENTRY_TECH_ID='strategic_missile_systems';

export function launchSiteAssessment(region){
  const latitude=Math.abs(Number(region?.centroid?.[1])||0);
  const rotationalAssist=Math.max(0,Math.cos(latitude*Math.PI/180));
  const coastal=Boolean(region?.isCoastal);
  const eastwardOcean=Boolean(region?.adjacentSeaDirections?.some?.(x=>x?.eastward));
  const fuelFactor=clamp(1-rotationalAssist*.065-(eastwardOcean?.035:0),.88,1);
  const cashFactor=clamp(1-(coastal?.018:0)-(eastwardOcean?.032:0),.94,1);
  return {regionId:region?.id,regionName:region?.name,latitude,coastal,eastwardOcean,rotationalAssist,fuelFactor,cashFactor,score:fuelFactor*.72+cashFactor*.28};
}

export function bestNationalLaunchSite(members=[]){
  return members.map(launchSiteAssessment).sort((a,b)=>a.score-b.score||a.latitude-b.latitude)[0]||null;
}

export function tickSpaceRaceWithLaunchGeography(regions,currentTick,rng=Math.random,elapsedDays=7){
  // The first space milestone requires strategic missile systems. Until one
  // exists, and unless a programme already exists, the entire launch-site,
  // polity-grouping and resource-rescaling pass is provably unable to change
  // simulation state. This keeps ancient/classical worlds out of the space stack.
  let spaceActive=false;
  for(const r of regions||[]){
    if(r.spaceProgramme||r.unlockedTechIds?.has?.(SPACE_ENTRY_TECH_ID)){spaceActive=true;break;}
  }
  if(!spaceActive)return[];

  const groups=new Map();
  for(const r of regions||[]){const id=polityId(r);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
  const factors=new Map();
  for(const [id,members] of groups){
    const site=bestNationalLaunchSite(members);if(!site)continue;factors.set(id,site);
    for(const r of members){
      r.treasury=Math.max(0,Number(r.treasury)||0)/site.cashFactor;
      r.stockpile||={};r.stockpile.petrol=Math.max(0,Number(r.stockpile.petrol)||0)/site.fuelFactor;
    }
  }
  let events=[];
  try{events=tickSpaceRace(regions,currentTick,rng,elapsedDays);}finally{
    for(const [id,members] of groups){const site=factors.get(id);if(!site)continue;for(const r of members){r.treasury=Math.max(0,Number(r.treasury)||0)*site.cashFactor;r.stockpile||={};r.stockpile.petrol=Math.max(0,Number(r.stockpile.petrol)||0)*site.fuelFactor;}}
  }
  for(const [id,members] of groups){
    const site=factors.get(id),carrier=members.find(r=>r.spaceProgramme)||members[0];
    if(carrier?.spaceProgramme&&site)carrier.spaceProgramme.launchSite={...site};
  }
  for(const e of events){const site=factors.get(e.polityId);if(site)e.launchSite={...site};}
  return events;
}