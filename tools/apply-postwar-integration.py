from pathlib import Path

p = Path('js/main.js')
text = p.read_text()
replacements = [
    ("import { renderMassPoliticsControls } from './ui/massPoliticsUi.js?v=20260918-mass-politics1';",
     "import { renderMassPoliticsControls } from './ui/massPoliticsUi.js?v=20260918-mass-politics1';\nimport { postWarSocietySummary, setVeteranSupportPolicy, tickPostWarSociety } from './society/postWarSociety.js?v=20260918-postwar1';\nimport { renderPostWarSocietyControls } from './ui/postWarSocietyUi.js?v=20260918-postwar1';"),
    ("    const massPoliticsEvents = profiler.measure('Mass politics', () => tickMassPolitics(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));",
     "    const postWarSocietyEvents = profiler.measure('Post-war society', () => tickPostWarSociety(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));\n    const massPoliticsEvents = profiler.measure('Mass politics', () => tickMassPolitics(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));"),
    ("      ...massPoliticsEvents.filter((event) => event.playerRelevant),",
     "      ...postWarSocietyEvents.filter((event) => event.playerRelevant),\n      ...massPoliticsEvents.filter((event) => event.playerRelevant),"),
    ("  if (region.id === playerRegionId && playerPolity) renderMassPoliticsControls(document.getElementById('region-controls'), playerPolity, regions, () => council?.refresh());",
     "  if (region.id === playerRegionId && playerPolity) {\n    renderMassPoliticsControls(document.getElementById('region-controls'), playerPolity, regions, () => council?.refresh());\n    renderPostWarSocietyControls(document.getElementById('region-controls'), playerPolity, () => council?.refresh());\n  }"),
    ("    massPoliticsApi: { setMassPoliticsPolicy, massPoliticsSummary },",
     "    massPoliticsApi: { setMassPoliticsPolicy, massPoliticsSummary },\n    postWarSocietyApi: { setVeteranSupportPolicy, postWarSocietySummary },"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing integration pattern: {old[:120]!r}')
    text = text.replace(old, new, 1)
p.write_text(text)
print('post-war society integration applied')
