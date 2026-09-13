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

replace_once(
    'js/main.js',
    "    profiler.measure('Medieval commerce', () => tickMedievalCommercialInstitutions(regions, polities, time.elapsedDays));\n    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));\n",
    "    profiler.measure('Medieval commerce', () => tickMedievalCommercialInstitutions(regions, polities, time.elapsedDays));\n    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapital(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));\n",
)

replace_once(
    'js/main.js',
    "      ...languagePolicyEvents.filter((event) => event.polityId === activePlayerPolityId),\n",
    "      ...languagePolicyEvents.filter((event) => event.polityId === activePlayerPolityId),\n      ...capitalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n",
)

print('Finance and corporate capital v2 integration applied')
