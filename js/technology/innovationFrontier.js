// Shared technology-relevance index.
//
// Breakthrough families should ask this layer whether a technology is dormant,
// frontier-relevant or universal before doing expensive region-level work.
// The first version keeps region knowledge as the canonical source, but also
// exposes polity grouping so later industrial/modern families can move invention
// to national/institutional actors without changing their public APIs all at once.

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || region?.id;
}

function actorKey(region, mode) {
  return mode === 'polity' ? polityId(region) : region?.id;
}

export function createInnovationFrontier(regions = [], { mode = 'region' } = {}) {
  const world = regions || [];
  const regionsById = new Map();
  const actorsById = new Map();
  const knownActorCountByTech = new Map();

  for (const region of world) {
    regionsById.set(region.id, region);
    const id = actorKey(region, mode);
    let actor = actorsById.get(id);
    if (!actor) {
      actor = { id, members: [], knownTechIds: new Set() };
      actorsById.set(id, actor);
    }
    actor.members.push(region);
    for (const techId of region.unlockedTechIds || []) actor.knownTechIds.add(techId);
  }

  for (const actor of actorsById.values()) {
    for (const techId of actor.knownTechIds) {
      knownActorCountByTech.set(techId, (knownActorCountByTech.get(techId) || 0) + 1);
    }
  }

  const actorCount = actorsById.size;

  function knownActorCount(techId) {
    return knownActorCountByTech.get(techId) || 0;
  }

  function anyActorKnows(techId) {
    return knownActorCount(techId) > 0;
  }

  function isUniversal(techId) {
    return actorCount > 0 && knownActorCount(techId) >= actorCount;
  }

  function regionHasExposure(region, techId) {
    for (const id of region.neighbors || []) {
      if (regionsById.get(id)?.unlockedTechIds?.has?.(techId)) return true;
    }
    for (const id of region.tradePartnerIds || []) {
      if (regionsById.get(id)?.unlockedTechIds?.has?.(techId)) return true;
    }
    if (region.recentTradePartners instanceof Map) {
      for (const id of region.recentTradePartners.keys()) {
        if (regionsById.get(id)?.unlockedTechIds?.has?.(techId)) return true;
      }
    }
    return false;
  }

  // `activation` is a world-level necessary condition. If false, the technology
  // is too far from the current frontier and callers should not inspect actors.
  function state(techId, { activation = null } = {}) {
    if (isUniversal(techId)) return 'universal';
    if (activation && !activation(api)) return 'dormant';
    return 'frontier';
  }

  // Candidate regions are those that either satisfy a cheap independent-invention
  // prerequisite or can receive an already-known technology through contact.
  // Expensive readiness calculations belong after this filter.
  function candidateRegions(techId, { independentEligible = null, includeDiffusion = true } = {}) {
    if (isUniversal(techId)) return [];
    const out = [];
    const diffusionExists = includeDiffusion && anyActorKnows(techId);
    for (const region of world) {
      if (region.unlockedTechIds?.has?.(techId)) continue;
      if (independentEligible?.(region) || (diffusionExists && regionHasExposure(region, techId))) out.push(region);
    }
    return out;
  }

  const api = {
    mode,
    world,
    regionsById,
    actorsById,
    actorCount,
    knownActorCount,
    anyActorKnows,
    isUniversal,
    regionHasExposure,
    state,
    candidateRegions,
  };
  return api;
}

export function technologyRelevant(frontier, techId, activation = null) {
  return frontier.state(techId, { activation }) === 'frontier';
}
