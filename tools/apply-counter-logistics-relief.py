from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# nation AI integration
p = Path('js/ai/nationAi.js')
s = p.read_text()
s = replace_once(s,
"import { chooseSupplyAwareCampaignDirective } from '../military/supplyAwareAi.js?v=20260908-supply-ai1';\n",
"import { chooseSupplyAwareCampaignDirective } from '../military/supplyAwareAi.js?v=20260908-supply-ai1';\nimport { chooseDefensiveCounterLogistics } from '../military/counterLogisticsAi.js?v=20260909-counter-logistics1';\nimport { coordinateExpeditionRelief } from '../military/expeditionReliefAi.js?v=20260909-relief1';\n",
'nation imports')
s = replace_once(s,
"export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7) {\n  const baseWeekScale = Math.max(0.01, elapsedDays / 7);\n  const regionsById = new Map(regions.map((region) => [region.id, region]));\n  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng);",
"export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7, options = {}) {\n  const baseWeekScale = Math.max(0.01, elapsedDays / 7);\n  const regionsById = new Map(regions.map((region) => [region.id, region]));\n  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng, currentTick, options);",
'tickNationAi signature')
old_manage = """function manageCampaigns(campaigns, regionsById, playerRegionId, rng) {
  for (const campaign of campaigns) {
    if (campaign.phase !== 'engaged') continue;
    const attacker = regionsById.get(campaign.attackerId);
    const defender = regionsById.get(campaign.defenderId);
    if (!attacker || !defender) continue;
    if (defender.controllingActorId !== playerRegionId && campaign.militia <= 0 &&
        (campaign.pressure >= 0.18 || campaign.defenderMorale < 0.65)) {
      massMobiliseDefender(campaign, defender, 0.1 + rng() * 0.1);
    }
    if (attacker.controllingActorId !== playerRegionId) {
      const supplyDecision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender);
      const desperate = (supplyDecision.riskTolerance || 0) >= 0.72;
      const canOrderlyWithdraw = (campaign.logisticsState?.routeReliability ?? 1) >= 0.20;
      if (campaign.attackerMorale < 0.22 ||
          (!desperate && canOrderlyWithdraw && campaign.supply < 0.3 && campaign.pressure < 0.45)) {
        requestCampaignWithdrawal(campaign);
      }
    }
  }
}
"""
new_manage = """function manageCampaigns(campaigns, regionsById, playerRegionId, rng, currentTick, options = {}) {
  const fleets = options.fleets || [];
  const seaRegionsById = new Map((options.seaRegions || []).map((region) => [region.id, region]));
  for (const campaign of campaigns) {
    if (campaign.phase !== 'engaged') continue;
    const attacker = regionsById.get(campaign.attackerId);
    const defender = regionsById.get(campaign.defenderId);
    if (!attacker || !defender) continue;
    if (defender.controllingActorId !== playerRegionId) {
      if (campaign.militia <= 0 && (campaign.pressure >= 0.18 || campaign.defenderMorale < 0.65)) {
        massMobiliseDefender(campaign, defender, 0.1 + rng() * 0.1);
      }
      chooseDefensiveCounterLogistics(campaign, attacker, defender, currentTick, rng);
    }
    if (attacker.controllingActorId !== playerRegionId) {
      const supplyDecision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender);
      const relief = coordinateExpeditionRelief(campaign, attacker, defender, fleets, regionsById, seaRegionsById, currentTick);
      const desperate = (supplyDecision.riskTolerance || 0) >= 0.72;
      const canOrderlyWithdraw = (campaign.logisticsState?.routeReliability ?? 1) >= 0.20;
      const evacuationOrdered = relief.directive === 'evacuate_if_possible';
      if (evacuationOrdered || campaign.attackerMorale < 0.22 ||
          (!desperate && canOrderlyWithdraw && campaign.supply < 0.3 && campaign.pressure < 0.45)) {
        requestCampaignWithdrawal(campaign);
      }
    }
  }
}
"""
s = replace_once(s, old_manage, new_manage, 'manageCampaigns')
p.write_text(s)

# campaign combat integration
p = Path('js/military/campaigns.js')
s = p.read_text()
s = replace_once(s,
"import { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';\n",
"import { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';\nimport { counterLogisticsCombatProfile } from './counterLogisticsAi.js?v=20260909-counter-logistics1';\n",
'campaign import')
old = """  const desperation = desperateAttackProfile(campaign);
  const pressureDelta = clamp((strengthRatio - 0.45) * 0.045 * objective.pressureRate * coastalFactor * desperation.pressureMultiplier, -0.025, 0.13);
  campaign.pressure = clamp(campaign.pressure + pressureDelta);
  campaign.stage = campaign.pressure < 0.25 ? 'skirmishing'
    : campaign.pressure < 0.55 ? 'encirclement' : campaign.pressure < 0.85 ? 'siege' : 'collapse';

  const intensity = campaign.stage === 'skirmishing' ? 0.008 : campaign.stage === 'encirclement' ? 0.013 : 0.02;
  const variance = () => 0.75 + rng() * 0.5;
  const combatAttackerLosses = Math.min(campaign.personnel,
    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * desperation.casualtyMultiplier * variance()));
  const logisticsLosses = Math.min(Math.max(0, campaign.personnel - combatAttackerLosses), Math.round(campaign.personnel * (expedition?.attritionRate ?? 0)));
  const attackerLosses = combatAttackerLosses + logisticsLosses;
  const defenderLossPool = Math.round((defender.army.personnel + campaign.militia) *
    intensity * attackerShare * variance());
"""
new = """  const desperation = desperateAttackProfile(campaign);
  const counterLogistics = counterLogisticsCombatProfile(campaign);
  const pressureDelta = clamp((strengthRatio - 0.45) * 0.045 * objective.pressureRate * coastalFactor * desperation.pressureMultiplier * counterLogistics.attackerPressureMultiplier, -0.025, 0.13);
  campaign.pressure = clamp(campaign.pressure + pressureDelta);
  campaign.stage = campaign.pressure < 0.25 ? 'skirmishing'
    : campaign.pressure < 0.55 ? 'encirclement' : campaign.pressure < 0.85 ? 'siege' : 'collapse';

  const baseIntensity = campaign.stage === 'skirmishing' ? 0.008 : campaign.stage === 'encirclement' ? 0.013 : 0.02;
  const intensity = baseIntensity * counterLogistics.intensityMultiplier;
  const variance = () => 0.75 + rng() * 0.5;
  const combatAttackerLosses = Math.min(campaign.personnel,
    Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * desperation.casualtyMultiplier * variance()));
  const supplyAttrition = (expedition?.attritionRate ?? 0) + counterLogistics.extraAttackerAttritionRate;
  const logisticsLosses = Math.min(Math.max(0, campaign.personnel - combatAttackerLosses), Math.round(campaign.personnel * supplyAttrition));
  const attackerLosses = combatAttackerLosses + logisticsLosses;
  const defenderLossPool = Math.round((defender.army.personnel + campaign.militia) *
    intensity * attackerShare * variance());
"""
s = replace_once(s, old, new, 'campaign counter logistics combat')
p.write_text(s)

# main passes fleet/world geography to operational AI
p = Path('js/main.js')
s = p.read_text()
s = replace_once(s,
"    tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,\n      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays);",
"    tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,\n      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions });",
'main AI options')
p.write_text(s)
