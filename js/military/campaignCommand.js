import { routeBetween, setCampaignSubregionalObjective } from './subregionalMovement.js?v=20260909-command1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const CAMPAIGN_ORDERS = Object.freeze({
  delegate: { label: 'Leave operational decisions to the general' },
  secure_supply: { label: 'Secure the supply line' },
  hold: { label: 'Hold current positions' },
  press_capital: { label: 'Press for the principal settlement' },
  avoid_battle: { label: 'Avoid a major battle' },
  seek_battle: { label: 'Seek a decisive battle' },
  withdraw: { label: 'Withdraw in good order' },
  evacuate: { label: 'Evacuate the expedition' },
});

function supplyWeeks(campaign) {
  const logistics = campaign?.logisticsState;
  if (!logistics) return null;
  const need = Math.max(1, Number(logistics.weeklyFoodNeed || logistics.weeklyRequirement?.food || 0));
  const food = Math.max(0, Number(logistics.carriedFood || logistics.food || 0));
  return food / need;
}

function supplyStatus(campaign) {
  return campaign?.logisticsState?.status || (Number(campaign?.supply ?? 1) < 0.35 ? 'low' : 'supplied');
}

export function ensureCampaignCommand(campaign) {
  campaign.commandState ||= {
    order: 'delegate',
    issuedTick: null,
    rationale: null,
    playerIssued: false,
    previousObjectivePolicy: null,
  };
  campaign.battleCommand ||= {};
  return campaign.commandState;
}

export function marshalCampaignAssessment(campaign, attacker, defender) {
  if (!campaign) return null;
  const command = ensureCampaignCommand(campaign);
  const initial = Math.max(1, Number(campaign.initialPersonnel || campaign.personnel || 1));
  const personnel = Math.max(0, Number(campaign.personnel || 0));
  const casualtyShare = clamp((Number(campaign.attackerCasualties || 0)) / initial);
  const morale = clamp(campaign.attackerMorale ?? 1);
  const supply = clamp(campaign.supply ?? campaign.logisticsState?.supplyFraction ?? 1);
  const weeks = supplyWeeks(campaign);
  const logistics = campaign.logisticsState || {};
  const corridor = Number(logistics.internalCorridorReliability ?? logistics.routeReliability ?? 1);
  const broken = logistics.corridorBrokenNodeId || null;
  const weak = logistics.corridorWeakNodeId || null;
  const status = supplyStatus(campaign);
  const blocked = Boolean(campaign.subregional?.blockedByCampaignId);

  let risk = 'low';
  let recommendation = 'delegate';
  let reason = 'The campaign is functioning within ordinary operational limits.';
  if (campaign.phase === 'returning' || campaign.withdrawRequested) {
    risk = 'high'; recommendation = campaign.viaSea ? 'evacuate' : 'withdraw'; reason = 'The army is already disengaging.';
  } else if (['starving','severe_shortage'].includes(status) || supply < 0.22) {
    risk = 'critical';
    if (broken || corridor < 0.25) { recommendation = 'secure_supply'; reason = 'The army is close to supply collapse; reopening the corridor matters more than the campaign objective.'; }
    else { recommendation = campaign.viaSea ? 'evacuate' : 'withdraw'; reason = 'Stores and fighting power are near collapse and there is no clear corridor problem the field army can quickly repair.'; }
  } else if (broken || corridor < 0.55) {
    risk = 'high'; recommendation = 'secure_supply'; reason = 'The inland supply corridor is cut or unreliable. Further advance risks isolating the army.';
  } else if (casualtyShare > 0.35 || morale < 0.35) {
    risk = 'high'; recommendation = 'hold'; reason = 'Losses or morale make another aggressive move unusually dangerous.';
  } else if (blocked && supply > 0.6 && morale > 0.55) {
    risk = 'moderate'; recommendation = 'seek_battle'; reason = 'A hostile field army is physically blocking the advance while our force remains capable of fighting.';
  } else if (supply < 0.48 || (weeks !== null && weeks < 2.5)) {
    risk = 'moderate'; recommendation = 'hold'; reason = 'The army has limited reserves. Consolidating before another advance reduces the chance of a supply crisis.';
  } else if (campaign.pressure > 0.55 && morale > 0.58) {
    risk = 'moderate'; recommendation = 'press_capital'; reason = 'The campaign has momentum and enough supply to exploit it against the principal objective.';
  }

  const position = campaign.subregional?.currentNodeId || (campaign.phase === 'travelling' ? 'on the march' : 'unknown');
  const objective = campaign.subregional?.objectivePolicy || campaign.objective || 'balanced';
  return {
    campaignId: campaign.id,
    attackerName: attacker?.name || campaign.attackerId,
    defenderName: defender?.name || campaign.defenderId,
    phase: campaign.phase,
    position,
    objective,
    personnel,
    initialPersonnel: initial,
    casualties: Number(campaign.attackerCasualties || 0),
    casualtyShare,
    morale,
    supply,
    supplyWeeks: weeks,
    supplyStatus: status,
    corridorReliability: corridor,
    corridorBrokenNodeId: broken,
    corridorWeakNodeId: weak,
    blocked,
    recommendation,
    risk,
    reason,
    currentOrder: command.order,
    playerIssued: command.playerIssued,
    generalIntent: campaign.aiLogisticsDirective || campaign.subregional?.objectivePolicy || 'continue campaign',
  };
}

function setDirectTarget(campaign, defender, nodeId) {
  if (!nodeId || !defender || !campaign.subregional?.currentNodeId) return false;
  const route = routeBetween(defender, campaign.subregional.currentNodeId, nodeId);
  campaign.subregional.targetNodeId = nodeId;
  campaign.subregional.route = route.nodeIds;
  campaign.subregional.routeIndex = 0;
  campaign.subregional.edgeProgress = 0;
  campaign.subregional.blockedByCampaignId = null;
  return true;
}

export function issueCampaignOrder(campaign, order, defender = null, currentTick = null, options = {}) {
  if (!campaign || campaign.completed || !CAMPAIGN_ORDERS[order]) return { changed: false, reason: 'invalid_order' };
  const state = ensureCampaignCommand(campaign);
  if (!state.previousObjectivePolicy) state.previousObjectivePolicy = campaign.subregional?.objectivePolicy || 'balanced';
  state.order = order;
  state.issuedTick = currentTick;
  state.playerIssued = options.playerIssued !== false;
  state.rationale = options.rationale || null;
  campaign.playerOperationalOverride = order !== 'delegate';

  if (order === 'delegate') {
    campaign.playerOperationalOverride = false;
    campaign.battleCommand.intendedCommitmentFraction = null;
    if (campaign.subregional?.objectivePolicy === 'hold') setCampaignSubregionalObjective(campaign, defender, state.previousObjectivePolicy || 'balanced');
  } else if (order === 'secure_supply') {
    const nodeId = campaign.logisticsState?.corridorBrokenNodeId || campaign.logisticsState?.corridorWeakNodeId || null;
    if (nodeId && campaign.logisticsState?.corridorBrokenNodeId) setDirectTarget(campaign, defender, nodeId);
    else setCampaignSubregionalObjective(campaign, defender, campaign.viaSea ? 'port' : 'hold');
    campaign.battleCommand.intendedCommitmentFraction = 0.78;
  } else if (order === 'hold') {
    setCampaignSubregionalObjective(campaign, defender, 'hold');
    campaign.battleCommand.intendedCommitmentFraction = 0.72;
  } else if (order === 'press_capital') {
    setCampaignSubregionalObjective(campaign, defender, 'capital');
    campaign.battleCommand.intendedCommitmentFraction = 0.9;
  } else if (order === 'avoid_battle') {
    setCampaignSubregionalObjective(campaign, defender, 'hold');
    campaign.battleCommand.intendedCommitmentFraction = 0.5;
    campaign.battleCommand.engagementPosture = 'avoid';
  } else if (order === 'seek_battle') {
    if (campaign.subregional?.objectivePolicy === 'hold') setCampaignSubregionalObjective(campaign, defender, 'balanced');
    campaign.battleCommand.intendedCommitmentFraction = 0.98;
    campaign.battleCommand.engagementPosture = 'seek';
  } else if (order === 'withdraw' || order === 'evacuate') {
    campaign.withdrawRequested = true;
    campaign.evacuationRequested = order === 'evacuate';
    campaign.battleCommand.intendedCommitmentFraction = 0.6;
  }
  if (!['avoid_battle','seek_battle'].includes(order)) delete campaign.battleCommand.engagementPosture;
  return { changed: true, order, state };
}

export function applyPlayerCommandToBattleParticipation(campaign, baseFraction) {
  const posture = campaign?.battleCommand?.engagementPosture;
  if (posture === 'avoid') return clamp(Math.min(baseFraction, 0.55), 0.12, 1);
  if (posture === 'seek') return clamp(Math.max(baseFraction, 0.95), 0.12, 1);
  return clamp(baseFraction, 0.12, 1);
}
