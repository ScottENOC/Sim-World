from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def repl(path, old, new):
    p=ROOT/path; t=p.read_text()
    if old not in t: raise RuntimeError(f'missing anchor in {path}: {old[:100]!r}')
    p.write_text(t.replace(old,new,1))

# Boat fishing gets its own maritime skill on top of generic fishing knowledge.
repl('js/economy/laborCore.js',
"import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';",
"import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';\nimport { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';")
repl('js/economy/laborCore.js',
"const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * weekScale * (1 + advancedShare * 0.5) *\n        stockFraction * fishingSkill * fisheryProtection;",
"const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * weekScale * (1 + advancedShare * 0.5) *\n        stockFraction * fishingSkill * maritimeSkillMultiplier(region, MARITIME_SKILLS.FISHING) * fisheryProtection;")

# Merchant seamanship improves what a given hull/crew can do, without replacing boat technology.
repl('js/economy/trade.js',
"import { navalMissionProfile, postureProfile } from '../military/policies.js?v=20260904-policy1';",
"import { navalMissionProfile, postureProfile } from '../military/policies.js?v=20260904-policy1';\nimport { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';")
repl('js/economy/trade.js',
"  const advancedShare = canDockAdvanced ? Math.max(merchantShare, legacyShare) : 0;\n  return {\n    advancedShare,\n    rangeKm: BASIC_SEA_RANGE_KM + (ADVANCED_SEA_RANGE_KM - BASIC_SEA_RANGE_KM) * advancedShare,\n    capacityMultiplier: 1 + advancedShare * 1.5,\n    costMultiplier: 1 - advancedShare * 0.45,\n    speedMultiplier: 1 + advancedShare * 0.9,\n  };",
"  const advancedShare = canDockAdvanced ? Math.max(merchantShare, legacyShare) : 0;\n  const sailingSkill = maritimeSkillMultiplier(regionA, MARITIME_SKILLS.TRADE);\n  const skillBonus = sailingSkill - 1;\n  return {\n    advancedShare,\n    rangeKm: (BASIC_SEA_RANGE_KM + (ADVANCED_SEA_RANGE_KM - BASIC_SEA_RANGE_KM) * advancedShare) * (1 + skillBonus * 0.45),\n    capacityMultiplier: (1 + advancedShare * 1.5) * (1 + skillBonus * 0.35),\n    costMultiplier: (1 - advancedShare * 0.45) * (1 - skillBonus * 0.35),\n    speedMultiplier: (1 + advancedShare * 0.9) * sailingSkill,\n  };")

# Exploration speciality expands practical range and makes long voyages faster/safer.
repl('js/core/scouting.js',
"import { hasDirectContact, knownRegionIds, recordScoutContact } from './knowledge.js?v=20260906-scouting1';",
"import { hasDirectContact, knownRegionIds, recordScoutContact } from './knowledge.js?v=20260906-scouting1';\nimport { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';")
repl('js/core/scouting.js',
"function navalRangeKm(region) {\n  return (region?.navy?.advancedBoats || 0) > 0\n    ? MAX_ADVANCED_NAVAL_SEARCH_KM\n    : MAX_BASIC_NAVAL_SEARCH_KM;\n}",
"function navalRangeKm(region) {\n  const hullRange = (region?.navy?.advancedBoats || 0) > 0\n    ? MAX_ADVANCED_NAVAL_SEARCH_KM\n    : MAX_BASIC_NAVAL_SEARCH_KM;\n  const skillBonus = maritimeSkillMultiplier(region, MARITIME_SKILLS.SCOUTING) - 1;\n  return hullRange * (1 + skillBonus * 0.8);\n}")
repl('js/core/scouting.js',
"function missionWeeks(viaSea, km) {\n  if (viaSea) return Math.max(3, 2 + Math.ceil(km / 80) * 2);\n  return Math.max(4, 2 + Math.ceil(km / 35) * 2);\n}",
"function missionWeeks(viaSea, km, region = null) {\n  if (viaSea) {\n    const skill = maritimeSkillMultiplier(region, MARITIME_SKILLS.SCOUTING);\n    return Math.max(3, Math.ceil((2 + Math.ceil(km / 80) * 2) / skill));\n  }\n  return Math.max(4, 2 + Math.ceil(km / 35) * 2);\n}")
repl('js/core/scouting.js',
"  const rumourBonus = choice.reason?.includes('rumour') ? 0.08 : 0;\n  return Math.max(0.18, Math.min(0.98, base - distancePenalty + rumourBonus));",
"  const rumourBonus = choice.reason?.includes('rumour') ? 0.08 : 0;\n  const skillBonus = choice.viaSea ? (maritimeSkillMultiplier(region, MARITIME_SKILLS.SCOUTING) - 1) * 0.35 : 0;\n  return Math.max(0.18, Math.min(0.98, base - distancePenalty + rumourBonus + skillBonus));")
repl('js/core/scouting.js',
"  const durationWeeks = missionWeeks(choice.viaSea, choice.distanceKm);",
"  const durationWeeks = missionWeeks(choice.viaSea, choice.distanceKm, region);")

# Naval combat experience helps both attacking crews and coastal defenders.
repl('js/military/raiding.js',
"import { armyCohesionMultiplier, navalMissionProfile, postureProfile } from './policies.js?v=20260904-policy1';",
"import { armyCohesionMultiplier, navalMissionProfile, postureProfile } from './policies.js?v=20260904-policy1';\nimport { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';")
repl('js/military/raiding.js',
"  const maritimeAssaultBonus = viaSea ? 1 + advancedNavyShare(attacker) * 0.5 : 1;\n  const attackerPower = raidingPersonnel * attackerEquip * maritimeAssaultBonus * militaryReadiness(attacker) *\n    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker));\n  const defenderPower = defender.army.personnel * defenderEquip * DEFENDER_HOME_ADVANTAGE *\n    postureProfile(defender).raidDefence * militaryReadiness(defender) *\n    armyCohesionMultiplier(defender) * horseMilitaryMultiplier(defender) * hillFortDefenceMultiplier(defender) *\n    settlementDefenceMultiplier(defender);",
"  const maritimeAssaultBonus = viaSea ? 1 + advancedNavyShare(attacker) * 0.5 : 1;\n  const attackerSeaSkill = viaSea ? maritimeSkillMultiplier(attacker, MARITIME_SKILLS.COMBAT) : 1;\n  const defenderSeaSkill = viaSea ? 1 + (maritimeSkillMultiplier(defender, MARITIME_SKILLS.COMBAT) - 1) * 0.5 : 1;\n  const attackerPower = raidingPersonnel * attackerEquip * maritimeAssaultBonus * attackerSeaSkill * militaryReadiness(attacker) *\n    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker));\n  const defenderPower = defender.army.personnel * defenderEquip * DEFENDER_HOME_ADVANTAGE * defenderSeaSkill *\n    postureProfile(defender).raidDefence * militaryReadiness(defender) *\n    armyCohesionMultiplier(defender) * horseMilitaryMultiplier(defender) * hillFortDefenceMultiplier(defender) *\n    settlementDefenceMultiplier(defender);")

# Accumulate experience from time actually spent fishing/trading/scouting/fighting at sea.
repl('js/main.js',
"import { createReligiousWorld, initialiseReligions, tickReligion } from './society/religion.js?v=20260905-religion1';",
"import { createReligiousWorld, initialiseReligions, tickReligion } from './society/religion.js?v=20260905-religion1';\nimport { tickMaritimeExperience } from './technology/seamanship.js?v=20260906-maritime1';")
repl('js/main.js',
"    tickTrade(regions, calendarWeek, time);\n    tickStateFinance(regions, time.elapsedDays);",
"    tickTrade(regions, calendarWeek, time);\n    tickMaritimeExperience(regions, activeRaids, time.elapsedDays);\n    tickStateFinance(regions, time.elapsedDays);")

print('maritime skill family integrated')
