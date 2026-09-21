const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const arr = (value) => Array.isArray(value) ? value : [];

function polity(world, actorOrPolityId) {
  const mappedId = world?.scenarioActorToPolityId?.[actorOrPolityId];
  return arr(world?.polities).find((candidate) =>
    candidate?.id === actorOrPolityId || candidate?.id === mappedId || candidate?.scenarioActorId === actorOrPolityId) || null;
}

function countryRegions(world, actorOrPolityId) {
  const p = polity(world, actorOrPolityId);
  const polityId = p?.id || actorOrPolityId;
  return arr(world?.regions).filter((region) =>
    region?.scenarioCountryId === actorOrPolityId ||
    region?.governance?.scenarioCountryId === actorOrPolityId ||
    region?.governance?.sovereignPolityId === polityId ||
    region?.polityId === polityId);
}

function hostileCampPairs(state, model) {
  const principal = new Set(arr(model?.campaignResolution?.principalCampIds));
  const membership = new Map();
  for (const camp of arr(state?.strategicCamps)) {
    if (!principal.has(camp.id)) continue;
    for (const member of arr(camp.members)) membership.set(member, camp.id);
  }
  return { principal, membership };
}

export function activePrincipalCampWars(world, victoryModel) {
  const state = world?.scenarioState || {};
  const { membership } = hostileCampPairs(state, victoryModel);
  const wars = [];
  for (const war of arr(world?.activeWars)) {
    if (!war || war.active === false) continue;
    const actorParticipants = arr(war.participantScenarioActorIds).length
      ? arr(war.participantScenarioActorIds)
      : arr(war.participants).map((entry) => typeof entry === 'string' ? entry : entry?.actorId).filter(Boolean);
    const camps = new Set(actorParticipants.map((id) => membership.get(id)).filter(Boolean));
    if (camps.size >= 2) wars.push(war);
  }
  return wars;
}

export function updateFocusedCampaignResolution(world, victoryModel, currentDay = 0) {
  world.scenarioVictoryState ||= {};
  const state = world.scenarioVictoryState;
  const activeWars = activePrincipalCampWars(world, victoryModel);
  if (activeWars.length) {
    state.principalPeaceSinceDay = null;
    state.resolved = false;
    return { resolved: false, activePrincipalWars: activeWars.length, peaceDays: 0 };
  }

  if (!Number.isFinite(state.principalPeaceSinceDay)) state.principalPeaceSinceDay = Number(currentDay) || 0;
  const peaceDays = Math.max(0, (Number(currentDay) || 0) - state.principalPeaceSinceDay);
  const required = Math.max(0, Number(victoryModel?.campaignResolution?.peaceStabilityDays || 0));
  if (peaceDays >= required) {
    state.resolved = true;
    state.resolvedDay = Number(currentDay) || 0;
  }
  return { resolved: state.resolved === true, activePrincipalWars: 0, peaceDays, requiredPeaceDays: required };
}

function sovereigntyScore(world, countryId) {
  const p = polity(world, countryId);
  if (!p) return 0;
  if (p.extinct === true || p.permanentlyAnnexed === true) return 0;
  if (p.governmentInExile === true) return clamp(p.restorationProspect ?? .55);
  return 1;
}

function territorialSecurityScore(world, countryId) {
  const regions = countryRegions(world, countryId);
  if (!regions.length) return polity(world, countryId) ? .6 : 0;
  let safe = 0;
  for (const region of regions) {
    const occupation = region?.scenarioOccupation;
    const hostileOccupation = occupation?.occupier && occupation.occupier !== countryId;
    safe += hostileOccupation ? 0 : 1;
  }
  return clamp(safe / regions.length);
}

function readMetric(p, names, fallback = .6) {
  for (const name of names) if (Number.isFinite(p?.[name])) return clamp(p[name]);
  return fallback;
}

function aimsScore(p) {
  const aims = arr(p?.scenarioWarAims).filter((aim) => aim?.adopted !== false);
  if (!aims.length) return 1;
  let achieved = 0;
  let totalWeight = 0;
  for (const aim of aims) {
    const weight = Math.max(.01, Number(aim.weight || 1));
    const progress = aim.completed === true ? 1 : aim.failed === true ? 0 : clamp(aim.progress ?? .5);
    achieved += progress * weight;
    totalWeight += weight;
  }
  return totalWeight ? clamp(achieved / totalWeight) : 1;
}

export function evaluateCountryScenarioOutcome(world, countryId, victoryModel) {
  const p = polity(world, countryId);
  const dimensions = arr(victoryModel?.outcomeDimensions);
  const values = {
    sovereignty: sovereigntyScore(world, countryId),
    'territorial-security': territorialSecurityScore(world, countryId),
    'human-security': readMetric(p, ['scenarioHumanSecurity', 'humanSecurity', 'populationSecurity'], .6),
    'economic-resilience': readMetric(p, ['scenarioEconomicResilience', 'economicResilience', 'economicHealth'], .6),
    'adopted-war-aims': aimsScore(p),
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const dimension of dimensions) {
    const weight = Math.max(0, Number(dimension.weight || 0));
    weighted += (values[dimension.id] ?? .5) * weight;
    totalWeight += weight;
  }
  const score = totalWeight ? clamp(weighted / totalWeight) : values.sovereignty;
  const minimumMet = values.sovereignty > 0 && !(p?.permanentlyAnnexed === true);
  return {
    countryId,
    polityId: p?.id || null,
    minimumSuccess: minimumMet,
    score,
    dimensions: values,
    campaignResolved: world?.scenarioVictoryState?.resolved === true,
    result: !minimumMet ? 'defeat' : score >= .75 ? 'strong-success' : score >= .5 ? 'success' : 'survived',
  };
}

export function canDeclareFocusedScenarioResult(world, countryId, victoryModel) {
  const resolution = world?.scenarioVictoryState?.resolved === true;
  if (!resolution) return { ready: false, reason: 'systemic_conflict_unresolved' };
  return { ready: true, outcome: evaluateCountryScenarioOutcome(world, countryId, victoryModel) };
}
