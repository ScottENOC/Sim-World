from pathlib import Path

p = Path('js/politics/medievalStateSystems.js')
s = p.read_text()

marker = "import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260908-subregion1';"
insert = marker + "\nimport { linkSuccessionClaimant, reconcileSuccessionContinuity } from './successionContinuityBridge.js?v=20260913-succession-continuity1';"
assert marker in s
if "successionContinuityBridge" not in s:
    s = s.replace(marker, insert, 1)

old = """  crisis.escalated = true;\n  crisis.claimantPolityId = claimantPolity.id;\n  return { type: 'succession_civil_war', polityId: polity.id, claimantPolityId: claimantPolity.id, claimantId: rival.id, regionId: capital.id, regionName: capital.name };"""
new = """  crisis.escalated = true;\n  crisis.claimantPolityId = claimantPolity.id;\n  linkSuccessionClaimant(polity, claimantPolity, rival, rival.supportRegionIds, regions, polities, currentTick);\n  return { type: 'succession_civil_war', polityId: polity.id, claimantPolityId: claimantPolity.id, claimantId: rival.id, regionId: capital.id, regionName: capital.name };"""
assert old in s
s = s.replace(old, new, 1)

old = """    if (succession.crisis?.contested && !succession.crisis.escalated && currentTick - succession.crisis.startedTick >= 8) {\n      const event = escalateCivilWar(polity, regions, polities, currentTick); if (event) events.push(event);\n    }\n    if (succession.crisis && !succession.crisis.contested && currentTick - succession.crisis.startedTick >= 4) {"""
new = """    if (succession.crisis?.contested && !succession.crisis.escalated && currentTick - succession.crisis.startedTick >= 8) {\n      const event = escalateCivilWar(polity, regions, polities, currentTick); if (event) events.push(event);\n    }\n    if (succession.crisis?.escalated) {\n      const continuityEvent = reconcileSuccessionContinuity(polity, polities, regions, currentTick);\n      if (continuityEvent) events.push(continuityEvent);\n    }\n    if (succession.crisis && !succession.crisis.contested && currentTick - succession.crisis.startedTick >= 4) {"""
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

# Player-facing event copy: the bridge event should explain that the defeated
# faction survives through the normal exile/restoration system.
p = Path('js/main.js')
s = p.read_text()
marker = "  if (event.type === 'medieval_civil_war') {"
assert marker in s
block = """  if (event.type === 'succession_continuity_resolved') {\n    document.getElementById('event-title').textContent = 'Succession war decided';\n    document.getElementById('event-body').textContent = event.loserStatus === 'exile'\n      ? `The territorial succession war is over, but the defeated claimant survives as a government in exile${event.hostPolityId ? ' under foreign protection' : ''}. Its claims, legitimacy and restoration diplomacy now use the same political-continuity system as a ruler displaced by conquest.`\n      : 'The territorial succession war is over and the defeated political faction no longer has a viable continuity claim.';\n    wireEventContinue(clock,eventQueue); return;\n  }\n"""
if "event.type === 'succession_continuity_resolved'" not in s:
    s = s.replace(marker, block + marker, 1)
p.write_text(s)
