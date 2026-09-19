from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected marker not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# --- fleets.js: design choices, physics, material BOM and refit costs ---------
fleets = ROOT / 'js/military/fleets.js'
text = fleets.read_text()
text = text.replace('function navalFrontier(region,designId){', 'function baseNavalFrontier(region,designId){', 1)
marker = "}\nexport function currentNavalDesign(region,designId){"
insert = r''' }

export const NAVAL_SUPERSTRUCTURE_MATERIALS=Object.freeze({STEEL:'steel',ALUMINIUM:'aluminium'});
export const NAVAL_SEAWATER_SYSTEMS=Object.freeze({CONVENTIONAL:'conventional',TITANIUM:'titanium'});
export const SUBMARINE_PRESSURE_HULLS=Object.freeze({STEEL:'steel',TITANIUM:'titanium'});
const NAVAL_SURFACE_LIGHT_METAL_CLASSES=new Set(['steel_warship','destroyer','dreadnought','fleet_tug']);
const NAVAL_PRIORITY_DEFAULTS=Object.freeze({
  surface:{speed:1,endurance:1,firepower:1,protection:1,sensors:1,reliability:1},
  submarine:{speed:1,depth:1,stealth:1,endurance:1,firepower:1,reliability:1},
});
const NAVAL_ALUMINIUM_INPUT=Object.freeze({steel_warship:18,destroyer:12,dreadnought:42,fleet_tug:8});
const NAVAL_TITANIUM_SYSTEM_INPUT=Object.freeze({steel_warship:4,destroyer:3,dreadnought:10,fleet_tug:2,submarine:5});

function mergeNavalInputs(base={},extra={}){const out={...base};for(const [k,v]of Object.entries(extra||{}))out[k]=(out[k]||0)+Math.max(0,Number(v)||0);return out;}
function normaliseNavalPriorities(kind,raw={}){const defs=NAVAL_PRIORITY_DEFAULTS[kind],out={};let sum=0;for(const k of Object.keys(defs)){out[k]=clamp(raw[k]??1,.25,2.5);sum+=out[k];}const mean=sum/Object.keys(out).length;for(const k of Object.keys(out))out[k]/=Math.max(.01,mean);return out;}
function hasNavalTech(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}
function navalClassAvailable(region,designId){
  if(designId==='steel_warship')return hasNavalTech(region,STEEL_HULL_TECH_ID);
  if(designId==='destroyer')return hasNavalTech(region,STEEL_HULL_TECH_ID)&&hasNavalTech(region,'self_propelled_torpedo');
  if(designId==='submarine')return hasNavalTech(region,SUBMARINE_TECH_ID);
  if(designId==='dreadnought')return hasNavalTech(region,DREADNOUGHT_TECH_ID);
  if(designId==='fleet_tug')return hasNavalTech(region,MARINE_STEAM_TECH_ID);
  return false;
}
export function navalDesignClassOptions(region){return ['steel_warship','destroyer','submarine','dreadnought','fleet_tug'].filter(id=>navalClassAvailable(region,id)).map(id=>({id,label:SHIP_DESIGNS[id].label}));}
export function navalDesignMaterialOptions(region,designId){
  const surface=NAVAL_SURFACE_LIGHT_METAL_CLASSES.has(designId),sub=designId==='submarine';
  const aluminiumAvailable=surface&&hasNavalTech(region,'aerospace_light_alloys');
  const titaniumAvailable=(surface||sub)&&hasNavalTech(region,'kroll_titanium');
  return {
    superstructure:[
      {id:NAVAL_SUPERSTRUCTURE_MATERIALS.STEEL,label:'Steel superstructure',available:true},
      {id:NAVAL_SUPERSTRUCTURE_MATERIALS.ALUMINIUM,label:'Aluminium-alloy superstructure',available:aluminiumAvailable,reason:aluminiumAvailable?null:'Requires advanced aluminium-alloy metallurgy'},
    ],
    seawaterSystems:[
      {id:NAVAL_SEAWATER_SYSTEMS.CONVENTIONAL,label:'Conventional seawater systems',available:true},
      {id:NAVAL_SEAWATER_SYSTEMS.TITANIUM,label:'Titanium seawater & machinery systems',available:titaniumAvailable,reason:titaniumAvailable?null:'Requires commercial titanium metallurgy'},
    ],
    pressureHull:sub?[
      {id:SUBMARINE_PRESSURE_HULLS.STEEL,label:'High-strength steel pressure hull',available:true},
      {id:SUBMARINE_PRESSURE_HULLS.TITANIUM,label:'Titanium pressure hull',available:titaniumAvailable,reason:titaniumAvailable?null:'Requires commercial titanium metallurgy'},
    ]:[],
  };
}
function validNavalChoice(options,id,fallback){return options.find(o=>o.id===id&&o.available)?.id||fallback;}
function defaultNavalDesignChoices(region,designId){
  const opts=navalDesignMaterialOptions(region,designId),stock=region.stockpile||{},precision=clamp(region.industrialSupply?.capability?.precision_machining||0),sub=designId==='submarine';
  return {
    superstructure:validNavalChoice(opts.superstructure,(stock.aluminium||0)>60?NAVAL_SUPERSTRUCTURE_MATERIALS.ALUMINIUM:NAVAL_SUPERSTRUCTURE_MATERIALS.STEEL,NAVAL_SUPERSTRUCTURE_MATERIALS.STEEL),
    seawaterSystems:validNavalChoice(opts.seawaterSystems,(stock.titanium||0)>18?NAVAL_SEAWATER_SYSTEMS.TITANIUM:NAVAL_SEAWATER_SYSTEMS.CONVENTIONAL,NAVAL_SEAWATER_SYSTEMS.CONVENTIONAL),
    pressureHull:sub?validNavalChoice(opts.pressureHull,(stock.titanium||0)>90&&precision>.72?SUBMARINE_PRESSURE_HULLS.TITANIUM:SUBMARINE_PRESSURE_HULLS.STEEL,SUBMARINE_PRESSURE_HULLS.STEEL):null,
    priorities:{},
  };
}
function normaliseNavalChoices(region,designId,choices=null){
  const source=choices||defaultNavalDesignChoices(region,designId),opts=navalDesignMaterialOptions(region,designId),sub=designId==='submarine';
  return {
    superstructure:validNavalChoice(opts.superstructure,source.superstructure,NAVAL_SUPERSTRUCTURE_MATERIALS.STEEL),
    seawaterSystems:validNavalChoice(opts.seawaterSystems,source.seawaterSystems,NAVAL_SEAWATER_SYSTEMS.CONVENTIONAL),
    pressureHull:sub?validNavalChoice(opts.pressureHull,source.pressureHull,SUBMARINE_PRESSURE_HULLS.STEEL):null,
    priorities:normaliseNavalPriorities(sub?'submarine':'surface',source.priorities||{}),
  };
}
function applyNavalMaterialsAndPriorities(region,designId,baseStats,choices){
  const sub=designId==='submarine',p=choices.priorities;let s={...baseStats,systemInputs:{...(baseStats.systemInputs||{})},designPriorities:p,
    superstructureMaterial:choices.superstructure,seawaterSystemsMaterial:choices.seawaterSystems,pressureHullMaterial:choices.pressureHull,
    steelConstructionMultiplier:1,topweightMultiplier:1,corrosionResistance:.62,fireResistance:1,maintenanceMultiplier:1,enduranceMultiplier:1,testDepthMultiplier:sub?1:null,fabricationComplexity:1};
  if(!sub&&choices.superstructure===NAVAL_SUPERSTRUCTURE_MATERIALS.ALUMINIUM&&NAVAL_SURFACE_LIGHT_METAL_CLASSES.has(designId)){
    const amount=NAVAL_ALUMINIUM_INPUT[designId]||8;s.systemInputs=mergeNavalInputs(s.systemInputs,{aluminium:amount});s.steelConstructionMultiplier=.91;s.topweightMultiplier=.86;
    s.speed*=1.026;s.pursuit*=1.036;s.antiAir=clamp((s.antiAir||0)*1.055);s.radarSearch=clamp((s.radarSearch||0)*1.035);s.durability*=.985;s.fireResistance=.88;s.maintenanceMultiplier*=1.06;
  }
  if(choices.seawaterSystems===NAVAL_SEAWATER_SYSTEMS.TITANIUM){
    const amount=NAVAL_TITANIUM_SYSTEM_INPUT[designId]||3;s.systemInputs=mergeNavalInputs(s.systemInputs,{titanium:amount});s.corrosionResistance=.95;s.maintenanceMultiplier*=.86;s.damageControl=clamp((s.damageControl||0)*1.045);s.durability*=1.018;s.speed*=1.006;s.propulsionQuality=clamp((s.propulsionQuality||0)*1.018);s.fabricationComplexity*=1.08;
  }
  if(sub&&choices.pressureHull===SUBMARINE_PRESSURE_HULLS.TITANIUM){
    const precision=clamp(region.industrialSupply?.capability?.precision_machining||0);s.systemInputs=mergeNavalInputs(s.systemInputs,{titanium:42});s.steelConstructionMultiplier=.55;s.topweightMultiplier=.82;s.testDepthMultiplier=1.55;
    s.speed*=1.055;s.durability*=1.12;s.signature=clamp((s.signature||.3)*.93,.12,1);s.fabricationComplexity*=1.35;s.damageControl=clamp((s.damageControl||0)*(.94+precision*.06));
  }
  const scale=(value,priority,intensity)=>value*(1+(priority-1)*intensity);
  s.speed=scale(s.speed,p.speed,.09);s.enduranceMultiplier=scale(s.enduranceMultiplier,p.endurance,.13);s.damageControl=clamp(scale(s.damageControl||0,p.reliability,.10));
  if(sub){s.testDepthMultiplier=scale(s.testDepthMultiplier||1,p.depth,.16);s.signature=clamp(s.signature*(1-(p.stealth-1)*.10),.10,1);s.torpedoEffect=clamp(scale(s.torpedoEffect||0,p.firepower,.10));s.combat=scale(s.combat,p.firepower,.07);}
  else{s.combat=scale(s.combat,p.firepower,.08);s.durability=scale(s.durability,p.protection,.10);s.armour=scale(s.armour,p.protection,.09);s.radarSearch=clamp(scale(s.radarSearch||0,p.sensors,.11));s.sonar=clamp(scale(s.sonar||0,p.sensors,.11));s.antiAir=clamp(scale(s.antiAir||0,p.sensors,.08));}
  return s;
}
function navalFrontier(region,designId,choices=null){const base=baseNavalFrontier(region,designId),selected=normaliseNavalChoices(region,designId,choices),stats=applyNavalMaterialsAndPriorities(region,designId,base.stats,selected);const materialGain=(selected.superstructure==='aluminium'?.018:0)+(selected.seawaterSystems==='titanium'?.018:0)+(selected.pressureHull==='titanium'?.025:0);return {quality:clamp(base.quality+materialGain),stats,designChoices:selected};}
export function previewNavalDesign(region,designId,choices={}){const f=navalFrontier(region,designId,choices);return {...f.stats,quality:f.quality,designChoices:f.designChoices};}
export function navalConstructionProfile(region,designId){const d=ensureCurrentNavalDesign(region,designId);return {steelMultiplier:d?.stats?.steelConstructionMultiplier??1,systemInputs:{...(d?.stats?.systemInputs||{})},designId:d?.id||null};}

export function currentNavalDesign(region,designId){'''
if marker not in text:
    raise SystemExit('naval frontier marker missing')
text = text.replace(marker, insert, 1)

old_create = "function createNavalDesign(region,designId,{authorisedBy='initial_standard',toolingReady=true}={}){\n  region.navalDesignCatalogue ||= {};const list=region.navalDesignCatalogue[designId] ||= [],f=navalFrontier(region,designId),sequence=(list.at(-1)?.sequence||0)+1;\n  const design={id:`${region.id}:${designId}:${sequence}`,designId,sequence,name:`${SHIP_DESIGNS[designId]?.label||designId} Mk ${romanMark(sequence)}`,quality:f.quality,stats:f.stats,authorisedBy,toolingReady};list.push(design);return design;\n}"
new_create = "function createNavalDesign(region,designId,{authorisedBy='initial_standard',toolingReady=true,choices=null}={}){\n  region.navalDesignCatalogue ||= {};const list=region.navalDesignCatalogue[designId] ||= [],selected=normaliseNavalChoices(region,designId,choices),f=navalFrontier(region,designId,selected),sequence=(list.at(-1)?.sequence||0)+1;\n  const design={id:`${region.id}:${designId}:${sequence}`,designId,sequence,name:`${SHIP_DESIGNS[designId]?.label||designId} Mk ${romanMark(sequence)}`,quality:f.quality,stats:f.stats,designChoices:structuredClone(selected),authorisedBy,toolingReady};list.push(design);return design;\n}"
if old_create not in text: raise SystemExit('createNavalDesign marker missing')
text = text.replace(old_create, new_create, 1)

old_quote = "export function quoteNavalMarkUpgrade(region,designId){\n  const spec=SHIP_DESIGNS[designId];if(!spec)return {available:false,reason:'unknown_ship_class'};\n  if(!operationalInfrastructure(region,'shipyard')&&!operationalInfrastructure(region,'naval_base'))return {available:false,reason:'no_operational_shipyard'};\n  const procurement=ensureNavalProcurement(region);procurement.designTooling ||= {};\n  if(procurement.designTooling[designId]?.pendingDesignId)return {available:false,reason:'tooling_already_in_progress'};\n  const nextSequence=((region.navalDesignCatalogue?.[designId]||[]).at(-1)?.sequence||0)+1,industrial=(spec.tier||0)>=5;\n  return {available:true,designId,nextSequence,machineComponents:industrial?5+nextSequence*3:0,steel:industrial?10+nextSequence*6:0,wood:industrial?0:35+nextSequence*18,treasury:10+nextSequence*7,downtimeWeeks:Math.min(30,6+nextSequence*2)};\n}"
new_quote = "export function quoteNavalMarkUpgrade(region,designId,choices=null){\n  const spec=SHIP_DESIGNS[designId];if(!spec)return {available:false,reason:'unknown_ship_class'};\n  if(!operationalInfrastructure(region,'shipyard')&&!operationalInfrastructure(region,'naval_base'))return {available:false,reason:'no_operational_shipyard'};\n  const procurement=ensureNavalProcurement(region);procurement.designTooling ||= {};\n  if(procurement.designTooling[designId]?.pendingDesignId)return {available:false,reason:'tooling_already_in_progress'};\n  const selected=normaliseNavalChoices(region,designId,choices),nextSequence=((region.navalDesignCatalogue?.[designId]||[]).at(-1)?.sequence||0)+1,industrial=(spec.tier||0)>=5;\n  const complexity=(selected.superstructure==='aluminium'?.12:0)+(selected.seawaterSystems==='titanium'?.18:0)+(selected.pressureHull==='titanium'?.55:0);\n  return {available:true,designId,nextSequence,designChoices:selected,machineComponents:(industrial?5+nextSequence*3:0)*(1+complexity),steel:industrial?10+nextSequence*6:0,wood:industrial?0:35+nextSequence*18,treasury:(10+nextSequence*7)*(1+complexity*.8),downtimeWeeks:Math.min(42,Math.ceil((6+nextSequence*2)*(1+complexity*.7)))};\n}"
if old_quote not in text: raise SystemExit('quote marker missing')
text = text.replace(old_quote, new_quote, 1)
text = text.replace("export function authoriseNavalMark(region,designId,{authorisedBy='player'}={}){\n  const quote=quoteNavalMarkUpgrade(region,designId);", "export function authoriseNavalMark(region,designId,{authorisedBy='player',choices=null}={}){\n  const quote=quoteNavalMarkUpgrade(region,designId,choices);", 1)
text = text.replace("const design=createNavalDesign(region,designId,{authorisedBy,toolingReady:false}),procurement=ensureNavalProcurement(region);", "const design=createNavalDesign(region,designId,{authorisedBy,toolingReady:false,choices:quote.designChoices}),procurement=ensureNavalProcurement(region);", 1)

# Refit an existing ship to a new material-heavy mark only if the specialised metals are physically available.
old_pay = "function payRefitCost(region, designId) {\n  const cost = SHIP_DESIGNS[designId]?.refitCost || {};"
new_pay = "function payRefitCost(region, designId, targetDesign = null) {\n  const baseCost = SHIP_DESIGNS[designId]?.refitCost || {};\n  const speciality=targetDesign?.stats?.systemInputs||{};const cost={...baseCost};\n  for(const key of ['aluminium','titanium'])if(speciality[key]>0)cost[key]=(cost[key]||0)+speciality[key]*.35;"
if old_pay not in text: raise SystemExit('payRefitCost marker missing')
text = text.replace(old_pay, new_pay, 1)
text = text.replace("if(markCandidate&&payRefitCost(region,markCandidate.ship.designId)){", "if(markCandidate&&payRefitCost(region,markCandidate.ship.designId,markCandidate.current)){", 1)
text = text.replace("if (!choice || !payRefitCost(region, choice.target)) continue;", "if (!choice || !payRefitCost(region, choice.target,currentNavalDesign(region,choice.target))) continue;", 1)
fleets.write_text(text)

# --- laborCore.js: construct the late classes and consume selected design BOM -
labor = ROOT / 'js/economy/laborCore.js'
text = labor.read_text()
text = text.replace("import { ensureNavalProcurement, refreshNavalProcurementTargets, SHIP_DESIGNS } from '../military/fleets.js?v=20260916-procurement1';", "import { ensureNavalProcurement, refreshNavalProcurementTargets, SHIP_DESIGNS, navalConstructionProfile } from '../military/fleets.js?v=20260919-naval-light-metals1';", 1)
text = text.replace("  steel_warship: { wood: 180, steel: 220, coal: 55, machine: 34 },\n};", "  steel_warship: { wood: 180, steel: 220, coal: 55, machine: 34 },\n  fleet_tug: { steel: 90, coal: 24, machine: 26 },\n  destroyer: { steel: 150, coal: 42, machine: 46, gunpowder: 4 },\n  submarine: { steel: 120, machine: 62, petrol: 30 },\n  dreadnought: { steel: 700, coal: 120, machine: 105, gunpowder: 20 },\n};", 1)
text = text.replace("  paddle_steam_warship: 0.0040, steam_frigate: 0.0035, ironclad: 0.0025, steel_warship: 0.0022,\n};", "  paddle_steam_warship: 0.0040, steam_frigate: 0.0035, ironclad: 0.0025, steel_warship: 0.0022,\n  fleet_tug: 0.0028, destroyer: 0.0018, submarine: 0.00155, dreadnought: 0.0007,\n};", 1)
old_build = "export function buildWarshipClass(region, designId, gap, makersAvailable) {\n  const cost = WARSHIP_BUILD_COST[designId];\n  const rate = WARSHIP_BUILD_RATE[designId] || 0;"
new_build = "export function buildWarshipClass(region, designId, gap, makersAvailable) {\n  const baseCost = WARSHIP_BUILD_COST[designId];\n  const profile = baseCost ? navalConstructionProfile(region, designId) : null;\n  const cost = baseCost ? {...baseCost} : null;\n  if(cost?.steel!=null)cost.steel*=profile?.steelMultiplier??1;\n  for(const [key,amount] of Object.entries(profile?.systemInputs||{}))cost[key]=(cost[key]||0)+Math.max(0,Number(amount)||0);\n  const rate = WARSHIP_BUILD_RATE[designId] || 0;"
if old_build not in text: raise SystemExit('buildWarshipClass marker missing')
text = text.replace(old_build, new_build, 1)
labor.write_text(text)

# --- main.js: expose naval design API to the fleet UI ------------------------
main = ROOT / 'js/main.js'
text = main.read_text()
old_import = "import { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, orderFleetHome, orderFleetToSea, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';"
new_import = "import { authoriseNavalMark, currentNavalDesign, deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, navalDesignClassOptions, navalDesignMaterialOptions, orderFleetHome, orderFleetToSea, previewNavalDesign, quoteNavalMarkUpgrade, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260919-naval-light-metals1';"
if old_import not in text: raise SystemExit('main fleet import marker missing')
text = text.replace(old_import,new_import,1)
old_api = "fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },"
new_api = "fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger, navalDesignClassOptions, navalDesignMaterialOptions, previewNavalDesign, quoteNavalMarkUpgrade, authoriseNavalMark, currentNavalDesign },"
if old_api not in text: raise SystemExit('fleetApi marker missing')
text = text.replace(old_api,new_api,1)
main.write_text(text)

# --- index.html: load the compact naval design bureau UI ---------------------
index = ROOT / 'index.html'
text = index.read_text()
old = '  <script type="module" src="js/ui/fleetUi.js?v=20260908-fleets1"></script>'
new = old + '\n  <script type="module" src="js/ui/navalDesignUi.js?v=20260919-naval-light-metals1"></script>'
if old not in text: raise SystemExit('fleetUi script marker missing')
index.write_text(text.replace(old,new,1))

print('Applied naval light-metal design integration.')
