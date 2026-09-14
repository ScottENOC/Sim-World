#!/usr/bin/env python3
from pathlib import Path


def replace_once_if_present(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        return False
    p.write_text(text.replace(old, new, 1))
    return True


def ensure_once(path, marker, anchor, insertion):
    p = Path(path)
    text = p.read_text()
    if marker in text:
        return False
    if anchor not in text:
        raise RuntimeError(f'missing patch anchor in {path}: {anchor[:80]!r}')
    p.write_text(text.replace(anchor, insertion, 1))
    return True

# Tradable bulk fuel. Idempotent because CI may run after the source integration
# has already been committed by an earlier branch push.
ensure_once(
    'js/economy/tradeGoods.js',
    "coal:       { label: 'Coal'",
    "  stone:      { label: 'Stone', basePrice: 0.3, referenceStock: 20000, category: 'bulk', cargoKgPerUnit: 8 },\n",
    "  stone:      { label: 'Stone', basePrice: 0.3, referenceStock: 20000, category: 'bulk', cargoKgPerUnit: 8 },\n"
    "  coal:       { label: 'Coal', basePrice: 0.9, referenceStock: 12000, category: 'bulk_fuel', cargoKgPerUnit: 2.5 },\n",
)

# Mining allocation and merchant-sale buffer.
replace_once_if_present(
    'js/economy/laborCore.js',
    "const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, salt: 2.2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };",
    "const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, coal: 2.4, clay: 1, gold: 2, salt: 2.2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };",
)
replace_once_if_present(
    'js/economy/laborCore.js',
    "const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, clay: 1000 };",
    "const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, coal: 3500, clay: 1000 };",
)

# Coal geology is layered like the older metal resources. Exhausting accessible
# seams does not erase later industrial reserves: shaft mining exposes a much
# larger middle tier, and steam pumping/deep-mining practice exposes deeper seams.
coal_three_tier = """    if (!region.deposits.coal) {
      let h = 2166136261;
      for (const c of region.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      const coalSignal = (h >>> 0) / 4294967295;
      const sedimentary = 0.35 + Math.min(0.45, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 85) * 0.25);
      if (coalSignal < sedimentary) {
        const scale = Math.max(1, region.areaSqKm);
        const outcrop = Math.round(scale * (35 + coalSignal * 55));
        const shaft = Math.round(scale * (145 + coalSignal * 230));
        const deep = Math.round(scale * (420 + coalSignal * 720));
        region.deposits.coal = { tiers: [
          { id: 'surface', label: 'Outcropping and shallow coal seams', initialStock: outcrop, remainingStock: outcrop, difficulty: 0.20, requiredTechId: null, maxWorkers: Math.max(10, Math.round(scale * 0.02)) },
          { id: 'shaft', label: 'Shaft-accessible coal seams', initialStock: shaft, remainingStock: shaft, difficulty: 0.38, requiredTechId: 'deep_mining', maxWorkers: Math.max(28, Math.round(scale * 0.055)) },
          { id: 'deep', label: 'Deep water-bearing coal seams', initialStock: deep, remainingStock: deep, difficulty: 0.58, requiredTechId: 'early_steam_pumping', maxWorkers: Math.max(55, Math.round(scale * 0.11)) },
        ] };
      }
    }
"""

p = Path('js/world/region.js')
text = p.read_text()
if "id: 'shaft', label: 'Shaft-accessible coal seams'" not in text:
    old_two_tier_start = "    if (!region.deposits.coal) {\n      let h = 2166136261;"
    clay_anchor = "    if (!region.deposits.clay) {\n      const clayStock = Math.max(50_000, Math.round(region.areaSqKm * 2_000));"
    if old_two_tier_start in text:
        start = text.index(old_two_tier_start)
        end = text.index(clay_anchor, start)
        text = text[:start] + coal_three_tier + text[end:]
        p.write_text(text)
    else:
        ensure_once('js/world/region.js', "region.deposits.coal = { tiers:", clay_anchor, coal_three_tier + clay_anchor)

# Make fuel use physical. Coal assets consume stock each tick; without fuel their
# productivity falls rather than receiving free energy from merely knowing the tech.
ensure_once(
    'js/economy/protoIndustry.js',
    'let coalAvailableStock = Math.max(0, region.stockpile.coal || 0);',
    "function operateAssets(region, years) {\n  const s = ensureProtoIndustryState(region);\n  let power = 0, productivity = 0, coalUse = 0;",
    "function operateAssets(region, years) {\n  const s = ensureProtoIndustryState(region);\n  let power = 0, productivity = 0, coalUse = 0;\n  region.stockpile ||= {};\n  let coalAvailableStock = Math.max(0, region.stockpile.coal || 0);",
)
ensure_once(
    'js/economy/protoIndustry.js',
    'asset.productivity *= fuelRatio;',
    "    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35));\n    if (['water_mill','wind_mill','fulling_mill','saw_mill','trip_hammer','steam_pump'].includes(asset.type)) power += asset.productivity * (asset.type === 'steam_pump' ? 1.6 : 1);",
    "    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35));\n    if (asset.type === 'coal_kiln' || asset.type === 'steam_pump') {\n      const annualFuel = asset.type === 'steam_pump' ? 28 : 18;\n      const wanted = annualFuel * years * asset.productivity;\n      const burned = Math.min(coalAvailableStock, wanted);\n      const fuelRatio = wanted > 0 ? burned / wanted : 1;\n      coalAvailableStock -= burned;\n      region.stockpile.coal = Math.max(0, (region.stockpile.coal || 0) - burned);\n      coalUse += burned;\n      asset.productivity *= fuelRatio;\n    }\n    if (['water_mill','wind_mill','fulling_mill','saw_mill','trip_hammer','steam_pump'].includes(asset.type)) power += asset.productivity * (asset.type === 'steam_pump' ? 1.6 : 1);",
)
replace_once_if_present(
    'js/economy/protoIndustry.js',
    "    if (asset.type === 'coal_kiln' || asset.type === 'steam_pump') coalUse += asset.productivity;\n",
    "",
)

print('coal resource integration applied')
