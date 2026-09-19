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

rep('js/military/artilleryFireControl.js',
"  const defaults={rangeFinding:0,survey:0,fireDirection:0,predictedFire:0,aerialObservationIntegration:0,counterBattery:0,targetIntelligence:0,combatWeeks:0,lessonsCaptured:0};",
"  const defaults={rangeFinding:0,survey:0,fireDirection:0,predictedFire:0,aerialObservationIntegration:0,counterBattery:0,soundRanging:0,counterBatteryRadar:0,targetIntelligence:0,combatWeeks:0,lessonsCaptured:0};")
rep('js/military/artilleryFireControl.js',
"export function resolveArtilleryTargeting(attacker,defender,profile,{bombardment=0,rng=Math.random,currentTick=0}={}){",
"export function artilleryTargetExposure(train=[]){\n  if(!train?.length)return{mobility:0,rapidSalvo:0,exposure:.72};\n  const mobility=train.reduce((s,g)=>s+clamp(g?.designStats?.mobility??.3),0)/train.length;\n  const rapidSalvo=train.reduce((s,g)=>s+clamp(g?.designStats?.salvoDensity??g?.designStats?.rateOfFire??.15),0)/train.length;\n  const exposure=clamp(.78-mobility*.62-rapidSalvo*.24,.035,.78);\n  return{mobility,rapidSalvo,exposure};\n}\n\nexport function counterBatteryTargetability(attacker,defender,targetTrain=[],currentTick=null){\n  const obs=artilleryObservationProfile(attacker,defender,currentTick),s=ensureArtilleryFireControl(attacker),target=artilleryTargetExposure(targetTrain);\n  const known=clamp(attacker?.artilleryIntelligence?.[defender?.id]?.confidence||0);\n  const sound=clamp(s.soundRanging||0),radar=clamp(s.counterBatteryRadar||0);\n  const activeAcquisition=clamp(1-(1-obs.aerial)*(1-known)*(1-sound*.80)*(1-radar));\n  const background=clamp(obs.ground*.18+s.counterBattery*.08);\n  const targetability=clamp(target.exposure*.10+activeAcquisition*(.30+.70*target.exposure)+background*target.exposure*.22);\n  return{...target,activeAcquisition,background,targetability,observation:obs};\n}\n\nexport function resolveCounterBatteryFire(attacker,defender,attackerProfile,targetTrain=[],{bombardment=0,rng=Math.random,currentTick=0}={}){\n  if(!targetTrain?.length)return{targetability:0,engaged:0,damaged:0,destroyed:0};\n  const acquisition=counterBatteryTargetability(attacker,defender,targetTrain,currentTick);\n  const fire=clamp(attackerProfile?.counterBatteryEffect||0)*clamp(bombardment)*acquisition.targetability;\n  let engaged=0,damaged=0,destroyed=0;\n  for(const gun of targetTrain){\n    const condition=clamp(gun?.condition??1,0,1);if(condition<=.02)continue;\n    const hitChance=clamp(fire*(.36+.28*clamp(attackerProfile?.precision||0)),0,.62);\n    if(rng()>=hitChance)continue;engaged++;\n    const damage=clamp(.08+fire*.34+rng()*.18,.05,.48);gun.condition=clamp(condition-damage,0,1);damaged++;if(gun.condition<=.08)destroyed++;\n  }\n  return{...acquisition,fire,engaged,damaged,destroyed};\n}\n\nexport function resolveArtilleryTargeting(attacker,defender,profile,{bombardment=0,rng=Math.random,currentTick=0}={}){")
rep('js/military/artilleryFireControl.js',
"  if(enemyArtillery>0) s.counterBattery=clamp(s.counterBattery+learn*(.45+obs.combined*.55)*(1-s.counterBattery));",
"  if(enemyArtillery>0){\n    s.counterBattery=clamp(s.counterBattery+learn*(.45+obs.combined*.55)*(1-s.counterBattery));\n    s.soundRanging=clamp(s.soundRanging+learn*.34*(1-s.soundRanging));\n  }")

rep('js/military/campaigns.js',
"import { artilleryFireControlProfile, recordArtilleryFireControlLessons, resolveArtilleryTargeting } from './artilleryFireControl.js?v=20260919-artillery1';",
"import { artilleryFireControlProfile, recordArtilleryFireControlLessons, resolveArtilleryTargeting, resolveCounterBatteryFire } from './artilleryFireControl.js?v=20260920-counterbattery1';")
rep('js/military/campaigns.js',
"  const artilleryTargeting = resolveArtilleryTargeting(attacker, defender, artilleryFireControl, { bombardment: modernArtillery.bombardment, rng, currentTick });",
"  const artilleryTargeting = resolveArtilleryTargeting(attacker, defender, artilleryFireControl, { bombardment: modernArtillery.bombardment, rng, currentTick });\n  const defenderTrain=defender.earlyModernMilitary?.artillery?.inventory||[];\n  const defenderArtilleryBase=artilleryCampaignProfile(defender,defenderTrain,{elapsedDays:7,logisticsSupply:1,consumeSupplies:false});\n  const defenderModernArtillery=modernArtilleryProfile(defender,defenderArtilleryBase,{elapsedDays:7,logisticsSupply:1,consumeSupplies:false});\n  const defenderFireControl=artilleryFireControlProfile(defender,attacker,{currentTick,weeksEngaged:campaign.weeksEngaged,train:defenderTrain});\n  const attackerCounterBattery=resolveCounterBatteryFire(attacker,defender,artilleryFireControl,defenderTrain,{bombardment:modernArtillery.bombardment,rng,currentTick});\n  const defenderCounterBattery=resolveCounterBatteryFire(defender,attacker,defenderFireControl,campaign.gunpowderArtillery||[],{bombardment:defenderModernArtillery.bombardment,rng,currentTick});")
rep('js/military/campaigns.js',
"    attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, artilleryFireControl, artilleryTargeting, trenchDefence, bombardment };",
"    attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, artilleryFireControl, artilleryTargeting, attackerCounterBattery, defenderCounterBattery, trenchDefence, bombardment };")

print('Early rocketry integration applied')
