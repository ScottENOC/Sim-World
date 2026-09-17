#!/usr/bin/env python3
from pathlib import Path


def replace_once(path, old, new):
    p = Path(path); s = p.read_text()
    if old not in s:
        raise RuntimeError(f'missing anchor in {path}: {old[:100]!r}')
    p.write_text(s.replace(old, new, 1))

# Refined petroleum products become ordinary trade goods.
p = Path('js/economy/tradeGoods.js'); s = p.read_text()
if "lamp_fuel:" not in s:
    anchor = "  oil:        { label: 'Crude oil', basePrice: 1.5, referenceStock: 9000, category: 'bulk_fuel', cargoKgPerUnit: 1.6 },\n"
    ins = anchor + (
        "  lamp_fuel:  { label: 'Lamp & heating fuel', basePrice: 2.8, referenceStock: 3200, category: 'refined_fuel', cargoKgPerUnit: 1.2 },\n"
        "  petrol:     { label: 'Petrol', basePrice: 3.4, referenceStock: 2600, category: 'refined_fuel', cargoKgPerUnit: 1.0 },\n"
        "  diesel:     { label: 'Diesel & distillate', basePrice: 3.1, referenceStock: 3000, category: 'refined_fuel', cargoKgPerUnit: 1.05 },\n"
        "  heavy_fuel_oil: { label: 'Heavy fuel oil', basePrice: 2.2, referenceStock: 4200, category: 'refined_fuel', cargoKgPerUnit: 1.15 },\n"
        "  aviation_fuel: { label: 'Aviation fuel', basePrice: 4.6, referenceStock: 1200, category: 'refined_fuel', cargoKgPerUnit: 0.95 },\n"
    )
    if anchor not in s: raise RuntimeError('trade goods oil anchor missing')
    s = s.replace(anchor, ins, 1)
    p.write_text(s)

# Household demand prefers refined lamp/heating fuel. Raw crude remains a small
# fallback for primitive seep-era use, not a permanent universal motor fuel.
p = Path('js/economy/householdEnergy.js'); s = p.read_text()
old = """  const available = Math.max(0, Number(region.stockpile.oil) || 0);
  const consumed = Math.min(available, demand.total);
  const ratio = demand.total > 0 ? consumed / demand.total : 0;
  const lightingConsumed = demand.lightingNeed * ratio;
  const heatingConsumed = demand.heatingNeed * ratio;
  region.stockpile.oil = Math.max(0, available - consumed);
"""
new = """  const refinedAvailable = Math.max(0, Number(region.stockpile.lamp_fuel) || 0);
  const crudeAvailable = Math.max(0, Number(region.stockpile.oil) || 0);
  const refinedConsumed = Math.min(refinedAvailable, demand.total);
  const remainingAfterRefined = Math.max(0, demand.total - refinedConsumed);
  const primitiveCrudeCapacity = demand.total * 0.18;
  const crudeConsumed = Math.min(crudeAvailable, remainingAfterRefined, primitiveCrudeCapacity);
  const consumed = refinedConsumed + crudeConsumed;
  const ratio = demand.total > 0 ? consumed / demand.total : 0;
  const lightingConsumed = demand.lightingNeed * ratio;
  const heatingConsumed = demand.heatingNeed * ratio;
  region.stockpile.lamp_fuel = Math.max(0, refinedAvailable - refinedConsumed);
  region.stockpile.oil = Math.max(0, crudeAvailable - crudeConsumed);
"""
if old in s: s = s.replace(old, new, 1)
s = s.replace("state.oilConsumed = consumed;", "state.oilConsumed = crudeConsumed;\n  state.refinedFuelConsumed = refinedConsumed;")
s = s.replace("region.marketDemand.oil = Math.max(0, unmet + demand.total * 0.2);", "region.marketDemand.lamp_fuel = Math.max(0, unmet + demand.total * 0.2);\n  region.marketDemand.oil = Math.max(0, crudeConsumed > 0 ? demand.total * 0.04 : 0);")
s = s.replace("return { ...state, unmetOilDemand: unmet };", "return { ...state, unmetOilDemand: unmet, refinedFuelConsumed, crudeConsumed };")
p.write_text(s)

# Refining ticks after extraction/production but before households and trade.
p = Path('js/main.js'); s = p.read_text()
if "./economy/petroleumRefining.js" not in s:
    s = s.replace("import { tickHouseholdEnergy } from './economy/householdEnergy.js?v=20260917-oil1';",
                  "import { tickHouseholdEnergy } from './economy/householdEnergy.js?v=20260917-oil1';\nimport { tickPetroleumRefining } from './economy/petroleumRefining.js?v=20260917-oil2';", 1)
if "tickPetroleumRefining(region, time.elapsedDays)" not in s:
    anchor = "    for (const region of regions) tickHouseholdEnergy(region, time.elapsedDays);"
    if anchor not in s: raise RuntimeError('household energy loop anchor missing')
    s = s.replace(anchor, "    for (const region of regions) tickPetroleumRefining(region, time.elapsedDays);\n" + anchor, 1)
p.write_text(s)

print('petroleum refining integration applied')
# Triggered after workflow installation.
