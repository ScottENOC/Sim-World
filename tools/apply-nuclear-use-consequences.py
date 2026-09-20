from pathlib import Path

p=Path('js/diplomacy/nuclearDeterrence.js')
s=p.read_text()
imp="import { tickNuclearUse } from '../military/nuclearUse.js?v=20260920-nuclear-use1';\n"
if imp not in s:
    anchor="import { tickNuclearDiplomacy } from './nuclearDiplomacy.js?v=20260920-nuclear-diplomacy1';\n"
    if anchor not in s:
        raise SystemExit('nuclear diplomacy import anchor missing')
    s=s.replace(anchor,anchor+imp)
call="  events.push(...tickNuclearUse(regions,currentTick,elapsedDays));\n"
if call not in s:
    anchor="  events.push(...tickNuclearDiplomacy(regions,currentTick,elapsedDays));\n"
    if anchor not in s:
        raise SystemExit('nuclear diplomacy tick anchor missing')
    s=s.replace(anchor,anchor+call)
p.write_text(s)
