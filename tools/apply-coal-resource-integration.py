#!/usr/bin/env python3
from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'missing patch anchor in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))

# Tradable bulk fuel.
replace('js/economy/tradeGoods.js',
"  stone:      { label: 'Stone', basePrice: 0.3, referenceStock: 20000, category: 'bulk', cargoKgPerUnit: 8 },\n",
"  stone:      { label: 'Stone', basePrice: 0.3, referenceStock: 20000, category: 'bulk', cargoKgPerUnit: 8 },\n  coal:       { label: 'Coal', basePrice: 0.9, referenceStock: 12000, category: 'bulk_fuel', cargoKgPerUnit: 2.5 },\n")

# Mining allocation and merchant-sale buffer.
replace('js/economy/laborCore.js',
"const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, salt: 2.2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };",
"const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, coal: 2.4, clay: 1, gold: 2, salt: 2.2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };")
replace('js/economy/laborCore.js',
"const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, clay: 1000 };",
"const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, coal: 3500, clay: 1000 };")

# Add deterministic coal geology at load time. Coal is widespread but not universal;
# the first tier can be worked with ordinary mining, deeper seams require shaft/deep mining.
replace('js/world/region.js',
"    if (!region.deposits.clay) {\n      const clayStock = Math.max(50_000, Math.round(region.areaSqKm * 2_000));",
"    if (!region.deposits.coal) {\n      let h = 2166136261;\n      for (const c of region.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);\n      const coalSignal = (h >>> 0) / 4294967295;\n      const sedimentary = 0.35 + Math.min(0.45, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 85) * 0.25);\n      if (coalSignal < sedimentary) {\n        const scale = Math.max(1, region.areaSqKm);\n        const surface = Math.round(scale * (45 + coalSignal * 80));\n        const deep = Math.round(scale * (180 + coalSignal * 260));\n        region.deposits.coal = { tiers: [\n          { id: 'surface', label: 'Shallow coal seams', initialStock: surface, remainingStock: surface, difficulty: 0.22, requiredTechId: null, maxWorkers: Math.max(12, Math.round(scale * 0.025)) },\n          { id: 'deep', label: 'Deep coal seams', initialStock: deep, remainingStock: deep, difficulty: 0.42, requiredTechId: 'deep_mining', maxWorkers: Math.max(30, Math.round(scale * 0.06)) },\n        ] };\n      }\n    }\n    if (!region.deposits.clay) {\n      const clayStock = Math.max(50_000, Math.round(region.areaSqKm * 2_000));")

# Make fuel use physical. Coal assets consume stock each tick; without fuel their
# productivity falls rather than receiving free energy from merely knowing the tech.
replace('js/economy/protoIndustry.js',
"function operateAssets(region, years) {\n  const s = ensureProtoIndustryState(region);\n  let power = 0, productivity = 0, coalUse = 0;",
"function operateAssets(region, years) {\n  const s = ensureProtoIndustryState(region);\n  let power = 0, productivity = 0, coalUse = 0;\n  region.stockpile ||= {};\n  let coalAvailableStock = Math.max(0, region.stockpile.coal || 0);")
replace('js/economy/protoIndustry.js',
"    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35));\n    if (['water_mill','wind_mill','fulling_mill','saw_mill','trip_hammer','steam_pump'].includes(asset.type)) power += asset.productivity * (asset.type === 'steam_pump' ? 1.6 : 1);",
"    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35));\n    if (asset.type === 'coal_kiln' || asset.type === 'steam_pump') {\n      const annualFuel = asset.type === 'steam_pump' ? 28 : 18;\n      const wanted = annualFuel * years * asset.productivity;\n      const burned = Math.min(coalAvailableStock, wanted);\n      const fuelRatio = wanted > 0 ? burned / wanted : 1;\n      coalAvailableStock -= burned;\n      region.stockpile.coal = Math.max(0, (region.stockpile.coal || 0) - burned);\n      coalUse += burned;\n      asset.productivity *= fuelRatio;\n    }\n    if (['water_mill','wind_mill','fulling_mill','saw_mill','trip_hammer','steam_pump'].includes(asset.type)) power += asset.productivity * (asset.type === 'steam_pump' ? 1.6 : 1);")
replace('js/economy/protoIndustry.js',
"    if (asset.type === 'coal_kiln' || asset.type === 'steam_pump') coalUse += asset.productivity;\n",
"")

print('coal resource integration applied')
