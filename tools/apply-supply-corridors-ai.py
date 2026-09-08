from pathlib import Path

def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Expeditionary logistics: maritime reliability is constrained by the physical inland corridor.
p = Path('js/military/expeditionaryLogistics.js')
s = p.read_text()
s = replace_once(s,
"import { FLEET_MISSIONS } from './fleets.js?v=20260908-fleets1';",
"import { FLEET_MISSIONS } from './fleets.js?v=20260908-fleets1';\nimport { campaignSupplyCorridor } from './supplyCorridors.js?v=20260908-corridor1';",
'logistics import')
s = replace_once(s,
"  state.routeReliability = clamp(routePresence * (0.3 + escortRatio * 0.62 + missionBonus), 0, 1);\n  state.deliveryCapacity = requirement * port.throughput * state.routeReliability;",
"  state.routeReliability = clamp(routePresence * (0.3 + escortRatio * 0.62 + missionBonus), 0, 1);\n  const corridor = campaignSupplyCorridor(campaign, defender);\n  state.internalCorridorReliability = port.captured ? corridor.reliability : 1;\n  state.corridorBrokenNodeId = port.captured ? corridor.brokenNodeId : null;\n  state.corridorWeakNodeId = port.captured ? corridor.weakNodeId : null;\n  state.routeReliability = clamp(state.routeReliability * state.internalCorridorReliability);\n  state.deliveryCapacity = requirement * port.throughput * state.routeReliability;",
'corridor reliability')
s = replace_once(s,
"    routeReliability: s.routeReliability,\n    deliveredLastWeek: s.deliveredLastWeek,",
"    routeReliability: s.routeReliability,\n    internalCorridorReliability: s.internalCorridorReliability ?? 1,\n    corridorBrokenNodeId: s.corridorBrokenNodeId || null,\n    corridorWeakNodeId: s.corridorWeakNodeId || null,\n    deliveredLastWeek: s.deliveredLastWeek,",
'corridor summary')
p.write_text(s)

# Campaigns: garrison captured nodes and make desperate assaults faster but bloodier.
p = Path('js/military/campaigns.js')
s = p.read_text()
s = replace_once(s,
"import { initialiseExpeditionaryLogistics, tickExpeditionaryLogistics } from './expeditionaryLogistics.js?v=20260908-logistics1';",
"import { initialiseExpeditionaryLogistics, tickExpeditionaryLogistics } from './expeditionaryLogistics.js?v=20260908-logistics1';\nimport { garrisonCapturedNode } from './supplyCorridors.js?v=20260908-corridor1';\nimport { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';",
'campaign imports')
s = replace_once(s,
"  const strengthRatio = attackerPower / Math.max(1, defenderPower);\n  const pressureDelta = clamp((strengthRatio - 0.45) * 0.045 * objective.pressureRate * coastalFactor, -0.025, 0.11);",
"  const strengthRatio = attackerPower / Math.max(1, defenderPower);\n  const desperation = desperateAttackProfile(campaign);\n  const pressureDelta = clamp((strengthRatio - 0.45) * 0.045 * objective.pressureRate * coastalFactor * desperation.pressureMultiplier, -0.025, 0.13);",
'desperate pressure')
s = replace_once(s,
"  const combatAttackerLosses = Math.min(campaign.personnel,\n    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * variance()));",
"  const combatAttackerLosses = Math.min(campaign.personnel,\n    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * desperation.casualtyMultiplier * variance()));",
'desperate losses')
s = replace_once(s,
"  if (movement.arrived) {\n    const occupation = attemptPhysicalOccupation(campaign, defender, currentTick, campaign.pressure);\n    if (occupation.captured) campaign.occupationSummary = occupation.summary;\n  }",
"  if (movement.arrived) {\n    const occupation = attemptPhysicalOccupation(campaign, defender, currentTick, campaign.pressure);\n    if (occupation.captured) {\n      const garrison = garrisonCapturedNode(campaign, attacker, defender, occupation.node, currentTick);\n      campaign.lastGarrisonAssignment = { nodeId: occupation.node.id, ...garrison, tick: currentTick };\n      campaign.occupationSummary = occupationSummary(defender);\n    }\n  }",
'garrison capture')
p.write_text(s)

# Nation AI: react to logistics state before deciding whether to withdraw.
p = Path('js/ai/nationAi.js')
s = p.read_text()
s = replace_once(s,
"import { chooseNpcMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';",
"import { chooseNpcMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';\nimport { chooseSupplyAwareCampaignDirective } from '../military/supplyAwareAi.js?v=20260908-supply-ai1';",
'ai import')
s = replace_once(s,
"    if (attacker.controllingActorId !== playerRegionId &&\n        (campaign.attackerMorale < 0.28 || (campaign.supply < 0.3 && campaign.pressure < 0.45))) {\n      requestCampaignWithdrawal(campaign);\n    }",
"    if (attacker.controllingActorId !== playerRegionId) {\n      const supplyDecision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender);\n      const desperate = (supplyDecision.riskTolerance || 0) >= 0.72;\n      const canOrderlyWithdraw = (campaign.logisticsState?.routeReliability ?? 1) >= 0.20;\n      if (campaign.attackerMorale < 0.22 ||\n          (!desperate && canOrderlyWithdraw && campaign.supply < 0.3 && campaign.pressure < 0.45)) {\n        requestCampaignWithdrawal(campaign);\n      }\n    }",
'ai campaign logistics')
p.write_text(s)
