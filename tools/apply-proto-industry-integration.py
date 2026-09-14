#!/usr/bin/env python3
from pathlib import Path

p = Path('js/main.js')
s = p.read_text()
imp = "import { tickProtoIndustry } from './economy/protoIndustry.js?v=20260914-protoindustry1';\n"
anchor = "import { tickCorporateCapital } from './economy/corporateCapital.js?v=20260913-capital2';\n"
if imp not in s:
    if anchor not in s: raise SystemExit('corporate capital import anchor missing')
    s = s.replace(anchor, anchor + imp)
call = "    const protoIndustryEvents = profiler.measure('Proto-industrial private investment', () => tickProtoIndustry(regions, calendarWeek, time.elapsedDays, Math.random));\n"
call_anchor = "    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapital(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
if call not in s:
    if call_anchor not in s: raise SystemExit('corporate capital tick anchor missing')
    s = s.replace(call_anchor, call_anchor + call)
event = "      ...protoIndustryEvents.filter((event) => event.regionId === playerRegionId),\n"
event_anchor = "      ...capitalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n"
if event not in s:
    if event_anchor not in s: raise SystemExit('capital event anchor missing')
    s = s.replace(event_anchor, event_anchor + event)
p.write_text(s)
print('proto-industry integration applied')
