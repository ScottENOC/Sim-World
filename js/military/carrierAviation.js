const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const CARRIER_TECH_IDS=Object.freeze({
  NAVAL_AVIATION:'fixed_wing_naval_aviation',
  ARRESTING_GEAR:'carrier_arresting_gear',
  HYDRAULIC_CATAPULT:'hydraulic_aircraft_catapult',
  STEAM_CATAPULT:'steam_aircraft_catapult',
  ANGLED_DECK:'angled_flight_deck',
  SUPER_CARRIER:'supercarrier_design',
  ADVANCED_ARRESTING:'advanced_carrier_arresting_gear',
  EMALS:'electromagnetic_aircraft_launch_system',
});

export const CARRIER_HULL_CLASSES=Object.freeze({LIGHT:'light_carrier',FLEET:'fleet_carrier',SUPER:'supercarrier'});
export const CARRIER_LAUNCH_SYSTEMS=Object.freeze({DECK_RUN:'deck_run',HYDRAULIC:'hydraulic_catapult',STEAM:'steam_catapult',EMALS:'electromagnetic_launch'});
export const CARRIER_RECOVERY_SYSTEMS=Object.freeze({EARLY_WIRES:'early_arresting_wires',ANGLED:'angled_deck_arresting',ADVANCED:'advanced_arresting'});

const HULL_SPEC=Object.freeze({
  [CARRIER_HULL_CLASSES.LIGHT]:{capacity:16,sortieRate:.28,deckSpace:.42,maxAircraftSize:.54,cost:{cash:125,steel:75,machine:34},eligible:['steel_warship','dreadnought']},
  [CARRIER_HULL_CLASSES.FLEET]:{capacity:42,sortieRate:.50,deckSpace:.68,maxAircraftSize:.78,cost:{cash:285,steel:175,machine:82},eligible:['dreadnought']},
  [CARRIER_HULL_CLASSES.SUPER]:{capacity:76,sortieRate:.76,deckSpace:1,maxAircraftSize:1,cost:{cash:650,steel:410,machine:190},eligible:['dreadnought']},
});
const LAUNCH_SPEC=Object.freeze({
  [CARRIER_LAUNCH_SYSTEMS.DECK_RUN]:{maxTakeoffMass:.40,tempo:.55,powerDemand:.04},
  [CARRIER_LAUNCH_SYSTEMS.HYDRAULIC]:{maxTakeoffMass:.57,tempo:.68,powerDemand:.08},
  [CARRIER_LAUNCH_SYSTEMS.STEAM]:{maxTakeoffMass:.82,tempo:.84,powerDemand:.22},
  [CARRIER_LAUNCH_SYSTEMS.EMALS]:{maxTakeoffMass:1,tempo:1,powerDemand:.48},
});
const RECOVERY_SPEC=Object.freeze({
  [CARRIER_RECOVERY_SYSTEMS.EARLY_WIRES]:{maxLandingMass:.52,tempo:.54,accidentRisk:.12},
  [CARRIER_RECOVERY_SYSTEMS.ANGLED]:{maxLandingMass:.82,tempo:.82,accidentRisk:.055},
  [CARRIER_RECOVERY_SYSTEMS.ADVANCED]:{maxLandingMass:1,tempo:1,accidentRisk:.025},
});

function electronics(region){const c=region.industrialPlants?.componentCapability||{};return clamp(Math.max(c.electronics||0,c.radio_navigation||0,c.radar_set||0));}
function precision(region){return clamp(region.industrialSupply?.capability?.precision_machining||0);}
function marine(region){return clamp(region.industrialMarine?.marineEngineering||0);}
function electricity(region){return clamp(region.electricity?.industrialService||region.electricity?.service||0);}
function flightExperience(region){return clamp((region.aviation?.flightExperience||0)/600);}
function annual(rate,days){return 1-Math.pow(1-clamp(rate,0,.95),Math.max(0,Number(days)||0)/DAYS_PER_YEAR);}

export function tickCarrierBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set();const e=electronics(region),p=precision(region),m=marine(region),xp=flightExperience(region),grid=electricity(region);
    if(!has(region,CARRIER_TECH_IDS.NAVAL_AVIATION)&&has(region,'powered_flight')&&has(region,'military_aviation')&&m>.38&&xp>.10){
      if(rng()<annual(.002+m*.012+p*.008+xp*.018,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.NAVAL_AVIATION);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.NAVAL_AVIATION,regionId:region.id,tick:currentTick,title:'Fixed-wing naval aviation'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.ARRESTING_GEAR)&&has(region,CARRIER_TECH_IDS.NAVAL_AVIATION)&&p>.36){
      if(rng()<annual(.003+p*.014+m*.008+xp*.015,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.ARRESTING_GEAR);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.ARRESTING_GEAR,regionId:region.id,tick:currentTick,title:'Carrier arresting wires'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.HYDRAULIC_CATAPULT)&&has(region,CARRIER_TECH_IDS.ARRESTING_GEAR)&&p>.44&&m>.48){
      if(rng()<annual(.002+p*.012+m*.012,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.HYDRAULIC_CATAPULT);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.HYDRAULIC_CATAPULT,regionId:region.id,tick:currentTick,title:'Hydraulic aircraft catapult'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.STEAM_CATAPULT)&&has(region,CARRIER_TECH_IDS.HYDRAULIC_CATAPULT)&&has(region,'jet_propulsion')&&m>.58&&p>.56){
      if(rng()<annual(.0012+p*.009+m*.011+e*.006,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.STEAM_CATAPULT);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.STEAM_CATAPULT,regionId:region.id,tick:currentTick,title:'Steam aircraft catapult'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.ANGLED_DECK)&&has(region,CARRIER_TECH_IDS.STEAM_CATAPULT)&&xp>.32&&m>.62){
      if(rng()<annual(.001+m*.010+p*.007+xp*.012,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.ANGLED_DECK);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.ANGLED_DECK,regionId:region.id,tick:currentTick,title:'Angled flight deck'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.SUPER_CARRIER)&&has(region,CARRIER_TECH_IDS.ANGLED_DECK)&&m>.72&&p>.68&&e>.58){
      if(rng()<annual(.00055+m*.007+p*.006+e*.004,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.SUPER_CARRIER);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.SUPER_CARRIER,regionId:region.id,tick:currentTick,title:'Large carrier design'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.ADVANCED_ARRESTING)&&has(region,CARRIER_TECH_IDS.SUPER_CARRIER)&&e>.70&&p>.72){
      if(rng()<annual(.00045+e*.006+p*.006+xp*.006,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.ADVANCED_ARRESTING);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.ADVANCED_ARRESTING,regionId:region.id,tick:currentTick,title:'Advanced carrier arresting systems'});continue;}
    }
    if(!has(region,CARRIER_TECH_IDS.EMALS)&&has(region,CARRIER_TECH_IDS.SUPER_CARRIER)&&has(region,CARRIER_TECH_IDS.ADVANCED_ARRESTING)&&grid>.78&&e>.82&&p>.78){
      if(rng()<annual(.00020+grid*.004+e*.005+p*.004,elapsedDays)){region.unlockedTechIds.add(CARRIER_TECH_IDS.EMALS);events.push({type:'naval_aviation_breakthrough',techId:CARRIER_TECH_IDS.EMALS,regionId:region.id,tick:currentTick,title:'Electromagnetic aircraft launch'});}
    }
  }
  return events;
}

function defaultLaunch(region){
  if(has(region,CARRIER_TECH_IDS.EMALS))return CARRIER_LAUNCH_SYSTEMS.EMALS;
  if(has(region,CARRIER_TECH_IDS.STEAM_CATAPULT))return CARRIER_LAUNCH_SYSTEMS.STEAM;
  if(has(region,CARRIER_TECH_IDS.HYDRAULIC_CATAPULT))return CARRIER_LAUNCH_SYSTEMS.HYDRAULIC;
  return CARRIER_LAUNCH_SYSTEMS.DECK_RUN;
}
function defaultRecovery(region){
  if(has(region,CARRIER_TECH_IDS.ADVANCED_ARRESTING))return CARRIER_RECOVERY_SYSTEMS.ADVANCED;
  if(has(region,CARRIER_TECH_IDS.ANGLED_DECK))return CARRIER_RECOVERY_SYSTEMS.ANGLED;
  return CARRIER_RECOVERY_SYSTEMS.EARLY_WIRES;
}
function hullAllowed(region,hullClass){
  if(hullClass===CARRIER_HULL_CLASSES.SUPER&&!has(region,CARRIER_TECH_IDS.SUPER_CARRIER))return false;
  if(hullClass===CARRIER_HULL_CLASSES.FLEET&&!has(region,CARRIER_TECH_IDS.HYDRAULIC_CATAPULT))return false;
  return true;
}

export function canConvertToCarrier(region,ship,hullClass=CARRIER_HULL_CLASSES.LIGHT){
  if(!region||!ship)return{possible:false,reason:'missing_platform'};
  if(!has(region,CARRIER_TECH_IDS.NAVAL_AVIATION)||!has(region,CARRIER_TECH_IDS.ARRESTING_GEAR))return{possible:false,reason:'naval_aviation_not_ready'};
  const spec=HULL_SPEC[hullClass];if(!spec)return{possible:false,reason:'unknown_carrier_class'};
  if(!hullAllowed(region,hullClass))return{possible:false,reason:'carrier_class_not_understood'};
  if(!spec.eligible.includes(ship.designId))return{possible:false,reason:'hull_too_small_or_unsuitable'};
  return{possible:true,spec};
}

export function convertShipToCarrier(region,ship,{hullClass=CARRIER_HULL_CLASSES.LIGHT}={}){
  const check=canConvertToCarrier(region,ship,hullClass);if(!check.possible)return{converted:false,reason:check.reason};
  const spec=check.spec,inv=region.industrialSupply?.inventory||{};region.stockpile||={};
  if(nonNegative(region.treasury)<spec.cost.cash||nonNegative(region.stockpile.steel)<spec.cost.steel||nonNegative(inv.machine_components)<spec.cost.machine)return{converted:false,reason:'insufficient_resources',cost:spec.cost};
  region.treasury-=spec.cost.cash;region.stockpile.steel-=spec.cost.steel;inv.machine_components-=spec.cost.machine;
  const prior={...(ship.designStats||{}),combat:ship.designStats?.combat??1,gunCapacity:ship.gunCapacity??ship.designStats?.gunCapacity??0};
  ship.carrierFacilities={hullClass,capacity:spec.capacity,deckSpace:spec.deckSpace,sortieRate:spec.sortieRate,maxAircraftSize:spec.maxAircraftSize,launchSystem:defaultLaunch(region),recoverySystem:defaultRecovery(region),originalDesignStats:prior};
  ship.classLabel=hullClass===CARRIER_HULL_CLASSES.SUPER?'supercarrier':hullClass===CARRIER_HULL_CLASSES.FLEET?'fleet aircraft carrier':'light aircraft carrier';
  ship.designStats={...prior,combat:(prior.combat||1)*(hullClass===CARRIER_HULL_CLASSES.LIGHT?.34:.22),gunCapacity:Math.min(prior.gunCapacity||0,hullClass===CARRIER_HULL_CLASSES.SUPER?8:4),carrier:true,carrierCapacity:spec.capacity};
  ship.gunCapacity=ship.designStats.gunCapacity;
  return{converted:true,ship,cost:spec.cost};
}

export function upgradeCarrierSystems(region,ship){
  const c=ship?.carrierFacilities;if(!c)return{upgraded:false,reason:'not_a_carrier'};
  const launch=defaultLaunch(region),recovery=defaultRecovery(region);const changed=launch!==c.launchSystem||recovery!==c.recoverySystem;
  c.launchSystem=launch;c.recoverySystem=recovery;return{upgraded:changed,launchSystem:launch,recoverySystem:recovery};
}

function aircraftMassProfile(aircraft){
  const s=aircraft?.designStats||{};const propulsion=s.propulsion||'piston';
  const base=aircraft?.role==='bomber'?.66:aircraft?.role==='tanker'?.78:aircraft?.role==='airborne_early_warning'?.72:.34;
  const takeoff=clamp(base+(s.payload||0)*.18+(s.range||0)*.08+(s.enginePower||0)*.06+(propulsion==='jet'?.11:0));
  const landing=clamp(takeoff-(s.payload||0)*.10-.04);
  return{takeoffMass:takeoff,landingMass:landing,aircraftSize:clamp(base+(s.payload||0)*.10+(s.enginePower||0)*.08),jet:propulsion==='jet'};
}

export function navaliseAircraft(region,aircraft,{foldingWings=true}={}){
  if(!region||!aircraft||aircraft.aircraftType==='helicopter')return{navalised:false,reason:'unsuitable_aircraft'};
  if(!has(region,CARRIER_TECH_IDS.NAVAL_AVIATION)||!has(region,CARRIER_TECH_IDS.ARRESTING_GEAR))return{navalised:false,reason:'carrier_aviation_not_ready'};
  const stats=aircraft.designStats||{};if(aircraft.role==='tanker'&&!has(region,CARRIER_TECH_IDS.EMALS))return{navalised:false,reason:'aircraft_too_heavy_for_current_carriers'};
  const cost=12+(stats.payload||0)*12+(stats.enginePower||0)*8;const inv=region.industrialSupply?.inventory||{};
  if(nonNegative(region.treasury)<cost||nonNegative(inv.machine_components)<2.5)return{navalised:false,reason:'insufficient_resources'};
  region.treasury-=cost;inv.machine_components-=2.5;
  aircraft.carrierAdaptation={tailhook:true,reinforcedLandingGear:true,foldingWings:Boolean(foldingWings),corrosionProtection:true};
  if(aircraft.designStats)aircraft.designStats={...aircraft.designStats,range:clamp((aircraft.designStats.range||0)*.965),payload:clamp((aircraft.designStats.payload||0)*.97),reliability:clamp((aircraft.designStats.reliability||0)*.985)};
  return{navalised:true,aircraft,cost};
}

export function carrierAircraftCompatibility(ship,aircraft){
  const c=ship?.carrierFacilities;if(!c)return{compatible:false,reason:'not_a_carrier'};
  if(!aircraft?.carrierAdaptation?.tailhook)return{compatible:false,reason:'aircraft_not_navalised'};
  const mass=aircraftMassProfile(aircraft),launch=LAUNCH_SPEC[c.launchSystem]||LAUNCH_SPEC.deck_run,recovery=RECOVERY_SPEC[c.recoverySystem]||RECOVERY_SPEC.early_arresting_wires;
  if(mass.aircraftSize>c.maxAircraftSize)return{compatible:false,reason:'aircraft_too_large',mass,launch,recovery};
  if(mass.takeoffMass>launch.maxTakeoffMass)return{compatible:false,reason:'launch_system_insufficient',mass,launch,recovery};
  if(mass.landingMass>recovery.maxLandingMass)return{compatible:false,reason:'recovery_system_insufficient',mass,launch,recovery};
  if(mass.jet&&c.launchSystem===CARRIER_LAUNCH_SYSTEMS.DECK_RUN)return{compatible:false,reason:'jet_requires_catapult',mass,launch,recovery};
  return{compatible:true,mass,launch,recovery};
}

function embarkedOnShip(region,shipId){return(region?.aviation?.aircraft||[]).filter(a=>a.status!=='destroyed'&&a.baseType==='carrier'&&a.carrierShipId===shipId);}
export function embarkCarrierAircraft(region,aircraftId,fleet,shipId){
  const ship=(fleet?.ships||[]).find(s=>s.id===shipId);if(!ship?.carrierFacilities)return{embarked:false,reason:'carrier_not_found'};
  const aircraft=(region?.aviation?.aircraft||[]).find(a=>a.id===aircraftId&&a.aircraftType!=='helicopter');if(!aircraft||aircraft.status==='destroyed')return{embarked:false,reason:'aircraft_unavailable'};
  const compat=carrierAircraftCompatibility(ship,aircraft);if(!compat.compatible)return{embarked:false,reason:compat.reason,compatibility:compat};
  if(embarkedOnShip(region,ship.id).length>=ship.carrierFacilities.capacity)return{embarked:false,reason:'hangar_full'};
  aircraft.baseType='carrier';aircraft.baseFleetId=fleet.id;aircraft.carrierShipId=ship.id;aircraft.baseRegionId=null;aircraft.carrierSeaRegionId=fleet.seaRegionId||null;aircraft.carrierPortRegionId=fleet.portRegionId||region.id;
  return{embarked:true,aircraft,shipId:ship.id};
}

export function disembarkCarrierAircraft(region,aircraftId,fleet=null){
  const aircraft=(region?.aviation?.aircraft||[]).find(a=>a.id===aircraftId&&a.baseType==='carrier');if(!aircraft)return{disembarked:false,reason:'not_embarked'};
  if(fleet&&aircraft.baseFleetId!==fleet.id)return{disembarked:false,reason:'wrong_fleet'};
  aircraft.baseType='airfield';aircraft.baseRegionId=fleet?.portRegionId||aircraft.carrierPortRegionId||region.id;aircraft.baseFleetId=null;aircraft.carrierShipId=null;aircraft.carrierSeaRegionId=null;aircraft.carrierPortRegionId=null;return{disembarked:true,aircraft};
}

export function carrierLaunchAssessment(region,aircraft,fleet,ship){
  const compat=carrierAircraftCompatibility(ship,aircraft);if(!compat.compatible)return{possible:false,reason:compat.reason,...compat};
  if(aircraft.baseFleetId!==fleet?.id||aircraft.carrierShipId!==ship?.id)return{possible:false,reason:'aircraft_not_embarked_here'};
  const c=ship.carrierFacilities,launch=compat.launch,recovery=compat.recovery;
  const deckHandling=clamp(c.sortieRate*launch.tempo*recovery.tempo);const condition=clamp(ship.condition??1);const aircraftCondition=clamp(aircraft.condition??1);
  const sortieReadiness=clamp(deckHandling*.50+condition*.20+aircraftCondition*.20+(aircraft.designStats?.reliability||.5)*.10);
  const accidentRisk=clamp(recovery.accidentRisk*(1-sortieReadiness*.45)+(compat.mass.jet?.012:0),.005,.20);
  return{possible:sortieReadiness>=.34,sortieReadiness,accidentRisk,launchSystem:c.launchSystem,recoverySystem:c.recoverySystem,mass:compat.mass};
}

export function fleetCarrierSummary(region,fleet){
  const carriers=(fleet?.ships||[]).filter(s=>s.carrierFacilities);let capacity=0,embarked=0,weightedTempo=0;
  for(const ship of carriers){const c=ship.carrierFacilities;capacity+=c.capacity;const n=embarkedOnShip(region,ship.id).length;embarked+=n;weightedTempo+=c.sortieRate*c.capacity;}
  return{carriers:carriers.length,capacity,embarked,freeCapacity:Math.max(0,capacity-embarked),sortieRate:capacity?weightedTempo/capacity:0,ships:carriers.map(s=>({shipId:s.id,hullClass:s.carrierFacilities.hullClass,capacity:s.carrierFacilities.capacity,launchSystem:s.carrierFacilities.launchSystem,recoverySystem:s.carrierFacilities.recoverySystem,embarked:embarkedOnShip(region,s.id).length}))};
}
