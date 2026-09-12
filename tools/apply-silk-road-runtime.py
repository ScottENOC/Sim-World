#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if old not in text:
        raise RuntimeError(f'{path}: expected text not found: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# Safari/module/data cache keys for the expanded static world.
replace('js/main.js',
        "import { loadWorld } from './world/region.js?v=20260905-infra1';",
        "import { loadWorld } from './world/region.js?v=20260912-silkroad1';")
replace('js/main.js',
        "import { loadSeaWorld, linkSeaAdjacency } from './world/seaRegion.js?v=20260904-weather1';",
        "import { loadSeaWorld, linkSeaAdjacency } from './world/seaRegion.js?v=20260912-silkroad1';")

# Put the eastern geography into the existing nested start-region picker.
replace('js/main.js',
        "      'IRN': { continent: 'Asia', country: 'Western Iran' },",
        "      'IRN': { continent: 'Asia', country: 'Western Iran' },\n"
        "      'KAZ': { continent: 'Asia', country: 'Kazakh Steppe' },\n"
        "      'TKM': { continent: 'Asia', country: 'Turkmenistan' },\n"
        "      'UZB': { continent: 'Asia', country: 'Transoxiana' },\n"
        "      'KGZ': { continent: 'Asia', country: 'Tian Shan Valleys' },\n"
        "      'TJK': { continent: 'Asia', country: 'Pamir & Tajik Valleys' },\n"
        "      'AFG': { continent: 'Asia', country: 'Afghanistan' },\n"
        "      'PAK': { continent: 'Asia', country: 'Indus & Northwest' },\n"
        "      'CHN': { continent: 'Asia', country: 'China' },\n"
        "      'MNG': { continent: 'Asia', country: 'Mongolian Steppe' },")

replace('js/world/region.js',
        "    fetch('data/world/resources.initial.json?v=20260904-weather1'),\n    fetch('data/world/terrain.initial.json?v=20260908-terrain1'),",
        "    fetch('data/world/resources.initial.json?v=20260912-silkroad1'),\n    fetch('data/world/terrain.initial.json?v=20260912-silkroad1'),")
replace('js/world/region.js',
        "    region.landQuality = endowment.landQuality;",
        "    region.landQuality = endowment.landQuality;\n    region.specialResources = { ...(endowment.specialResources || {}) };")

replace('js/world/seaRegion.js',
        "    fetch('data/world/seaRegions.geo.json'),\n    fetch('data/world/seaRegions.meta.json'),",
        "    fetch('data/world/seaRegions.geo.json?v=20260912-silkroad1'),\n    fetch('data/world/seaRegions.meta.json?v=20260912-silkroad1'),")

# Strategic/luxury eastern goods become ordinary merchant cargo. Gunpowder is
# deliberately NOT added here; later technology must discover how to combine
# saltpetre, sulfur and charcoal.
replace('js/economy/tradeGoods.js',
        "  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material', cargoKgPerUnit: 0.2 },",
        "  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material', cargoKgPerUnit: 0.2 },\n"
        "  saltpetre:  { label: 'Saltpetre', basePrice: 5, referenceStock: 1200, category: 'raw_material', cargoKgPerUnit: 1 },\n"
        "  sulfur:     { label: 'Sulfur', basePrice: 4, referenceStock: 800, category: 'raw_material', cargoKgPerUnit: 1 },\n"
        "  silk:       { label: 'Silk', basePrice: 18, referenceStock: 250, category: 'luxury', cargoKgPerUnit: 0.15 },")

# Let pre-gunpowder economies mine modest quantities of the chemical inputs as
# useful mineral commodities, without giving them knowledge of gunpowder.
replace('js/economy/laborCore.js',
        "const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, stone: 1 };",
        "const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, saltpetre: 1.4, sulfur: 1.2, stone: 1 };")
replace('js/economy/laborCore.js',
        "    const backgroundResources = openResources.filter((key) => key === 'gold' || key === 'stone');",
        "    const backgroundResources = openResources.filter((key) => ['gold', 'stone', 'saltpetre', 'sulfur'].includes(key));")

# Sericulture shares the textile labour pool; high silk potential shifts part
# of rural textile output into a light, valuable export rather than creating
# free output on top of ordinary cloth.
replace('js/economy/laborCore.js',
        "  const textilesMade = textileWorkers * TEXTILES_PER_WORKER * weekScale * skillMultiplier(region, 'textiles');\n  region.stockpile.textiles = (region.stockpile.textiles || 0) + textilesMade;",
        "  const rawTextileOutput = textileWorkers * TEXTILES_PER_WORKER * weekScale * skillMultiplier(region, 'textiles');\n"
        "  const silkPotential = Math.max(0, Number(region.specialResources?.silk) || 0);\n"
        "  const silkLaborShare = Math.min(0.45, silkPotential * 0.25);\n"
        "  const textilesMade = rawTextileOutput * (1 - silkLaborShare);\n"
        "  const silkMade = rawTextileOutput * silkLaborShare * 0.6;\n"
        "  region.stockpile.textiles = (region.stockpile.textiles || 0) + textilesMade;\n"
        "  region.stockpile.silk = (region.stockpile.silk || 0) + silkMade;")
replace('js/economy/laborCore.js',
        "    pitch: pitchMade, textiles: textilesMade, clothes: clothesMade, tailors: Math.round(tailors) };",
        "    pitch: pitchMade, textiles: textilesMade, silk: silkMade, clothes: clothesMade, tailors: Math.round(tailors) };")

# Bust trade module dependencies after adding goods.
replace('js/economy/prices.js',
        "import { TRADE_GOODS, TRADABLE_RESOURCES } from './tradeGoods.js?v=20260905-goods1';",
        "import { TRADE_GOODS, TRADABLE_RESOURCES } from './tradeGoods.js?v=20260912-silkroad1';")
replace('js/economy/trade.js',
        "import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260905-goods1';",
        "import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260912-silkroad1';")
replace('js/economy/trade.js',
        "import { cargoKgPerUnit } from './tradeGoods.js?v=20260905-goods2';",
        "import { cargoKgPerUnit } from './tradeGoods.js?v=20260912-silkroad1';")
replace('js/main.js',
        "import { tickEconomy } from './economy/labor.js?v=20260905-projects1';",
        "import { tickEconomy } from './economy/labor.js?v=20260912-silkroad1';")
replace('js/main.js',
        "import { tickTrade } from './economy/trade.js?v=20260912-currency2';",
        "import { tickTrade } from './economy/trade.js?v=20260912-silkroad1';")
