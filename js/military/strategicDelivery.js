import { operationalInfrastructure } from '../economy/construction.js?v=20260920-strategic-delivery1';
import { nuclearIndustrialReadiness, REACTOR_ENGINEERING_TECH_ID } from '../economy/nuclearPower.js?v=20260920-nuclear1';
import { nuclearDeterrentStatus } from './nuclearWeaponisation.js?v=20260920-nuclear-weaponisation1';
import { aerialRefuellingSupport } from './aviation.js?v=20260920-nuclear-deterrence1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=(v)=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const STRATEGIC_BOMBER_DELIVERY_TECH_ID='strategic_bomber_delivery';
export const STRATEGIC_MISSILE_TECH_ID='strategic_missile_systems';
export const HARDENED_STRATEGIC_BASING_TECH_ID='hardened_strategic_basing';
export const MOBILE_STRATEGIC_BASING_TECH_ID='mobile_strategic_basing';
export const NAVAL_NUCLEAR_PROPULSION_TECH_ID='naval_nuclear_propulsion';
export const STRATEGIC_MISSILE_SUBMARINE_TECH_ID='strategic_missile_submarine';
export const STRATEGIC_EARLY_WARNING_TECH_ID='strategic_early_warning';
export const SECURE_STRATEGIC_COMMAND_TECH_ID='secure_strategic_command';

export const STRATEGIC_POSTURES=Object.freeze({
  MINIMAL:'minimal',BALANCED:'balanced',SURVIVABLE:'survivable'
});

export function ensureStrategicDelivery(region){
  region.strategicDelivery ||= {};
  const s=region.strategicDelivery;
  s.policy ||= {posture:STRATEGIC_POSTURES.BALANCED,bomberAlert:.22,bomberDispersal:.18,landDispersal:.2,submarinePatrolRate:.35};
  s.air ||= {experience:0};
  s.land ||= {fixedLaunchers:0,mobileLaunchers:0,readiness:.45,experience:0};
  s.sea ||= {platformIds:[],patrolPlatformIds:[],readiness:.42,experience:0};
  s.command ||= {warningExperience:0,commandExperience:0};
  s.procurement ||= {landTarget:0,mobileShare:.35,seaTarget:0};
  if(!Array.isArray(s.sea.platformIds))s.sea.platformIds=[];
  if(!Array.isArray(s.sea.patrolPlatformIds))s.sea.patrolPlatformIds=[];
  return s;
}

export function setStrategicDeliveryPolicy(region,patch={}){
  const s=ensureStrategicDelivery(region),p=s.policy;
  if(Object.values(STRATEGIC_POSTURES).includes(patch.posture))p.posture=patch.posture;
  for(const key of ['bomberAlert','bomberDispersal','landDispersal','submarinePatrolRate'])if(Number.isFinite(patch[key]))p[key]=clamp(patch[key]);
  if(Number.isFinite(patch.landTarget))s.procurement.landTarget=Math.max(0,Math.round(patch.landTarget));
  if(Number.isFinite(patch.mobileShare))s.procurement.mobileShare=clamp(patch.mobileShare);
  if(Number.isFinite(patch.seaTarget))s.procurement.seaTarget=Math.max(0,Math.round(patch.seaTarget));
  return {policy:{...p},procurement:{...s.procurement}};
}

function industrialCapability(region){
  const c=region.industrialPlants?.componentCapability||{};
  const precision=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const electronics=clamp(c.electronics||c.radio_navigation||0);
  const engines=clamp(c.engine||0);
  const manufacture=clamp(region.structuralTransformation?.capability?.manufacture||0);
  return {precision,electronics,engines,manufacture,overall:clamp(precision*.32+electronics*.24+engines*.18+manufacture*.26)};
}

function annualChance(rate,elapsedDays){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR);}
function unlock(region,techId,eventType,title,currentTick,events){
  if(has(region,techId))return false;
  region.unlockedTechIds.add(techId);
  events.push({type:eventType,techId,regionId:region.id,regionName:region.name,tick:currentTick,title});
  return true;
}

export function tickStrategicDeliveryBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    const ind=industrialCapability(region),nuclear=nuclearIndustrialReadiness(region),aviation=region.aviation?.aircraft||[];
    const bombers=aviation.filter(a=>a.ownerType==='military'&&a.role==='bomber'&&a.status!=='destroyed').length;
    const subs=(region.fleets||[]).flatMap(f=>f.ships||[]).filter(s=>s.designId==='submarine').length;
    const strategicPractice=clamp((ensureStrategicDelivery(region).land.experience||0)*.25+(region.aviation?.flightExperience||0)/5000*.25+(region.earlyModernMilitary?.naval?.readiness||0)*.2+ind.overall*.3);

    if(!has(region,STRATEGIC_BOMBER_DELIVERY_TECH_ID)&&has(region,'aerial_bombing')&&has(region,'aerial_refuelling')&&bombers>0&&ind.overall>.48){
      if(rng()<annualChance(.018+strategicPractice*.045,elapsedDays))unlock(region,STRATEGIC_BOMBER_DELIVERY_TECH_ID,'strategic_delivery_breakthrough','Long-range strategic bomber operations',currentTick,events);
    }
    if(!has(region,STRATEGIC_MISSILE_TECH_ID)&&has(region,'rocket_launcher_systems')&&ind.precision>.55&&ind.electronics>.28&&ind.manufacture>.52){
      if(rng()<annualChance(.006+strategicPractice*.032,elapsedDays))unlock(region,STRATEGIC_MISSILE_TECH_ID,'strategic_delivery_breakthrough','Strategic missile systems',currentTick,events);
    }
    if(has(region,STRATEGIC_MISSILE_TECH_ID)&&!has(region,HARDENED_STRATEGIC_BASING_TECH_ID)&&ind.manufacture>.58){
      if(rng()<annualChance(.016+ind.overall*.035,elapsedDays))unlock(region,HARDENED_STRATEGIC_BASING_TECH_ID,'strategic_delivery_breakthrough','Hardened strategic basing',currentTick,events);
    }
    if(has(region,STRATEGIC_MISSILE_TECH_ID)&&!has(region,MOBILE_STRATEGIC_BASING_TECH_ID)&&ind.engines>.48&&ind.manufacture>.58){
      if(rng()<annualChance(.012+ind.overall*.032,elapsedDays))unlock(region,MOBILE_STRATEGIC_BASING_TECH_ID,'strategic_delivery_breakthrough','Mobile strategic basing',currentTick,events);
    }
    if(!has(region,NAVAL_NUCLEAR_PROPULSION_TECH_ID)&&has(region,REACTOR_ENGINEERING_TECH_ID)&&has(region,'submarine')&&nuclear>.62&&ind.precision>.62){
      if(rng()<annualChance(.004+nuclear*.022+ind.overall*.018+(subs>0?.01:0),elapsedDays))unlock(region,NAVAL_NUCLEAR_PROPULSION_TECH_ID,'strategic_delivery_breakthrough','Naval nuclear propulsion',currentTick,events);
    }
    if(!has(region,STRATEGIC_MISSILE_SUBMARINE_TECH_ID)&&has(region,NAVAL_NUCLEAR_PROPULSION_TECH_ID)&&has(region,STRATEGIC_MISSILE_TECH_ID)&&has(region,'submarine')){
      if(rng()<annualChance(.005+nuclear*.018+ind.overall*.018,elapsedDays))unlock(region,STRATEGIC_MISSILE_SUBMARINE_TECH_ID,'strategic_delivery_breakthrough','Strategic missile submarine',currentTick,events);
    }
    if(!has(region,STRATEGIC_EARLY_WARNING_TECH_ID)&&has(region,'radar')&&ind.electronics>.42){
      if(rng()<annualChance(.010+ind.electronics*.032,elapsedDays))unlock(region,STRATEGIC_EARLY_WARNING_TECH_ID,'strategic_delivery_breakthrough','Strategic early-warning network',currentTick,events);
    }
    if(!has(region,SECURE_STRATEGIC_COMMAND_TECH_ID)&&has(region,STRATEGIC_EARLY_WARNING_TECH_ID)&&ind.electronics>.48&&(has(region,'telephone')||has(region,'computing'))){
      if(rng()<annualChance(.008+ind.electronics*.026,elapsedDays))unlock(region,SECURE_STRATEGIC_COMMAND_TECH_ID,'strategic_delivery_breakthrough','Secure strategic command system',currentTick,events);
    }
  }
  return events;
}

export function buildLandStrategicLauncher(region,{mobile=false}={}){
  const s=ensureStrategicDelivery(region);
  if(!has(region,STRATEGIC_MISSILE_TECH_ID))return{built:false,reason:'no_strategic_missile_system'};
  if(mobile&&!has(region,MOBILE_STRATEGIC_BASING_TECH_ID))return{built:false,reason:'no_mobile_basing'};
  region.stockpile ||= {};const components=region.industrialSupply?.inventory||{};
  const steelNeed=mobile?52:68,machineNeed=mobile?18:15,cashNeed=mobile?42:36;
  if(nonNegative(region.stockpile.steel)<steelNeed||nonNegative(components.machine_components)<machineNeed||nonNegative(region.treasury)<cashNeed)return{built:false,reason:'insufficient_industrial_inputs'};
  region.stockpile.steel-=steelNeed;components.machine_components-=machineNeed;region.treasury-=cashNeed;
  if(mobile)s.land.mobileLaunchers++;else s.land.fixedLaunchers++;
  s.land.experience=clamp(s.land.experience+.018);
  return{built:true,mobile,fixedLaunchers:s.land.fixedLaunchers,mobileLaunchers:s.land.mobileLaunchers};
}

export function commissionStrategicSubmarine(region,fleet,shipId){
  const s=ensureStrategicDelivery(region),ship=(fleet?.ships||[]).find(x=>x.id===shipId);
  if(!ship||ship.designId!=='submarine')return{commissioned:false,reason:'submarine_required'};
  if(!has(region,NAVAL_NUCLEAR_PROPULSION_TECH_ID)||!has(region,STRATEGIC_MISSILE_SUBMARINE_TECH_ID))return{commissioned:false,reason:'technology_not_ready'};
  if(!operationalInfrastructure(region,'large_drydock'))return{commissioned:false,reason:'large_drydock_required'};
  if(nonNegative(region.stockpile?.reactor_fuel)<.35||nonNegative(region.treasury)<85)return{commissioned:false,reason:'insufficient_reactor_fuel_or_funds'};
  region.stockpile.reactor_fuel-=.35;region.treasury-=85;
  ship.propulsion='nuclear';ship.strategicRole='strategic_missile_submarine';ship.strategicReadiness=.52;ship.strategicPatrol=false;
  if(!s.sea.platformIds.includes(ship.id))s.sea.platformIds.push(ship.id);
  s.sea.experience=clamp(s.sea.experience+.025);
  return{commissioned:true,ship};
}

export function setStrategicSubmarinePatrol(region,fleet,shipId,onPatrol=true){
  const s=ensureStrategicDelivery(region),ship=(fleet?.ships||[]).find(x=>x.id===shipId);
  if(!ship||ship.strategicRole!=='strategic_missile_submarine')return{assigned:false,reason:'strategic_submarine_required'};
  ship.strategicPatrol=Boolean(onPatrol);
  if(onPatrol){if(!s.sea.patrolPlatformIds.includes(ship.id))s.sea.patrolPlatformIds.push(ship.id);}
  else s.sea.patrolPlatformIds=s.sea.patrolPlatformIds.filter(id=>id!==ship.id);
  return{assigned:true,onPatrol:Boolean(onPatrol)};
}

function airLeg(region){
  const s=ensureStrategicDelivery(region),aircraft=region.aviation?.aircraft||[];
  const bombers=aircraft.filter(a=>a.ownerType==='military'&&a.role==='bomber'&&a.status!=='destroyed'&&(a.condition??1)>=.42);
  const refuel=aerialRefuellingSupport(region),enabled=has(region,STRATEGIC_BOMBER_DELIVERY_TECH_ID)&&bombers.length>0;
  const alert=clamp(s.policy.bomberAlert),dispersal=clamp(s.policy.bomberDispersal);
  const survivability=enabled?clamp(.18+alert*.22+dispersal*.38+(refuel.enabled?.10:0)):0;
  const readiness=enabled?clamp(.42+Math.min(.28,bombers.length*.035)+alert*.16+(refuel.enabled?.12:0)):0;
  return{available:enabled,bombers:bombers.length,tankers:refuel.tankers,refuellingSupported:refuel.enabled,alert,dispersal,survivability,readiness};
}

function landLeg(region){
  const s=ensureStrategicDelivery(region),fixed=Math.max(0,s.land.fixedLaunchers|0),mobile=Math.max(0,s.land.mobileLaunchers|0),total=fixed+mobile;
  const available=has(region,STRATEGIC_MISSILE_TECH_ID)&&total>0;
  const hardening=has(region,HARDENED_STRATEGIC_BASING_TECH_ID)?1:0,mobility=total?mobile/total:0,dispersal=clamp(s.policy.landDispersal);
  const survivability=available?clamp(.15+hardening*.18+mobility*.42+dispersal*.20):0;
  const readiness=available?clamp((s.land.readiness||.45)*.72+.18+Math.min(.10,total*.012)):0;
  return{available,fixedLaunchers:fixed,mobileLaunchers:mobile,hardening:Boolean(hardening),mobilityShare:mobility,dispersal,survivability,readiness};
}

function seaLeg(region,{fleets=[]}={}){
  const s=ensureStrategicDelivery(region),ships=(fleets||[]).flatMap(f=>f.ships||[]);
  const strategic=ships.filter(ship=>ship.strategicRole==='strategic_missile_submarine'||s.sea.platformIds.includes(ship.id));
  const patrol=strategic.filter(ship=>ship.strategicPatrol||s.sea.patrolPlatformIds.includes(ship.id));
  const available=has(region,STRATEGIC_MISSILE_SUBMARINE_TECH_ID)&&strategic.length>0;
  const atSeaShare=strategic.length?patrol.length/strategic.length:0;
  const survivability=available?clamp(.28+atSeaShare*.52+(has(region,NAVAL_NUCLEAR_PROPULSION_TECH_ID)?.12:0)):0;
  const readiness=available?clamp((s.sea.readiness||.42)*.62+.22+atSeaShare*.16):0;
  return{available,strategicSubmarines:strategic.length,onPatrol:patrol.length,atSeaShare,nuclearPropulsion:has(region,NAVAL_NUCLEAR_PROPULSION_TECH_ID),survivability,readiness};
}

export function strategicForceReadiness(region,{fleets=[]}={}){
  const air=airLeg(region),land=landLeg(region),sea=seaLeg(region,{fleets});
  const legs=[air,land,sea],available=legs.filter(x=>x.available),survivable=available.filter(x=>x.survivability>=.5);
  const warning=has(region,STRATEGIC_EARLY_WARNING_TECH_ID)?clamp(.48+(ensureStrategicDelivery(region).command.warningExperience||0)*.32):.18;
  const commandResilience=has(region,SECURE_STRATEGIC_COMMAND_TECH_ID)?clamp(.52+(ensureStrategicDelivery(region).command.commandExperience||0)*.30):.22;
  const weighted=available.length?available.reduce((sum,x)=>sum+x.survivability*x.readiness,0)/available.length:0;
  const retaliationConfidence=clamp(weighted*.68+warning*.12+commandResilience*.20);
  return{air,land,sea,legsAvailable:available.length,survivableLegs:survivable.length,fullTriad:available.length===3,warning,commandResilience,retaliationConfidence,firstStrikeVulnerability:clamp(1-retaliationConfidence)};
}

export function secondStrikeAssessment(region,{fleets=[]}={}){
  const force=strategicForceReadiness(region,{fleets});
  const demonstrated=nuclearDeterrentStatus(region)==='demonstrated_device_capability';
  const credible=demonstrated&&force.retaliationConfidence>=.48&&force.survivableLegs>=1;
  const robust=demonstrated&&force.retaliationConfidence>=.68&&force.survivableLegs>=2;
  return{...force,demonstratedDevice:demonstrated,credibleSecondStrike:credible,robustSecondStrike:robust};
}

export function tickStrategicDelivery(regions,currentTick,elapsedDays=7,{fleets=[]}={}){
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,events=[];
  for(const region of regions||[]){
    const s=ensureStrategicDelivery(region),force=strategicForceReadiness(region,{fleets});
    if(force.air.available)s.air.experience=clamp(s.air.experience+years*.045*(1-s.air.experience));
    if(force.land.available){s.land.experience=clamp(s.land.experience+years*.035*(1-s.land.experience));s.land.readiness=clamp(s.land.readiness+years*.08*(.78-s.land.readiness));}
    if(force.sea.available){s.sea.experience=clamp(s.sea.experience+years*.028*(1-s.sea.experience));s.sea.readiness=clamp(s.sea.readiness+years*.055*(.76-s.sea.readiness));}
    if(has(region,STRATEGIC_EARLY_WARNING_TECH_ID))s.command.warningExperience=clamp(s.command.warningExperience+years*.04*(1-s.command.warningExperience));
    if(has(region,SECURE_STRATEGIC_COMMAND_TECH_ID))s.command.commandExperience=clamp(s.command.commandExperience+years*.032*(1-s.command.commandExperience));
    const assessment=secondStrikeAssessment(region,{fleets});
    s.lastAssessment={tick:currentTick,retaliationConfidence:assessment.retaliationConfidence,firstStrikeVulnerability:assessment.firstStrikeVulnerability,credibleSecondStrike:assessment.credibleSecondStrike,robustSecondStrike:assessment.robustSecondStrike};
  }
  return events;
}
