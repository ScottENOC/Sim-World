#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'{path}: expected text not found: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))

# breakthroughs: add medieval emergent technologies
replace('js/technology/breakthroughs.js',
        "import { tickClassicalBreakthroughs } from './classicalTransition.js?v=20260907-classical1';",
        "import { tickClassicalBreakthroughs } from './classicalTransition.js?v=20260907-classical1';\nimport { tickMedievalBreakthroughs } from './medievalTransition.js?v=20260912-medieval1';")
replace('js/technology/breakthroughs.js',
        "  events.push(...tickClassicalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  return events;",
        "  events.push(...tickClassicalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickMedievalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  return events;")

# medieval formations
replace('js/military/formations.js',
        "  siege_engineer_corps: {",
        "  crossbow_companies: {\n    id: 'crossbow_companies', label: 'Crossbow companies', minArmy: 180,\n    discoveryYears: 10, maxCoverage: 0.32, combatBonus: 0.18, cohesionBonus: 0.05,\n    annualMetalPerSoldier: 0.0025, annualTreasuryPerSoldier: 0.0022,\n    terrain: { plains: 1.02, hills: 1.04, mountains: 0.98, forest: 0.94, wetland: 0.90 },\n  },\n  knightly_retinues: {\n    id: 'knightly_retinues', label: 'Knightly heavy-cavalry retinues', minArmy: 240,\n    discoveryYears: 18, maxCoverage: 0.20, combatBonus: 0.28, cohesionBonus: 0.08, mobilityBonus: 0.08,\n    annualMetalPerSoldier: 0.009, annualTreasuryPerSoldier: 0.0055,\n    terrain: { plains: 1.10, hills: 0.96, mountains: 0.68, forest: 0.72, wetland: 0.60 },\n  },\n  siege_engineer_corps: {")
replace('js/military/formations.js',
        "  if (archetypeId === 'siege_engineer_corps') {",
        "  if (archetypeId === 'crossbow_companies') {\n    return { ...base, eligible: hasTech(region, 'crossbows') && arsenal && army >= 180 &&\n      base.metalAdequacy >= 0.18 };\n  }\n  if (archetypeId === 'knightly_retinues') {\n    const warHorses = Math.max(0, region.horseEconomy?.war || 0);\n    return { ...base, eligible: hasTech(region, 'heavy_cavalry') && drill && arsenal &&\n      warHorses >= Math.max(45, army * 0.12) && base.metalAdequacy >= 0.35 && army >= 240 };\n  }\n  if (archetypeId === 'siege_engineer_corps') {")
replace('js/military/formations.js',
        "    cavalry_corps: `${place} Horse Corps`,",
        "    cavalry_corps: `${place} Horse Corps`,\n    crossbow_companies: `${place} Crossbow Companies`,\n    knightly_retinues: `${place} Knightly Retinue`,")

# make formation combat bonuses actually count in campaigns
replace('js/military/campaigns.js',
        "import { formationAmphibiousBonus, formationMobilityBonus, formationSiegeBonus } from './formations.js?v=20260908-prof1';",
        "import { formationAmphibiousBonus, formationCombatMultiplier, formationMobilityBonus, formationSiegeBonus } from './formations.js?v=20260912-medieval1';")
replace('js/military/campaigns.js',
        "    horseMilitaryMultiplier(region) * terrainMultiplier * homeAdvantage *\n    (0.55 + 0.45 * supply) * (0.65 + 0.35 * morale);",
        "    horseMilitaryMultiplier(region) * formationCombatMultiplier(region, terrain) * terrainMultiplier * homeAdvantage *\n    (0.55 + 0.45 * supply) * (0.65 + 0.35 * morale);")

# and in raids
replace('js/military/raiding.js',
        "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';",
        "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';\nimport { formationCombatMultiplier } from './formations.js?v=20260912-medieval1';")
replace('js/military/raiding.js',
        "    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker)) * attackerFirearms.multiplier;",
        "    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker)) * formationCombatMultiplier(attacker) * attackerFirearms.multiplier;")
replace('js/military/raiding.js',
        "    settlementDefenceMultiplier(defender) * defenderFirearms.multiplier;",
        "    settlementDefenceMultiplier(defender) * formationCombatMultiplier(defender) * defenderFirearms.multiplier;")

# heavy cavalry increases the demand for trained war horses
replace('js/economy/horses.js',
        "  const doctrineDemand = region.unlockedTechIds?.has('mounted_cavalry') ? 1.45\n    : region.unlockedTechIds?.has('light_chariotry') ? 1.25 : 1;",
        "  const doctrineDemand = region.unlockedTechIds?.has('heavy_cavalry') ? 1.85\n    : region.unlockedTechIds?.has('mounted_cavalry') ? 1.45\n    : region.unlockedTechIds?.has('light_chariotry') ? 1.25 : 1;")

# ocean-going sailing extends advanced-boat range rather than replacing boats
replace('js/economy/trade.js',
        "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';",
        "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';\nimport { oceanSailingProfile } from '../technology/medievalTransition.js?v=20260912-medieval1';")
replace('js/economy/trade.js', "function seaTransportProfile(regionA, regionB) {", "export function seaTransportProfile(regionA, regionB) {")
replace('js/economy/trade.js',
        "  const sailingSkill = maritimeSkillMultiplier(regionA, MARITIME_SKILLS.TRADE);\n  const skillBonus = sailingSkill - 1;\n  return {\n    advancedShare,\n    rangeKm: (BASIC_SEA_RANGE_KM + (ADVANCED_SEA_RANGE_KM - BASIC_SEA_RANGE_KM) * advancedShare) * (1 + skillBonus * 0.45),\n    capacityMultiplier: (1 + advancedShare * 1.5) * (1 + skillBonus * 0.35),\n    costMultiplier: (1 - advancedShare * 0.45) * (1 - skillBonus * 0.35),\n    speedMultiplier: (1 + advancedShare * 0.9) * sailingSkill,\n  };",
        "  const sailingSkill = maritimeSkillMultiplier(regionA, MARITIME_SKILLS.TRADE);\n  const skillBonus = sailingSkill - 1;\n  const ocean = oceanSailingProfile(regionA);\n  const oceanCapable = ocean.known && advancedShare >= 0.35;\n  const oceanRange = oceanCapable ? ocean.rangeMultiplier : 1;\n  const oceanSpeed = oceanCapable ? ocean.speedMultiplier : 1;\n  return {\n    advancedShare, oceanCapable,\n    rangeKm: (BASIC_SEA_RANGE_KM + (ADVANCED_SEA_RANGE_KM - BASIC_SEA_RANGE_KM) * advancedShare) * (1 + skillBonus * 0.45) * oceanRange,\n    capacityMultiplier: (1 + advancedShare * 1.5) * (1 + skillBonus * 0.35) * (oceanCapable ? 1.15 : 1),\n    costMultiplier: (1 - advancedShare * 0.45) * (1 - skillBonus * 0.35) * (oceanCapable ? 0.90 : 1),\n    speedMultiplier: (1 + advancedShare * 0.9) * sailingSkill * oceanSpeed,\n  };")

# cache chain
replace('js/main.js',
        "import { tickBreakthroughs, IRON_SMELTING_TECH_ID, ADVANCED_BOATBUILDING_TECH_ID, CATAPULT_TECH_ID } from './technology/breakthroughs.js?v=20260912-gunpowder1';",
        "import { tickBreakthroughs, IRON_SMELTING_TECH_ID, ADVANCED_BOATBUILDING_TECH_ID, CATAPULT_TECH_ID } from './technology/breakthroughs.js?v=20260912-medieval1';")
replace('js/main.js',
        "import { tickTrade } from './economy/trade.js?v=20260912-gunpowder1';",
        "import { tickTrade } from './economy/trade.js?v=20260912-medieval1';")
replace('js/main.js',
        "import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable, syncNextRaidId } from './military/raiding.js?v=20260912-gunpowder1';",
        "import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable, syncNextRaidId } from './military/raiding.js?v=20260912-medieval1';")
replace('js/main.js',
        "import { syncNextCampaignId, tickCampaigns } from './military/campaigns.js?v=20260912-gunpowder1';",
        "import { syncNextCampaignId, tickCampaigns } from './military/campaigns.js?v=20260912-medieval1';")
