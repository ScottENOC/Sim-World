import {
  enterGovernmentInExile,
  initialisePoliticalContinuity,
  plausibleGovernedRegions,
} from './continuity.js?v=20260913-succession-continuity1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function ensureClaims(polity) {
  polity.continuity ||= {};
  polity.continuity.claims ||= {};
  polity.continuity.historicalControl ||= {};
  polity.continuity.exileSupport ||= {};
  return polity.continuity;
}

function sovereignTerritories(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

/**
 * Link a succession challenger to the same continuity machinery used by a
 * conquered/displaced government. The challenger remains a distinct political
 * faction, but gains durable claims, a seat, legitimacy and later access to the
 * normal exile/restoration path if it loses the civil war.
 */
export function linkSuccessionClaimant(parentPolity, claimantPolity, rival, supportRegionIds, regions, polities, currentTick) {
  if (!parentPolity || !claimantPolity || parentPolity.id === claimantPolity.id) return null;

  // Reuse the canonical continuity initialiser so dynasty/faction IDs,
  // historical local control and claim records have exactly the same shape as
  // conquest-generated claimant governments.
  initialisePoliticalContinuity([parentPolity, claimantPolity], regions, currentTick);
  const parent = ensureClaims(parentPolity);
  const claimant = ensureClaims(claimantPolity);
  const supported = new Set(supportRegionIds || []);
  const parentTerritories = sovereignTerritories(parentPolity, regions);
  const anchor = regions.find((region) => supported.has(region.id)) ||
    regions.find((region) => region.id === claimantPolity.capitalRegionId) || null;

  claimant.status = 'claimant';
  claimant.hostPolityId = null;
  claimant.overlordPolityId = null;
  claimant.seatRegionId = anchor?.id || claimantPolity.capitalRegionId || null;
  claimant.legitimacy = clamp(Math.max(claimant.legitimacy || 0.18, rival?.legitimacy || 0.2));
  claimant.prestige = clamp(Math.max(claimant.prestige || 0.1, claimant.legitimacy * 0.55));
  claimant.successionClaim = {
    parentPolityId: parentPolity.id,
    claimantId: rival?.id || claimantPolity.claimantId || null,
    kind: rival?.kind || 'succession_claimant',
    generation: parentPolity.succession?.rulerGeneration || 1,
    startedTick: currentTick,
    status: 'contesting',
  };

  // A succession claimant is claiming the same realm, not merely the province
  // that supplied its first supporters. Supported provinces are strongest,
  // while the rest of the incumbent realm still receives a meaningful dynastic
  // or political claim so later restoration is possible without inventing a
  // second claimant system.
  for (const region of parentTerritories) {
    const strength = supported.has(region.id) ? 0.96 : 0.68;
    claimant.claims[region.id] = Math.max(claimant.claims[region.id] || 0, strength);
    parent.claims[region.id] = Math.max(parent.claims[region.id] || 0, 0.96);
  }
  for (const regionId of supported) {
    claimant.claims[regionId] = Math.max(claimant.claims[regionId] || 0, 0.96);
    parent.claims[regionId] = Math.max(parent.claims[regionId] || 0, 0.96);
  }

  claimantPolity.claimantOfPolityId = parentPolity.id;
  claimantPolity.claimantId = rival?.id || claimantPolity.claimantId || null;
  return claimant;
}

/**
 * Resolve only the territorial phase of a succession war. The defeated faction
 * is deliberately not deleted: it becomes the same government-in-exile actor
 * used after conquest and can lobby foreign hosts for restoration.
 */
export function reconcileSuccessionContinuity(parentPolity, polities, regions, currentTick) {
  const crisis = parentPolity?.succession?.crisis;
  if (!crisis?.escalated || crisis.continuityResolved) return null;
  const claimantPolity = polities.find((candidate) => candidate.id === crisis.claimantPolityId);
  if (!claimantPolity) return null;

  const parentTerritories = sovereignTerritories(parentPolity, regions);
  const claimantTerritories = sovereignTerritories(claimantPolity, regions);
  if (parentTerritories.length && claimantTerritories.length) return null;

  const loser = parentTerritories.length ? claimantPolity : parentPolity;
  const winner = parentTerritories.length ? parentPolity : claimantPolity;
  const loserContinuity = ensureClaims(loser);
  const winnerContinuity = ensureClaims(winner);

  const plausible = plausibleGovernedRegions(loser, regions, polities, 0.42);
  if (plausible.length || Object.keys(loserContinuity.claims || {}).length) {
    enterGovernmentInExile(loser, regions, polities, currentTick, winner.id);
    loserContinuity.successionClaim ||= {};
    loserContinuity.successionClaim.status = 'defeated_exile';
    loserContinuity.successionClaim.defeatedTick = currentTick;
    loserContinuity.successionClaim.winnerPolityId = winner.id;
  } else {
    loserContinuity.status = 'extinct';
  }

  winnerContinuity.status = 'sovereign';
  winnerContinuity.hostPolityId = null;
  winnerContinuity.overlordPolityId = null;
  winnerContinuity.seatRegionId = winner.capitalRegionId || winnerContinuity.seatRegionId;
  if (winnerContinuity.successionClaim) {
    winnerContinuity.successionClaim.status = 'victorious';
    winnerContinuity.successionClaim.victoryTick = currentTick;
  }

  crisis.continuityResolved = true;
  crisis.contested = false;
  crisis.winnerPolityId = winner.id;
  crisis.loserPolityId = loser.id;
  crisis.resolvedTick = currentTick;

  return {
    type: 'succession_continuity_resolved',
    polityId: parentPolity.id,
    winnerPolityId: winner.id,
    loserPolityId: loser.id,
    loserStatus: loserContinuity.status,
    hostPolityId: loserContinuity.hostPolityId || null,
  };
}
