from pathlib import Path

p=Path('js/main.js')
s=p.read_text()

anchor="import { renderCombinedExerciseControls } from './ui/combinedExercisesUi.js?v=20260919-exercises1';\n"
line="import { renderMilitaryAssistanceControls } from './ui/militaryAssistanceUi.js?v=20260920-aid-ui1';\n"
if line not in s:
    if anchor not in s: raise SystemExit('military assistance UI import anchor not found')
    s=s.replace(anchor,anchor+line,1)

anchor2="  if (region.id === playerRegionId) renderCombinedExerciseControls(document.getElementById('region-controls'),region,{regions,seaRegions:window.__worldsim?.seaRegions||[],agreements,fleets:window.__worldsim?.fleets||[],currentTick:calendarWeekIndex(clock.elapsedDays||0),onAction:()=>council?.refresh()});\n"
line2="  if (region.id === playerRegionId && playerPolity) renderMilitaryAssistanceControls(document.getElementById('region-controls'),playerPolity,{regions,polities,visiblePolityIds:[...new Set(regions.filter((candidate)=>fogOfWar.isVisible(candidate)).map((candidate)=>candidate.governance?.sovereignPolityId).filter(Boolean))],currentTick:calendarWeekIndex(clock.elapsedDays||0),onAction:()=>council?.refresh()});\n"
if line2 not in s:
    if anchor2 not in s: raise SystemExit('military assistance UI render anchor not found')
    s=s.replace(anchor2,anchor2+line2,1)

p.write_text(s)
