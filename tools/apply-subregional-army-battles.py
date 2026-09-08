from pathlib import Path

movement = Path('js/military/subregionalMovement.js')
s = movement.read_text()
s = s.replace("  campaign.subregional.lastMoveTick = currentTick;\n  campaign.subregional.blockedByCampaignId = null;", "  campaign.subregional.lastMoveTick = currentTick;\n  campaign.subregional.previousNodeId = null;\n  campaign.subregional.blockedByCampaignId = null;")
s = s.replace("    state.routeIndex += 1;\n    state.currentNodeId = to.id;", "    state.routeIndex += 1;\n    state.previousNodeId = from?.id || state.currentNodeId;\n    state.currentNodeId = to.id;")
movement.write_text(s)

campaigns = Path('js/military/campaigns.js')
s = campaigns.read_text()
anchor = "import { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';"
if "subregionalArmyBattles" not in s:
    s = s.replace(anchor, anchor + "\nimport { resolveSubregionalArmyBattles } from './subregionalArmyBattles.js?v=20260909-nodebattle1';")
old = "  for (const defenderId of defenderIds) events.push(...resolveCampaignNodeInteractions(campaigns, activeWars, defenderId));"
new = "  for (const defenderId of defenderIds) {\n    events.push(...resolveCampaignNodeInteractions(campaigns, activeWars, defenderId));\n    events.push(...resolveSubregionalArmyBattles(campaigns, activeWars, regionsById.get(defenderId), regionsById, currentTick, rng));\n  }"
if old not in s and new not in s:
    raise SystemExit('campaign interaction anchor not found')
s = s.replace(old, new)
campaigns.write_text(s)
