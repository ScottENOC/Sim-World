import { attitudeToward, changeAttitude } from '../diplomacy/relations.js?v=20260921-space-cooperation1';
import { tickOffworldHabitats } from './offworldHabitats.js?v=20260921-offworld1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const polityId=r=>r?.governance?.sovereignPolityId||r?.polityId||r?.id;

export const SPACE_STRATEGIES=Object.freeze({COMPETITIVE:'competitive',COOPERATIVE:'cooperative',SECURITY:'security'});
export const SPACE_MODULES=Object.freeze({
  habitation:{label:'habitation module',cash:90,steel:8,components:6},
  laboratory:{label:'laboratory module',cash:120,steel:7,components:10},
  power:{label:'power module',cash:80,steel:6,components:8},
  greenhouse:{label:'greenhouse module',cash:95,steel:5,components:7},
  isru:{label:'in-situ resource utilisation module',cash:180,steel:12,components:16},
  landing_pad:{label:'landing pad / logistics module',cash:110,steel:14,components:5},
});

function groupedPolities(regions){const groups=new Map();for(const r of regions||[]){const id=polityId(r);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}return groups;}
function carrierFor(members){return members.filter(r=>r.spaceProgramme).sort((a,b)=>(b.spaceProgramme?.completedMilestones?.length||0)-(a.spaceProgramme?.completedMilestones?.length||0))[0]||members[0];}
function total(members,key){return members.reduce((s,r)=>s+nonNegative(key==='treasury'?r.treasury:r.stockpile?.[key]),0);}
function consume(members,key,amount){let remaining=nonNegative(amount);for(const r of [...members].sort((a,b)=>nonNegative(key==='treasury'?b.treasury:b.stockpile?.[key])-nonNegative(key==='treasury'?a.treasury:a.stockpile?.[key]))){if(remaining<=1e-9)break;if(key==='treasury'){const take=Math.min(nonNegative(r.treasury),remaining);r.treasury=nonNegative(r.treasury)-take;remaining-=take;}else{r.stockpile||={};const take=Math.min(nonNegative(r.stockpile[key]),remaining);r.stockpile[key]=nonNegative(r.stockpile[key])-take;remaining-=take;}}return amount-remaining;}
function pay(members,costs){let ratio=1;for(const [k,v] of Object.entries(costs))if(v>0)ratio=Math.min(ratio,total(members,k)/v);ratio=clamp(ratio);for(const [k,v] of Object.entries(costs))consume(members,k,v*ratio);return ratio;}

export function ensureSpacePolicy(carrier){
  carrier.spaceProgramme||={completedMilestones:[],claimedFirsts:[],projects:{},history:[],totalSpent:0,prestigeEarned:0};
  const p=carrier.spaceProgramme;
  if(!Object.values(SPACE_STRATEGIES).includes(p.strategy))p.strategy=SPACE_STRATEGIES.COMPETITIVE;
  if(!Array.isArray(p.partners))p.partners=[];
  if(!Array.isArray(p.cooperationHistory))p.cooperationHistory=[];
  p.cooperationScore=nonNegative(p.cooperationScore);
  return p;
}

export function setSpaceProgrammeStrategy(carrier,strategy){if(!Object.values(SPACE_STRATEGIES).includes(strategy))return false;ensureSpacePolicy(carrier).strategy=strategy;return true;}

function defaultName(carrier,id,partners=[]){
  if(partners.length&&id==='orbital')return 'International Orbital Station';
  if(id==='orbital')return `${carrier.name} Orbital Station`;
  if(id==='moon')return `${carrier.name} Lunar Base`;
  return `${carrier.name} Mars Base`;
}

function ensureFacilityShape(carrier,h,id){
  h.name||=defaultName(carrier,id);
  h.modules||={habitation:Math.max(1,Math.ceil(nonNegative(h.capacity)/8)),laboratory:id==='orbital'?1:0,power:1,greenhouse:nonNegative(h.greenhouseModules),isru:0,landing_pad:id==='orbital'?0:1};
  for(const type of Object.keys(SPACE_MODULES))h.modules[type]=nonNegative(h.modules[type]);
  h.localResources||={water:0,oxygen:0,propellant:0,constructionFeedstock:0};
  h.scienceOutput=nonNegative(h.scienceOutput);h.logisticsEfficiency=clamp(h.logisticsEfficiency||0);h.isruReliability=clamp(h.isruReliability||0);
  h.guestCrewByPolity||={};h.jointContributions||={};
  return h;
}

export function buildHabitatModule(carrier,members,habitatId,moduleType,count=1){
  const spec=SPACE_MODULES[moduleType],h=carrier?.spaceProgramme?.habitats?.[habitatId];if(!spec||!h||count<=0)return {built:0,reason:'unavailable'};
  if(moduleType==='isru'&&habitatId==='orbital')return {built:0,reason:'surface_required'};
  if(moduleType==='landing_pad'&&habitatId==='orbital')return {built:0,reason:'surface_required'};
  ensureFacilityShape(carrier,h,habitatId);
  const wanted=Math.max(0,Number(count)||0),ratio=pay(members,{treasury:spec.cash*wanted,steel:spec.steel*wanted,machine_components:spec.components*wanted});
  const built=wanted*ratio;if(built<=0)return {built:0,reason:'resources'};h.modules[moduleType]+=built;
  if(moduleType==='habitation')h.capacity+=built*6;
  if(moduleType==='power')h.powerCapacityKw+=built*(habitatId==='mars'?180:habitatId==='moon'?140:110);
  if(moduleType==='greenhouse'&&habitatId!=='orbital')h.greenhouseModules+=built;
  return {built,habitatId,moduleType};
}

function developModules(carrier,members,h,id,years){
  ensureFacilityShape(carrier,h,id);if(years<=0||h.condition<.7)return;
  const p=ensureSpacePolicy(carrier),orders=[];
  if(h.capacity-h.crew<2)orders.push('habitation');
  if(h.powerCapacityKw<h.powerDemandKw*1.3)orders.push('power');
  if(id!=='orbital'&&h.modules.landing_pad<1.5)orders.push('landing_pad');
  if(id!=='orbital'&&h.modules.isru<1&&h.condition>.82)orders.push('isru');
  if(p.strategy===SPACE_STRATEGIES.COOPERATIVE&&h.modules.laboratory<Math.max(1,h.modules.habitation*.7))orders.push('laboratory');
  if(id==='mars'&&h.foodSelfSufficiency<.45)orders.push('greenhouse');
  const type=orders[0];if(type)buildHabitatModule(carrier,members,id,type,Math.min(.45*years,1));
}

function operateModules(carrier,h,id,years){
  ensureFacilityShape(carrier,h,id);const condition=clamp(h.condition),power=clamp(h.powerCapacityKw/Math.max(1,h.powerDemandKw));
  h.scienceOutput=(h.modules.laboratory||0)*condition*(.45+.55*power);
  h.logisticsEfficiency=clamp((h.modules.landing_pad||0)*.12+(h.modules.isru||0)*.08,0,.38);
  if(id!=='orbital'&&h.modules.isru>0){
    const output=h.modules.isru*years*condition*(.55+.45*power);h.isruReliability=clamp(condition*(.5+.5*power));
    h.localResources.water+=output*(id==='mars'?7:4);h.localResources.oxygen+=output*3.2;h.localResources.constructionFeedstock+=output*(id==='moon'?2.6:1.8);h.localResources.propellant+=output*(id==='mars'?1.7:1.2);
  }
}

function logisticsFactors(carrier){
  let cash=1,fuel=1,steel=1,components=1;
  for(const [id,h0] of Object.entries(carrier?.spaceProgramme?.habitats||{})){const h=ensureFacilityShape(carrier,h0,id);if(!h.active)continue;const local=clamp((h.modules.isru||0)*.055,0,.24),pad=clamp((h.modules.landing_pad||0)*.045,0,.14);cash*=1-pad*.35;fuel*=1-pad-local*.55;steel*=1-local*.28;components*=1-local*.12;}
  return {treasury:clamp(cash,.86,1),petrol:clamp(fuel,.66,1),steel:clamp(steel,.86,1),machine_components:clamp(components,.92,1)};
}

export function inviteSpacePartner(host,guest,currentTick=0){
  const hp=ensureSpacePolicy(host),gp=ensureSpacePolicy(guest);if(!host?.spaceProgramme?.habitats?.orbital)return {accepted:false,reason:'no_station'};
  if(hp.strategy!==SPACE_STRATEGIES.COOPERATIVE||gp.strategy===SPACE_STRATEGIES.SECURITY)return {accepted:false,reason:'policy'};
  if(attitudeToward(guest,host.id)<-.25)return {accepted:false,reason:'relations'};
  const gid=polityId(guest),hid=polityId(host);if(!hp.partners.includes(gid))hp.partners.push(gid);if(!gp.partners.includes(hid))gp.partners.push(hid);
  const station=ensureFacilityShape(host,host.spaceProgramme.habitats.orbital,'orbital');station.name=defaultName(host,'orbital',hp.partners);station.jointContributions[gid]=nonNegative(station.jointContributions[gid]);
  changeAttitude(host,guest.id,.035,'joint_space_programme',currentTick);changeAttitude(guest,host.id,.055,'joint_space_programme',currentTick);
  hp.cooperationScore+=1;gp.cooperationScore+=1;hp.cooperationHistory.push({type:'space_partnership',partnerPolityId:gid,tick:currentTick});
  return {accepted:true,hostPolityId:hid,guestPolityId:gid};
}

export function sendGuestAstronaut(host,guest,currentTick=0){
  const station=host?.spaceProgramme?.habitats?.orbital,hp=ensureSpacePolicy(host);if(!station)return {accepted:false,reason:'no_station'};const gid=polityId(guest);if(!hp.partners.includes(gid))return {accepted:false,reason:'not_partner'};
  ensureFacilityShape(host,station,'orbital');if(station.crew+1>station.capacity)return {accepted:false,reason:'capacity'};
  station.guestCrewByPolity[gid]=nonNegative(station.guestCrewByPolity[gid])+1;station.crew+=1;
  changeAttitude(host,guest.id,.018,'guest_astronaut',currentTick);changeAttitude(guest,host.id,.032,'guest_astronaut',currentTick);hp.cooperationScore+=.5;
  return {accepted:true,stationName:station.name,guestPolityId:gid};
}

function autoCooperate(groups,currentTick,years,rng,events){
  const entries=[...groups.entries()].map(([id,members])=>({id,members,carrier:carrierFor(members)})).filter(x=>x.carrier?.spaceProgramme);
  for(const host of entries){const hp=ensureSpacePolicy(host.carrier);if(hp.strategy!==SPACE_STRATEGIES.COOPERATIVE||!host.carrier.spaceProgramme.habitats?.orbital)continue;
    for(const guest of entries){if(host.id===guest.id)continue;const gp=ensureSpacePolicy(guest.carrier);if(gp.strategy===SPACE_STRATEGIES.SECURITY||attitudeToward(guest.carrier,host.carrier.id)<-.1)continue;
      if(!hp.partners.includes(guest.id)&&rng()<clamp(years*.45*(.45+Math.max(0,attitudeToward(guest.carrier,host.carrier.id))),0,.4)){const r=inviteSpacePartner(host.carrier,guest.carrier,currentTick);if(r.accepted)events.push({type:'space_partnership_formed',hostPolityId:host.id,guestPolityId:guest.id,tick:currentTick,title:'Joint space programme',message:`${host.carrier.name} and ${guest.carrier.name} begin sharing orbital infrastructure.`});}
      if(hp.partners.includes(guest.id)){
        changeAttitude(host.carrier,guest.carrier.id,.004*years,'space_cooperation',currentTick);changeAttitude(guest.carrier,host.carrier.id,.006*years,'space_cooperation',currentTick);
        const station=ensureFacilityShape(host.carrier,host.carrier.spaceProgramme.habitats.orbital,'orbital');const contribution=Math.min(nonNegative(guest.carrier.treasury),6*years);guest.carrier.treasury-=contribution;host.carrier.treasury+=contribution;station.jointContributions[guest.id]=nonNegative(station.jointContributions[guest.id])+contribution;
        if((station.guestCrewByPolity[guest.id]||0)<Math.max(1,station.capacity*.12)&&rng()<clamp(years*.55,0,.25)){const trip=sendGuestAstronaut(host.carrier,guest.carrier,currentTick);if(trip.accepted)events.push({type:'guest_astronaut_mission',hostPolityId:host.id,guestPolityId:guest.id,tick:currentTick,title:'International astronaut mission',message:`An astronaut from ${guest.carrier.name} joins ${station.name}, strengthening relations between the participating countries.`});}
      }
    }
  }
}

export function tickOffworldHabitatsWithInfrastructure(regions,currentTick,rng=Math.random,elapsedDays=7){
  const groups=groupedPolities(regions),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,scaled=[];
  for(const [,members] of groups){const carrier=carrierFor(members);if(!carrier?.spaceProgramme)continue;ensureSpacePolicy(carrier);for(const [id,h] of Object.entries(carrier.spaceProgramme.habitats||{}))operateModules(carrier,h,id,years);const factors=logisticsFactors(carrier);for(const r of members){r.stockpile||={};const snapshot={r,treasury:r.treasury,petrol:r.stockpile.petrol,steel:r.stockpile.steel,components:r.stockpile.machine_components,factors};scaled.push(snapshot);r.treasury=nonNegative(r.treasury)/factors.treasury;r.stockpile.petrol=nonNegative(r.stockpile.petrol)/factors.petrol;r.stockpile.steel=nonNegative(r.stockpile.steel)/factors.steel;r.stockpile.machine_components=nonNegative(r.stockpile.machine_components)/factors.machine_components;}}
  let events=[];try{events=tickOffworldHabitats(regions,currentTick,rng,elapsedDays);}finally{for(const s of scaled){s.r.treasury=nonNegative(s.r.treasury)*s.factors.treasury;s.r.stockpile.petrol=nonNegative(s.r.stockpile.petrol)*s.factors.petrol;s.r.stockpile.steel=nonNegative(s.r.stockpile.steel)*s.factors.steel;s.r.stockpile.machine_components=nonNegative(s.r.stockpile.machine_components)*s.factors.machine_components;}}
  for(const [,members] of groups){const carrier=carrierFor(members);if(!carrier?.spaceProgramme)continue;for(const [id,h] of Object.entries(carrier.spaceProgramme.habitats||{})){ensureFacilityShape(carrier,h,id);developModules(carrier,members,h,id,years);operateModules(carrier,h,id,years);}carrier.report||={};carrier.report.spaceInfrastructure={strategy:ensureSpacePolicy(carrier).strategy,partners:[...carrier.spaceProgramme.partners],cooperationScore:carrier.spaceProgramme.cooperationScore,habitats:Object.fromEntries(Object.entries(carrier.spaceProgramme.habitats||{}).map(([id,h])=>[id,{name:h.name,modules:{...h.modules},scienceOutput:h.scienceOutput,logisticsEfficiency:h.logisticsEfficiency,isruReliability:h.isruReliability,localResources:{...h.localResources},guestCrewByPolity:{...h.guestCrewByPolity},jointContributions:{...h.jointContributions}}]))};}
  autoCooperate(groups,currentTick,years,rng,events);return events;
}
