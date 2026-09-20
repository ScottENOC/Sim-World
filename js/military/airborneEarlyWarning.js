const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
let nextAewId=1;

export const AIRBORNE_EARLY_WARNING_TECH_ID='airborne_early_warning';

function electronics(region){const c=region?.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radio_navigation||0));}
function radar(region){return clamp(region?.industrialPlants?.componentCapability?.radar_set||0);}
function precision(region){return clamp(region?.industrialSupply?.capability?.precision_machining||0);}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function syncNextAewId(regions=[]){let max=0;for(const r of regions)for(const a of r.aviation?.aircraft||[])if(String(a.id||'').startsWith('aew-'))max=Math.max(max,Number(String(a.id).replace(/\D/g,''))||0);nextAewId=max+1;}

export function airborneEarlyWarningFrontier(region){
  const c=region?.industrialPlants?.componentCapability||{};
  const r=radar(region),e=electronics(region),radio=clamp(c.radio_navigation||e),p=precision(region);
  const electric=clamp(region?.electricity?.industrialService||region?.electricity?.service||0);
  return {
    radarPower:clamp(.18+r*.58+e*.12+electric*.12),
    radarRange:clamp(.12+r*.52+radio*.16+p*.10),
    tracking:clamp(.10+e*.42+r*.28+radio*.14+p*.06),
    commandAndControl:clamp(.10+radio*.42+e*.34+r*.08),
    endurance:clamp(.28+(c.aircraft_engine||c.engine||0)*.30+p*.12),
    powerBurden:clamp(.46+r*.22+e*.12),
  };
}

export function tickAirborneEarlyWarningBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set();if(has(region,AIRBORNE_EARLY_WARNING_TECH_ID))continue;
    const e=electronics(region),r=radar(region),p=precision(region),xp=clamp((region.aviation?.flightExperience||0)/700);
    if(!has(region,'radar')||!has(region,'military_aviation')||!has(region,'transport_aircraft')||e<.46||r<.42||p<.42||xp<.14)continue;
    const chance=.0012+e*.008+r*.012+p*.006+xp*.012;
    if(rng()<annual(chance,elapsedDays)){region.unlockedTechIds.add(AIRBORNE_EARLY_WARNING_TECH_ID);events.push({type:'aviation_breakthrough',techId:AIRBORNE_EARLY_WARNING_TECH_ID,regionId:region.id,tick:currentTick,title:'Airborne early warning and control'});}
  }
  return events;
}

export function canBuildAirborneEarlyWarning(region){
  if(!has(region,AIRBORNE_EARLY_WARNING_TECH_ID))return{available:false,reason:'aew_not_understood'};
  const f=airborneEarlyWarningFrontier(region);
  if(f.radarPower<.42||f.commandAndControl<.34)return{available:false,reason:'radar_or_comms_insufficient',frontier:f};
  return{available:true,frontier:f};
}

export function buildAirborneEarlyWarningAircraft(region){
  const check=canBuildAirborneEarlyWarning(region);if(!check.available)return{built:false,reason:check.reason};
  region.aviation||={aircraft:[],flightExperience:0};region.aviation.aircraft||=[];region.stockpile||={};region.industrialSupply||={};region.industrialSupply.inventory||={};
  const inv=region.industrialSupply.inventory,cost={cash:72,steel:34,machine:26};
  if(nonNegative(region.treasury)<cost.cash||nonNegative(region.stockpile.steel)<cost.steel||nonNegative(inv.machine_components)<cost.machine)return{built:false,reason:'insufficient_inputs',cost};
  region.treasury-=cost.cash;region.stockpile.steel-=cost.steel;inv.machine_components-=cost.machine;
  const f=check.frontier;
  const aircraft={id:`aew-${nextAewId++}`,ownerType:'military',role:'airborne_early_warning',baseType:'airfield',homeBaseRegionId:region.id,baseRegionId:region.id,condition:1,fuel:1,status:'serviceable',mission:'idle',targetRegionId:null,pilotExperience:0,totalFlights:0,
    designStats:{propulsion:has(region,'jet_propulsion')?'jet':'piston',enginePower:clamp(.50+f.endurance*.22),payload:.08,range:clamp(.50+f.endurance*.34),reliability:clamp(.50+precision(region)*.28),firepower:.02,manoeuvrability:.18,radarCapability:f.radarPower,onboardPower:clamp(.52+f.powerBurden*.26)},
    aewSystems:{...f},crewRequired:8};
  region.aviation.aircraft.push(aircraft);return{built:true,aircraft,cost};
}

export function airborneEarlyWarningSupport(region,fleetId=null){
  const aircraft=(region?.aviation?.aircraft||[]).filter(a=>a.status!=='destroyed'&&a.ownerType==='military'&&a.role==='airborne_early_warning'&&(a.condition??1)>=.42&&(!fleetId||a.baseFleetId===fleetId));
  if(!aircraft.length)return{available:false,count:0,radarCoverage:0,tracking:0,commandAndControl:0};
  let radarCoverage=0,tracking=0,commandAndControl=0;
  for(const a of aircraft){const s=a.aewSystems||airborneEarlyWarningFrontier(region),ready=clamp((a.condition??1)*.6+(a.pilotExperience||0)*.15+.25);radarCoverage+=s.radarRange*ready;tracking+=s.tracking*ready;commandAndControl+=s.commandAndControl*ready;}
  const n=aircraft.length;
  return{available:true,count:n,radarCoverage:clamp(radarCoverage/Math.sqrt(n)),tracking:clamp(tracking/n),commandAndControl:clamp(commandAndControl/n)};
}
