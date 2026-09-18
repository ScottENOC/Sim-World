from pathlib import Path

def apply(path,repls):
 p=Path(path);text=p.read_text()
 for old,new in repls:
  if new in text: continue
  if old not in text: raise SystemExit(f'missing pattern {path}: {old[:100]!r}')
  text=text.replace(old,new,1)
 p.write_text(text)

apply('js/technology/industrialProduction.js',[
("import { PETROLEUM_REFINING_TECH_ID } from './petroleum.js?v=20260917-oil1';",
 "import { PETROLEUM_REFINING_TECH_ID } from './petroleum.js?v=20260917-oil1';\nimport { industrialFactoryCapacity, tickIndustrialPlants } from '../economy/industrialPlant.js?v=20260919-components1';"),
("  const tech=region.unlockedTechIds||new Set();\n  const industry=industrialReadiness(region);",
 "  const tech=region.unlockedTechIds||new Set();\n  const factoryCapacity=industrialFactoryCapacity(region);\n  if(factoryCapacity<=0)return {automobile:0,assembly:0,advanced:0};\n  const industry=industrialReadiness(region);"),
("    if(tech.has(AUTOMOBILE_TECH_ID))s.motorisationReadiness=clamp(s.motorisationReadiness+years*(.018+industry*.06)*(1-s.motorisationReadiness));\n  }",
 "    if(tech.has(AUTOMOBILE_TECH_ID))s.motorisationReadiness=clamp(s.motorisationReadiness+years*(.018+industry*.06)*(1-s.motorisationReadiness));\n    tickIndustrialPlants(region,elapsedDays);\n  }")
])

apply('js/economy/construction.js',[
("  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,\n    minPopulation: 8000,\n    description: 'Distillation towers, tanks, furnaces and pipework processing crude oil into specialised fuels. It can operate on imported crude and does not require local petroleum deposits.',\n    workRequired: 18000, defaultWorkers: 220, minWorkers: 70, maxWorkers: 900,\n    materials: { stone: 900, iron: 180, steel: 90 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,\n  },",
 "  petroleum_refinery: {\n    id: 'petroleum_refinery', name: 'Petroleum refinery', requiredTechId: 'petroleum_refining', unique: false,\n    minPopulation: 8000,\n    description: 'Distillation towers, tanks, furnaces and pipework processing crude oil into specialised fuels. It can operate on imported crude and does not require local petroleum deposits.',\n    workRequired: 18000, defaultWorkers: 220, minWorkers: 70, maxWorkers: 900,\n    materials: { stone: 900, iron: 180, steel: 90 }, wagePerWorkerWeek: 0.0035, maintenanceRate: 0.065,\n  },\n  factory: {\n    id: 'factory', name: 'Industrial factory', requiredTechId: 'steelmaking', unique: false,\n    minPopulation: 8000,\n    description: 'A powered industrial plant with machine halls, tooling and production-floor capacity. Vehicles and other complex mass-produced goods require real factory capacity rather than appearing directly from raw materials.',\n    workRequired: 16500, defaultWorkers: 210, minWorkers: 65, maxWorkers: 900,\n    materials: { stone: 700, iron: 160, steel: 120, wood: 350 }, wagePerWorkerWeek: 0.0038, maintenanceRate: 0.06,\n  },")
])

apply('js/economy/industrialSupply.js',[
("import { AUTOMOBILE_TECH_ID, industrialProductionMultipliers } from '../technology/industrialProduction.js?v=20260919-industrial-production1';",
 "import { AUTOMOBILE_TECH_ID, industrialProductionMultipliers } from '../technology/industrialProduction.js?v=20260919-industrial-production1';\nimport { industrialFactoryCapacity } from './industrialPlant.js?v=20260919-components1';"),
("s.outputCapacity.motor_vehicle = region.unlockedTechIds?.has(AUTOMOBILE_TECH_ID) ? Math.max(0, base * s.capability.automotive_engineering * 12 * electric * communications * labour * production.standardisedGoods) : 0; return s;",
 "s.outputCapacity.motor_vehicle = region.unlockedTechIds?.has(AUTOMOBILE_TECH_ID) ? Math.min(industrialFactoryCapacity(region), Math.max(0, base * s.capability.automotive_engineering * 12 * electric * communications * labour * production.standardisedGoods)) : 0; return s;")
])

apply('js/military/equipmentGenerations.js',[
("  TANK:'tank',\n  FIGHTER:'fighter',",
 "  TANK:'tank',\n  SELF_PROPELLED_GUN:'self_propelled_gun',\n  FIGHTER:'fighter',"),
("  field_artillery:'Field Gun',heavy_artillery:'Heavy Howitzer',tank:'Tank',fighter:'Fighter',bomber:'Bomber',",
 "  field_artillery:'Field Gun',heavy_artillery:'Heavy Howitzer',tank:'Tank',self_propelled_gun:'Self-Propelled Gun',fighter:'Fighter',bomber:'Bomber',"),
("export function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){",
 "export function armouredVehicleDesignFrontier(region,family=EQUIPMENT_FAMILIES.TANK){\n  const c=region.industrialPlants?.componentCapability||{};\n  const exp=clamp(region.industrialPlants?.productExperience?.[family]||0);\n  const q=(k,fallback=.05)=>clamp(c[k]??fallback);\n  const engine=q('engine'),trans=q('transmission'),tracks=q('tracked_running_gear'),gun=q('gun_system'),armour=q('armour_plate'),optics=q('optics'),electronics=q('electronics'),hull=q('hull_fabrication');\n  const spg=family===EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN;\n  return {family, mobility:clamp(engine*.34+trans*.26+tracks*.30+hull*.10), firepower:clamp(gun*.62+optics*.20+electronics*.08+hull*.10), protection:clamp(armour*(spg?.62:.82)+hull*(spg?.18:.12)+tracks*.06), reliability:clamp(engine*.18+trans*.18+tracks*.16+gun*.10+armour*.08+hull*.12+exp*.18), fireControlPotential:clamp(optics*.50+electronics*.28+gun*.12+exp*.10), integration:exp};\n}\n\nexport function ensureCurrentArmouredVehicleDesign(region,family=EQUIPMENT_FAMILIES.TANK,tick=0){\n  const frontier=armouredVehicleDesignFrontier(region,family),current=currentEquipmentDesign(region,family);\n  const score=(s)=>(s.mobility||0)*.22+(s.firepower||0)*.28+(s.protection||0)*.24+(s.reliability||0)*.14+(s.fireControlPotential||0)*.12;\n  if(!current)return createEquipmentDesign(region,family,frontier,{reason:'first_standard_design',tick});\n  const improvement=(score(frontier)-score(current.stats))/Math.max(.15,score(current.stats));\n  if(improvement>=.08)return createEquipmentDesign(region,family,frontier,{reason:'shared_component_improvement',tick});\n  return current;\n}\n\nexport function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){")
])
print('component industrial integration applied')
