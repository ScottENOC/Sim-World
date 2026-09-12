#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'{path}: expected text not found: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# --- technology breakthrough ---
replace('js/technology/breakthroughs.js',
        "import { tickClassicalBreakthroughs } from './classicalTransition.js?v=20260907-classical1';",
        "import { tickClassicalBreakthroughs } from './classicalTransition.js?v=20260907-classical1';\nimport { GUNPOWDER_TECH_ID } from '../military/firearms.js?v=20260912-gunpowder1';\n\nexport { GUNPOWDER_TECH_ID };")
replace('js/technology/breakthroughs.js',
        "const CIVIL_ENGINEERING_DIFFUSION_CHANCE = 0.0015;",
        "const CIVIL_ENGINEERING_DIFFUSION_CHANCE = 0.0015;\nconst MAX_LOCAL_GUNPOWDER_DISCOVERY_CHANCE = 4.5e-7;\nconst MAX_NETWORK_GUNPOWDER_DISCOVERY_CHANCE = 1.5e-7;\nconst GUNPOWDER_DIFFUSION_CHANCE_PER_PARTNER = 0.0012;")
anchor = "function smithingKnowledge(region) {\n"
insert = """function recentTradePartnerRegions(region, regionsById, currentTick = null) {
  const ids = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.entries()]
        .filter(([, lastTradeTick]) => currentTick === null || currentTick - lastTradeTick <= TRADE_DIFFUSION_MEMORY_WEEKS)
        .map(([id]) => id)
    : [...(region.tradePartnerIds || [])];
  return ids.map((id) => regionsById.get(id)).filter(Boolean);
}

function hasGunpowderIngredient(region, ingredient) {
  if (ingredient === 'wood') {
    return (region.stockpile?.wood || 0) > 5 || (region.forest?.currentStock || 0) > 100;
  }
  return (region.stockpile?.[ingredient] || 0) > 1 || Boolean(region.deposits?.[ingredient]);
}

export function gunpowderBreakthroughChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds.has(GUNPOWDER_TECH_ID)) return 0;
  const partners = recentTradePartnerRegions(region, regionsById, currentTick);
  const ingredients = ['saltpetre', 'sulfur', 'wood'];
  const localComplete = ingredients.every((ingredient) => hasGunpowderIngredient(region, ingredient));
  const networkComplete = ingredients.every((ingredient) =>
    hasGunpowderIngredient(region, ingredient) || partners.some((partner) => hasGunpowderIngredient(partner, ingredient)));

  const experimentalExperience = Math.max(0, effectiveExperience(region, 'mining')) * 0.35 +
    Math.max(0, effectiveExperience(region, 'smithing')) * 0.35 +
    Math.max(0, effectiveExperience(region, 'pottery')) * 0.30;
  const experimentation = 1 - Math.exp(-experimentalExperience / 180_000);
  const independent = localComplete
    ? (0.10 + experimentation * 0.90) * MAX_LOCAL_GUNPOWDER_DISCOVERY_CHANCE
    : networkComplete
      ? (0.08 + experimentation * 0.92) * MAX_NETWORK_GUNPOWDER_DISCOVERY_CHANCE
      : 0;

  const knowledgeablePartners = partners.filter((partner) => partner.unlockedTechIds.has(GUNPOWDER_TECH_ID)).length;
  const diffusion = 1 - Math.pow(1 - GUNPOWDER_DIFFUSION_CHANCE_PER_PARTNER, knowledgeablePartners);
  return 1 - (1 - independent) * (1 - diffusion);
}

"""
replace('js/technology/breakthroughs.js', anchor, insert + anchor)
replace('js/technology/breakthroughs.js',
        "  const drainageDiscoveries = regions.filter((region) => rng() < chance(mineDrainageChance(region, regionsById)));",
        "  const drainageDiscoveries = regions.filter((region) => rng() < chance(mineDrainageChance(region, regionsById)));\n  const gunpowderDiscoveries = regions.filter((region) => rng() < chance(gunpowderBreakthroughChance(region, regionsById, currentTick)));")
replace('js/technology/breakthroughs.js',
        "  for (const region of hillFortDiscoveries) {",
        "  for (const region of gunpowderDiscoveries) {\n    region.unlockedTechIds.add(GUNPOWDER_TECH_ID);\n    region.firearms ||= {};\n    region.firearms.readiness = Math.max(0.02, region.firearms.readiness || 0);\n    events.push({\n      type: 'gunpowder_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick,\n      title: 'Gunpowder discovered',\n      message: `${region.name} has discovered a powerful explosive mixture of saltpetre, sulfur and charcoal.`,\n    });\n  }\n  for (const region of hillFortDiscoveries) {")

# --- strategic trade goods ---
replace('js/economy/tradeGoods.js',
        "  iron_weapons:   { label: 'New iron weapons & armour', basePrice: 60, referenceStock: 100, category: 'military_equipment', strategic: true, cargoKgPerUnit: 5 },",
        "  iron_weapons:   { label: 'New iron weapons & armour', basePrice: 60, referenceStock: 100, category: 'military_equipment', strategic: true, cargoKgPerUnit: 5 },\n  gunpowder:      { label: 'Gunpowder', basePrice: 28, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 1 },\n  firearms:       { label: 'Firearms', basePrice: 95, referenceStock: 120, category: 'military_equipment', strategic: true, cargoKgPerUnit: 4 },")

# --- campaign combat ---
replace('js/military/campaigns.js',
        "import { counterLogisticsCombatProfile } from './counterLogisticsAi.js?v=20260909-counter-logistics1';",
        "import { counterLogisticsCombatProfile } from './counterLogisticsAi.js?v=20260909-counter-logistics1';\nimport { firearmCombatProfile } from './firearms.js?v=20260912-gunpowder1';")
replace('js/military/campaigns.js',
        "  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1);\n  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain);",
        "  const attackerFirearms = firearmCombatProfile(attacker, defender, campaign.personnel, { consumeSupplies: true, elapsedDays: 7 });\n  const defenderFirearms = firearmCombatProfile(defender, attacker, defender.army.personnel, { consumeSupplies: true, elapsedDays: 7 });\n  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier;\n  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier;")
replace('js/military/campaigns.js',
        "    logisticsStatus: campaign.logisticsState?.status || null, routeReliability: campaign.logisticsState?.routeReliability ?? null };",
        "    logisticsStatus: campaign.logisticsState?.status || null, routeReliability: campaign.logisticsState?.routeReliability ?? null,\n    attackerFirearms, defenderFirearms };")

# --- raid combat ---
replace('js/military/raiding.js',
        "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';",
        "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';\nimport { firearmCombatProfile } from './firearms.js?v=20260912-gunpowder1';")
replace('js/military/raiding.js',
        "  const attackerPower = raidingPersonnel * attackerEquip * maritimeAssaultBonus * attackerSeaSkill * militaryReadiness(attacker) *\n    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker));\n  const defenderPower = defender.army.personnel * defenderEquip * DEFENDER_HOME_ADVANTAGE * defenderSeaSkill *\n    postureProfile(defender).raidDefence * militaryReadiness(defender) *\n    armyCohesionMultiplier(defender) * horseMilitaryMultiplier(defender) * hillFortDefenceMultiplier(defender) *\n    settlementDefenceMultiplier(defender);",
        "  const attackerFirearms = firearmCombatProfile(attacker, defender, raidingPersonnel, { consumeSupplies: true, elapsedDays: 7 });\n  const defenderFirearms = firearmCombatProfile(defender, attacker, defender.army.personnel, { consumeSupplies: true, elapsedDays: 7 });\n  const attackerPower = raidingPersonnel * attackerEquip * maritimeAssaultBonus * attackerSeaSkill * militaryReadiness(attacker) *\n    armyCohesionMultiplier(attacker) * (viaSea ? 1 : horseMilitaryMultiplier(attacker)) * attackerFirearms.multiplier;\n  const defenderPower = defender.army.personnel * defenderEquip * DEFENDER_HOME_ADVANTAGE * defenderSeaSkill *\n    postureProfile(defender).raidDefence * militaryReadiness(defender) *\n    armyCohesionMultiplier(defender) * horseMilitaryMultiplier(defender) * hillFortDefenceMultiplier(defender) *\n    settlementDefenceMultiplier(defender) * defenderFirearms.multiplier;")
replace('js/military/raiding.js',
        "    treasuryStolen, stabilityLoss,\n    maritimeAssaultBonus, lootValue };",
        "    treasuryStolen, stabilityLoss,\n    maritimeAssaultBonus, attackerFirearms, defenderFirearms, lootValue };")

# --- world tick and cache chain ---
replace('js/main.js',
        "import { tickBreakthroughs, IRON_SMELTING_TECH_ID, ADVANCED_BOATBUILDING_TECH_ID, CATAPULT_TECH_ID } from './technology/breakthroughs.js?v=20260905-projects1';",
        "import { tickBreakthroughs, IRON_SMELTING_TECH_ID, ADVANCED_BOATBUILDING_TECH_ID, CATAPULT_TECH_ID } from './technology/breakthroughs.js?v=20260912-gunpowder1';\nimport { tickGunpowderIndustry } from './military/firearms.js?v=20260912-gunpowder1';")
replace('js/main.js',
        "import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable, syncNextRaidId } from './military/raiding.js?v=20260905-projects1';",
        "import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable, syncNextRaidId } from './military/raiding.js?v=20260912-gunpowder1';")
replace('js/main.js',
        "import { syncNextCampaignId, tickCampaigns } from './military/campaigns.js?v=20260905-projects1';",
        "import { syncNextCampaignId, tickCampaigns } from './military/campaigns.js?v=20260912-gunpowder1';")
replace('js/main.js',
        "    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));",
        "    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));\n    profiler.measure('Gunpowder industry', () => tickGunpowderIndustry(regions, time.elapsedDays));")

# trade/prices cache chain after new goods
replace('js/economy/prices.js',
        "import { TRADE_GOODS, TRADABLE_RESOURCES } from './tradeGoods.js?v=20260912-silkroad1';",
        "import { TRADE_GOODS, TRADABLE_RESOURCES } from './tradeGoods.js?v=20260912-gunpowder1';")
replace('js/economy/trade.js',
        "import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260912-silkroad1';",
        "import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260912-gunpowder1';")
replace('js/economy/trade.js',
        "import { cargoKgPerUnit } from './tradeGoods.js?v=20260912-silkroad1';",
        "import { cargoKgPerUnit } from './tradeGoods.js?v=20260912-gunpowder1';")
replace('js/main.js',
        "import { tickTrade } from './economy/trade.js?v=20260912-silkroad1';",
        "import { tickTrade } from './economy/trade.js?v=20260912-gunpowder1';")
