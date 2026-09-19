from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def rep(path,old,new):
 p=ROOT/path;t=p.read_text()
 if old not in t: raise SystemExit(f'marker missing in {path}: {old[:100]!r}')
 p.write_text(t.replace(old,new,1))

rep('js/military/modernLandWarfare.js',
"export const HEAVY_HOWITZER_TECH_ID='heavy_howitzers';",
"export const HEAVY_HOWITZER_TECH_ID='heavy_howitzers';\nexport const EARLY_ROCKETRY_TECH_ID='early_rocketry';\nexport const ROCKET_ARTILLERY_TECH_ID='rocket_artillery';\nexport const IMPROVED_ROCKET_PROPELLANT_TECH_ID='improved_rocket_propellant';\nexport const ROCKET_STABILISATION_TECH_ID='rocket_stabilisation';\nexport const ROCKET_LAUNCHER_SYSTEMS_TECH_ID='rocket_launcher_systems';")
rep('js/military/modernLandWarfare.js',
" {id:QUICK_FIRE_ARTILLERY_TECH_ID,prereq:[BREECH_ARTILLERY_TECH_ID,SMOKELESS_POWDER_TECH_ID],base:0.000008,label:'Quick-firing artillery'},",
" {id:QUICK_FIRE_ARTILLERY_TECH_ID,prereq:[BREECH_ARTILLERY_TECH_ID,SMOKELESS_POWDER_TECH_ID],base:0.000008,label:'Quick-firing artillery'},\n {id:EARLY_ROCKETRY_TECH_ID,prereq:['gunpowder'],base:0.000012,label:'Early military rocketry'},\n {id:ROCKET_ARTILLERY_TECH_ID,prereq:[EARLY_ROCKETRY_TECH_ID,'steelmaking'],base:0.000010,label:'Rocket artillery'},\n {id:IMPROVED_ROCKET_PROPELLANT_TECH_ID,prereq:[ROCKET_ARTILLERY_TECH_ID,SMOKELESS_POWDER_TECH_ID],base:0.000008,label:'Consistent rocket propellants'},\n {id:ROCKET_STABILISATION_TECH_ID,prereq:[ROCKET_ARTILLERY_TECH_ID,'precision_machining'],base:0.000007,label:'Stabilised artillery rockets'},\n {id:ROCKET_LAUNCHER_SYSTEMS_TECH_ID,prereq:[ROCKET_ARTILLERY_TECH_ID],base:0.000008,label:'Multiple rocket launcher systems'},")

rep('js/military/equipmentGenerations.js',
"  HEAVY_ARTILLERY:'heavy_artillery',",
"  HEAVY_ARTILLERY:'heavy_artillery',\n  ROCKET_ARTILLERY:'rocket_artillery',")
rep('js/military/equipmentGenerations.js',
"  field_artillery:'Field Gun',heavy_artillery:'Heavy Howitzer',tank:'Tank',self_propelled_gun:'Self-Propelled Gun',fighter:'Fighter',bomber:'Bomber',",
"  field_artillery:'Field Gun',heavy_artillery:'Heavy Howitzer',rocket_artillery:'Rocket Artillery',tank:'Tank',self_propelled_gun:'Self-Propelled Gun',fighter:'Fighter',bomber:'Bomber',")
rep('js/military/equipmentGenerations.js',
"import { MILITARY_PLATFORM, platformElectronicsFrontier } from './militaryElectronics.js?v=20260919-military-computing1';",
"import { MILITARY_PLATFORM, platformElectronicsFrontier } from './militaryElectronics.js?v=20260919-military-computing1';\nimport { rocketArtilleryFrontier } from './earlyRocketry.js?v=20260919-rockets1';")
rep('js/military/equipmentGenerations.js',
"  if(family===EQUIPMENT_FAMILIES.HEAVY_ARTILLERY)return artilleryDesignFrontier(region,kind||'heavy_howitzer');",
"  if(family===EQUIPMENT_FAMILIES.HEAVY_ARTILLERY)return artilleryDesignFrontier(region,kind||'heavy_howitzer');\n  if(family===EQUIPMENT_FAMILIES.ROCKET_ARTILLERY)return rocketArtilleryFrontier(region);")
rep('js/military/equipmentGenerations.js',
"export function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){const frontier=artilleryDesignFrontier(region,kind),family=frontier.family;return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{kind,tick,reason:'first_standard_design',authorisedBy:'initial_standard'});}",
"export function ensureCurrentArtilleryDesign(region,kind='field_cannon',tick=0){const frontier=artilleryDesignFrontier(region,kind),family=frontier.family;return currentEquipmentDesign(region,family)||authoriseEquipmentMark(region,family,{kind,tick,reason:'first_standard_design',authorisedBy:'initial_standard'});}\nexport function ensureCurrentRocketArtilleryDesign(region,tick=0){if(!rocketArtilleryFrontier(region))return null;return currentEquipmentDesign(region,EQUIPMENT_FAMILIES.ROCKET_ARTILLERY)||authoriseEquipmentMark(region,EQUIPMENT_FAMILIES.ROCKET_ARTILLERY,{tick,reason:'first_standard_design',authorisedBy:'initial_standard'});}")

print('Early rocketry integration applied')
