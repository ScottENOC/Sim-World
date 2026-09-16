import { launchCampaign } from '../military/campaigns.js?v=20260917-regime-war1';
import { enterGovernmentInExile } from './continuity.js?v=20260917-regime-war1';

const MIN_FORCE = 25;
const CAMPAIGN_GAP_WEEKS = 4;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function ownedRegions(polityId, regions) {
  return (regions || []).filter((region) => region.governance?.sovereignPolityId === polityId);
}

function conflictCampaign(campaign, conflict) {
  const tag = campaign?.regimeConflict;
  return Boolean(tag && !campaign.completed &&
    tag.incumbentPolityId === conflict.incumbentPolityId &&
    tag.revolutionaryPolityId === conflict.revolutionaryPolityId &&
    tag.startedTick === conflict.startedTick);
}

function frontierOptions(sideId, enemyId, regions) {
  const byId = new Map((regions || []).map((region) => [region.id, region]));
  const options = [];
  for (const attacker of ownedRegions(sideId, regions)) {
    const personnel = Math.max(0, Number(attacker.army?.personnel) || 0);
    if (personnel < MIN_FORCE) continue;
    const enemies = (attacker.neighbors || [])
      .map((id) => byId.get(id))
      .filter((region) => region?.governance?.sovereignPolityId === enemyId);
    if (!enemies.length) continue;
    enemies.sort((a, b) => {
      const aDef = (a.army?.personnel || 0) * (0.6 + 0.4 * (a.stability ?? 0.5));
      const bDef = (b.army?.personnel || 0) * (0.6 + 0.4 * (b.stability ?? 0.5));
      return aDef - bDef;
    });
    options.push({
      attacker,
      defender: enemies[0],
      score: personnel * (0.7 + 0.3 * (attacker.stability ?? 0.5)),
    });
  }
  return options.sort((a, b) => b.score - a.score);
}

function frontierPower(options) {
  return options.reduce((sum, item) => sum + item.score, 0);
}

function syncConflictState(polities, conflict, patch) {
  for (const polityId of [conflict.incumbentPolityId, conflict.revolutionaryPolityId]) {
    const polity = (polities || []).find((candidate) => candidate.id === polityId);
    if (!polity?.regimeConflict || polity.regimeConflict.status !== 'active') continue;
    Object.assign(polity.regimeConflict, patch);
  }
}

function ensureOwnedSeat(polity, regions) {
  const owned = ownedRegions(polity.id, regions);
  if (!owned.length) return null;
  const current = owned.find((region) => region.id === polity.capitalRegionId);
  const seat = current || [...owned].sort((a, b) => (b.population || 0) - (a.population || 0))[0];
  polity.capitalRegionId = seat.id;
  polity.rulerRegionId = seat.id;
  polity.continuity ||= {};
  polity.continuity.seatRegionId = seat.id;
  return seat;
}

function finishConflict(conflict, polities, regions, currentTick, options = {}) {
  const incumbent = (polities || []).find((candidate) => candidate.id === conflict.incumbentPolityId);
  const revolutionary = (polities || []).find((candidate) => candidate.id === conflict.revolutionaryPolityId);
  if (!incumbent || !revolutionary) return null;
  const incumbentRegions = ownedRegions(incumbent.id, regions);
  const revolutionaryRegions = ownedRegions(revolutionary.id, regions);
  if (incumbentRegions.length && revolutionaryRegions.length) return null;

  const winner = incumbentRegions.length ? incumbent : revolutionary;
  const loser = winner.id === incumbent.id ? revolutionary : incumbent;
  const outcome = winner.id === revolutionary.id ? 'revolutionary_victory' : 'incumbent_victory';
  const winnerSeat = ensureOwnedSeat(winner, regions);
  winner.continuity ||= {};
  winner.continuity.status = 'sovereign';
  winner.continuity.hostPolityId = null;
  winner.continuity.overlordPolityId = null;
  winner.continuity.legitimacy = clamp((winner.continuity.legitimacy ?? winner.administration?.legitimacy ?? 0.3) + 0.06);
  winner.administration ||= {};
  winner.administration.legitimacy = clamp((winner.administration.legitimacy ?? 0.3) + 0.05);

  let exile = {
    hostPolityId: loser.continuity?.hostPolityId || null,
    hostRegionId: loser.continuity?.seatRegionId || null,
    exilePopulation: loser.continuity?.exilePopulation || 0,
  };
  if (loser.continuity?.status !== 'exile') {
    exile = enterGovernmentInExile(loser, regions, polities, currentTick, winner.id);
  }

  winner.regimeHistory ||= [];
  loser.regimeHistory ||= [];
  winner.regimeHistory.push({ kind: 'regime_civil_war_victory', tick: currentTick, opponentPolityId: loser.id, outcome });
  loser.regimeHistory.push({ kind: 'regime_civil_war_defeat', tick: currentTick, opponentPolityId: winner.id, outcome });
  winner.regimeConflict = null;
  loser.regimeConflict = null;

  return {
    type: 'regime_civil_war_resolved',
    outcome,
    winnerPolityId: winner.id,
    winnerName: winner.name,
    winnerSeatRegionId: winnerSeat?.id || null,
    loserPolityId: loser.id,
    loserName: loser.name,
    hostPolityId: exile.hostPolityId || null,
    hostRegionId: exile.hostRegionId || null,
    playerRelevant: options.playerPolityId === winner.id || options.playerPolityId === loser.id,
    summary: outcome === 'revolutionary_victory'
      ? 'The revolutionary government has won the civil war. The displaced incumbent survives only through whatever exile support it can retain.'
      : 'The incumbent government has defeated the revolutionary state. The revolutionary leadership survives, if at all, as an exile claimant.',
  };
}

function launchFromOption(option, conflict, campaigns, regions, polities, currentTick) {
  if (!option) return null;
  const requested = Math.max(MIN_FORCE, Math.floor((option.attacker.army?.personnel || 0) * 0.55));
  const campaign = launchCampaign(option.attacker, option.defender, 'subjugation', requested, currentTick, {
    campaigns,
    regions,
    polities,
    regimeConflict: {
      incumbentPolityId: conflict.incumbentPolityId,
      revolutionaryPolityId: conflict.revolutionaryPolityId,
      startedTick: conflict.startedTick,
    },
  });
  if (campaign) campaigns.push(campaign);
  return campaign;
}

function optionSide(regionId, regions) {
  return regions.find((region) => region.id === regionId)?.governance?.sovereignPolityId || null;
}

export function tickRegimeCivilWars(polities, regions, campaigns, currentTick, rng = Math.random, options = {}) {
  const events = [];
  const incumbents = (polities || []).filter((polity) => polity.regimeConflict?.status === 'active' &&
    polity.regimeConflict.incumbentPolityId === polity.id);

  for (const incumbent of incumbents) {
    const conflict = incumbent.regimeConflict;
    const revolutionary = polities.find((candidate) => candidate.id === conflict.revolutionaryPolityId);
    if (!revolutionary) {
      incumbent.regimeConflict = null;
      continue;
    }

    const resolved = finishConflict(conflict, polities, regions, currentTick, options);
    if (resolved) {
      events.push(resolved);
      continue;
    }

    if ((campaigns || []).some((campaign) => conflictCampaign(campaign, conflict))) continue;
    if (Number.isFinite(conflict.lastCampaignTick) && currentTick - conflict.lastCampaignTick < CAMPAIGN_GAP_WEEKS) continue;

    const incumbentFront = frontierOptions(incumbent.id, revolutionary.id, regions);
    const revolutionaryFront = frontierOptions(revolutionary.id, incumbent.id, regions);
    if (!incumbentFront.length && !revolutionaryFront.length) continue;

    const incumbentPower = frontierPower(incumbentFront);
    const revolutionaryPower = frontierPower(revolutionaryFront);
    const incumbentFirst = rng() < incumbentPower / Math.max(1, incumbentPower + revolutionaryPower);
    const attempts = incumbentFirst
      ? [incumbentFront[0], revolutionaryFront[0]]
      : [revolutionaryFront[0], incumbentFront[0]];
    const campaign = launchFromOption(attempts[0], conflict, campaigns, regions, polities, currentTick) ||
      launchFromOption(attempts[1], conflict, campaigns, regions, polities, currentTick);
    if (!campaign) continue;

    syncConflictState(polities, conflict, { lastCampaignTick: currentTick });
    const attackerPolityId = optionSide(campaign.attackerId, regions);
    const defenderPolityId = optionSide(campaign.defenderId, regions);
    const attackerName = polities.find((candidate) => candidate.id === attackerPolityId)?.name || campaign.attackerId;
    const defenderName = polities.find((candidate) => candidate.id === defenderPolityId)?.name || campaign.defenderId;
    events.push({
      type: 'regime_civil_war_campaign_started',
      incumbentPolityId: incumbent.id,
      revolutionaryPolityId: revolutionary.id,
      attackerPolityId,
      defenderPolityId,
      attackerRegionId: campaign.attackerId,
      defenderRegionId: campaign.defenderId,
      campaignId: campaign.id,
      playerRelevant: options.playerPolityId === incumbent.id || options.playerPolityId === revolutionary.id,
      summary: `${attackerName} has opened a civil-war campaign against territory held by ${defenderName}. The ordinary campaign system will resolve movement, supply, battle, siege and casualties.`,
    });
  }

  return events;
}
