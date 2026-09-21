import { HYDROPONIC_CEA_TECH_ID } from '../economy/controlledEnvironmentAgriculture.js?v=20260921-cea1';
import { SPACE_TECH_IDS } from './spaceRace.js?v=20260921-offworld1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const OFFWORLD_TECH_IDS=Object.freeze({
  LUNAR_NAVIGATION:'lunar_navigation',
  LUNAR_LANDING_SYSTEMS:'lunar_landing_systems',
  LUNAR_SURFACE_HABITATION:'lunar_surface_habitation',
  INTERPLANETARY_NAVIGATION:'interplanetary_navigation',
  DEEP_SPACE_LIFE_SUPPORT:'deep_space_life_support',
  MARS_LANDING_SYSTEMS:'mars_landing_systems',
  MARS_SURFACE_HABITATION:'mars_surface_habitation',
  CLOSED_LOOP_AGRICULTURE:'offworld_closed_loop_agriculture',
});

const HABITAT_SPECS=Object.freeze({
  orbital:{milestone:'first_permanent_space_station',label:'orbital station',body:'earth orbit',initialCrew:6,initialCapacity:8,cashPerCrewYear:8,steelPerCrewYear:.08,componentsPerCrewYear:.10,fuelPerCrewYear:.55,initialPowerKw:140,foodCap:.25},
  moon:{milestone:'first_moon_base',label:'Moon base',body:'moon',initialCrew:4,initialCapacity:6,cashPerCrewYear:22,steelPerCrewYear:.18,componentsPerCrewYear:.24,fuelPerCrewYear:2.2,initialPowerKw:180,foodCap:.55},
  mars:{milestone:'first_mars_base',label:'Mars base',body:'mars',initialCrew:6,initialCapacity:8,cashPerCrewYear:62,steelPerCrewYear:.42,componentsPerCrewYear:.55,fuelPerCrewYear:8.5,initialPowerKw:320,foodCap:.72},
});

const TECH_STEPS=Object.freeze([
  {id:SPACE_TECH_IDS.ORBITAL_HABITATION,label:'Orbital habitation',requiresMilestones:['first_human_orbit'],requiresTech:[SPACE_TECH_IDS.CREWED_SPACEFLIGHT],base:.0045},
  {id:OFFWORLD_TECH_IDS.LUNAR_NAVIGATION,label:'Lunar navigation',requiresMilestones:['first_satellite'],requiresTech:[SPACE_TECH_IDS.ORBITAL_SYSTEMS],base:.0040},
  {id:OFFWORLD_TECH_IDS.LUNAR_LANDING_SYSTEMS,label:'Lunar landing systems',requiresMilestones:['first_lunar_flyby'],requiresTech:[OFFWORLD_TECH_IDS.LUNAR_NAVIGATION],base:.0034},
  {id:OFFWORLD_TECH_IDS.INTERPLANETARY_NAVIGATION,label:'Interplanetary navigation',requiresMilestones:['first_lunar_flyby'],requiresTech:[SPACE_TECH_IDS.ORBITAL_SYSTEMS],base:.0028},
  {id:OFFWORLD_TECH_IDS.DEEP_SPACE_LIFE_SUPPORT,label:'Deep-space life support',requiresMilestones:['first_permanent_space_station'],requiresTech:[SPACE_TECH_IDS.ORBITAL_HABITATION],base:.0028},
  {id:OFFWORLD_TECH_IDS.LUNAR_SURFACE_HABITATION,label:'Lunar surface habitation',requiresMilestones:['first_human_moon'],requiresTech:[SPACE_TECH_IDS.ORBITAL_HABITATION,OFFWORLD_TECH_IDS.LUNAR_LANDING_SYSTEMS],base:.0026},
  {id:OFFWORLD_TECH_IDS.MARS_LANDING_SYSTEMS,label:'Mars landing systems',requiresMilestones:['first_mars_orbit'],requiresTech:[OFFWORLD_TECH_IDS.INTERPLANETARY_NAVIGATION],base:.0022},
  {id:OFFWORLD_TECH_IDS.MARS_SURFACE_HABITATION,label:'Mars surface habitation',requiresMilestones:['first_human_mars'],requiresTech:[OFFWORLD_TECH_IDS.DEEP_SPACE_LIFE_SUPPORT,OFFWORLD_TECH_IDS.MARS_LANDING_SYSTEMS],base:.0019},
  {id:OFFWORLD_TECH_IDS.CLOSED_LOOP_AGRICULTURE,label:'Closed-loop off-world agriculture',requiresMilestones:['first_permanent_space_station'],requiresTech:[HYDROPONIC_CEA_TECH_ID,OFFWORLD_TECH_IDS.DEEP_SPACE_LIFE_SUPPORT],base:.0025},
]);

function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||region?.id;}
function groupedPolities(regions){const groups=new Map();for(const r of regions||[]){const id=polityId(r);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}return groups;}
function programmeRegion(members){return members.filter(r=>r.spaceProgramme).sort((a,b)=>(b.spaceProgramme?.completedMilestones?.length||0)-(a.spaceProgramme?.completedMilestones?.length||0))[0]||[...members].sort((a,b)=>(b.population||0)-(a.population||0)||(b.treasury||0)-(a.treasury||0))[0];}
function completed(carrier,id){return Boolean(carrier?.spaceProgramme?.completedMilestones?.includes?.(id));}
function techAvailable(members,id){return members.some(r=>has(r,id));}
function industrialReadiness(members){const pop=members.reduce((s,r)=>s+Math.max(1,nonNegative(r.population)),0);return clamp(members.reduce((s,r)=>{const c=r.industrialSupply?.capability||{},p=r.industrialPlants?.componentCapability||{},v=clamp((c.precision_machining||0)*.26+(r.structuralTransformation?.capability?.manufacture||0)*.26+(p.electronics||p.radio_navigation||0)*.22+(p.engine||0)*.12+(r.electricity?.industrialService||0)*.14);return s+v*Math.max(1,nonNegative(r.population));},0)/Math.max(1,pop));}
function weeklyChance(p,days){return 1-Math.pow(1-clamp(p),Math.max(0,Number(days)||0)/7);}
function resourceTotal(members,key){return members.reduce((s,r)=>s+nonNegative(key==='treasury'?r.treasury:r.stockpile?.[key]),0);}
function consumeAcross(members,key,amount){let remaining=nonNegative(amount);const ordered=[...members].sort((a,b)=>nonNegative(key==='treasury'?b.treasury:b.stockpile?.[key])-nonNegative(key==='treasury'?a.treasury:a.stockpile?.[key]));for(const r of ordered){if(remaining<=1e-9)break;if(key==='treasury'){const take=Math.min(nonNegative(r.treasury),remaining);r.treasury=nonNegative(r.treasury)-take;remaining-=take;}else{r.stockpile||={};const take=Math.min(nonNegative(r.stockpile[key]),remaining);r.stockpile[key]=nonNegative(r.stockpile[key])-take;remaining-=take;}}return amount-remaining;}
function payBundle(members,needs){let ratio=1;for(const [key,amount] of Object.entries(needs))if(amount>0)ratio=Math.min(ratio,resourceTotal(members,key)/amount);ratio=clamp(ratio);if(ratio<=0)return 0;for(const [key,amount] of Object.entries(needs))consumeAcross(members,key,amount*ratio);return ratio;}

export function ensureOffworldHabitats(region){
  region.spaceProgramme||={completedMilestones:[],claimedFirsts:[],projects:{},history:[],totalSpent:0,prestigeEarned:0};
  const p=region.spaceProgramme;p.habitats||={};
  return p.habitats;
}

function newHabitat(id,spec,currentTick){return{id,label:spec.label,body:spec.body,active:true,foundedTick:currentTick,crew:spec.initialCrew,capacity:spec.initialCapacity,condition:1,resupplyReliability:1,lifeSupportReliability:.92,powerCapacityKw:spec.initialPowerKw,powerDemandKw:spec.initialPowerKw*.58,powerReliability:.92,greenhouseModules:0,greenhouseExperience:0,greenhouseReliability:0,foodSelfSufficiency:0,lastAnnualisedCashCost:0,lastAnnualisedFuelCost:0,cumulativeResupplyCost:0,cumulativeFuelUse:0,shortageDays:0};}

function syncHabitats(carrier,currentTick,events){const habitats=ensureOffworldHabitats(carrier);for(const [id,spec] of Object.entries(HABITAT_SPECS)){if(!habitats[id]&&completed(carrier,spec.milestone)){habitats[id]=newHabitat(id,spec,currentTick);events.push({type:'offworld_habitat_established',habitatId:id,body:spec.body,regionId:carrier.id,regionName:carrier.name,tick:currentTick,title:`Permanent ${spec.label} established`,message:`${carrier.name}'s space programme now maintains a permanently occupied ${spec.label}.`});}}return habitats;}

function greenhouseTarget(h,spec){if(h.id==='orbital')return 0;const supported=Math.max(1,h.crew/4);return supported*(spec.foodCap/.72);}
function greenhousePowerPerModule(h){return h.id==='mars'?46:32;}
function greenhouseCosts(h){return h.id==='mars'?{treasury:90,steel:4,machine_components:5}:{treasury:45,steel:2,machine_components:3};}

function expandGreenhouses(h,spec,members,years,techReady){if(!techReady||h.id==='orbital'||years<=0)return;const target=greenhouseTarget(h,spec),gap=Math.max(0,target-h.greenhouseModules);if(gap<=.01)return;const desired=Math.min(gap,years*(h.id==='mars'?.34:.42));const costs=greenhouseCosts(h),ratio=payBundle(members,{treasury:costs.treasury*desired,steel:costs.steel*desired,machine_components:costs.machine_components*desired});const built=desired*ratio;if(built<=0)return;h.greenhouseModules+=built;h.powerCapacityKw+=built*greenhousePowerPerModule(h)*1.12;}

function operateGreenhouses(h,spec,members,years,techReady){if(!techReady||h.greenhouseModules<=0||h.id==='orbital'){h.greenhouseReliability=0;h.foodSelfSufficiency=0;return;}const fertiliserNeed=h.greenhouseModules*.032*years,available=resourceTotal(members,'fertiliser'),fertRatio=fertiliserNeed>0?clamp(available/fertiliserNeed):1;consumeAcross(members,'fertiliser',fertiliserNeed*fertRatio);const greenhousePower=h.greenhouseModules*greenhousePowerPerModule(h);h.powerDemandKw=Math.max(20,h.capacity*12)+greenhousePower;const powerRatio=clamp(h.powerCapacityKw/Math.max(1,h.powerDemandKw));h.greenhouseReliability=clamp((.34+.66*powerRatio)*(.45+.55*fertRatio)*(.55+.45*h.condition));if(h.greenhouseReliability>.35)h.greenhouseExperience=clamp(h.greenhouseExperience+years*.08*h.greenhouseReliability*(1-h.greenhouseExperience));const cropReliability=clamp(h.greenhouseReliability*(.82+.18*h.greenhouseExperience));h.foodSelfSufficiency=clamp((h.greenhouseModules*4/Math.max(1,h.crew))*cropReliability,0,spec.foodCap);}

function resupplyHabitat(h,spec,members,years){const foodRelief=h.foodSelfSufficiency*.30,needs={treasury:spec.cashPerCrewYear*h.crew*years*(1-foodRelief),steel:spec.steelPerCrewYear*h.crew*years,machine_components:spec.componentsPerCrewYear*h.crew*years,petrol:spec.fuelPerCrewYear*h.crew*years*(1-foodRelief*.75)};const ratio=payBundle(members,needs);h.resupplyReliability=clamp(ratio);h.lastAnnualisedCashCost=years>0?needs.treasury*ratio/years:0;h.lastAnnualisedFuelCost=years>0?needs.petrol*ratio/years:0;h.cumulativeResupplyCost+=needs.treasury*ratio;h.cumulativeFuelUse+=needs.petrol*ratio;if(ratio<.72)h.shortageDays+=years*DAYS_PER_YEAR*(1-ratio);else h.shortageDays=Math.max(0,h.shortageDays-years*DAYS_PER_YEAR*.35);const recovery=(ratio-.68)*.16;h.condition=clamp(h.condition+years*recovery,.18,1);h.lifeSupportReliability=clamp(.45+h.condition*.35+ratio*.20,.35,.995);if(ratio<.38)h.crew=Math.max(1,h.crew-years*Math.max(1,h.crew*.18));return ratio;}

function expandHabitat(h,spec,members,years){if(years<=0||h.condition<.78||h.resupplyReliability<.76)return;const desiredCapacityGrowth=years*(h.id==='orbital'?1.2:h.id==='moon'?.55:.28);const costs=h.id==='orbital'?{treasury:75,steel:7,machine_components:5,petrol:3}:h.id==='moon'?{treasury:180,steel:14,machine_components:10,petrol:11}:{treasury:420,steel:30,machine_components:22,petrol:38};const ratio=payBundle(members,Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,v*desiredCapacityGrowth])));const growth=desiredCapacityGrowth*ratio;if(growth<=0)return;h.capacity+=growth;h.powerCapacityKw+=growth*(h.id==='mars'?42:h.id==='moon'?30:24);const targetCrew=h.capacity*(h.id==='mars'?.62:.72);h.crew=Math.min(targetCrew,h.crew+growth*.8);}

function writeReport(carrier,habitats){carrier.report||={};carrier.report.offworldHabitats={totalCrew:Object.values(habitats).reduce((s,h)=>s+nonNegative(h.crew),0),habitats:Object.fromEntries(Object.entries(habitats).map(([id,h])=>[id,{active:h.active,body:h.body,crew:h.crew,capacity:h.capacity,condition:h.condition,resupplyReliability:h.resupplyReliability,lifeSupportReliability:h.lifeSupportReliability,powerCapacityKw:h.powerCapacityKw,powerDemandKw:h.powerDemandKw,greenhouseModules:h.greenhouseModules,greenhouseReliability:h.greenhouseReliability,foodSelfSufficiency:h.foodSelfSufficiency,shortageDays:h.shortageDays,lastAnnualisedCashCost:h.lastAnnualisedCashCost,lastAnnualisedFuelCost:h.lastAnnualisedFuelCost}]))};}

export function spaceExplorationBreakthroughChances(carrier,members){const done=new Set(carrier?.spaceProgramme?.completedMilestones||[]),industry=industrialReadiness(members),out={};for(const step of TECH_STEPS){const known=techAvailable(members,step.id),eligible=!known&&(step.requiresMilestones||[]).every(id=>done.has(id))&&(step.requiresTech||[]).every(id=>techAvailable(members,id));out[step.id]=eligible?clamp(step.base*(.45+industry*.85)):0;}return out;}

export function tickSpaceExplorationBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){const events=[];for(const [id,members] of groupedPolities(regions)){const carrier=programmeRegion(members);if(!carrier?.spaceProgramme)continue;const chances=spaceExplorationBreakthroughChances(carrier,members);for(const step of TECH_STEPS){if(!chances[step.id]||rng()>=weeklyChance(chances[step.id],elapsedDays))continue;for(const r of members){r.unlockedTechIds||=new Set();r.unlockedTechIds.add(step.id);}events.push({type:'space_technology_breakthrough',techId:step.id,polityId:id,regionId:carrier.id,regionName:carrier.name,tick:currentTick,title:step.label,message:`${carrier.name}'s space programme has developed ${step.label.toLowerCase()}.`});break;}}return events;}

export function tickOffworldHabitats(regions,currentTick,rng=Math.random,elapsedDays=7){const events=[],years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;void rng;for(const [,members] of groupedPolities(regions)){const carrier=programmeRegion(members);if(!carrier?.spaceProgramme)continue;const habitats=syncHabitats(carrier,currentTick,events),closedLoop=techAvailable(members,OFFWORLD_TECH_IDS.CLOSED_LOOP_AGRICULTURE);for(const [id,h] of Object.entries(habitats)){const spec=HABITAT_SPECS[id];if(!spec||!h.active)continue;expandGreenhouses(h,spec,members,years,closedLoop);operateGreenhouses(h,spec,members,years,closedLoop);resupplyHabitat(h,spec,members,years);expandHabitat(h,spec,members,years);if(h.condition<=.30&&h.active)events.push({type:'offworld_habitat_crisis',habitatId:id,body:spec.body,regionId:carrier.id,regionName:carrier.name,tick:currentTick,title:`${spec.label} supply crisis`,message:`${carrier.name}'s ${spec.label} is operating in critical condition because resupply and maintenance are inadequate.`});}writeReport(carrier,habitats);}return events;}

export function offworldHabitatSummary(region){const habitats=region?.spaceProgramme?.habitats||{};return Object.fromEntries(Object.entries(habitats).map(([id,h])=>[id,{body:h.body,crew:nonNegative(h.crew),capacity:nonNegative(h.capacity),condition:clamp(h.condition),resupplyReliability:clamp(h.resupplyReliability),greenhouseModules:nonNegative(h.greenhouseModules),foodSelfSufficiency:clamp(h.foodSelfSufficiency),powerDemandKw:nonNegative(h.powerDemandKw),powerCapacityKw:nonNegative(h.powerCapacityKw)}]));}
