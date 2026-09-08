import { campaignsAtSameNode } from './subregionalMovement.js?v=20260908-movement1';
import { stanceBetween, WAR_STANCES, warForCampaign } from './warTheatres.js?v=20260908-war1';
import { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function effectiveCampaignPower(campaign, region, node, opponentCampaign) {
  const personnel = Math.max(1, campaign.personnel || 0);
  const supply = clamp(campaign.supply ?? campaign.logisticsState?.supplyFraction ?? 1);
  const morale = clamp(campaign.attackerMorale ?? 1);
  const desperation = desperateAttackProfile(campaign);
  const fortHold = node?.controllerActorId === campaign.occupationActorId && ['fort','city','principal_settlement','town'].includes(node?.kind)
    ? 1.12 : 1;
  const garrisonSupport = node?.garrisonActorId === campaign.occupationActorId
    ? 1 + Math.min(0.18, (node.garrisonPersonnel || 0) / Math.max(1, personnel) * 0.35) : 1;
  const professional = 1 + Math.min(0.22, Number(region?.militaryProfessionalisation?.institutionalExperience || 0) * 0.25);
  const pressure = desperation.pressureMultiplier || 1;
  const fatigue = clamp(1 - Math.max(0, 0.45 - supply) * 0.45, 0.72, 1);
  return personnel * (0.58 + supply * 0.42) * (0.62 + morale * 0.38) * fortHold * garrisonSupport * professional * fatigue * pressure;
}

function casualtyRate(ownPower, enemyPower, campaign, rng) {
  const share = enemyPower / Math.max(1, ownPower + enemyPower);
  const desperation = desperateAttackProfile(campaign);
  return clamp((0.012 + share * 0.032) * (0.82 + rng() * 0.36) * (desperation.casualtyMultiplier || 1), 0.006, 0.075);
}

function applyLosses(campaign, attackerRegion, losses) {
  const actual = Math.min(Math.max(0, Math.round(losses)), Math.max(0, campaign.personnel || 0));
  campaign.personnel = Math.max(0, (campaign.personnel || 0) - actual);
  campaign.attackerCasualties = (campaign.attackerCasualties || 0) + actual;
  if (attackerRegion?.army) attackerRegion.army.away = Math.max(0, (attackerRegion.army.away || 0) - actual);
  return actual;
}

function retreatCampaign(campaign) {
  const state = campaign.subregional ||= {};
  const fallback = state.previousNodeId || null;
  if (fallback) {
    state.currentNodeId = fallback;
    state.previousNodeId = null;
    state.targetNodeId = null;
    state.route = [];
    state.routeIndex = 0;
    state.edgeProgress = 0;
    state.blockedByCampaignId = null;
    return { retreated: true, nodeId: fallback };
  }
  campaign.withdrawRequested = true;
  state.blockedByCampaignId = null;
  return { retreated: false, withdrawalRequested: true };
}

function resolvePair(a, b, node, regionsById, currentTick, rng) {
  const aRegion = regionsById.get(a.attackerId);
  const bRegion = regionsById.get(b.attackerId);
  if (!aRegion || !bRegion) return null;
  const aPower = effectiveCampaignPower(a, aRegion, node, b);
  const bPower = effectiveCampaignPower(b, bRegion, node, a);
  const aLosses = applyLosses(a, aRegion, (a.personnel || 0) * casualtyRate(aPower, bPower, a, rng));
  const bLosses = applyLosses(b, bRegion, (b.personnel || 0) * casualtyRate(bPower, aPower, b, rng));
  const aShock = aLosses / Math.max(1, a.initialPersonnel || a.personnel + aLosses || 1);
  const bShock = bLosses / Math.max(1, b.initialPersonnel || b.personnel + bLosses || 1);
  a.attackerMorale = clamp((a.attackerMorale ?? 1) - aShock * 1.9);
  b.attackerMorale = clamp((b.attackerMorale ?? 1) - bShock * 1.9);

  const ratio = aPower / Math.max(1, bPower);
  let winner = null, loser = null;
  if (ratio >= 1.32 || b.attackerMorale < 0.16 || b.personnel < (b.initialPersonnel || 1) * 0.14) { winner = a; loser = b; }
  else if (ratio <= 0.76 || a.attackerMorale < 0.16 || a.personnel < (a.initialPersonnel || 1) * 0.14) { winner = b; loser = a; }

  let retreat = null;
  if (winner && loser) {
    retreat = retreatCampaign(loser);
    winner.subregional.blockedByCampaignId = null;
    winner.subregional.targetNodeId = null;
    winner.subregional.route = [];
  } else {
    a.subregional.blockedByCampaignId = b.id;
    b.subregional.blockedByCampaignId = a.id;
  }

  const record = {
    tick: currentTick, nodeId: node?.id || a.subregional?.currentNodeId || null,
    campaignAId: a.id, campaignBId: b.id, actorAId: a.occupationActorId, actorBId: b.occupationActorId,
    lossesA: aLosses, lossesB: bLosses, powerA: aPower, powerB: bPower,
    winnerCampaignId: winner?.id || null, loserCampaignId: loser?.id || null,
    decisive: Boolean(winner), retreat,
  };
  a.fieldBattleHistory ||= []; b.fieldBattleHistory ||= [];
  a.fieldBattleHistory.push(record); b.fieldBattleHistory.push(record);
  if (a.fieldBattleHistory.length > 20) a.fieldBattleHistory.shift();
  if (b.fieldBattleHistory.length > 20) b.fieldBattleHistory.shift();
  return record;
}

export function resolveSubregionalArmyBattles(campaigns, wars, defenderRegion, regionsById, currentTick, rng = Math.random) {
  const events = [];
  if (!defenderRegion) return events;
  const control = defenderRegion.subregionalControl;
  for (const group of campaignsAtSameNode(campaigns, defenderRegion.id)) {
    const node = control?.places?.find((p) => p.id === group.nodeId) || null;
    for (let i = 0; i < group.campaigns.length; i++) {
      for (let j = i + 1; j < group.campaigns.length; j++) {
        const a = group.campaigns[i], b = group.campaigns[j];
        if (a.occupationActorId === b.occupationActorId) continue;
        const war = warForCampaign(wars || [], a) || warForCampaign(wars || [], b);
        const stanceAB = war ? stanceBetween(war, a.occupationActorId, b.occupationActorId) : WAR_STANCES.AVOID;
        const stanceBA = war ? stanceBetween(war, b.occupationActorId, a.occupationActorId) : WAR_STANCES.AVOID;
        const hostile = stanceAB === WAR_STANCES.HOSTILE || stanceBA === WAR_STANCES.HOSTILE;
        if (!hostile) continue;
        const battle = resolvePair(a, b, node, regionsById, currentTick, rng);
        if (!battle) continue;
        events.push({ type: battle.decisive ? 'subregional_army_battle_decided' : 'subregional_army_battle_continues', ...battle });
      }
    }
  }
  return events;
}
