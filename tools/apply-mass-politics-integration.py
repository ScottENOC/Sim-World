from pathlib import Path

p = Path('js/main.js')
text = p.read_text()
replacements = [
    ("import { LANGUAGE_POLICIES, ensureRegionalLanguagePolicy, regionalLanguagePolicyAssessment, setRegionalLanguagePolicy, tickRegionalLanguagePolicies } from './politics/languagePolicy.js?v=20260909-language-policy1';",
     "import { LANGUAGE_POLICIES, ensureRegionalLanguagePolicy, regionalLanguagePolicyAssessment, setRegionalLanguagePolicy, tickRegionalLanguagePolicies } from './politics/languagePolicy.js?v=20260909-language-policy1';\nimport { massPoliticsSummary, setMassPoliticsPolicy, tickMassPolitics } from './politics/massPolitics.js?v=20260918-mass-politics1';\nimport { renderMassPoliticsControls } from './ui/massPoliticsUi.js?v=20260918-mass-politics1';"),
    ("    const polityEvents = profiler.measure('Polities', () => tickPolities(polities, regions, calendarWeek, time.elapsedDays, { agreements }));",
     "    const polityEvents = profiler.measure('Polities', () => tickPolities(polities, regions, calendarWeek, time.elapsedDays, { agreements }));\n    const massPoliticsEvents = profiler.measure('Mass politics', () => tickMassPolitics(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));"),
    ("      ...polityEvents.filter((event) => event.regionId === playerRegionId),",
     "      ...polityEvents.filter((event) => event.regionId === playerRegionId),\n      ...massPoliticsEvents.filter((event) => event.playerRelevant),"),
    ("  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0), {",
     "  if (region.id === playerRegionId && playerPolity) renderMassPoliticsControls(document.getElementById('region-controls'), playerPolity, regions, () => council?.refresh());\n  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0), {"),
    ("    financialDiplomacyApi: { setBondPolicy, dumpSovereignBonds, setSettlementCurrencyPolicy },",
     "    financialDiplomacyApi: { setBondPolicy, dumpSovereignBonds, setSettlementCurrencyPolicy },\n    massPoliticsApi: { setMassPoliticsPolicy, massPoliticsSummary },"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing integration pattern: {old[:120]!r}')
    text = text.replace(old, new, 1)
p.write_text(text)
print('mass politics integration applied')
