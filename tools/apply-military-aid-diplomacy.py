from pathlib import Path

path=Path('js/main.js')
text=path.read_text()
imp="import { requestMilitaryAid, proposeMilitaryAid, counterMilitaryAidOffer, respondMilitaryAidOffer, setMilitaryAidExportControl, militaryAidExportAssessment, dispatchMilitaryAidDiplomatically, suspendMilitaryAidProgramme, resumeMilitaryAidProgramme, tickMilitaryAidDiplomacy } from './diplomacy/militaryAidDiplomacy.js?v=20260920-aid-diplomacy1';\n"
if imp not in text:
    anchor="import { createMilitaryAssistanceProgramme, dispatchMilitaryAid, proxyConflictAssessment, tickMilitaryAssistance } from './diplomacy/militaryAssistance.js?v=20260920-aid1';\n"
    if anchor not in text: raise SystemExit('military assistance import anchor not found')
    text=text.replace(anchor,anchor+imp)

if 'const militaryAidDiplomacyEvents = profiler.measure(' not in text:
    anchor="    const militaryAssistanceEvents = profiler.measure('Military assistance and proxy wars', () =>\n      tickMilitaryAssistance(polities, regions, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
    if anchor not in text: raise SystemExit('military assistance tick anchor not found')
    addition=anchor+"    const militaryAidDiplomacyEvents = profiler.measure('Military aid diplomacy', () =>\n      tickMilitaryAidDiplomacy(polities, regions, calendarWeek, Math.random, { playerPolityId: activePlayerPolityId }));\n"
    text=text.replace(anchor,addition)

if '...militaryAidDiplomacyEvents.filter(' not in text:
    anchor="      ...militaryAssistanceEvents.filter((event) => event.donorPolityId === activePlayerPolityId || event.recipientPolityId === activePlayerPolityId || event.opponentPolityId === activePlayerPolityId || event.sides?.includes?.(activePlayerPolityId)),\n"
    if anchor not in text: raise SystemExit('player military assistance event anchor not found')
    addition=anchor+"      ...militaryAidDiplomacyEvents.filter((event) => event.donorPolityId === activePlayerPolityId || event.recipientPolityId === activePlayerPolityId),\n"
    text=text.replace(anchor,addition)

api_anchor="    militaryAssistanceApi: { createMilitaryAssistanceProgramme, dispatchMilitaryAid, proxyConflictAssessment },\n"
api_repl="    militaryAssistanceApi: { createMilitaryAssistanceProgramme, dispatchMilitaryAid, proxyConflictAssessment, requestMilitaryAid, proposeMilitaryAid, counterMilitaryAidOffer, respondMilitaryAidOffer, setMilitaryAidExportControl, militaryAidExportAssessment, dispatchMilitaryAidDiplomatically, suspendMilitaryAidProgramme, resumeMilitaryAidProgramme },\n"
if api_anchor in text:text=text.replace(api_anchor,api_repl)
elif api_repl not in text: raise SystemExit('military assistance API anchor not found')

path.write_text(text)
