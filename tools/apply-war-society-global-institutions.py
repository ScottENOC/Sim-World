from pathlib import Path

def patch(path,repls):
    p=Path(path); text=p.read_text()
    for old,new in repls:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing anchor in {path}: {old[:100]!r}')
        text=text.replace(old,new,1)
    p.write_text(text)

patch('js/main.js',[
("import { renderPostWarSocietyControls } from './ui/postWarSocietyUi.js?v=20260918-postwar1';\n",
 "import { renderPostWarSocietyControls } from './ui/postWarSocietyUi.js?v=20260918-postwar1';\nimport { setWarInformationPolicy, tickWarSociety, warSocietySummary } from './society/warSociety.js?v=20260919-war-society1';\nimport { renderWarSocietyControls } from './ui/warSocietyUi.js?v=20260919-war-society1';\nimport { internationalOrganisationSummary, proposeInternationalOrganisation, submitInternationalMotion, tickInternationalOrganisations, worldInstitutionReadiness } from './diplomacy/internationalOrganisations.js?v=20260919-global-institutions1';\nimport { renderInternationalOrganisationControls } from './ui/internationalOrganisationsUi.js?v=20260919-global-institutions1';\n"),
("  const eventQueue = [];\n",
 "  const eventQueue = [];\n  const internationalOrganisations = [];\n"),
("    const postWarSocietyEvents = profiler.measure('Post-war society', () => tickPostWarSociety(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));\n    const massPoliticsEvents = profiler.measure('Mass politics', () => tickMassPolitics(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));",
 "    const warSocietyEvents = profiler.measure('War and society', () => tickWarSociety(polities, regions, activeWars, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));\n    const postWarSocietyEvents = profiler.measure('Post-war society', () => tickPostWarSociety(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));\n    const massPoliticsEvents = profiler.measure('Mass politics', () => tickMassPolitics(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));\n    const internationalOrganisationEvents = profiler.measure('International organisations', () => tickInternationalOrganisations({ polities, regions, activeWars, internationalOrganisations }, calendarWeek, time.elapsedDays));"),
("      ...postWarSocietyEvents.filter((event) => event.playerRelevant),\n      ...massPoliticsEvents.filter((event) => event.playerRelevant),",
 "      ...warSocietyEvents.filter((event) => event.playerRelevant),\n      ...postWarSocietyEvents.filter((event) => event.playerRelevant),\n      ...massPoliticsEvents.filter((event) => event.playerRelevant),\n      ...internationalOrganisationEvents.filter((event) => internationalOrganisations.find((org) => org.id === event.organisationId)?.memberPolityIds?.includes?.(activePlayerPolityId)),"),
("    financialDiplomacyApi: { setBondPolicy, dumpSovereignBonds, setSettlementCurrencyPolicy },\n",
 "    financialDiplomacyApi: { setBondPolicy, dumpSovereignBonds, setSettlementCurrencyPolicy },\n    warSocietyApi: { setWarInformationPolicy, warSocietySummary },\n    internationalOrganisationApi: { proposeInternationalOrganisation, submitInternationalMotion, internationalOrganisationSummary, worldInstitutionReadiness },\n    internationalOrganisations,\n")
])

# Add controls beside other polity-level controls without disturbing the large template.
p=Path('js/main.js'); text=p.read_text()
anchor="  if (region.id === playerRegionId) renderCombinedExerciseControls(document.getElementById('region-controls'),region,{regions,seaRegions:window.__worldsim?.seaRegions||[],agreements,fleets:window.__worldsim?.fleets||[],currentTick:calendarWeekIndex(clock.elapsedDays||0),onAction:()=>council?.refresh()});\n"
addition=anchor+"  if (region.id === playerRegionId) {\n    const polity = polityById(polities, activePlayerPolityId);\n    renderWarSocietyControls(document.getElementById('region-controls'), polity, { onAction: () => council?.refresh() });\n    renderInternationalOrganisationControls(document.getElementById('region-controls'), polity, { polities, regions, activeWars: window.__worldsim?.activeWars || [], internationalOrganisations: window.__worldsim?.internationalOrganisations || [], currentTick: calendarWeekIndex(clock.elapsedDays || 0) }, { onAction: () => council?.refresh() });\n  }\n"
if addition not in text:
    if anchor not in text: raise SystemExit('missing control anchor')
    text=text.replace(anchor,addition,1)
p.write_text(text)

patch('js/society/postWarSociety.js',[
("    const stressTarget = clamp(queueShare * 0.38 + signals.unemployment * 0.22 + signals.housingStress * 0.16 + signals.hardship * 0.14 + state.mobilisationMemory * 0.10);",
 "    const traumaBurden = clamp(polity.warSociety?.combatTraumaBurden || 0);\n    const stressTarget = clamp(queueShare * 0.34 + signals.unemployment * 0.20 + signals.housingStress * 0.14 + signals.hardship * 0.12 + state.mobilisationMemory * 0.08 + traumaBurden * 0.12);")
])
print('war society/global institution integration applied')
