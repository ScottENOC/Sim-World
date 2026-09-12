#!/usr/bin/env python3
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
main_path = root / 'js' / 'main.js'
trade_path = root / 'js' / 'economy' / 'trade.js'
index_path = root / 'index.html'

main = main_path.read_text()
needle = "import { tickDemographics } from './society/demographics.js?v=20260912-culture-scale1';\n"
insert = needle + "import { tickDisease } from './society/disease.js?v=20260912-disease1';\nimport './ui/diseasePolicyUi.js?v=20260912-disease1';\n"
if "tickDisease" not in main:
    if needle not in main: raise SystemExit('main demographics import anchor missing')
    main = main.replace(needle, insert, 1)

tick_anchor = "    const religionEvents = profiler.measure('Religion', () => tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays));\n    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));\n"
tick_repl = "    const religionEvents = profiler.measure('Religion', () => tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays));\n    const diseaseEvents = profiler.measure('Disease', () => tickDisease(regions, time.elapsedDays, Math.random));\n    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));\n"
if "profiler.measure('Disease'" not in main:
    if tick_anchor not in main: raise SystemExit('main disease tick anchor missing')
    main = main.replace(tick_anchor, tick_repl, 1)

event_anchor = "      ...religionEvents.filter((event) => event.regionId === playerRegionId),\n      ...languageChangeEvents.filter((event) => event.regionId === playerRegionId),\n"
event_repl = "      ...religionEvents.filter((event) => event.regionId === playerRegionId),\n      ...diseaseEvents.filter((event) => event.regionId === playerRegionId),\n      ...languageChangeEvents.filter((event) => event.regionId === playerRegionId),\n"
if "...diseaseEvents.filter" not in main:
    if event_anchor not in main: raise SystemExit('main player event anchor missing')
    main = main.replace(event_anchor, event_repl, 1)
main_path.write_text(main)

trade = trade_path.read_text()
import_anchor = "import { currencyTradeFriction, recordCurrencyContact } from './currency.js?v=20260912-currency3';\n"
if "quarantineTradeFriction" not in trade:
    if import_anchor not in trade: raise SystemExit('trade currency import anchor missing')
    trade = trade.replace(import_anchor, import_anchor + "import { quarantineTradeFriction } from '../society/disease.js?v=20260912-disease1';\n", 1)

helper_anchor = "function clamp01(value) {\n  return Math.max(0, Math.min(1, Number(value) || 0));\n}\n"
helper = helper_anchor + "\nfunction combinedTradeFriction(regionA, regionB) {\n  return currencyTradeFriction(regionA, regionB) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB);\n}\n"
if "function combinedTradeFriction" not in trade:
    if helper_anchor not in trade: raise SystemExit('trade helper anchor missing')
    trade = trade.replace(helper_anchor, helper, 1)
    trade = re.sub(r'currencyTradeFriction\(([^,()]+),\s*([^()]+)\)', r'combinedTradeFriction(\1, \2)', trade)
    trade = trade.replace("return combinedTradeFriction(regionA, regionB) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB);", "return currencyTradeFriction(regionA, regionB) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB);")
trade_path.write_text(trade)

index = index_path.read_text()
index = re.sub(r'(js/main\.js\?v=)[^\"\']+', r'\g<1>20260912-disease1', index)
index_path.write_text(index)
