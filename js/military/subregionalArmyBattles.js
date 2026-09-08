import { campaignsAtSameNode } from './subregionalMovement.js?v=20260908-movement1';
import { stanceBetween, WAR_STANCES, warForCampaign } from './warTheatres.js?v=20260908-war1';
import { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function effectiveCampaignPower(campaign, region, node) {
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

function relationBetween(a, b, war) {
  if (a.occupationActorId === b.occupationActorId) return 'same_actor';
  if (!war) return 'avoid';
  const ab = stanceBetween(war, a.occupationActorId, b.occupationActorId);
  const ba = stanceBetween(war, b.occupationActorId, a.occupationActorId);
  if (ab === WAR_STANCES.HOSTILE || ba === WAR_STANCES.HOSTILE) return 'hostile';
  if (ab === WAR_STANCES.COOPERATE && ba === WAR_STANCES.COOPERATE) return 'cooperate';
  if ([ab, ba].includes(WAR_STANCES.COOPERATE) || [ab, ba].includes(WAR_STANCES.COBELLIGERENT)) return 'cobelligerent';
  return 'avoid';
}

export function alliedCoordinationQuality(campaigns, war, regionsById) {
  if (!campaigns?.length || campaigns.length === 1) return 1;
  let relationTotal = 0;
  let relationCount = 0;
  for (let i = 0; i < campaigns.length; i++) {
    for (let j = i + 1; j < campaigns.length; j++) {
      const relation = relationBetween(campaigns[i], campaigns[j], war);
      if (relation === 'same_actor') relationTotal += 1;
      else if (relation === 'cooperate') relationTotal += 0.94;
      else if (relation === 'cobelligerent') relationTotal += 0.76;
      else relationTotal += 0.58;
      relationCount += 1;
    }
  }
  const relationshipQuality = relationCount ? relationTotal / relationCount : 1;
  const institutional = campaigns.reduce((sum, campaign) => {
    const region = regionsById.get(campaign.attackerId);
    return sum + clamp(region?.militaryProfessionalisation?.institutionalExperience || 0);
  }, 0) / campaigns.length;
  return clamp(relationshipQuality + institutional * 0.08, 0.55, 1);
}

function canJoinCoalition(candidate, coalition, war) {
  if (!coalition.length) return true;
  let hasPositiveLink = false;
  for (const member of coalition) {
    const relation = relationBetween(candidate, member, war);
    if (relation === 'hostile') return false;
    if (['same_actor','cooperate','cobelligerent'].includes(relation)) hasPositiveLink = true;
  }
  return hasPositiveLink;
}

function buildCoalitions(group, war) {
  const coalitions = [];
  for (const campaign of group) {
    let placed = false;
    for (const coalition of coalitions) {
      if (!canJoinCoalition(campaign, coalition, war)) continue;
      coalition.push(campaign);
      placed = true;
      break;
    }
    if (!placed) coalitions.push([campaign]);
  }
  return coalitions;
}

function coalitionsHostile(a, b, war) {
  return a.some((x) => b.some((y) => relationBetween(x, y, war) === 'hostile'));
}

function coalitionPower(coalition, node, regionsById, war) {
  const members = coalition.map((campaign) => {
    const region = regionsById.get(campaign.attackerId);
    return { campaign, region, power: region ? effectiveCampaignPower(campaign, region, node) : 0 };
  });
  const nominalPower = members.reduce((sum, member) => sum + member.power, 0);
  const coordinationQuality = alliedCoordinationQuality(coalition, war, regionsById);
  return { members, nominalPower, coordinationQuality, effectivePower: nominalPower * coordinationQuality };
}

function applyCoalitionLosses(side, enemyPower, ownPower, rng) {
  const totalExposure = side.members.reduce((sum, member) => sum + Math.max(1, member.power), 0);
  const losses = [];
  for (const member of side.members) {
    const campaign = member.campaign;
    const exposure = Math.max(1, member.power) / Math.max(1, totalExposure);
    const baseLosses = (campaign.personnel || 0) * casualtyRate(ownPower, enemyPower, campaign, rng);
    const coordinationPenalty = 1 + (1 - side.coordinationQuality) * 0.32;
    const actual = applyLosses(campaign, member.region, baseLosses * coordinationPenalty * (0.82 + exposure * 0.36));
    const shock = actual / Math.max(1, campaign.initialPersonnel || campaign.personnel + actual || 1);
    campaign.attackerMorale = clamp((campaign.attackerMorale ?? 1) - shock * 1.9);
    losses.push({ campaignId: campaign.id, actorId: campaign.occupationActorId, losses: actual });
  }
  return losses;
}

function coalitionBroken(side) {
  const remaining = side.members.reduce((sum, member) => sum + Math.max(0, member.campaign.personnel || 0), 0);
  const initial = side.members.reduce((sum, member) => sum + Math.max(1, member.campaign.initialPersonnel || member.campaign.personnel || 1), 0);
  const morale = side.members.reduce((sum, member) => sum + clamp(member.campaign.attackerMorale ?? 1), 0) / Math.max(1, side.members.length);
  return morale < 0.16 || remaining < initial * 0.14;
}

function retreatCoalition(side) {
  return side.members.map(({ campaign }) => ({ campaignId: campaign.id, ...retreatCampaign(campaign) }));
}

function clearWinnerBlocks(side) {
  for (const { campaign } of side.members) {
    campaign.subregional.blockedByCampaignId = null;
    campaign.subregional.targetNodeId = null;
    campaign.subregional.route = [];
  }
}

function blockOpposingCoalitions(a, b) {
  const aLead = b.members[0]?.campaign?.id || null;
  const bLead = a.members[0]?.campaign?.id || null;
  for (const { campaign } of a.members) campaign.subregional.blockedByCampaignId = aLead;
  for (const { campaign } of b.members) campaign.subregional.blockedByCampaignId = bLead;
}

function resolveCoalitionBattle(coalitionA, coalitionB, node, war, regionsById, currentTick, rng) {
  const a = coalitionPower(coalitionA, node, regionsById, war);
  const b = coalitionPower(coalitionB, node, regionsById, war);
  const lossesA = applyCoalitionLosses(a, b.effectivePower, a.effectivePower, rng);
  const lossesB = applyCoalitionLosses(b, a.effectivePower, b.effectivePower, rng);
  const ratio = a.effectivePower / Math.max(1, b.effectivePower);
  let winner = null, loser = null;
  if (ratio >= 1.32 || coalitionBroken(b)) { winner = a; loser = b; }
  else if (ratio <= 0.76 || coalitionBroken(a)) { winner = b; loser = a; }
  let retreats = [];
  if (winner && loser) {
    retreats = retreatCoalition(loser);
    clearWinnerBlocks(winner);
  } else {
    blockOpposingCoalitions(a, b);
  }
  const winnerIds = winner?.members.map((member) => member.campaign.id) || [];
  const loserIds = loser?.members.map((member) => member.campaign.id) || [];
  const record = {
    tick: currentTick,
    nodeId: node?.id || coalitionA[0]?.subregional?.currentNodeId || null,
    coalitionA: coalitionA.map((campaign) => ({ campaignId: campaign.id, actorId: campaign.occupationActorId })),
    coalitionB: coalitionB.map((campaign) => ({ campaignId: campaign.id, actorId: campaign.occupationActorId })),
    lossesA, lossesB,
    nominalPowerA: a.nominalPower, nominalPowerB: b.nominalPower,
    powerA: a.effectivePower, powerB: b.effectivePower,
    coordinationA: a.coordinationQuality, coordinationB: b.coordinationQuality,
    winnerCampaignIds: winnerIds, loserCampaignIds: loserIds,
    winnerCampaignId: winnerIds.length === 1 ? winnerIds[0] : null,
    loserCampaignId: loserIds.length === 1 ? loserIds[0] : null,
    decisive: Boolean(winner), retreats,
  };
  for (const campaign of [...coalitionA, ...coalitionB]) {
    campaign.fieldBattleHistory ||= [];
    campaign.fieldBattleHistory.push(record);
    if (campaign.fieldBattleHistory.length > 20) campaign.fieldBattleHistory.shift();
  }
  return record;
}

export function resolveSubregionalArmyBattles(campaigns, wars, defenderRegion, regionsById, currentTick, rng = Math.random) {
  const events = [];
  if (!defenderRegion) return events;
  const control = defenderRegion.subregionalControl;
  for (const group of campaignsAtSameNode(campaigns, defenderRegion.id)) {
    const node = control?.places?.find((p) => p.id === group.nodeId) || null;
    const war = group.campaigns.map((campaign) => warForCampaign(wars || [], campaign)).find(Boolean) || null;
    const coalitions = buildCoalitions(group.campaigns, war);
    for (let i = 0; i < coalitions.length; i++) {
      for (let j = i + 1; j < coalitions.length; j++) {
        if (!coalitionsHostile(coalitions[i], coalitions[j], war)) continue;
        const battle = resolveCoalitionBattle(coalitions[i], coalitions[j], node, war, regionsById, currentTick, rng);
        const singlePair = coalitions[i].length === 1 && coalitions[j].length === 1;
        const type = singlePair
          ? (battle.decisive ? 'subregional_army_battle_decided' : 'subregional_army_battle_continues')
          : (battle.decisive ? 'subregional_coalition_battle_decided' : 'subregional_coalition_battle_continues');
        events.push({ type, ...battle });
      }
    }
  }
  return events;
}
