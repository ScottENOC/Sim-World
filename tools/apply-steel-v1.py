from pathlib import Path

# breakthroughs integration
p=Path('js/technology/breakthroughs.js'); s=p.read_text()
needle="import { GUNPOWDER_TECH_ID } from '../military/firearms.js?v=20260912-gunpowder1';\n"
if "STEELMAKING_TECH_ID" not in s:
    s=s.replace(needle, needle+"import { STEELMAKING_TECH_ID, steelmakingBreakthroughChance, tickSteelIndustry, tickSteelMilitaryAdoption } from './steel.js?v=20260912-steel1';\n")
    s=s.replace("export { GUNPOWDER_TECH_ID };", "export { GUNPOWDER_TECH_ID, STEELMAKING_TECH_ID };")
    s=s.replace("  const gunpowderDiscoveries = regions.filter((region) => rng() < chance(gunpowderBreakthroughChance(region, regionsById, currentTick)));",
                "  const gunpowderDiscoveries = regions.filter((region) => rng() < chance(gunpowderBreakthroughChance(region, regionsById, currentTick)));\n  const steelDiscoveries = regions.filter((region) => rng() < chance(steelmakingBreakthroughChance(region, regionsById, currentTick)));")
    marker="  for (const region of gunpowderDiscoveries) {"
    block="  for (const region of steelDiscoveries) {\n    region.unlockedTechIds.add(STEELMAKING_TECH_ID);\n    region.steelIndustry ||= {};\n    region.steelIndustry.readiness = Math.max(0.03, region.steelIndustry.readiness || 0);\n    events.push({ type: 'steelmaking_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });\n  }\n"
    s=s.replace(marker, block+marker)
    # add ongoing steel production/adoption after iron industry progression
    target="  for (const region of regions) advanceIronIndustry(region);"
    s=s.replace(target, target+"\n  for (const region of regions) { tickSteelIndustry(region, elapsedDays); tickSteelMilitaryAdoption(region, elapsedDays); }")
p.write_text(s)

# trade good
p=Path('js/economy/tradeGoods.js'); s=p.read_text()
if "steel:" not in s:
    s=s.replace("  iron:       { label: 'Iron', basePrice: 24, referenceStock: 1500, category: 'material', cargoKgPerUnit: 1 },",
                "  iron:       { label: 'Iron', basePrice: 24, referenceStock: 1500, category: 'material', cargoKgPerUnit: 1 },\n  steel:      { label: 'Steel', basePrice: 70, referenceStock: 350, category: 'material', strategic: true, cargoKgPerUnit: 1 },")
p.write_text(s)

# formation combat quality
p=Path('js/military/formations.js'); s=p.read_text()
if "steelMilitaryQualityMultiplier" not in s:
    s=s.replace("import { recordSocietalMemory } from '../society/societalMemoryEvents.js?v=20260907-memory2';",
                "import { recordSocietalMemory } from '../society/societalMemoryEvents.js?v=20260907-memory2';\nimport { steelMilitaryQualityMultiplier } from '../technology/steel.js?v=20260912-steel1';")
    s=s.replace("export function formationCombatMultiplier(region, terrain = null) {\n  return 1 + Math.min(0.34, summedFormationEffect(region, 'combatBonus', terrain));\n}",
                "export function formationCombatMultiplier(region, terrain = null) {\n  return (1 + Math.min(0.34, summedFormationEffect(region, 'combatBonus', terrain))) * steelMilitaryQualityMultiplier(region);\n}")
p.write_text(s)

# cache bust chain
for path in ['js/economy/prices.js','js/economy/trade.js','js/main.js']:
    p=Path(path); s=p.read_text()
    s=s.replace("tradeGoods.js?v=20260912-gunpowder1", "tradeGoods.js?v=20260912-steel1")
    s=s.replace("prices.js?v=20260912-gunpowder1", "prices.js?v=20260912-steel1")
    s=s.replace("breakthroughs.js?v=20260912-gunpowder1", "breakthroughs.js?v=20260912-steel1")
    s=s.replace("formations.js?v=20260912-medieval1", "formations.js?v=20260912-steel1")
    p.write_text(s)

# remove helper workflow after commit handled by workflow
