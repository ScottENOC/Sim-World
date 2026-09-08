from pathlib import Path

p = Path('js/military/campaigns.js')
s = p.read_text()

def repl(old, new, label):
    global s
    if new in s:
        return
    if old not in s:
        raise SystemExit(f'missing anchor: {label}')
    s = s.replace(old, new, 1)

repl(
"import { attemptPhysicalOccupation, initialiseCampaignMovement, resolveCampaignNodeInteractions, setCampaignSubregionalObjective, tickCampaignMovement } from './subregionalMovement.js?v=20260908-movement1';",
"import { attemptPhysicalOccupation, initialiseCampaignMovement, resolveCampaignNodeInteractions, setCampaignSubregionalObjective, tickCampaignMovement } from './subregionalMovement.js?v=20260908-movement1';\nimport { initialiseExpeditionaryLogistics, tickExpeditionaryLogistics } from './expeditionaryLogistics.js?v=20260908-logistics1';",
'import logistics')

repl(
"function resolveCampaignWeek(campaign, attacker, defender, polities, regions, currentTick, toolTypes, rng) {\n  campaign.weeksEngaged += 1;\n  const movement = tickCampaignMovement(campaign, defender, currentTick, campaignMobility(attacker));",
"function resolveCampaignWeek(campaign, attacker, defender, polities, regions, currentTick, toolTypes, rng, options = {}) {\n  campaign.weeksEngaged += 1;\n  const expedition = campaign.viaSea ? tickExpeditionaryLogistics(campaign, attacker, defender, options.fleets || [], currentTick) : null;\n  const movement = tickCampaignMovement(campaign, defender, currentTick, campaignMobility(attacker) * (expedition?.movementMultiplier ?? 1));",
'weekly logistics')

old_supply = """  const logistics = professionalLogisticsMultiplier(attacker, currentTick);\n  const foodNeeded = campaign.personnel * 0.08;\n  const foodSupplied = Math.min(foodNeeded, Math.max(0, attacker.stockpile?.food || 0));\n  attacker.stockpile.food = Math.max(0, (attacker.stockpile.food || 0) - foodSupplied);\n  const supplySuccess = foodNeeded > 0 ? foodSupplied / foodNeeded : 1;\n  const defenderWater = Math.min(0.012, effectiveInfrastructureCount(defender, 'wells_cisterns') * 0.007 +\n    effectiveInfrastructureCount(defender, 'canal') * 0.005);\n  const supplyDrain = (0.018 + campaign.travelWeeks * 0.0025 + (defender.isCoastal ? (1 - control) * 0.035 : 0)) / logistics;\n  campaign.supply = clamp(campaign.supply + supplySuccess * 0.035 * Math.min(1.18, logistics) - supplyDrain - campaign.pressure * 0.008);\n  campaign.defenderMorale = clamp(campaign.defenderMorale + defenderWater);\n"""
new_supply = """  const logistics = professionalLogisticsMultiplier(attacker, currentTick);\n  const defenderWater = Math.min(0.012, effectiveInfrastructureCount(defender, 'wells_cisterns') * 0.007 +\n    effectiveInfrastructureCount(defender, 'canal') * 0.005);\n  if (campaign.viaSea && expedition) {\n    campaign.supply = expedition.supplyFraction;\n    campaign.attackerMorale = clamp(campaign.attackerMorale + expedition.moraleDelta);\n  } else {\n    const foodNeeded = campaign.personnel * 0.08;\n    const foodSupplied = Math.min(foodNeeded, Math.max(0, attacker.stockpile?.food || 0));\n    attacker.stockpile.food = Math.max(0, (attacker.stockpile.food || 0) - foodSupplied);\n    const supplySuccess = foodNeeded > 0 ? foodSupplied / foodNeeded : 1;\n    const supplyDrain = (0.018 + campaign.travelWeeks * 0.0025 + (defender.isCoastal ? (1 - control) * 0.035 : 0)) / logistics;\n    campaign.supply = clamp(campaign.supply + supplySuccess * 0.035 * Math.min(1.18, logistics) - supplyDrain - campaign.pressure * 0.008);\n  }\n  campaign.defenderMorale = clamp(campaign.defenderMorale + defenderWater);\n"""
repl(old_supply, new_supply, 'supply block')

repl(
"  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain);",
"  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1);",
'combat supply multiplier')

repl(
"  const attackerLosses = Math.min(campaign.personnel,\n    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * variance()));",
"  const combatAttackerLosses = Math.min(campaign.personnel,\n    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * variance()));\n  const logisticsLosses = Math.min(Math.max(0, campaign.personnel - combatAttackerLosses), Math.round(campaign.personnel * (expedition?.attritionRate ?? 0)));\n  const attackerLosses = combatAttackerLosses + logisticsLosses;",
'logistics attrition')

repl(
"  const week = { tick: currentTick, stage: campaign.stage, terrain, pressureDelta, pressure: campaign.pressure,\n    attackerLosses, defenderLosses, militiaLosses, civilianDeaths, attackerMorale: campaign.attackerMorale,\n    defenderMorale: campaign.defenderMorale, supply: campaign.supply, strengthRatio, navalControl: control };",
"  const week = { tick: currentTick, stage: campaign.stage, terrain, pressureDelta, pressure: campaign.pressure,\n    attackerLosses, logisticsLosses, defenderLosses, militiaLosses, civilianDeaths, attackerMorale: campaign.attackerMorale,\n    defenderMorale: campaign.defenderMorale, supply: campaign.supply, strengthRatio, navalControl: control,\n    logisticsStatus: campaign.logisticsState?.status || null, routeReliability: campaign.logisticsState?.routeReliability ?? null };",
'week logistics report')

repl(
"      initialiseCampaignMovement(campaign, defender, campaign.arriveTick);",
"      initialiseCampaignMovement(campaign, defender, campaign.arriveTick);\n      if (campaign.viaSea) initialiseExpeditionaryLogistics(campaign, attacker, defender, options.fleets || [], campaign.arriveTick);",
'arrival logistics')

repl(
"      resolveCampaignWeek(campaign, attacker, defender, polities, regionList, combatWeek, toolTypes, rng);",
"      resolveCampaignWeek(campaign, attacker, defender, polities, regionList, combatWeek, toolTypes, rng, options);",
'pass options')

p.write_text(s)

m = Path('js/main.js')
ms = m.read_text()
old = "const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars });"
new = "const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets });"
if new not in ms:
    if old not in ms: raise SystemExit('missing main campaign options')
    ms = ms.replace(old, new, 1)
m.write_text(ms)
