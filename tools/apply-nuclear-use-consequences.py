from pathlib import Path

p=Path('js/diplomacy/nuclearDeterrence.js')
s=p.read_text()
imp="import { tickNuclearUse } from '../military/nuclearUse.js?v=20260920-nuclear-use1';\n"
if imp not in s:
    anchor="import { tickNuclearDiplomacy } from './nuclearDiplomacy.js?v=20260920-nuclear-diplomacy1';\n"
    if anchor not in s:
        raise SystemExit('nuclear diplomacy import anchor missing')
    s=s.replace(anchor,anchor+imp)

call="events.push(...tickNuclearUse(regions,currentTick,elapsedDays));"
if call not in s:
    candidates=[
        "events.push(...tickNuclearCrisisBargaining(regions,currentTick,elapsedDays));return events;",
        "events.push(...tickNuclearDiplomacy(regions,currentTick,elapsedDays));return events;",
        "  events.push(...tickNuclearCrisisBargaining(regions,currentTick,elapsedDays));\n  return events;",
        "  events.push(...tickNuclearDiplomacy(regions,currentTick,elapsedDays));\n  return events;",
    ]
    replaced=False
    for anchor in candidates:
        if anchor in s:
            if anchor.startswith('events.push'):
                s=s.replace(anchor,anchor.replace('return events;',call+'return events;'),1)
            else:
                s=s.replace(anchor,anchor.replace('\n  return events;','\n  '+call+'\n  return events;'),1)
            replaced=True
            break
    if not replaced:
        raise SystemExit('nuclear deterrence tick return anchor missing')
p.write_text(s)
