from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path,old,new):
    p=ROOT/path
    text=p.read_text()
    if old not in text:
        raise SystemExit(f'Expected marker not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old,new,1))

# --- aviation breakthroughs and carrier-based aircraft handoff -------------
replace_once('js/military/aviation.js',
"export const JET_PROPULSION_TECH_ID='jet_propulsion';",
"export const JET_PROPULSION_TECH_ID='jet_propulsion';\nexport const NAVAL_AVIATION_TECH_ID='naval_aviation';\nexport const AIRCRAFT_CARRIER_TECH_ID='aircraft_carrier';")
replace_once('js/military/aviation.js',
"    if(has(region,MILITARY_AVIATION_TECH_ID)&&!has(region,RADAR_TECH_ID)&&electricity>.34&&radio>.24&&optics>.20){",
"    if(has(region,MILITARY_AVIATION_TECH_ID)&&has(region,'steel_hull_shipbuilding')&&!has(region,NAVAL_AVIATION_TECH_ID)&&operationalInfrastructure(region,'shipyard')&&a.flightExperience>45){\n      const navalPractice=clamp(Math.min(1,(region.navalAviationExperience||0)/180)*.30+practice*.45+marine*.25);\n      const annual=clamp(.003+navalPractice*.025+connectedSources(region,byId,NAVAL_AVIATION_TECH_ID)*.025,0,.16);\n      if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(NAVAL_AVIATION_TECH_ID);events.push({type:'aviation_breakthrough',techId:NAVAL_AVIATION_TECH_ID,regionId:region.id,title:'Naval aviation'});}\n    }\n    if(has(region,NAVAL_AVIATION_TECH_ID)&&has(region,'dreadnought_design')&&!has(region,AIRCRAFT_CARRIER_TECH_ID)&&industry>.52&&a.flightExperience>90){\n      const annual=clamp(.002+industry*.016+practice*.012+Math.min(1,(region.navalAviationExperience||0)/250)*.025+connectedSources(region,byId,AIRCRAFT_CARRIER_TECH_ID)*.025,0,.13);\n      if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(AIRCRAFT_CARRIER_TECH_ID);events.push({type:'aviation_breakthrough',techId:AIRCRAFT_CARRIER_TECH_ID,regionId:region.id,title:'Purpose-built aircraft carrier'});}\n    }\n    if(has(region,MILITARY_AVIATION_TECH_ID)&&!has(region,RADAR_TECH_ID)&&electricity>.34&&radio>.24&&optics>.20){")
replace_once('js/military/aviation.js',
"      if(a.status==='destroyed'||a.mission===AIR_MISSIONS.IDLE||a.mission===AIR_MISSIONS.COURIER)continue;",
"      if(a.baseType==='carrier')continue;\n      if(a.status==='destroyed'||a.mission===AIR_MISSIONS.IDLE||a.mission===AIR_MISSIONS.COURIER)continue;")

# --- large dry dock ---------------------------------------------------------
replace_once('js/economy/construction.js',
"  airfield: {\n    id: 'airfield', name: 'Airfield and aircraft workshops'",
"  large_drydock: {\n    id: 'large_drydock', name: 'Large naval dry dock', requiredTechId: 'steel_hull_shipbuilding', coastal: true, unique: false,\n    requiresInfrastructure: 'shipyard', minPopulation: 25000,\n    description: 'A very large graving dock with heavy cranes, pumps, workshops and deep-water access for building and repairing capital ships and aircraft carriers.',\n    workRequired: 90000, defaultWorkers: 760, minWorkers: 220, maxWorkers: 3200,\n    materials: { stone: 6500, steel: 1900, wood: 900 }, wagePerWorkerWeek: 0.0055, maintenanceRate: 0.095,\n  },\n  airfield: {\n    id: 'airfield', name: 'Airfield and aircraft workshops'")

# --- physical construction costs/facility gate -----------------------------
replace_once('js/economy/laborCore.js',
"  dreadnought: { steel: 700, coal: 120, machine: 105, gunpowder: 20 },",
"  dreadnought: { steel: 700, coal: 120, machine: 105, gunpowder: 20 },\n  fleet_oiler: { steel: 260, coal: 45, machine: 58 },\n  aircraft_carrier: { steel: 980, coal: 150, machine: 165, aluminium: 55 },")
replace_once('js/economy/laborCore.js',
"  fleet_tug: 0.0028, destroyer: 0.0018, submarine: 0.00155, dreadnought: 0.0007,",
"  fleet_tug: 0.0028, destroyer: 0.0018, submarine: 0.00155, dreadnought: 0.0007,\n  fleet_oiler: 0.00135, aircraft_carrier: 0.00042,")
replace_once('js/economy/laborCore.js',
"export function buildWarshipClass(region, designId, gap, makersAvailable) {\n  const baseCost = WARSHIP_BUILD_COST[designId];",
"export function buildWarshipClass(region, designId, gap, makersAvailable) {\n  if(designId==='aircraft_carrier'&&!operationalInfrastructure(region,'large_drydock'))return {built:0,makers:0,designId,reason:'requires_large_drydock'};\n  const baseCost = WARSHIP_BUILD_COST[designId];")

# --- carrier and oiler hulls + evolving carrier systems --------------------
replace_once('js/military/fleets.js',
"import { assignShipCrew, tickNavalPersonnel, recordShipCrewPractice } from './qualifiedPersonnel.js?v=20260919-personnel1';",
"import { assignShipCrew, tickNavalPersonnel, recordShipCrewPractice } from './qualifiedPersonnel.js?v=20260919-personnel1';\nimport { AIRCRAFT_CARRIER_TECH_ID, ensureFleetAviationFuel, serviceFleetAviationFuel, tickCarrierAviation } from './carrierAviation.js?v=20260919-carriers1';")
replace_once('js/military/fleets.js',
"  dreadnought: {\n    id: 'dreadnought', label: 'dreadnought', tier: 10, advanced: true, propulsion: 'steam', crew: 80, speed: 1.68,\n    fallbackSpeed: 0.30, combat: 7.20, durability: 5.20, pursuit: 1.18, captureResistance: 1.55, gunCapacity: 30, armour: 2.45,\n    coalCapacity: 70, coalPerWeek: 4.8, refitCost: { steel: 125, coal: 30, machine: 28, gunpowder: 4 },\n  },",
"  dreadnought: {\n    id: 'dreadnought', label: 'dreadnought', tier: 10, advanced: true, propulsion: 'steam', crew: 80, speed: 1.68,\n    fallbackSpeed: 0.30, combat: 7.20, durability: 5.20, pursuit: 1.18, captureResistance: 1.55, gunCapacity: 30, armour: 2.45,\n    coalCapacity: 70, coalPerWeek: 4.8, refitCost: { steel: 125, coal: 30, machine: 28, gunpowder: 4 },\n  },\n  fleet_oiler: {\n    id:'fleet_oiler',label:'fleet oiler',tier:10,advanced:true,support:true,propulsion:'steam',crew:34,speed:1.46,\n    fallbackSpeed:.32,combat:.24,durability:2.35,pursuit:.72,captureResistance:.96,gunCapacity:2,armour:.16,\n    coalCapacity:44,coalPerWeek:2.2,aviationFuelCapacity:220,fuelTransferRate:48,refitCost:{steel:58,coal:16,machine:16},\n  },\n  aircraft_carrier: {\n    id:'aircraft_carrier',label:'aircraft carrier',tier:11,advanced:true,propulsion:'steam',crew:118,speed:1.72,\n    fallbackSpeed:.28,combat:2.10,durability:4.15,pursuit:1.12,captureResistance:1.34,gunCapacity:12,armour:1.05,\n    coalCapacity:105,coalPerWeek:6.2,aviationFuelCapacity:95,airCapacity:34,sortieRate:.62,flightDeckRating:.38,carrierMaintenance:.32,\n    refitCost:{steel:180,coal:40,machine:48,aluminium:12},\n  },")
replace_once('js/military/fleets.js',
"const NAVAL_SURFACE_LIGHT_METAL_CLASSES=new Set(['steel_warship','destroyer','dreadnought','fleet_tug']);",
"const NAVAL_SURFACE_LIGHT_METAL_CLASSES=new Set(['steel_warship','destroyer','dreadnought','fleet_tug','fleet_oiler','aircraft_carrier']);")
replace_once('js/military/fleets.js',
"const NAVAL_ALUMINIUM_INPUT=Object.freeze({steel_warship:18,destroyer:12,dreadnought:42,fleet_tug:8});",
"const NAVAL_ALUMINIUM_INPUT=Object.freeze({steel_warship:18,destroyer:12,dreadnought:42,fleet_tug:8,fleet_oiler:12,aircraft_carrier:58});")
replace_once('js/military/fleets.js',
"const NAVAL_TITANIUM_SYSTEM_INPUT=Object.freeze({steel_warship:4,destroyer:3,dreadnought:10,fleet_tug:2,submarine:5});",
"const NAVAL_TITANIUM_SYSTEM_INPUT=Object.freeze({steel_warship:4,destroyer:3,dreadnought:10,fleet_tug:2,submarine:5,fleet_oiler:4,aircraft_carrier:12});")
replace_once('js/military/fleets.js',
"  if(designId==='fleet_tug')return hasNavalTech(region,MARINE_STEAM_TECH_ID);\n  return false;",
"  if(designId==='fleet_tug')return hasNavalTech(region,MARINE_STEAM_TECH_ID);\n  if(designId==='fleet_oiler')return hasNavalTech(region,AIRCRAFT_CARRIER_TECH_ID);\n  if(designId==='aircraft_carrier')return hasNavalTech(region,AIRCRAFT_CARRIER_TECH_ID);\n  return false;")
replace_once('js/military/fleets.js',
"export function navalDesignClassOptions(region){return ['steel_warship','destroyer','submarine','dreadnought','fleet_tug'].filter(id=>navalClassAvailable(region,id)).map(id=>({id,label:SHIP_DESIGNS[id].label}));}",
"export function navalDesignClassOptions(region){return ['steel_warship','destroyer','submarine','dreadnought','fleet_tug','fleet_oiler','aircraft_carrier'].filter(id=>navalClassAvailable(region,id)).map(id=>({id,label:SHIP_DESIGNS[id].label}));}")
replace_once('js/military/fleets.js',
"function navalFrontier(region,designId,choices=null){const base=baseNavalFrontier(region,designId),selected=normaliseNavalChoices(region,designId,choices),stats=applyNavalMaterialsAndPriorities(region,designId,base.stats,selected);const materialGain=(selected.superstructure==='aluminium'?.018:0)+(selected.seawaterSystems==='titanium'?.018:0)+(selected.pressureHull==='titanium'?.025:0);return {quality:clamp(base.quality+materialGain),stats,designChoices:selected};}",
"function applyCarrierSystems(region,designId,stats){\n  if(designId!=='aircraft_carrier')return stats;const c=region?.industrialPlants?.componentCapability||{},precision=clamp(region?.industrialSupply?.capability?.precision_machining||0),exp=clamp((region?.navalAviationExperience||0)/300);\n  const hull=clamp(c.hull_fabrication||0),engine=clamp(c.engine||0),trans=clamp(c.transmission||0),electrical=clamp(c.electronics||0),damage=clamp(c.damage_control||0),radar=clamp(c.radar_set||0);\n  const flightDeckRating=clamp(.22+hull*.18+precision*.28+damage*.12+exp*.20),arrestingGear=clamp(.14+trans*.22+precision*.36+exp*.28),aircraftElevators=clamp(.12+engine*.10+trans*.20+precision*.27+electrical*.15+exp*.16),deckHandling=clamp(.18+exp*.34+electrical*.14+damage*.13+precision*.21);\n  const jet=hasNavalTech(region,'jet_propulsion'),jetCompatibility=clamp((arrestingGear*.34+flightDeckRating*.28+aircraftElevators*.18+deckHandling*.20)*(jet?1:.72));\n  return {...stats,flightDeckRating,arrestingGear,aircraftElevators,deckHandling,jetDeckCompatibility:jetCompatibility,airCapacity:Math.max(18,Math.round((stats.airCapacity||34)*(.78+flightDeckRating*.22+aircraftElevators*.12))),sortieRate:(stats.sortieRate||.62)*(.66+deckHandling*.34)*(jet?(.78+jetCompatibility*.22):1),aviationFuelCapacity:(stats.aviationFuelCapacity||95)*(.90+damage*.10),carrierMaintenance:clamp(.18+precision*.28+damage*.28+electrical*.16+exp*.10),radarSearch:clamp((stats.radarSearch||0)+radar*.08),fabricationComplexity:(stats.fabricationComplexity||1)*(1.12+flightDeckRating*.10)};\n}\nfunction navalFrontier(region,designId,choices=null){const base=baseNavalFrontier(region,designId),selected=normaliseNavalChoices(region,designId,choices);let stats=applyNavalMaterialsAndPriorities(region,designId,base.stats,selected);stats=applyCarrierSystems(region,designId,stats);const materialGain=(selected.superstructure==='aluminium'?.018:0)+(selected.seawaterSystems==='titanium'?.018:0)+(selected.pressureHull==='titanium'?.025:0);const carrierGain=designId==='aircraft_carrier'?((stats.flightDeckRating||0)+(stats.deckHandling||0))*.018:0;return {quality:clamp(base.quality+materialGain+carrierGain),stats,designChoices:selected};}")
replace_once('js/military/fleets.js',
"  if (region?.unlockedTechIds?.has(MARINE_STEAM_TECH_ID) && count >= 4) targets.fleet_tug = Math.max(targets.fleet_tug || 0, Math.ceil(count / 8));\n  return targets;",
"  if (region?.unlockedTechIds?.has(MARINE_STEAM_TECH_ID) && count >= 4) targets.fleet_tug = Math.max(targets.fleet_tug || 0, Math.ceil(count / 8));\n  if(region?.unlockedTechIds?.has(AIRCRAFT_CARRIER_TECH_ID)&&count>=8){const carriers=Math.max(1,Math.floor(count/12));targets.aircraft_carrier=Math.max(targets.aircraft_carrier||0,carriers);targets.fleet_oiler=Math.max(targets.fleet_oiler||0,carriers);}\n  return targets;")
replace_once('js/military/fleets.js',
"  const provisioning = serviceProvisioningInPort(fleet, port, owner, weeks, fleetCrewCount(fleet));\n  return { access, supplied, repaired: fleet.condition - before, provisioning, coalLoaded };",
"  const aviationFuel=serviceFleetAviationFuel(fleet,access==='ally'?port:owner);\n  const provisioning = serviceProvisioningInPort(fleet, port, owner, weeks, fleetCrewCount(fleet));\n  return { access, supplied, repaired: fleet.condition - before, provisioning, coalLoaded, aviationFuelLoaded:aviationFuel.loaded };" )
replace_once('js/military/fleets.js',
"  for (const ship of fleet.ships) repairShipDamage(ship, repairRate * weeks, { dockyard: access !== 'ally' && (operationalInfrastructure(port, 'shipyard') || operationalInfrastructure(port, 'naval_base')) });",
"  for (const ship of fleet.ships) {const carrier=ship.designId==='aircraft_carrier',carrierDock=operationalInfrastructure(port,'large_drydock');const amount=carrier&&!carrierDock?Math.min(repairRate*weeks,.0015*weeks):repairRate*weeks;repairShipDamage(ship,amount,{dockyard:access!=='ally'&&(carrier?carrierDock:(operationalInfrastructure(port,'shipyard')||operationalInfrastructure(port,'naval_base')))});}")
replace_once('js/military/fleets.js',
"    const markCandidate=fleet.ships.map((ship,index)=>({ship,index,current:currentNavalDesign(region,ship.designId)})).find(x=>(x.current?.sequence||1)>(x.ship.modelSequence||1));",
"    const markCandidate=fleet.ships.map((ship,index)=>({ship,index,current:currentNavalDesign(region,ship.designId)})).find(x=>(x.current?.sequence||1)>(x.ship.modelSequence||1)&&(x.ship.designId!=='aircraft_carrier'||operationalInfrastructure(region,'large_drydock')));")
replace_once('js/military/fleets.js',
"  events.push(...portAssaults(fleets, regionsById, currentTick, rng));",
"  events.push(...tickCarrierAviation(regions,fleets,seaRegions,currentTick,elapsedDays,rng));\n  events.push(...portAssaults(fleets, regionsById, currentTick, rng));")
replace_once('js/military/fleets.js',
"    ensureFleetState(fleet);\n    if (!fleet.ships.length) continue;",
"    ensureFleetState(fleet);ensureFleetAviationFuel(fleet);\n    if (!fleet.ships.length) continue;")

# --- main API ---------------------------------------------------------------
replace_once('js/main.js',
"import { tickAviation, syncNextAircraftId, buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary } from './military/aviation.js?v=20260918-aviation1';",
"import { tickAviation, syncNextAircraftId, buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary } from './military/aviation.js?v=20260919-carriers1';\nimport { embarkAircraftOnCarrier, disembarkAircraftFromCarrier, assignCarrierAircraftMission, carrierAirWingSummary, fleetAviationFuelCapacity } from './military/carrierAviation.js?v=20260919-carriers1';")
replace_once('js/main.js',
"    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },\n    aviationApi: { buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary },",
"    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger, authoriseNavalMark, currentNavalDesign, navalDesignClassOptions, navalDesignMaterialOptions, previewNavalDesign, quoteNavalMarkUpgrade },\n    aviationApi: { buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary, embarkAircraftOnCarrier, disembarkAircraftFromCarrier, assignCarrierAircraftMission, carrierAirWingSummary, fleetAviationFuelCapacity },")

# --- carrier preview UI and fleet controls ---------------------------------
replace_once('js/ui/navalDesignUi.js',
"  const sub=classId==='submarine';\n  out.innerHTML=`<strong>Preview</strong><br>${sub?`Speed ${num(p.speed)} · test-depth ×${num(p.testDepthMultiplier)} · signature ${num(p.signature)} · torpedo ${num(p.torpedoEffect)}`:`Speed ${num(p.speed)} · combat ${num(p.combat)} · durability ${num(p.durability)} · armour ${num(p.armour)} · radar ${num(p.radarSearch)}`}<br>Endurance ×${num(p.enduranceMultiplier)} · corrosion ${Math.round((p.corrosionResistance||0)*100)}% · fire resistance ${Math.round((p.fireResistance||1)*100)}%<br><small>Construction: ${esc(materials)}${p.steelConstructionMultiplier!==1?` · steel hull/base requirement ×${num(p.steelConstructionMultiplier)}`:''}. Design/tooling: ${quote.available?`${quote.machineComponents.toFixed(1)} machine components · ${quote.treasury.toFixed(1)} treasury · ${quote.downtimeWeeks} weeks`:`${esc(quote.reason||'unavailable')}`}.</small>`;",
"  const sub=classId==='submarine',carrier=classId==='aircraft_carrier';\n  const headline=sub?`Speed ${num(p.speed)} · test-depth ×${num(p.testDepthMultiplier)} · signature ${num(p.signature)} · torpedo ${num(p.torpedoEffect)}`:carrier?`Speed ${num(p.speed)} · air group ${Math.round(p.airCapacity||0)} · sortie rate ${num(p.sortieRate)} · deck ${Math.round((p.flightDeckRating||0)*100)}% · jet compatibility ${Math.round((p.jetDeckCompatibility||0)*100)}%`:`Speed ${num(p.speed)} · combat ${num(p.combat)} · durability ${num(p.durability)} · armour ${num(p.armour)} · radar ${num(p.radarSearch)}`;\n  out.innerHTML=`<strong>Preview</strong><br>${headline}<br>Endurance ×${num(p.enduranceMultiplier)} · corrosion ${Math.round((p.corrosionResistance||0)*100)}% · fire resistance ${Math.round((p.fireResistance||1)*100)}%${carrier?` · aviation fuel ${num(p.aviationFuelCapacity)}`:''}<br><small>Construction: ${esc(materials)}${p.steelConstructionMultiplier!==1?` · steel hull/base requirement ×${num(p.steelConstructionMultiplier)}`:''}. Design/tooling: ${quote.available?`${quote.machineComponents.toFixed(1)} machine components · ${quote.treasury.toFixed(1)} treasury · ${quote.downtimeWeeks} weeks`:`${esc(quote.reason||'unavailable')}`}.</small>`;")
replace_once('index.html',
"  <script type=\"module\" src=\"js/ui/fleetUi.js?v=20260908-fleets1\"></script>",
"  <script type=\"module\" src=\"js/ui/fleetUi.js?v=20260919-carriers1\"></script>\n  <script type=\"module\" src=\"js/ui/carrierAviationUi.js?v=20260919-carriers1\"></script>")

print('Aircraft carrier integration applied.')
