from pathlib import Path

p = Path('js/military/campaigns.js')
s = p.read_text()

def repl(old, new, label):
    global s
    if new in s:
        return
    if old not in s:
        raise SystemExit(f'missing anchor: {label}')
    s = s.replace(old, new, 1)

repl(
"import { advanceCampaignControl, establishCampaignFootprint, occupationSummary, releaseUnsupportedOccupation } from './subregionalControl.js?v=20260908-subregion1';",
"import { advanceCampaignControl, establishCampaignFootprint, occupationSummary, releaseUnsupportedOccupation } from './subregionalControl.js?v=20260908-subregion1';\nimport { attemptPhysicalOccupation, initialiseCampaignMovement, resolveCampaignNodeInteractions, setCampaignSubregionalObjective, tickCampaignMovement } from './subregionalMovement.js?v=20260908-movement1';",
'import')

repl(
"    occupationActorId: attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id,\n    occupationSummary: null,",
"    occupationActorId: attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id,\n    occupationSummary: null,\n    subregional: { objectivePolicy: options.subregionalObjective || (reach.viaSea ? 'port' : 'balanced'), currentNodeId: null, targetNodeId: null, route: [], routeIndex: 0, edgeProgress: 0, blockedByCampaignId: null },",
'launch state')

repl(
"function resolveCampaignWeek(campaign, attacker, defender, polities, regions, currentTick, toolTypes, rng) {\n  campaign.weeksEngaged += 1;",
"function resolveCampaignWeek(campaign, attacker, defender, polities, regions, currentTick, toolTypes, rng) {\n  campaign.weeksEngaged += 1;\n  const movement = tickCampaignMovement(campaign, defender, currentTick, campaignMobility(attacker));",
'weekly movement')

repl(
"  campaign.occupationSummary = advanceCampaignControl(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, pressureDelta, campaign.pressure, currentTick);",
"  campaign.occupationSummary = advanceCampaignControl(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, pressureDelta, campaign.pressure, currentTick, { capturePlaces: false });\n  if (movement.arrived) {\n    const occupation = attemptPhysicalOccupation(campaign, defender, currentTick, campaign.pressure);\n    if (occupation.captured) campaign.occupationSummary = occupation.summary;\n  }",
'physical capture')

repl(
"      establishCampaignFootprint(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, campaign.arriveTick, { viaSea: campaign.viaSea });\n      campaign.occupationSummary = occupationSummary(defender);",
"      establishCampaignFootprint(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, campaign.arriveTick, { viaSea: campaign.viaSea });\n      campaign.occupationSummary = occupationSummary(defender);\n      initialiseCampaignMovement(campaign, defender, campaign.arriveTick);",
'arrival movement')

anchor = "  return { remaining: campaigns.filter((campaign) => !campaign.completed), events };"
replacement = "  const activeWars = options.activeWars || [];\n  const defenderIds = new Set(campaigns.filter((campaign) => !campaign.completed && campaign.phase === 'engaged').map((campaign) => campaign.defenderId));\n  for (const defenderId of defenderIds) events.push(...resolveCampaignNodeInteractions(campaigns, activeWars, defenderId));\n  return { remaining: campaigns.filter((campaign) => !campaign.completed), events };"
repl(anchor, replacement, 'interaction return')

if 'export function setCampaignObjectivePolicy' not in s:
    s += "\nexport function setCampaignObjectivePolicy(campaign, defender, policy) { return setCampaignSubregionalObjective(campaign, defender, policy); }\n"

p.write_text(s)

c = Path('js/military/subregionalControl.js')
cs = c.read_text()
old_sig = "export function advanceCampaignControl(region, attackerActorId, pressureDelta, pressure, currentTick) {"
new_sig = "export function advanceCampaignControl(region, attackerActorId, pressureDelta, pressure, currentTick, options = {}) {"
if new_sig not in cs:
    if old_sig not in cs: raise SystemExit('missing subregional signature')
    cs = cs.replace(old_sig, new_sig, 1)
old_candidate = "    const candidate = captureCandidate(control, attackerActorId, pressure);"
new_candidate = "    const candidate = options.capturePlaces === false ? null : captureCandidate(control, attackerActorId, pressure);"
if new_candidate not in cs:
    if old_candidate not in cs: raise SystemExit('missing capture candidate')
    cs = cs.replace(old_candidate, new_candidate, 1)
c.write_text(cs)

m = Path('js/main.js')
ms = m.read_text()
old = "const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId });"
new = "const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars });"
if new not in ms:
    if old not in ms: raise SystemExit('missing main campaign call')
    ms = ms.replace(old, new, 1)
m.write_text(ms)
