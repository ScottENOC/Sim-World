import { campaignSupplyCorridor, supplyCorridorTarget } from './supplyCorridors.js?v=20260908-corridor1';
import { setCampaignSubregionalObjective } from './subregionalMovement.js?v=20260908-movement1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function weeksFood(campaign) {
  const s = campaign?.logisticsState;
  return s?.weeklyRequirement > 0 ? Math.max(0, (s.carriedFood || 0) / s.weeklyRequirement) : Infinity;
}

function setDirectTarget(campaign, nodeId, directive, risk) {
  campaign.subregional ||= {};
  campaign.subregional.objectivePolicy = 'supply';
  campaign.subregional.targetNodeId = nodeId || null;
  campaign.subregional.route = [];
  campaign.subregional.routeIndex = 0;
  campaign.subregional.edgeProgress = 0;
  campaign.aiLogisticsDirective = directive;
  campaign.aiRiskTolerance = risk;
}

export function chooseSupplyAwareCampaignDirective(campaign, attacker, defender) {
  if (!campaign?.viaSea || !campaign.logisticsState) return { directive: 'normal', riskTolerance: 0.35 };
  const state = campaign.logisticsState;
  const foodWeeks = weeksFood(campaign);
  const corridor = campaignSupplyCorridor(campaign, defender);
  const target = supplyCorridorTarget(campaign, defender);

  // Healthy armies preserve strength and secure the route before taking bad fights.
  if (state.status === 'supplied' && foodWeeks >= 2.5) {
    campaign.aiLogisticsDirective = corridor.reliability < 0.7 ? 'secure_corridor' : 'preserve';
    campaign.aiRiskTolerance = corridor.reliability < 0.7 ? 0.42 : 0.28;
    if (corridor.reliability < 0.7 && target) setDirectTarget(campaign, target, 'secure_corridor', 0.42);
    return { directive: campaign.aiLogisticsDirective, riskTolerance: campaign.aiRiskTolerance, corridor, foodWeeks };
  }

  // Once reserves are becoming uncomfortable, restoring supply outranks prestige objectives.
  if (state.status === 'living_on_stores' || state.status === 'rationing' || foodWeeks < 2) {
    if (target) setDirectTarget(campaign, target, 'secure_corridor', 0.58);
    else setCampaignSubregionalObjective(campaign, defender, 'port');
    campaign.aiLogisticsDirective = target ? 'secure_corridor' : 'seize_port';
    campaign.aiRiskTolerance = 0.58;
    return { directive: campaign.aiLogisticsDirective, riskTolerance: 0.58, corridor, foodWeeks };
  }

  if (state.status === 'severe_shortage') {
    // A badly supplied army will accept poor tactical odds to regain food or communications.
    if (target) setDirectTarget(campaign, target, 'breakout', 0.78);
    else setCampaignSubregionalObjective(campaign, defender, 'countryside');
    campaign.aiLogisticsDirective = target ? 'breakout' : 'forage';
    campaign.aiRiskTolerance = 0.78;
    return { directive: campaign.aiLogisticsDirective, riskTolerance: 0.78, corridor, foodWeeks };
  }

  // Starvation changes the optimisation problem: a dangerous assault may be preferable to certain collapse.
  if (state.status === 'starving') {
    if (target) setDirectTarget(campaign, target, 'desperate_assault', 0.96);
    else setCampaignSubregionalObjective(campaign, defender, 'countryside');
    campaign.aiLogisticsDirective = target ? 'desperate_assault' : 'forage_desperately';
    campaign.aiRiskTolerance = 0.96;
    campaign.desperateAttack = true;
    return { directive: campaign.aiLogisticsDirective, riskTolerance: 0.96, corridor, foodWeeks };
  }

  campaign.aiLogisticsDirective = 'normal';
  campaign.aiRiskTolerance = clamp(campaign.aiRiskTolerance ?? 0.35);
  return { directive: campaign.aiLogisticsDirective, riskTolerance: campaign.aiRiskTolerance, corridor, foodWeeks };
}

export function desperateAttackProfile(campaign) {
  if (!campaign?.desperateAttack || campaign?.logisticsState?.status !== 'starving') return { pressureMultiplier: 1, casualtyMultiplier: 1 };
  return { pressureMultiplier: 1.22, casualtyMultiplier: 1.28 };
}
