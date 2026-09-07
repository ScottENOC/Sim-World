import { attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { cultureAffinity } from '../society/culture.js?v=20260907-culture1';
import { establishVassalage, polityById, sovereignPolity } from './polities.js?v=20260904-war1';

export const SETTLEMENT_TYPES = Object.freeze({
  vassal_ruler: { label: 'Recognise the old ruler as a vassal', autonomy: 0.9, tributeRate: 0.07, militaryObligation: 0.45, legitimacyGain: 0.12 },
  governor: { label: 'Offer the old ruler a governorship', autonomy: 0.58, tributeRate: 0.12, militaryObligation: 0.5, legitimacyGain: 0.18 },
  reduced_realm: { label: 'Leave a reduced autonomous realm', autonomy: 0.95, tributeRate: 0.045, militaryObligation: 0.35, legitimacyGain: 0.08 },
  direct_rule: { label: 'Impose direct rule and displace the old government', autonomy: 0.22, tributeRate: 0.16, militaryObligation: 0.6, legitimacyGain: 0 },
});

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function stable01(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

function ensureContinuity(polity) {
  if (!polity) return null;
  polity.continuity ||= {
    factionId: `faction_${polity.id}`,
    dynastyId: `house_${polity.id}`,
    status: polity.subjectToPolityId ? 'vassal' : 'sovereign',
    seatRegionId: polity.capitalRegionId,
    hostPolityId: null,
    overlordPolityId: polity.subjectToPolityId || null,
    legitimacy: clamp(polity.administration?.legitimacy ?? 0.25),
    prestige: 0.2,
    exilePopulation: 0,
    governmentInExileSinceTick: null,
    claims: {},
    historicalControl: {},
    acceptedSettlementIds: [],
    rejectedSettlementIds: [],
    lastSettlementTick: null,
  };
  polity.continuity.claims ||= {};
  polity.continuity.historicalControl ||= {};
  polity.continuity.acceptedSettlementIds ||= [];
  polity.continuity.rejectedSettlementIds ||= [];
  return polity.continuity;
}

export function initialisePoliticalContinuity(polities, regions, currentTick = 0) {
  for (const polity of polities) {
    const state = ensureContinuity(polity);
    const territories = regions.filter((r) => r.governance?.localPolityId === polity.id || r.polityId === polity.id);
    for (const region of territories) {
      state.claims[region.id] = Math.max(state.claims[region.id] || 0, 0.9);
      state.historicalControl[region.id] ||= { firstTick: currentTick, lastTick: currentTick, controlYears: 0, peakClaim: 1 };
    }
  }
  return polities;
}

export function recordFactionControl(polity, region, elapsedYears = 0, currentTick = 0) {
  const state = ensureContinuity(polity);
  if (!state || !region) return;
  const record = state.historicalControl[region.id] ||= { firstTick: currentTick, lastTick: currentTick, controlYears: 0, peakClaim: 0 };
  record.lastTick = currentTick;
  record.controlYears += Math.max(0, elapsedYears);
  const earned = clamp(0.35 + Math.log1p(record.controlYears) / 8);
  state.claims[region.id] = Math.max(state.claims[region.id] || 0, earned);
  record.peakClaim = Math.max(record.peakClaim || 0, state.claims[region.id]);
}

function culturalAnchor(polity, regions) {
  const state = ensureContinuity(polity);
  return regions.find((r) => r.id === state.seatRegionId) ||
    regions.find((r) => r.id === polity.capitalRegionId) ||
    regions.find((r) => r.governance?.localPolityId === polity.id) || null;
}

export function plausibleGovernanceScore(polity, region, regions, polities) {
  if (!polity || !region) return 0;
  const state = ensureContinuity(polity);
  const historical = clamp(state.claims[region.id] || 0);
  const anchor = culturalAnchor(polity, regions);
  const culture = anchor ? cultureAffinity(anchor, region) : 0.2;
  const sameLocalTradition = region.governance?.localPolityId === polity.id || region.polityId === polity.id ? 1 : 0;
  const currentSovereign = polityById(polities, region.governance?.sovereignPolityId);
  const hostileOccupation = currentSovereign && currentSovereign.id !== polity.id ? 0.08 : 0;
  return clamp(historical * 0.44 + culture * 0.34 + sameLocalTradition * 0.24 + state.legitimacy * 0.14 - hostileOccupation);
}

export function plausibleGovernedRegions(polity, regions, polities, threshold = 0.42) {
  return regions
    .map((region) => ({ region, score: plausibleGovernanceScore(polity, region, regions, polities) }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

export function chooseExileHost(polity, regions, polities, excludedPolityId = null) {
  const state = ensureContinuity(polity);
  const anchor = culturalAnchor(polity, regions);
  if (!anchor) return null;
  const candidates = polities
    .filter((candidate) => candidate.id !== polity.id && candidate.id !== excludedPolityId)
    .map((candidate) => {
      const seat = regions.find((r) => r.id === candidate.capitalRegionId);
      if (!seat) return null;
      const culture = cultureAffinity(anchor, seat);
      const attitude = clamp((attitudeToward(seat, anchor.id) + 1) / 2);
      const distancePenalty = anchor.neighbors?.includes(seat.id) ? 0 : 0.08;
      const score = culture * 0.5 + attitude * 0.3 + clamp(candidate.administration?.legitimacy || 0.2) * 0.2 - distancePenalty;
      return { polity: candidate, seat, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.score >= 0.28 ? candidates[0] : null;
}

export function resolvePartialConquest(attackerRegion, defenderRegion, polities, regions, currentTick = 0) {
  const conqueror = sovereignPolity(attackerRegion, polities);
  const defeated = sovereignPolity(defenderRegion, polities);
  if (!conqueror || !defeated || conqueror.id === defeated.id) return null;
  const remaining = regions.filter((r) => r.id !== defenderRegion.id && r.governance?.sovereignPolityId === defeated.id);
  if (remaining.length === 0) return null;

  const state = ensureContinuity(defeated);
  const wasCapital = defeated.capitalRegionId === defenderRegion.id;
  defenderRegion.governance.sovereignPolityId = conqueror.id;
  defenderRegion.governance.localPolityId ||= defeated.id;
  defenderRegion.governance.relationship = 'integrated';
  defenderRegion.governance.autonomy = 0.28;
  defenderRegion.governance.administrativeControl = 0.55;
  defenderRegion.governance.tributeRate = 0;
  defenderRegion.controllingActorId = conqueror.capitalRegionId;
  state.claims[defenderRegion.id] = Math.max(state.claims[defenderRegion.id] || 0, wasCapital ? 1 : 0.9);

  let newSeat = regions.find((r) => r.id === state.seatRegionId && r.governance?.sovereignPolityId === defeated.id);
  if (!newSeat) {
    newSeat = remaining
      .map((region) => ({ region, score: plausibleGovernanceScore(defeated, region, regions, polities) }))
      .sort((a, b) => b.score - a.score)[0]?.region || remaining[0];
  }
  if (wasCapital) {
    state.displacedCapitalRegionId = defenderRegion.id;
    state.seatRegionId = newSeat.id;
    state.status = 'claimant';
    state.legitimacy = clamp(state.legitimacy + 0.05);
    defeated.capitalRegionId = newSeat.id;
    defeated.rulerRegionId = newSeat.id;
  }
  return { partial: true, wasCapital, lostRegionId: defenderRegion.id, newSeatRegionId: newSeat.id,
    defeatedPolityId: defeated.id, conquerorPolityId: conqueror.id };
}

let nextSettlementId = 1;
export function createConquestSettlementOffer(attackerRegion, defenderRegion, type, polities, regions, currentTick = 0) {
  const terms = SETTLEMENT_TYPES[type];
  if (!terms) return null;
  const conqueror = sovereignPolity(attackerRegion, polities);
  const defeated = sovereignPolity(defenderRegion, polities);
  if (!conqueror || !defeated || conqueror.id === defeated.id) return null;
  return {
    id: nextSettlementId++,
    type,
    conquerorPolityId: conqueror.id,
    defeatedPolityId: defeated.id,
    regionId: defenderRegion.id,
    offeredTick: currentTick,
    status: 'offered',
    terms: { ...terms },
  };
}

export function chooseNpcConquestOffer(attackerRegion, defenderRegion, polities, regions) {
  const defeated = sovereignPolity(defenderRegion, polities);
  const score = plausibleGovernanceScore(defeated, defenderRegion, regions, polities);
  const attitude = clamp((attitudeToward(attackerRegion, defenderRegion.id) + 1) / 2);
  if (score >= 0.72) return 'vassal_ruler';
  if (score >= 0.52 && attitude >= 0.25) return 'governor';
  if (score >= 0.42) return 'reduced_realm';
  return 'direct_rule';
}

export function evaluateSettlementOffer(offer, polities, regions) {
  if (!offer) return { accept: false, score: -1 };
  const defeated = polityById(polities, offer.defeatedPolityId);
  const conqueror = polityById(polities, offer.conquerorPolityId);
  const region = regions.find((r) => r.id === offer.regionId);
  if (!defeated || !conqueror || !region) return { accept: false, score: -1 };
  const state = ensureContinuity(defeated);
  const governability = plausibleGovernanceScore(defeated, region, regions, polities);
  const host = chooseExileHost(defeated, regions, polities, conqueror.id);
  const hostOption = host?.score || 0;
  const survivalValue = offer.type === 'vassal_ruler' ? 0.65 : offer.type === 'reduced_realm' ? 0.58 : offer.type === 'governor' ? 0.42 : 0.05;
  const autonomy = offer.terms?.autonomy || 0;
  const legitimacyCost = offer.type === 'governor' ? 0.22 : offer.type === 'direct_rule' ? 0.4 : 0.08;
  const acceptScore = survivalValue + autonomy * 0.28 + governability * 0.22 + state.legitimacy * 0.12 - legitimacyCost;
  const exileScore = hostOption * 0.52 + state.legitimacy * 0.34 + governability * 0.22 + 0.08;
  return { accept: acceptScore >= exileScore, score: acceptScore - exileScore, acceptScore, exileScore, host };
}

export function enterGovernmentInExile(polity, regions, polities, currentTick = 0, excludedPolityId = null) {
  const state = ensureContinuity(polity);
  const host = chooseExileHost(polity, regions, polities, excludedPolityId);
  state.status = 'exile';
  state.hostPolityId = host?.polity.id || null;
  state.overlordPolityId = null;
  state.seatRegionId = host?.seat.id || null;
  state.governmentInExileSinceTick = currentTick;
  state.exilePopulation = Math.round(25 + state.legitimacy * 90 + state.prestige * 60);
  state.legitimacy = clamp(state.legitimacy + (host ? 0.04 : -0.08));
  polity.subjectToPolityId = null;
  return { hostPolityId: state.hostPolityId, hostRegionId: state.seatRegionId, exilePopulation: state.exilePopulation };
}

export function acceptSettlementOffer(offer, polities, regions, currentTick = 0) {
  const conqueror = polityById(polities, offer?.conquerorPolityId);
  const defeated = polityById(polities, offer?.defeatedPolityId);
  const region = regions.find((r) => r.id === offer?.regionId);
  const conquerorRegion = regions.find((r) => r.id === conqueror?.capitalRegionId);
  if (!offer || !conqueror || !defeated || !region || !conquerorRegion) return { accepted: false, reason: 'invalid_offer' };
  const state = ensureContinuity(defeated);
  if (offer.type === 'direct_rule') return rejectSettlementOffer(offer, polities, regions, currentTick, true);

  establishVassalage(conquerorRegion, region, polities, currentTick, regions);
  region.governance.autonomy = offer.terms.autonomy;
  region.governance.tributeRate = offer.terms.tributeRate;
  region.governance.militaryObligation = offer.terms.militaryObligation;
  if (offer.type === 'governor') {
    region.governance.relationship = 'delegated';
    region.governance.governor.type = 'local_governor';
    region.governance.governor.localLegitimacy = Math.max(0.72, state.legitimacy);
  }
  state.status = offer.type === 'governor' ? 'governor' : 'vassal';
  state.seatRegionId = region.id;
  state.hostPolityId = null;
  state.overlordPolityId = conqueror.id;
  state.lastSettlementTick = currentTick;
  state.acceptedSettlementIds.push(offer.id);
  state.legitimacy = clamp(state.legitimacy - (offer.type === 'governor' ? 0.08 : 0.025));
  conqueror.administration.legitimacy = clamp((conqueror.administration.legitimacy || 0) + offer.terms.legitimacyGain);
  offer.status = 'accepted';
  return { accepted: true, status: state.status, regionId: region.id };
}

export function rejectSettlementOffer(offer, polities, regions, currentTick = 0, imposedDirectRule = false) {
  const conqueror = polityById(polities, offer?.conquerorPolityId);
  const defeated = polityById(polities, offer?.defeatedPolityId);
  const region = regions.find((r) => r.id === offer?.regionId);
  if (!offer || !conqueror || !defeated || !region) return { accepted: false, reason: 'invalid_offer' };
  const state = ensureContinuity(defeated);
  state.rejectedSettlementIds.push(offer.id);
  state.lastSettlementTick = currentTick;
  offer.status = imposedDirectRule ? 'direct_rule' : 'rejected';

  // The conqueror controls the occupied region directly; the defeated political
  // faction remains a separate actor with a claim rather than being deleted.
  region.governance.sovereignPolityId = conqueror.id;
  region.governance.relationship = 'integrated';
  region.governance.autonomy = imposedDirectRule ? 0.2 : 0.32;
  region.governance.administrativeControl = imposedDirectRule ? 0.72 : 0.55;
  region.governance.tributeRate = 0;
  region.governance.localPolityId ||= defeated.id;
  region.controllingActorId = conqueror.capitalRegionId;
  state.claims[region.id] = Math.max(state.claims[region.id] || 0, 0.88);
  enterGovernmentInExile(defeated, regions, polities, currentTick, conqueror.id);
  return { accepted: false, exile: true, hostPolityId: state.hostPolityId, regionId: region.id };
}

export function resolveNpcSettlement(offer, polities, regions, currentTick = 0) {
  if (offer.type === 'direct_rule') return rejectSettlementOffer(offer, polities, regions, currentTick, true);
  const decision = evaluateSettlementOffer(offer, polities, regions);
  return decision.accept
    ? acceptSettlementOffer(offer, polities, regions, currentTick)
    : rejectSettlementOffer(offer, polities, regions, currentTick, false);
}

export function transferRegion(region, fromPolity, toPolity, regions, polities, currentTick = 0, reason = 'grant') {
  if (!region || !fromPolity || !toPolity || fromPolity.id === toPolity.id) return { transferred: false, reason: 'invalid_transfer' };
  if (region.governance?.sovereignPolityId !== fromPolity.id) return { transferred: false, reason: 'not_owned' };
  const toState = ensureContinuity(toPolity);
  region.governance.sovereignPolityId = toPolity.id;
  region.governance.localPolityId = toPolity.id;
  region.governance.localRulerId = toPolity.capitalRegionId;
  region.governance.governorId = null;
  region.governance.governor = null;
  region.governance.relationship = region.id === toPolity.capitalRegionId ? 'core' : 'vassal';
  region.governance.autonomy = region.id === toPolity.capitalRegionId ? 0 : 0.92;
  region.governance.administrativeControl = region.id === toPolity.capitalRegionId ? 1 : 0.12;
  region.governance.tributeRate = region.id === toPolity.capitalRegionId ? 0 : 0.04;
  region.controllingActorId = toPolity.capitalRegionId;
  toState.claims[region.id] = Math.max(toState.claims[region.id] || 0, reason === 'liberation' ? 0.95 : 0.6);
  recordFactionControl(toPolity, region, 0, currentTick);
  const fromState = ensureContinuity(fromPolity);
  fromState.claims[region.id] = Math.max(fromState.claims[region.id] || 0, reason === 'liberation' ? 0.15 : 0.35);
  return { transferred: true, regionId: region.id, fromPolityId: fromPolity.id, toPolityId: toPolity.id, reason };
}

export function grantRegionalAutonomy(region, amount = 0.1) {
  if (!region?.governance || region.governance.relationship === 'core') return { changed: false, reason: 'core_region' };
  const previous = clamp(region.governance.autonomy);
  region.governance.autonomy = clamp(previous + Math.max(0, amount), 0.1, 0.99);
  region.governance.administrativeControl = clamp((region.governance.administrativeControl || 0) - amount * 0.45);
  if (region.governance.autonomy >= 0.82 && region.governance.relationship === 'integrated') region.governance.relationship = 'delegated';
  if (region.governance.autonomy >= 0.94) region.governance.relationship = 'vassal';
  return { changed: true, previous, autonomy: region.governance.autonomy, relationship: region.governance.relationship };
}

export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0) {
  const events = [];
  for (const polity of polities) {
    const state = ensureContinuity(polity);
    const sovereignRegions = regions.filter((r) => r.governance?.sovereignPolityId === polity.id);
    for (const region of sovereignRegions) recordFactionControl(polity, region, elapsedYears, currentTick);

    if (state.status === 'exile') {
      const host = polityById(polities, state.hostPolityId);
      const hostSeat = regions.find((r) => r.id === host?.capitalRegionId);
      const support = hostSeat ? clamp((attitudeToward(hostSeat, state.seatRegionId || '') + 1) / 2) : 0;
      const yearlyDecay = host ? 0.004 : 0.014;
      state.legitimacy = clamp(state.legitimacy - yearlyDecay * elapsedYears + support * 0.002 * elapsedYears);
      state.exilePopulation = Math.max(5, Math.round(state.exilePopulation * Math.pow(host ? 0.995 : 0.97, elapsedYears)));
      if (sovereignRegions.length > 0) {
        state.status = 'claimant';
        state.seatRegionId = sovereignRegions[0].id;
        state.hostPolityId = null;
        state.exilePopulation = 0;
        events.push({ type: 'government_restored', polityId: polity.id, regionId: sovereignRegions[0].id });
      }
    } else if (sovereignRegions.length === 0 && !polity.subjectToPolityId) {
      const plausible = plausibleGovernedRegions(polity, regions, polities, 0.48);
      if (plausible.length > 0) {
        enterGovernmentInExile(polity, regions, polities, currentTick);
        events.push({ type: 'government_exiled', polityId: polity.id, hostPolityId: state.hostPolityId });
      } else if (state.legitimacy < 0.04) {
        state.status = 'extinct';
        events.push({ type: 'political_faction_extinct', polityId: polity.id });
      }
    }
  }
  return events;
}

export function canFactionContinue(polity, regions, polities) {
  const state = ensureContinuity(polity);
  if (state.status === 'extinct') return false;
  if (regions.some((r) => r.governance?.sovereignPolityId === polity.id)) return true;
  if (state.status === 'vassal' || state.status === 'governor' || state.status === 'exile' || state.status === 'claimant') return true;
  return plausibleGovernedRegions(polity, regions, polities, 0.42).length > 0 || state.legitimacy >= 0.08;
}
