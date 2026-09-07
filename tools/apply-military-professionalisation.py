#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    text = path.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected patch anchor not found in {path}: {old[:100]!r}')
    path.write_text(text.replace(old, new, 1))
    return True

campaigns = ROOT / 'js/military/campaigns.js'
replace_once(campaigns,
"import { chooseBattlefield, recordCombatExperience, terrainCombatMultiplier } from './terrain.js?v=20260908-terrain1';\n",
"import { chooseBattlefield, recordCombatExperience, terrainCombatMultiplier } from './terrain.js?v=20260908-terrain1';\nimport { formationAmphibiousBonus, formationMobilityBonus, formationSiegeBonus } from './formations.js?v=20260908-prof1';\nimport { marchSpeedMultiplier, moraleShockMultiplier, professionalLogisticsMultiplier, retreatLossMultiplier } from './professionalisation.js?v=20260908-prof1';\n")

replace_once(campaigns,
"function campaignMobility(region) {\n  const movement = horseLandSpeedMultiplier(region) * overlandInfrastructureMultiplier(region);\n  return clamp((movement - 0.8) / 1.15);\n}\n",
"function campaignMobility(region) {\n  const movement = horseLandSpeedMultiplier(region) * overlandInfrastructureMultiplier(region) *\n    marchSpeedMultiplier(region) * (1 + formationMobilityBonus(region));\n  return clamp((movement - 0.8) / 1.25);\n}\n")

replace_once(campaigns,
"    : LAND_SPEED_KM_PER_WEEK * horseLandSpeedMultiplier(attacker) * overlandInfrastructureMultiplier(attacker);\n",
"    : LAND_SPEED_KM_PER_WEEK * horseLandSpeedMultiplier(attacker) * overlandInfrastructureMultiplier(attacker) *\n      marchSpeedMultiplier(attacker) * (1 + formationMobilityBonus(attacker));\n")

replace_once(campaigns,
"function beginReturn(campaign, attacker, defender, currentTick, outcome) {\n  campaign.phase = 'returning';\n  campaign.stage = 'withdrawing';\n  campaign.outcome = outcome;\n  campaign.returnTick = currentTick + campaignTravelWeeks(attacker, defender, campaign.viaSea);\n  defender.conflictPressure = 0;\n  defender.emergencyMilitiaPersonnel = 0;\n}\n",
"function beginReturn(campaign, attacker, defender, currentTick, outcome) {\n  if (campaign.weeksEngaged > 0 && (outcome === 'attacker_broke' || outcome === 'withdrawn')) {\n    const baseRetreatLoss = outcome === 'attacker_broke' ? 0.055 : 0.022;\n    const retreatLoss = Math.min(campaign.personnel, Math.round(campaign.personnel * baseRetreatLoss * retreatLossMultiplier(attacker, currentTick)));\n    if (retreatLoss > 0) {\n      campaign.personnel -= retreatLoss;\n      campaign.attackerCasualties += retreatLoss;\n      attacker.army.away = Math.max(0, (attacker.army.away || 0) - retreatLoss);\n      campaign.retreatLosses = (campaign.retreatLosses || 0) + retreatLoss;\n    }\n  }\n  campaign.phase = 'returning';\n  campaign.stage = 'withdrawing';\n  campaign.outcome = outcome;\n  campaign.returnTick = currentTick + campaignTravelWeeks(attacker, defender, campaign.viaSea);\n  defender.conflictPressure = 0;\n  defender.emergencyMilitiaPersonnel = 0;\n}\n")

replace_once(campaigns,
"  const coastalFactor = defender.isCoastal\n    ? campaign.viaSea ? clamp(control * 1.35, 0.25, 1) : clamp(0.55 + control * 0.55, 0.55, 1)\n    : 1;\n\n  const foodNeeded = campaign.personnel * 0.08;\n",
"  const amphibiousPreparation = campaign.viaSea ? 1 + formationAmphibiousBonus(attacker) : 1;\n  const coastalFactor = defender.isCoastal\n    ? campaign.viaSea ? clamp(control * 1.35 * amphibiousPreparation, 0.25, 1.15) : clamp(0.55 + control * 0.55, 0.55, 1)\n    : 1;\n\n  const logistics = professionalLogisticsMultiplier(attacker, currentTick);\n  const foodNeeded = campaign.personnel * 0.08;\n")

replace_once(campaigns,
"  const supplyDrain = 0.018 + campaign.travelWeeks * 0.0025 + (defender.isCoastal ? (1 - control) * 0.035 : 0);\n  campaign.supply = clamp(campaign.supply + supplySuccess * 0.035 - supplyDrain - campaign.pressure * 0.008);\n",
"  const supplyDrain = (0.018 + campaign.travelWeeks * 0.0025 + (defender.isCoastal ? (1 - control) * 0.035 : 0)) / logistics;\n  campaign.supply = clamp(campaign.supply + supplySuccess * 0.035 * Math.min(1.18, logistics) - supplyDrain - campaign.pressure * 0.008);\n")

replace_once(campaigns,
"  const attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain);\n  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain);\n",
"  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain);\n  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain);\n  if (campaign.pressure >= 0.45) attackerPower *= 1 + formationSiegeBonus(attacker);\n")

replace_once(campaigns,
"  campaign.attackerMorale = clamp(campaign.attackerMorale - lossShock * 2.2 -\n    (1 - campaign.supply) * 0.035 + Math.max(0, pressureDelta) * 0.08 - (pressureDelta <= 0 ? 0.01 : 0));\n  campaign.defenderMorale = clamp(campaign.defenderMorale - Math.max(0, pressureDelta) * 0.5 -\n    (defenderLosses + militiaLosses) / Math.max(1, defender.population) * 4);\n",
"  campaign.attackerMorale = clamp(campaign.attackerMorale - lossShock * 2.2 * moraleShockMultiplier(attacker, currentTick) -\n    (1 - campaign.supply) * 0.035 + Math.max(0, pressureDelta) * 0.08 - (pressureDelta <= 0 ? 0.01 : 0));\n  campaign.defenderMorale = clamp(campaign.defenderMorale - Math.max(0, pressureDelta) * 0.5 * moraleShockMultiplier(defender, currentTick) -\n    (defenderLosses + militiaLosses) / Math.max(1, defender.population) * 4 * moraleShockMultiplier(defender, currentTick));\n")

region = ROOT / 'js/world/region.js'
replace_once(region,
"    this.militaryExperience = { combat: 0, lastTick: 0, engagementWeeks: 0 };\n",
"    this.militaryExperience = { field: 0, institutional: 0, lastFieldTick: 0, engagementWeeks: 0, trainingYears: 0 };\n    this.militaryInstitutions = { officerSchoolProgress: 0, officerSchoolActive: false };\n")

print('military professionalisation patch applied')
