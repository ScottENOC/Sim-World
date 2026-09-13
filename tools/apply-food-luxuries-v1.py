from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'marker not found in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))

# Trade catalogue: salt finally becomes a merchant good; spices and tea are
# compact, high-value cargo suited to long-distance trade.
replace_once('js/economy/tradeGoods.js',
"  silk:       { label: 'Silk', basePrice: 18, referenceStock: 250, category: 'luxury', cargoKgPerUnit: 0.15 },\n",
"  silk:       { label: 'Silk', basePrice: 18, referenceStock: 250, category: 'luxury', cargoKgPerUnit: 0.15 },\n  salt:       { label: 'Salt', basePrice: 1.4, referenceStock: 2400, category: 'preservation', cargoKgPerUnit: 1 },\n  pepper:     { label: 'Pepper', basePrice: 16, referenceStock: 120, category: 'luxury', cargoKgPerUnit: 0.12 },\n  cinnamon:   { label: 'Cinnamon', basePrice: 20, referenceStock: 80, category: 'luxury', cargoKgPerUnit: 0.10 },\n  tea:        { label: 'Tea', basePrice: 9, referenceStock: 240, category: 'luxury', cargoKgPerUnit: 0.15 },\n  cloves:     { label: 'Cloves', basePrice: 34, referenceStock: 45, category: 'luxury', cargoKgPerUnit: 0.08 },\n  nutmeg:     { label: 'Nutmeg and mace', basePrice: 38, referenceStock: 40, category: 'luxury', cargoKgPerUnit: 0.08 },\n")

# Resource metadata. These are cultivated/harvested commodities, not mineral
# deposits, so their source geography lives in foodLuxuries.js.
p = ROOT / 'data/world/resourceTypes.json'
data = json.loads(p.read_text())
for key, label in {
    'pepper':'Pepper','cinnamon':'Cinnamon','tea':'Tea','cloves':'Cloves','nutmeg':'Nutmeg and mace'
}.items():
    data.setdefault(key, {'category':'cultivated_luxury','label':label})
p.write_text(json.dumps(data, indent=2) + '\n')

# Economy integration.
replace_once('js/economy/laborCore.js',
"import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';\n",
"import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';\nimport { applyFoodPreservation, tickFoodLuxuries } from './foodLuxuries.js?v=20260913-food-luxuries1';\n")
replace_once('js/economy/laborCore.js',
"const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };",
"const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, salt: 2.2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };")
replace_once('js/economy/laborCore.js',
"    const backgroundResources = openResources.filter((key) => ['gold', 'stone', 'saltpetre', 'sulfur'].includes(key));",
"    const backgroundResources = openResources.filter((key) => ['gold', 'stone', 'salt', 'saltpetre', 'sulfur'].includes(key));")
replace_once('js/economy/laborCore.js',
"  for (const sea of seaRegions) {\n    const fishRate = 1 - Math.pow(1 - FISH_REGROWTH_RATE, Math.max(0.01, elapsedWeeks(elapsedDays)));\n    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: fishRate });\n  }\n}",
"  for (const sea of seaRegions) {\n    const fishRate = 1 - Math.pow(1 - FISH_REGROWTH_RATE, Math.max(0.01, elapsedWeeks(elapsedDays)));\n    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: fishRate });\n  }\n  tickFoodLuxuries(regions, elapsedDays);\n}")
replace_once('js/economy/laborCore.js',
"    const storage = potteryStorageProfile(region);\n    // Vessels improve both capacity and protection from damp, pests and\n    // contamination. Even full coverage buys seasons rather than immortality.\n    const tickSpoilage = 1 - Math.pow(1 - storage.spoilage, weekScale);\n    foodBalance = Math.min(foodBalance * (1 - tickSpoilage), (foodNeeded / weekScale) * storage.weeks);\n    report.foodStorage = { potteryCoverage: storage.coverage, publicGranaries: storage.granaries, weeks: storage.weeks,\n      spoilage: tickSpoilage };",
"    const storage = potteryStorageProfile(region);\n    const preservation = applyFoodPreservation(region, humanFoodNeeded / weekScale, elapsedDays);\n    // Pottery/granaries protect stored food; preservation methods and salt\n    // reduce losses further without pretending spices magically preserve meat.\n    const preservedSpoilage = storage.spoilage * preservation.spoilageMultiplier;\n    const tickSpoilage = 1 - Math.pow(1 - preservedSpoilage, weekScale);\n    const storageWeeks = storage.weeks + preservation.capacityWeeksBonus;\n    foodBalance = Math.min(foodBalance * (1 - tickSpoilage), (foodNeeded / weekScale) * storageWeeks);\n    report.foodStorage = { potteryCoverage: storage.coverage, publicGranaries: storage.granaries, weeks: storageWeeks,\n      spoilage: tickSpoilage, saltCoverage: preservation.saltCoverage, saltUsed: preservation.saltUsed,\n      preservationMethods: preservation.methods };" )

# Successful trade spreads familiarity with a commodity. This is deliberately
# tied to real delivered cargo rather than global technology unlocks.
replace_once('js/economy/trade.js',
"import { medievalTradeFrictionMultiplier } from './medievalCommercialInstitutions.js?v=20260912-medieval2';\n",
"import { medievalTradeFrictionMultiplier } from './medievalCommercialInstitutions.js?v=20260912-medieval2';\nimport { recordCommodityTrade } from './foodLuxuries.js?v=20260913-food-luxuries1';\n")
replace_once('js/economy/trade.js',
"    recordDirectTrade(origin, dest, venture.soldVolume, currentTick);\n    recordCurrencyContact(origin, dest, currentTick);",
"    recordDirectTrade(origin, dest, venture.soldVolume, currentTick);\n    recordCommodityTrade(origin, dest, venture.resource, venture.soldVolume);\n    recordCurrencyContact(origin, dest, currentTick);")

print('food luxuries v1 integration applied')
