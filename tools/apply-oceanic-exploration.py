#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'js' / 'main.js'

text = MAIN.read_text()

import_anchor = "import { tickEarlyModernReform } from './society/earlyModernReform.js?v=20260914-reform1';\n"
import_line = "import { tickOceanicExploration } from './economy/oceanicExploration.js?v=20260914-exploration1';\n"
if import_line not in text:
    if import_anchor not in text:
        raise RuntimeError('Could not find Early Modern reform import anchor in js/main.js')
    text = text.replace(import_anchor, import_anchor + import_line, 1)

runtime_anchor = "    const earlyModernReformEvents = profiler.measure('Early-modern religious reform', () => tickEarlyModernReform(regions, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
runtime_line = "    const oceanicExplorationEvents = profiler.measure('Oceanic exploration', () => tickOceanicExploration(regions, seaRegions, fleets, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
if runtime_line not in text:
    if runtime_anchor not in text:
        raise RuntimeError('Could not find Early Modern reform runtime anchor in js/main.js')
    text = text.replace(runtime_anchor, runtime_anchor + runtime_line, 1)

event_anchor = "      ...earlyModernReformEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n"
event_line = "      ...oceanicExplorationEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),\n"
if event_line not in text:
    if event_anchor not in text:
        raise RuntimeError('Could not find Early Modern reform player-event anchor in js/main.js')
    text = text.replace(event_anchor, event_anchor + event_line, 1)

MAIN.write_text(text)
print('Oceanic exploration runtime integration applied.')
