from pathlib import Path

# Currency snapshots carry reserve/peg/common-currency fields to trade contacts.
p=Path('js/economy/currency.js'); t=p.read_text()
if 'reserveCurrencyScore: Number(currency.reserveCurrencyScore)' not in t:
    t=t.replace("    policyRate: Number(currency.policyRate) || 0,\n    generation: currency.generation || 1,", "    policyRate: Number(currency.policyRate) || 0,\n    reserveCurrencyScore: Number(currency.reserveCurrencyScore) || 0,\n    peg: currency.peg ? { ...currency.peg } : null,\n    unionId: currency.unionId || null,\n    generation: currency.generation || 1,")
if "if (!Number.isFinite(currency.reserveCurrencyScore))" not in t:
    t=t.replace("  if (!Number.isFinite(currency.reserveValue)) currency.reserveValue = 0;", "  if (!Number.isFinite(currency.reserveValue)) currency.reserveValue = 0;\n  if (!Number.isFinite(currency.reserveCurrencyScore)) currency.reserveCurrencyScore = 0;\n  if (currency.peg === undefined) currency.peg = null;")
p.write_text(t)

# Pegged currencies derive value partly from their anchor while credibility holds.
p=Path('js/economy/forex.js'); t=p.read_text()
old="""  const fineness = clamp(c.fineness ?? 1, 0.15, 1);
  const trust = clamp(c.trust ?? 0);
  return fineness * (0.72 + trust * 0.28);
"""
new="""  const fineness = clamp(c.fineness ?? 1, 0.15, 1);
  const trust = clamp(c.trust ?? 0);
  const ownValue = fineness * (0.72 + trust * 0.28);
  if (c.peg?.anchorCurrencyId && Number.isFinite(c.peg.anchorCommodityValue) && Number.isFinite(c.peg.targetRate)) {
    const credibility = clamp(c.peg.credibility ?? 0);
    const peggedValue = Math.max(0.001, c.peg.anchorCommodityValue * c.peg.targetRate);
    return ownValue * (1 - credibility) + peggedValue * credibility;
  }
  return ownValue;
"""
if old in t:t=t.replace(old,new)
p.write_text(t)

# Trade may settle through a liquid third currency and accumulates working foreign reserves.
p=Path('js/economy/trade.js'); t=p.read_text()
imp="import { internationalSettlementPlan, recordInternationalSettlement } from './internationalMoney.js?v=20260918-intmoney1';\n"
anchor="import { currencyTradeFriction, recordCurrencyContact } from './currency.js?v=20260912-currency3';\n"
if imp not in t:t=t.replace(anchor,anchor+imp)
old="""function combinedTradeFriction(regionA, regionB) {
  return currencyTradeFriction(regionA, regionB) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB) *
    medievalTradeFrictionMultiplier(regionA) * medievalTradeFrictionMultiplier(regionB);
}
"""
new="""function combinedTradeFriction(regionA, regionB) {
  const directCurrency = currencyTradeFriction(regionA, regionB);
  const internationalCurrency = internationalSettlementPlan(regionA, regionB).friction;
  return Math.min(directCurrency, internationalCurrency) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB) *
    medievalTradeFrictionMultiplier(regionA) * medievalTradeFrictionMultiplier(regionB);
}
"""
if old in t:t=t.replace(old,new)
needle="""    recordCurrencyContact(origin, dest, currentTick);
    recordDiplomaticTrade(origin, dest, payment, currentTick);
"""
replacement="""    recordCurrencyContact(origin, dest, currentTick);
    recordInternationalSettlement(origin, dest, payment);
    recordDiplomaticTrade(origin, dest, payment, currentTick);
"""
if needle in t:t=t.replace(needle,replacement)
p.write_text(t)

# Country tick owns the quarterly international monetary review; main supplies agreements.
p=Path('js/politics/polities.js'); t=p.read_text()
imp="import { ensureInternationalMonetaryState, tickInternationalMonetarySystem } from '../economy/internationalMoney.js?v=20260918-intmoney1';\n"
anchor="import { ensureMonetaryInstitution, tickMonetaryModernisation } from '../economy/monetaryModernisation.js?v=20260918-money1';\n"
if imp not in t:t=t.replace(anchor,anchor+imp)
if 'ensureInternationalMonetaryState(polity);' not in t:
    t=t.replace('    ensureMonetaryInstitution(polity);', '    ensureMonetaryInstitution(polity);\n    ensureInternationalMonetaryState(polity);')
t=t.replace('export function tickPolities(polities, regions, currentTick, elapsedDays = 7) {', 'export function tickPolities(polities, regions, currentTick, elapsedDays = 7, options = {}) {')
needle='''  for (const region of regions) {
    if (!region.militaryThreat) region.militaryThreat = { lastRaidedTick: null, recentRaids: 0 };
'''
if 'tickInternationalMonetarySystem(polities, regions' not in t:
    t=t.replace(needle, "  events.push(...tickInternationalMonetarySystem(polities, regions, options.agreements || [], elapsedDays, currentTick));\n\n"+needle)
p.write_text(t)

p=Path('js/main.js'); t=p.read_text()
t=t.replace("tickPolities(polities, regions, calendarWeek, time.elapsedDays)", "tickPolities(polities, regions, calendarWeek, time.elapsedDays, { agreements })")
p.write_text(t)

print('international monetary integration applied')
