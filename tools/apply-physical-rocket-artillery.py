from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def rep(path,old,new):
 p=ROOT/path;t=p.read_text()
 if old not in t: raise SystemExit(f'marker missing in {path}: {old[:140]!r}')
 p.write_text(t.replace(old,new,1))

# Physical launcher production/deployment alongside, but not conflated with, tube artillery.
rep('js/military/earlyModernWarfare.js',
"import { backfillArtilleryDesign, ensureCurrentArtilleryDesign, materialDesignAdjustment, stampEquipment } from './equipmentGenerations.js?v=20260919-equipment1';",
"import { backfillArtilleryDesign, ensureCurrentArtilleryDesign, ensureCurrentRocketArtilleryDesign, materialDesignAdjustment, stampEquipment } from './equipmentGenerations.js?v=20260920-rockets1';")
rep('js/military/earlyModernWarfare.js',
"function buildNavalGun(region) {",
"function buildRocketLauncher(region) {\n  if (!hasTech(region, 'rocket_artillery')) return false;\n  region.stockpile ||= {};\n  const machineInventory=region.industrialSupply?.inventory;\n  if ((region.stockpile.steel || 0) < 4 || (region.stockpile.gunpowder || 0) < 0.05 || (machineInventory?.machine_components || 0) < 1.2) return false;\n  const design=ensureCurrentRocketArtilleryDesign(region);\n  if (!design) return false;\n  region.stockpile.steel -= 4;\n  region.stockpile.gunpowder -= 0.05;\n  machineInventory.machine_components -= 1.2;\n  const launcher=stampEquipment({ kind:'rocket_artillery', metal:'steel', condition:1 }, design);\n  ensureEarlyModernMilitary(region).artillery.inventory.push(launcher);\n  return true;\n}\n\nfunction buildNavalGun(region) {")
rep('js/military/earlyModernWarfare.js',
"    if (hasTech(region, 'heavy_howitzers')) ensureCurrentArtilleryDesign(region, 'bombard');",
"    if (hasTech(region, 'heavy_howitzers')) ensureCurrentArtilleryDesign(region, 'bombard');\n    if (hasTech(region, 'rocket_artillery')) ensureCurrentRocketArtilleryDesign(region);")
rep('js/military/earlyModernWarfare.js',
"    const fieldGuns = state.artillery.inventory.filter((item) => item.kind === 'field_cannon').length + state.artillery.away.filter((item) => item.kind === 'field_cannon').length;",
"    const fieldGuns = state.artillery.inventory.filter((item) => item.kind === 'field_cannon').length + state.artillery.away.filter((item) => item.kind === 'field_cannon').length;\n    const rocketLaunchers = state.artillery.inventory.filter((item) => item.kind === 'rocket_artillery').length + state.artillery.away.filter((item) => item.kind === 'rocket_artillery').length;")
rep('js/military/earlyModernWarfare.js',
"    let artilleryBuilt = 0;",
"    const rocketTarget = hasTech(region,'rocket_artillery') && state.artillery.readiness >= 0.35 ? Math.min(12, Math.floor(personnel / 1100 * state.artillery.readiness)) : 0;\n    let artilleryBuilt = 0;")
rep('js/military/earlyModernWarfare.js',
"    const advanced = Math.max(0, region.navy?.advancedBoats || 0);",
"    let rocketLaunchersBuilt=0;\n    const rocketAttempts=Math.max(1,Math.floor(buildScale*(0.35+state.artillery.readiness*1.8)));\n    while (rocketLaunchers + rocketLaunchersBuilt < rocketTarget && rocketLaunchersBuilt < rocketAttempts) {\n      if (!buildRocketLauncher(region)) break;\n      rocketLaunchersBuilt += 1;\n    }\n\n    const advanced = Math.max(0, region.navy?.advancedBoats || 0);")
rep('js/military/earlyModernWarfare.js',
"    reports.push({ regionId: region.id, artilleryBuilt, navalGunsBuilt, artilleryReadiness: state.artillery.readiness, navalReadiness: state.naval.readiness });",
"    if (rocketTarget > rocketLaunchers) {\n      region.marketDemand.artillery_rockets=Math.max(region.marketDemand.artillery_rockets||0,(rocketTarget-rocketLaunchers)*8);\n      region.marketDemand.machine_components=Math.max(region.marketDemand.machine_components||0,(rocketTarget-rocketLaunchers)*1.2);\n    }\n    reports.push({ regionId: region.id, artilleryBuilt, rocketLaunchersBuilt, navalGunsBuilt, artilleryReadiness: state.artillery.readiness, navalReadiness: state.naval.readiness });")
rep('js/military/earlyModernWarfare.js',
"  const ordered = [...state.inventory].sort((a, b) => (b.kind === 'bombard' ? 1 : 0) - (a.kind === 'bombard' ? 1 : 0));",
"  const priority={bombard:3,rocket_artillery:2,field_cannon:1};\n  const ordered = [...state.inventory].sort((a, b) => (priority[b.kind]||0) - (priority[a.kind]||0));")
rep('js/military/earlyModernWarfare.js',
"  if (!train?.length || !hasTech(region, 'gunpowder')) return { fortDefenceMultiplier: 1, combatMultiplier: 1, suppliedFraction: 0, powderUsed: 0, shotUsed: 0, guns: 0 };\n  const weeks = Math.max(0.1, elapsedDays / 7);\n  let weight = 0;\n  for (const gun of train) {",
"  const tubeTrain=(train||[]).filter(g=>g?.kind!=='rocket_artillery');\n  if (!tubeTrain.length || !hasTech(region, 'gunpowder')) return { fortDefenceMultiplier: 1, combatMultiplier: 1, suppliedFraction: 0, powderUsed: 0, shotUsed: 0, guns: 0, models:[] };\n  const weeks = Math.max(0.1, elapsedDays / 7);\n  let weight = 0;\n  for (const gun of tubeTrain) {")
rep('js/military/earlyModernWarfare.js',
"    for (const gun of train) gun.condition = clamp((gun.condition ?? 1) - 0.0015 * weeks / Math.max(0.6, materialQuality(gun.metal)), 0, 1);",
"    for (const gun of tubeTrain) gun.condition = clamp((gun.condition ?? 1) - 0.0015 * weeks / Math.max(0.6, materialQuality(gun.metal)), 0, 1);")
rep('js/military/earlyModernWarfare.js',
"    suppliedFraction, powderUsed, shotUsed, guns: train.length,\n    models: Object.entries(train.reduce((m,g)=>(m[g.modelName||'Uncatalogued gun']=(m[g.modelName||'Uncatalogued gun']||0)+1,m),{})).map(([name,count])=>({name,count})),",
"    suppliedFraction, powderUsed, shotUsed, guns: tubeTrain.length,\n    models: Object.entries(tubeTrain.reduce((m,g)=>(m[g.modelName||'Uncatalogued gun']=(m[g.modelName||'Uncatalogued gun']||0)+1,m),{})).map(([name,count])=>({name,count})),")

# Produce dedicated rocket ammunition; it remains a strategic traded munition.
rep('js/economy/industrialWarEconomy.js',
"const modernArtillery=(r)=>has(r,'breech_loading_artillery')||has(r,'heavy_howitzers')||has(r,'quick_firing_artillery');",
"const modernArtillery=(r)=>has(r,'breech_loading_artillery')||has(r,'heavy_howitzers')||has(r,'quick_firing_artillery')||has(r,'rocket_artillery');")
rep('js/economy/industrialWarEconomy.js',
" let smallArms=0,shells=0,spending=0;",
" let smallArms=0,shells=0,rockets=0,spending=0;")
rep('js/economy/industrialWarEconomy.js',
" let torpedoes=0,navalMines=0;",
" if(has(region,'rocket_artillery')){\n  const launchers=[...(region.earlyModernMilitary?.artillery?.inventory||[]),...(region.earlyModernMilitary?.artillery?.away||[])].filter(x=>x?.kind==='rocket_artillery').length;\n  const target=launchers*(region.warEconomy?.activeCampaigns?32:9);\n  const gap=Math.max(0,target-(region.stockpile.artillery_rockets||0));\n  const capacity=Math.max(0,base*(2+launchers*12)*years);\n  const powderPer=.22,metalPer=.055,cashPer=.032;\n  rockets=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalPer,Math.max(0,region.treasury||0)/cashPer);\n  if(rockets>0){const cash=rockets*cashPer;region.stockpile.gunpowder-=rockets*powderPer;consumeMetal(region,rockets*metalPer);region.treasury=Math.max(0,region.treasury-cash);region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.artillery_rockets=(region.stockpile.artillery_rockets||0)+rockets;}\n  region.marketDemand.artillery_rockets=Math.max(region.marketDemand.artillery_rockets||0,gap/Math.max(1,elapsedDays/7));\n }\n let torpedoes=0,navalMines=0;")
rep('js/economy/industrialWarEconomy.js',
" return{smallArms,shells,torpedoes,navalMines,spending,value:smallArms*12+shells*38+torpedoes*85+navalMines*44};",
" return{smallArms,shells,rockets,torpedoes,navalMines,spending,value:smallArms*12+shells*38+rockets*46+torpedoes*85+navalMines*44};")
rep('js/economy/industrialWarEconomy.js',
"  region.report ||= {};region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells,torpedoesMade:output.torpedoes,navalMinesMade:output.navalMines,munitionsSpending:output.spending};",
"  region.report ||= {};region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells,artilleryRocketsMade:output.rockets,torpedoesMade:output.torpedoes,navalMinesMade:output.navalMines,munitionsSpending:output.spending};")

rep('js/economy/tradeGoods.js',
"  artillery_shells: { label: 'Artillery shells', basePrice: 38, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 4.5 },",
"  artillery_shells: { label: 'Artillery shells', basePrice: 38, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 4.5 },\n  artillery_rockets: { label: 'Artillery rockets', basePrice: 46, referenceStock: 160, category: 'military_supply', strategic: true, cargoKgPerUnit: 5.2 },")

# Use persistent launcher design stats in combat instead of silently using today's frontier.
rep('js/military/earlyRocketry.js',
"export function rocketArtilleryCombatProfile(region,{launchers=0,logisticsSupply=1,elapsedDays=7,consumeSupplies=true}={}){\n  const frontier=rocketArtilleryFrontier(region);if(!frontier||!has(region,ROCKET_ARTILLERY_TECH_ID)||launchers<=0)return{combatMultiplier:1,bombardment:0,areaSuppression:0,precision:0,ammoSupply:1,rocketsUsed:0,rangeKm:0};\n  const weeks=Math.max(.1,elapsedDays/7),needed=launchers*(.45+.85*frontier.salvoDensity)*weeks;",
"export function rocketArtilleryCombatProfile(region,{launchers=0,launcherUnits=[],logisticsSupply=1,elapsedDays=7,consumeSupplies=true}={}){\n  const current=rocketArtilleryFrontier(region);const units=(launcherUnits||[]).filter(x=>(x?.condition??1)>.08);const n=units.length||Math.max(0,launchers);\n  if(!current||!has(region,ROCKET_ARTILLERY_TECH_ID)||n<=0)return{combatMultiplier:1,bombardment:0,areaSuppression:0,precision:0,ammoSupply:1,rocketsUsed:0,rangeKm:0};\n  const avg=(key,fallback)=>units.length?units.reduce((s,x)=>s+(Number(x?.designStats?.[key])||fallback),0)/units.length:fallback;\n  const frontier={...current,rangeKm:avg('rangeKm',current.rangeKm),intrinsicAccuracy:avg('intrinsicAccuracy',current.intrinsicAccuracy),reliability:avg('reliability',current.reliability),salvoDensity:avg('salvoDensity',current.salvoDensity),firepower:avg('firepower',current.firepower)};\n  const weeks=Math.max(.1,elapsedDays/7),needed=n*(.45+.85*frontier.salvoDensity)*weeks;")
rep('js/military/earlyRocketry.js',
"  return {combatMultiplier:1+Math.min(.12,launchers*.008*effective),bombardment:clamp(frontier.firepower*frontier.salvoDensity*effective),",
"  return {combatMultiplier:1+Math.min(.12,n*.008*effective),bombardment:clamp(frontier.firepower*frontier.salvoDensity*effective),")

# Combine tube and rocket batteries in campaigns while preserving their different precision/ammunition models.
rep('js/military/campaigns.js',
"import { artilleryFireControlProfile, recordArtilleryFireControlLessons, resolveArtilleryTargeting, resolveCounterBatteryFire } from './artilleryFireControl.js?v=20260920-counterbattery1';",
"import { artilleryFireControlProfile, recordArtilleryFireControlLessons, resolveArtilleryTargeting, resolveCounterBatteryFire } from './artilleryFireControl.js?v=20260920-counterbattery1';\nimport { rocketArtilleryCombatProfile } from './earlyRocketry.js?v=20260920-rockets1';")
rep('js/military/campaigns.js',
"  const modernArtillery = modernArtilleryProfile(attacker, artillery, { elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true });",
"  const rocketUnits=(campaign.gunpowderArtillery||[]).filter(g=>g?.kind==='rocket_artillery');\n  const rocketArtillery=rocketArtilleryCombatProfile(attacker,{launcherUnits:rocketUnits,elapsedDays:7,logisticsSupply:campaign.supply,consumeSupplies:true});\n  const modernArtillery = modernArtilleryProfile(attacker, artillery, { elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true });")
rep('js/military/campaigns.js',
"  const defenderModernArtillery=modernArtilleryProfile(defender,defenderArtilleryBase,{elapsedDays:7,logisticsSupply:1,consumeSupplies:false});",
"  const defenderRocketUnits=defenderTrain.filter(g=>g?.kind==='rocket_artillery');\n  const defenderRocketArtillery=rocketArtilleryCombatProfile(defender,{launcherUnits:defenderRocketUnits,elapsedDays:7,logisticsSupply:1,consumeSupplies:false});\n  const defenderModernArtillery=modernArtilleryProfile(defender,defenderArtilleryBase,{elapsedDays:7,logisticsSupply:1,consumeSupplies:false});")
rep('js/military/campaigns.js',
"  const attackerCounterBattery=resolveCounterBatteryFire(attacker,defender,artilleryFireControl,defenderTrain,{bombardment:modernArtillery.bombardment,rng,currentTick});\n  const defenderCounterBattery=resolveCounterBatteryFire(defender,attacker,defenderFireControl,campaign.gunpowderArtillery||[],{bombardment:defenderModernArtillery.bombardment,rng,currentTick});",
"  const attackerCounterBattery=resolveCounterBatteryFire(attacker,defender,artilleryFireControl,defenderTrain,{bombardment:Math.max(modernArtillery.bombardment,rocketArtillery.bombardment*.55),rng,currentTick});\n  const defenderCounterBattery=resolveCounterBatteryFire(defender,attacker,defenderFireControl,campaign.gunpowderArtillery||[],{bombardment:Math.max(defenderModernArtillery.bombardment,defenderRocketArtillery.bombardment*.55),rng,currentTick});")
rep('js/military/campaigns.js',
"    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * artilleryFireControl.combatMultiplier * attackerTactics.combatMultiplier * jointCoordination;",
"    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * rocketArtillery.combatMultiplier * artilleryFireControl.combatMultiplier * attackerTactics.combatMultiplier * jointCoordination;")
rep('js/military/campaigns.js',
"  recordArtilleryFireControlLessons(attacker, defender, { currentTick, intensity, bombardment: modernArtillery.bombardment, enemyArtillery: defender.earlyModernMilitary?.artillery?.inventory?.length || 0 });",
"  recordArtilleryFireControlLessons(attacker, defender, { currentTick, intensity, bombardment: Math.max(modernArtillery.bombardment,rocketArtillery.bombardment), enemyArtillery: defender.earlyModernMilitary?.artillery?.inventory?.length || 0 });")
rep('js/military/campaigns.js',
"    attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, artilleryFireControl, artilleryTargeting, attackerCounterBattery, defenderCounterBattery, trenchDefence, bombardment };",
"    attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, rocketArtillery, artilleryFireControl, artilleryTargeting, attackerCounterBattery, defenderCounterBattery, trenchDefence, bombardment };")

print('Physical rocket artillery integration applied')
