from pathlib import Path

p = Path('js/main.js')
s = p.read_text()

import_anchor = "import { tickForeignPoliticalIntervention } from './politics/foreignPoliticalIntervention.js?v=20260917-intervention1';\n"
import_line = "import { tickMilitaryAssistance } from './diplomacy/militaryAssistance.js?v=20260920-aid1';\n"
if import_line not in s:
    if import_anchor not in s:
        raise SystemExit('military assistance import anchor not found')
    s = s.replace(import_anchor, import_anchor + import_line, 1)

call_anchor = "    const foreignInterventionEvents = profiler.measure('Foreign political intervention', () =>\n      tickForeignPoliticalIntervention(polities, regions, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
call_line = "    const militaryAssistanceEvents = profiler.measure('Military assistance and proxy wars', () =>\n      tickMilitaryAssistance(polities, regions, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
if call_line not in s:
    if call_anchor not in s:
        raise SystemExit('military assistance tick anchor not found')
    s = s.replace(call_anchor, call_anchor + call_line, 1)

# Surface only events involving the player; background patronage remains simulated silently.
event_anchor = "      ...foreignInterventionEvents.filter((event) => event.playerRelevant),\n"
event_line = "      ...militaryAssistanceEvents.filter((event) => event.donorPolityId === activePlayerPolityId || event.recipientPolityId === activePlayerPolityId || event.opponentPolityId === activePlayerPolityId || event.sides?.includes?.(activePlayerPolityId)),\n"
if event_line not in s:
    if event_anchor not in s:
        raise SystemExit('event queue anchor not found')
    s = s.replace(event_anchor, event_anchor + event_line, 1)

p.write_text(s)
