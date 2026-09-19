from pathlib import Path

p=Path('js/main.js')
text=p.read_text()
replacements=[
("import { internationalOrganisationSummary, proposeInternationalOrganisation, submitInternationalMotion, tickInternationalOrganisations, worldInstitutionReadiness } from './diplomacy/internationalOrganisations.js?v=20260919-global-institutions1';",
 "import { internationalOrganisationSummary, proposeInternationalOrganisation, submitInternationalMotion, syncNextInternationalOrganisationIds, tickInternationalOrganisations, worldInstitutionReadiness } from './diplomacy/internationalOrganisations.js?v=20260919-global-institutions1';"),
("function wireMenu({ fogOfWar, map, clock, regions, seaRegions, polities, religiousWorld, agreements, getActiveRaids,",
 "function wireMenu({ fogOfWar, map, clock, regions, seaRegions, polities, religiousWorld, agreements, internationalOrganisations, getActiveRaids,"),
("activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), activeWars: window.__worldsim?.activeWars || [], fleets: window.__worldsim?.fleets || [],",
 "activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), activeWars: window.__worldsim?.activeWars || [], fleets: window.__worldsim?.fleets || [], internationalOrganisations,"),
("const restored = restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, activeWars, fleets, clock, fogOfWar });",
 "const restored = restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, activeWars, fleets, internationalOrganisations, clock, fogOfWar });"),
("    syncNextFleetIds(fleets);\n    syncRegionalNavyLedger(regions, fleets);",
 "    syncNextFleetIds(fleets);\n    syncNextInternationalOrganisationIds(internationalOrganisations);\n    syncRegionalNavyLedger(regions, fleets);"),
("    agreements,\n    getActiveRaids: () => activeRaids,",
 "    agreements,\n    internationalOrganisations,\n    getActiveRaids: () => activeRaids,"),
]
for old,new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f'missing main.js anchor: {old[:120]!r}')
    text=text.replace(old,new,1)
p.write_text(text)
print('international organisation save wiring applied')
