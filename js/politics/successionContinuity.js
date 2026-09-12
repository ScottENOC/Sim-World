import { enterGovernmentInExile, plausibleGovernedRegions } from './continuity.js?v=20260913-succession1';
import { institutionalPathProfile } from './institutionalPaths.js?v=20260913-statepaths1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function territoriesFor(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

function ensureSuccession(polity) {
  polity.continuity ||= {};
  polity.continuity.succession ||= {};
  const state = polity.continuity.succession;
  if (!Number.isFinite(state.rulerTenureYears)) state.rulerTenureYears = 0;
  if (!Number.isFinite(state.generation)) state.generation = 1;
  if (!Number.isFinite(state.lastSuccessionTick)) state.lastSuccessionTick = 0;
  if (!Number.isFinite(state.security)) state.security = 0.55;
  state.activeCrisis ||= null;
  return state;
}

function localElitePower(region) {
  const p = region.medievalPolitics || {};
  return clamp((p.eliteOrganisation || 0) * 0.5 + (p.localDefence || 0) * 0.25 + (p.localFiscalCapacity || 0) * 0.25);
}

function professionalMilitary(region) {
  const army = Math.max(0, Number(region.army?.personnel) || 0) + Math.max(0, Number(region.army?.away) || 0);
  const population = Math.max(1, Number(region.population) || 1);
  return clamp(army / Math.max(300, population * 0.022));
}

function annualSuccessionHazard(state) {
  if (state.rulerTenureYears < 10) return 0.0025;
  return clamp(0.009 + Math.max(0, state.rulerTenureYears - 18) * 0.0021, 0, 0.095);
}

function chanceForYears(annualChance, years) {
  return 1 - Math.pow(1 - clamp(annualChance), Math.max(0, years));
}

function successionSecurity(polity, regions) {
  const territories = territoriesFor(polity, regions);
  const n = Math.max(1, territories.length);
  const avgElite = territories.reduce((sum, region) => sum + localElitePower(region), 0) / n;
  const avgAutonomy = territories.reduce((sum, region) => sum + clamp(region.governance?.autonomy || 0), 0) / n;
  const profile = institutionalPathProfile(polity);
  const legitimacy = clamp(polity.administration?.legitimacy || polity.continuity?.legitimacy || 0.25);
  const continuityLegitimacy = clamp(polity.continuity?.legitimacy ?? legitimacy);
  const religious = clamp(polity.religiousLegitimacyBonus || 0);
  return clamp(0.18 + legitimacy * 0.28 + continuityLegitimacy * 0.16 + profile.successionStability * 0.28 + religious * 0.08 - avgElite * 0.14 - avgAutonomy * 0.08 - Math.max(0, territories.length - 5) * 0.008);
}

function continuityClaimant(polity, original, anchor, claim, kind, currentTick) {
  polity.continuity ||= {};
  const continuity = polity.continuity;
  continuity.status = 'claimant';
  continuity.hostPolityId = null;
  continuity.overlordPolityId = null;
  continuity.seatRegionId = anchor.id;
  continuity.legitimacy = clamp(Math.max(continuity.legitimacy || 0.18, claim * 0.72));
  continuity.prestige = clamp(Math.max(continuity.prestige || 0.1, claim * 0.45));
  continuity.claims ||= {};
  continuity.historicalControl ||= {};
  continuity.exileSupport ||= {};
  continuity.successionClaim = {
    originalPolityId: original.id,
    generation: ensureSuccession(original).generation,
    kind,
    claimStrength: claim,
    startedTick: currentTick,
  };
  polity.claimantForPolityId = original.id;
  polity.subjectToPolityId = null;
  polity.capitalRegionId = anchor.id;
  polity.rulerRegionId = anchor.id;
  return continuity;
}

function claimantCandidates(original, regions, polities) {
  const territories = territoriesFor(original, regions);
  const capital = territories.find((region) => region.id === original.capitalRegionId) || territories[0];
  const profile = institutionalPathProfile(original);
  const candidates = [{
    polity: original,
    anchor: capital,
    kind: 'designated_successor',
    claim: clamp(0.5 + (original.administration?.legitimacy || 0) * 0.26 + profile.bureaucratic * 0.14),
  }];

  const alternatives = [];
  for (const region of territories) {
    if (region.id === capital?.id) continue;
    const localId = region.governance?.localPolityId || region.polityId;
    const local = polities.find((candidate) => candidate.id === localId);
    if (!local || local.id === original.id) continue;
    const localPower = localElitePower(region);
    const military = professionalMilitary(region);
    const autonomy = clamp(region.governance?.autonomy || 0);
    const claim = clamp(0.2 + localPower * 0.34 + military * 0.2 + autonomy * 0.16 + (local.continuity?.legitimacy || 0.2) * 0.1);
    alternatives.push({ polity: local, anchor: region, kind: military > localPower ? 'military_claimant' : 'provincial_claimant', claim });
  }

  alternatives.sort((a, b) => b.claim - a.claim);
  for (const candidate of alternatives.slice(0, 2)) candidates.push(candidate);
  return candidates.sort((a, b) => b.claim - a.claim);
}

function supportScore(region, candidate, original) {
  const anchorBonus = candidate.anchor?.id === region.id ? 0.42 : 0;
  const elite = localElitePower(region);
  const autonomy = clamp(region.governance?.autonomy || 0);
  const adminControl = clamp(region.governance?.administrativeControl || 0);
  const capitalBonus = region.id === original.capitalRegionId && candidate.polity.id === original.id ? 0.4 : 0;
  const claimantLocality = (region.governance?.localPolityId || region.polityId) === candidate.polity.id ? 0.2 : 0;
  const challengerSignal = candidate.polity.id === original.id ? adminControl * 0.2 - elite * 0.06 : elite * 0.18 + autonomy * 0.12;
  return candidate.claim + anchorBonus + capitalBonus + claimantLocality + challengerSignal;
}

function ensureContinuityClaims(candidate, originalTerritories) {
  candidate.polity.continuity ||= {};
  candidate.polity.continuity.claims ||= {};
  for (const region of originalTerritories) {
    candidate.polity.continuity.claims[region.id] = Math.max(candidate.polity.continuity.claims[region.id] || 0, candidate.claim * (region.id === candidate.anchor?.id ? 1 : 0.72));
  }
}

function createSuccessionWar(original, factions, currentTick, activeWars) {
  if (!Array.isArray(activeWars) || factions.length < 2) return null;
  const actorIds = factions.map((faction) => faction.polity.id);
  const existing = activeWars.find((war) => war.active && war.successionForPolityId === original.id);
  if (existing) return existing;
  const war = {
    id: `succession-war-${original.id}-${currentTick}`,
    startedTick: currentTick,
    endedTick: null,
    active: true,
    successionForPolityId: original.id,
    primaryPair: actorIds.slice(0, 2).sort().join('|'),
    participants: actorIds.map((actorId) => ({
      actorId,
      joinedTick: currentTick,
      sideId: actorId,
      warAim: 'regime_change',
      targetActorId: actorIds.find((id) => id !== actorId) || null,
      stances: Object.fromEntries(actorIds.filter((id) => id !== actorId).map((id) => [id, 'hostile'])),
      enemyPriorities: Object.fromEntries(actorIds.filter((id) => id !== actorId).map((id) => [id, 1 / Math.max(1, actorIds.length - 1)])),
      surrenderPolicy: {},
      occupationPreferences: {},
    })),
    history: [{ type: 'succession_crisis_started', polityId: original.id, tick: currentTick }],
  };
  activeWars.push(war);
  return war;
}

function partitionForCrisis(original, candidates, regions, currentTick) {
  const territories = territoriesFor(original, regions);
  const factions = candidates.slice(0, 3).map((candidate) => ({ ...candidate, regionIds: [] }));
  for (const region of territories) {
    const chosen = factions.slice().sort((a, b) => supportScore(region, b, original) - supportScore(region, a, original))[0];
    chosen.regionIds.push(region.id);
  }

  for (const faction of factions) {
    ensureContinuityClaims(faction, territories);
    if (faction.polity.id !== original.id) continuityClaimant(faction.polity, original, faction.anchor, faction.claim, faction.kind, currentTick);
  }

  for (const faction of factions) {
    if (faction.polity.id === original.id) continue;
    for (const regionId of faction.regionIds) {
      const region = regions.find((candidate) => candidate.id === regionId);
      if (!region || region.id === original.capitalRegionId) continue;
      region.governance.sovereignPolityId = faction.polity.id;
      region.governance.relationship = (region.governance?.localPolityId || region.polityId) === faction.polity.id ? 'core' : 'delegated';
      region.governance.administrativeControl = Math.min(region.governance.administrativeControl || 0.4, 0.55);
      region.governance.autonomy = Math.max(region.governance.autonomy || 0, 0.35);
      region.controllingActorId = faction.polity.capitalRegionId;
    }
  }
  return factions;
}

export function triggerSuccession(polity, polities, regions, currentTick, options = {}) {
  const state = ensureSuccession(polity);
  const candidates = claimantCandidates(polity, regions, polities);
  const security = successionSecurity(polity, regions);
  state.security = security;
  state.generation += 1;
  state.rulerTenureYears = 0;
  state.lastSuccessionTick = currentTick;

  const contested = candidates.length >= 2 && security < 0.7 && candidates[0].claim - candidates[1].claim < 0.34;
  if (!contested) {
    state.activeCrisis = null;
    polity.continuity ||= {};
    polity.continuity.legitimacy = clamp((polity.continuity.legitimacy || polity.administration?.legitimacy || 0.25) + 0.01 - (1 - security) * 0.02);
    polity.administration.legitimacy = clamp((polity.administration?.legitimacy || 0.25) + 0.008 - (1 - security) * 0.015);
    return { type: 'orderly_succession', polityId: polity.id, security, claimantPolityId: polity.id };
  }

  const factions = partitionForCrisis(polity, candidates, regions, currentTick);
  const war = createSuccessionWar(polity, factions, currentTick, options.activeWars);
  state.activeCrisis = {
    originalPolityId: polity.id,
    startedTick: currentTick,
    generation: state.generation,
    factionPolityIds: factions.map((faction) => faction.polity.id),
    warId: war?.id || null,
    active: true,
  };
  polity.administration.legitimacy = clamp((polity.administration?.legitimacy || 0.25) - 0.08);
  return {
    type: 'succession_crisis',
    polityId: polity.id,
    security,
    warId: war?.id || null,
    factionPolityIds: factions.map((faction) => faction.polity.id),
    factions: factions.map((faction) => ({ polityId: faction.polity.id, kind: faction.kind, claim: faction.claim, regionIds: faction.regionIds, anchorRegionId: faction.anchor?.id })),
  };
}

function updateActiveCrisis(polity, polities, regions, currentTick, activeWars) {
  const state = ensureSuccession(polity);
  const crisis = state.activeCrisis;
  if (!crisis?.active) return null;
  const surviving = crisis.factionPolityIds.filter((id) => regions.some((region) => region.governance?.sovereignPolityId === id));
  for (const factionId of crisis.factionPolityIds) {
    if (surviving.includes(factionId)) continue;
    const claimant = polities.find((candidate) => candidate.id === factionId);
    if (!claimant || claimant.subjectToPolityId || claimant.continuity?.status === 'exile') continue;
    const plausible = plausibleGovernedRegions(claimant, regions, polities, 0.42);
    if (plausible.length) enterGovernmentInExile(claimant, regions, polities, currentTick, surviving[0] || null);
  }
  if (surviving.length > 1) return null;
  crisis.active = false;
  crisis.endedTick = currentTick;
  crisis.winnerPolityId = surviving[0] || null;
  const war = Array.isArray(activeWars) ? activeWars.find((candidate) => candidate.id === crisis.warId) : null;
  if (war) { war.active = false; war.endedTick = currentTick; war.history.push({ type: 'succession_crisis_resolved', winnerPolityId: crisis.winnerPolityId, tick: currentTick }); }
  return { type: 'succession_resolved', polityId: polity.id, winnerPolityId: crisis.winnerPolityId, factionPolityIds: crisis.factionPolityIds };
}

export function tickSuccessionContinuity(polities, regions, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const events = [];
  for (const polity of polities) {
    const state = ensureSuccession(polity);
    const crisisEvent = updateActiveCrisis(polity, polities, regions, currentTick, options.activeWars);
    if (crisisEvent) events.push(crisisEvent);
    if (state.activeCrisis?.active || polity.subjectToPolityId || !territoriesFor(polity, regions).length) continue;
    state.rulerTenureYears += years;
    state.security = successionSecurity(polity, regions);
    if (rng() < chanceForYears(annualSuccessionHazard(state), years)) {
      events.push(triggerSuccession(polity, polities, regions, currentTick, options));
    }
  }
  return events;
}
