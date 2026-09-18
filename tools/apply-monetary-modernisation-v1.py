from pathlib import Path

# Trade silver as specie alongside gold.
p=Path('js/economy/tradeGoods.js'); t=p.read_text()
if "silver:     { label: 'Silver'" not in t:
    t=t.replace("  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material', cargoKgPerUnit: 0.2 },", "  gold:       { label: 'Gold', basePrice: 40, referenceStock: 200, category: 'raw_material', cargoKgPerUnit: 0.2 },\n  silver:     { label: 'Silver', basePrice: 6, referenceStock: 900, category: 'raw_material', cargoKgPerUnit: 0.35 },")
p.write_text(t)

# Add monetary state to currency snapshots and persistent institution state.
p=Path('js/economy/currency.js'); t=p.read_text()
if "regime: currency.regime" not in t:
    t=t.replace("    fineness: clamp(currency.fineness),\n    generation: currency.generation || 1,", "    fineness: clamp(currency.fineness),\n    regime: currency.regime || 'silver_standard',\n    reserveCoverage: Number(currency.reserveCoverage) || 0,\n    inflation: Number(currency.inflation) || 0,\n    policyRate: Number(currency.policyRate) || 0,\n    generation: currency.generation || 1,")
if "monetaryBase: 0" not in t:
    t=t.replace("      seigniorageRaised: 0,\n      history: [],", "      seigniorageRaised: 0,\n      monetaryBase: 0,\n      backingMetal: 'silver',\n      reserveValue: 0,\n      regime: 'silver_standard',\n      reserveCoverage: 0,\n      inflation: 0,\n      policyRate: 0,\n      history: [],")
    t=t.replace("  if (!Number.isFinite(currency.seigniorageRaised)) currency.seigniorageRaised = 0;", "  if (!Number.isFinite(currency.seigniorageRaised)) currency.seigniorageRaised = 0;\n  if (!Number.isFinite(currency.monetaryBase)) currency.monetaryBase = 0;\n  if (!Number.isFinite(currency.reserveValue)) currency.reserveValue = 0;")
# Debasement windfall is now limited by actually minted monetary base, not a revenue proxy.
old="""  const annualRevenueProxy = Math.max(0, capital.militaryFinance?.revenueEma || 0) * 52;
  const monetaryBaseProxy = Math.max(10, annualRevenueProxy * 1.5 + Math.max(0, capital.treasury || 0) * 0.25);
  const windfall = monetaryBaseProxy * actualDebasement * 0.9;
"""
new="""  const monetaryBaseProxy = Math.max(0, currency.monetaryBase || 0);
  const windfall = monetaryBaseProxy * actualDebasement * 0.9;
"""
if old in t:t=t.replace(old,new)
p.write_text(t)

# Polities own the country-level monetary institution and publish conditions to territories.
p=Path('js/politics/polities.js'); t=p.read_text()
imp="import { ensureMonetaryInstitution, tickMonetaryModernisation } from '../economy/monetaryModernisation.js?v=20260918-money1';\n"
anchor="import { ensureCurrencyInstitution, tickCurrencyInstitution } from '../economy/currency.js?v=20260912-currency3';\n"
if imp not in t:t=t.replace(anchor,anchor+imp)
if 'ensureMonetaryInstitution(polity);' not in t:
    t=t.replace('    ensureCurrencyInstitution(polity);', '    ensureCurrencyInstitution(polity);\n    ensureMonetaryInstitution(polity);')
if 'tickMonetaryModernisation(polity, capital, regions' not in t:
    t=t.replace('    events.push(...tickCurrencyInstitution(polity, capital, regions, elapsedDays, currentTick));', "    events.push(...tickCurrencyInstitution(polity, capital, regions, elapsedDays, currentTick));\n    tickMonetaryModernisation(polity, capital, regions, elapsedDays);")
p.write_text(t)

# Sovereign borrowing now uses the central-bank benchmark plus sovereign risk premium when available.
p=Path('js/economy/stateFinance.js'); t=p.read_text()
old="const annualInterestRate = 0.025 + (1 - stateCredit) * 0.09 + Math.min(0.18, debtBurden * 0.025);"
new="const annualInterestRate = Math.max(0.001, region.monetaryConditions?.sovereignRate ?? (0.025 + (1 - stateCredit) * 0.09 + Math.min(0.18, debtBurden * 0.025)));"
if old in t:t=t.replace(old,new)
p.write_text(t)

# Firms face benchmark interest plus firm risk instead of leverage only affecting solvency.
p=Path('js/economy/corporateCapital.js'); t=p.read_text()
if "commercialRiskPremium" not in t.splitlines()[0:5]:
    t="import { commercialRiskPremium } from './monetaryModernisation.js?v=20260918-money1';\n"+t
needle="const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28 + externalityProfile.apparentCostSaving*.22;"
replacement="const borrowingRate=Math.max(0,region.monetaryConditions?.commercialBaseRate||0.04)+commercialRiskPremium(region,firm);firm.borrowingRate=borrowingRate;const interestDrag=Math.min(.22,borrowingRate*leverage*.8);const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28 + externalityProfile.apparentCostSaving*.22-interestDrag;"
if needle in t:t=t.replace(needle,replacement)
p.write_text(t)

print('monetary modernisation integration applied')