from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))
    return True


replace_once(
    'js/economy/corporateCapital.js',
    "    firm.ageYears = Math.max(0, firm.ageYears || 0) + years;\n    const sectorFit = firm.sector === 'shipping' ? (region.isCoastal ? 0.08 : -0.12) : firm.sector === 'long_distance_trade' ? 0.05 : 0;\n",
    "    firm.ageYears = Math.max(0, firm.ageYears || 0) + years;\n    if (firm.form === 'partnership' && firm.ageYears >= 3 && s.charterPractice > 0.4 && (rng?.() ?? Math.random()) < clamp(years * 0.12)) {\n      firm.form = 'chartered_venture';\n      firm.statePrivilege = 0.55;\n      firm.charterPolityId = polity?.id || null;\n      firm.debtIndex = Math.max(firm.debtIndex, firm.capitalIndex * 0.28);\n      events.push({ type: 'commercial_firm_reorganised', regionId: region.id, polityId: polity?.id || null, firmId: firm.id, form: firm.form, sector: firm.sector });\n    } else if (firm.form === 'chartered_venture' && firm.ageYears >= 6 && s.jointStockPractice > 0.55 && (rng?.() ?? Math.random()) < clamp(years * 0.1)) {\n      firm.form = 'joint_stock_company';\n      firm.statePrivilege = Math.min(firm.statePrivilege || 0, 0.3);\n      firm.debtIndex = Math.max(firm.debtIndex, firm.capitalIndex * 0.34);\n      firm.equityIndex = Math.max(firm.equityIndex || 0, firm.capitalIndex * 0.66);\n      events.push({ type: 'commercial_firm_reorganised', regionId: region.id, polityId: polity?.id || null, firmId: firm.id, form: firm.form, sector: firm.sector });\n    }\n    const sectorFit = firm.sector === 'shipping' ? (region.isCoastal ? 0.08 : -0.12) : firm.sector === 'long_distance_trade' ? 0.05 : 0;\n",
)

replace_once(
    'js/economy/corporateCapital.js',
    "  const revenue = territories.reduce((sum, r) => sum + Math.max(0, r.militaryFinance?.revenueEma || 0), 0);\n  const debtCapacity = Math.max(0, revenue * 52 * (0.6 + stateCredit * 2.2) - finance.publicDebt);\n  const requested = Math.min(available, debtCapacity, Math.max(0.05, revenue * 4 + stress * 2));\n  if (requested <= 0.01) return;\n",
    "  const revenue = territories.reduce((sum, r) => sum + Math.max(0, r.militaryFinance?.revenueEma || 0), 0);\n  const debtCapacity = Math.max(0, revenue * 52 * (0.6 + stateCredit * 2.2) - finance.publicDebt);\n  const capitalRevenue = Math.max(0, capital.militaryFinance?.revenueEma || 0);\n  const currentPayroll = Math.max(0, capital.militaryFinance?.payrollDue || 0);\n  const currentAdmin = Math.max(0, capital.militaryFinance?.administrationDue || 0);\n  const reserveTarget = Math.max(0.05, capitalRevenue * 4 + (currentPayroll + currentAdmin) * 2 + stress * 0.25);\n  const fundingGap = Math.max(0, reserveTarget - Math.max(0, capital.treasury || 0));\n  const requested = Math.min(available, debtCapacity, fundingGap);\n  if (requested <= 0.01) return;\n",
)

replace_once(
    'js/economy/medievalCommercialInstitutions.js',
    "const DAYS_PER_YEAR = 365.2425;\n",
    "import { corporateCreditMultiplier } from './corporateCapital.js?v=20260913-capital2';\n\nconst DAYS_PER_YEAR = 365.2425;\n",
)

replace_once(
    'js/economy/medievalCommercialInstitutions.js',
    "  return 1 + s.finance.merchantCredit * 0.45 + s.finance.depositBanking * 0.3 + s.finance.stateCredit * 0.25 - s.finance.creditCrisis * 0.35;\n",
    "  return (1 + s.finance.merchantCredit * 0.45 + s.finance.depositBanking * 0.3 + s.finance.stateCredit * 0.25 - s.finance.creditCrisis * 0.35) * corporateCreditMultiplier(region);\n",
)

replace_once(
    'js/economy/trade.js',
    "import { recordCommodityTrade } from './foodLuxuries.js?v=20260913-food-luxuries1';\n",
    "import { recordCommodityTrade } from './foodLuxuries.js?v=20260913-food-luxuries1';\nimport { corporateVentureCapacityMultiplier } from './corporateCapital.js?v=20260913-capital2';\n",
)

replace_once(
    'js/economy/trade.js',
    "  for (const opp of opportunities) {\n    if (idle < 1 || launched >= MAX_NEW_VENTURES_PER_WEEK) break;\n",
    "  const ventureCap = Math.max(1, Math.round(MAX_NEW_VENTURES_PER_WEEK * corporateVentureCapacityMultiplier(region)));\n  for (const opp of opportunities) {\n    if (idle < 1 || launched >= ventureCap) break;\n",
)

replace_once(
    'js/main.js',
    "import { tickMedievalCommercialInstitutions } from './economy/medievalCommercialInstitutions.js?v=20260912-medieval2';\n",
    "import { tickMedievalCommercialInstitutions } from './economy/medievalCommercialInstitutions.js?v=20260912-medieval2';\nimport { tickCorporateCapital } from './economy/corporateCapital.js?v=20260913-capital2';\n",
)

# Insert the finance tick immediately after medieval commerce without assuming
# no later feature has inserted another tick before medieval doctrine.
main_path = Path('js/main.js')
main_text = main_path.read_text()
capital_tick = "    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapital(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
if capital_tick not in main_text:
    commerce_tick = "    profiler.measure('Medieval commerce', () => tickMedievalCommercialInstitutions(regions, polities, time.elapsedDays));\n"
    if commerce_tick not in main_text:
        raise RuntimeError('Expected Medieval commerce integration anchor missing in js/main.js')
    main_text = main_text.replace(commerce_tick, commerce_tick + capital_tick, 1)
    main_path.write_text(main_text)

replace_once(
    'js/main.js',
    "      ...languagePolicyEvents.filter((event) => event.polityId === activePlayerPolityId),\n",
    "      ...languagePolicyEvents.filter((event) => event.polityId === activePlayerPolityId),\n      ...capitalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
)

print('Finance and corporate capital v2 integration applied')