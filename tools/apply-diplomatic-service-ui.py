from pathlib import Path
p=Path('js/main.js')
s=p.read_text()
imp="import { renderDiplomaticServicePanel } from './ui/diplomaticServicePanel.js?v=20260909-diplomatic-ui1';\n"
if imp not in s:
    anchor="import { AdvisorCouncil } from './ui/advisors.js?v=20260905-projects1';\n"
    assert anchor in s
    s=s.replace(anchor,anchor+imp,1)
call="  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0));\n"
if call not in s:
    marker="\n}\n\nfunction renderSubjectRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes) {"
    assert marker in s
    s=s.replace(marker,"\n"+call+"}\n\nfunction renderSubjectRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes) {",1)
p.write_text(s)
