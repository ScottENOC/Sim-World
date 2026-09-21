function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function indexById(items) {
  return new Map(asArray(items).filter(Boolean).map((item) => [item.id, item]));
}

function resolvePolity(world, actorId) {
  const mappedId = world?.scenarioActorToPolityId?.[actorId];
  return asArray(world?.polities).find((polity) => polity?.id === actorId || polity?.id === mappedId || polity?.scenarioActorId === actorId) || null;
}

function resolveRegion(world, selector) {
  if (!selector) return [];
  const regions = asArray(world?.regions);
  if (typeof selector === 'string') {
    return regions.filter((region) => region?.id === selector || region?.scenarioSelectors?.includes?.(selector));
  }
  if (selector.regionId) return regions.filter((region) => region?.id === selector.regionId);
  if (selector.selector) return regions.filter((region) => region?.scenarioSelectors?.includes?.(selector.selector));
  return [];
}

function ensureScenarioState(world, scenarioId) {
  world.scenarioState ||= {};
  world.scenarioState.id = scenarioId;
  world.scenarioState.hydrated ||= false;
  world.scenarioState.actors ||= [];
  world.scenarioState.strategicCamps ||= [];
  world.scenarioState.conflicts ||= [];
  world.scenarioState.relationships ||= [];
  world.scenarioState.openingState ||= {};
  return world.scenarioState;
}

function hydrateActors(world, state, definition, report) {
  state.actors = asArray(definition.actors).map((actor) => {
    const polity = resolvePolity(world, actor.id);
    if (polity) {
      polity.scenarioActorId = actor.id;
      polity.scenarioActorKind = actor.kind || 'country';
      polity.scenarioPlayable = actor.kind === 'country';
    } else if (actor.kind === 'country') {
      report.unresolvedActors.push(actor.id);
    }
    return { ...actor, resolvedPolityId: polity?.id || null };
  });
}

function hydrateCamps(world, state, definition) {
  state.strategicCamps = asArray(definition.strategicCamps).map((camp) => ({
    ...camp,
    members: [...asArray(camp.members)],
    openingMembers: [...asArray(camp.members)],
    lockedMembership: camp.lockedMembership === true,
  }));
  world.strategicCamps = state.strategicCamps;
}

function hydrateRelationships(world, state, definition) {
  const relationships = asArray(definition.relationships).length ? definition.relationships : definition.diplomaticPostures;
  state.relationships = asArray(relationships).map((relationship) => ({ ...relationship }));
  world.scenarioRelationships = state.relationships;
}

function hydrateConflict(world, conflict, report) {
  const hydrated = JSON.parse(JSON.stringify(conflict));
  hydrated.scenarioSeeded = true;
  hydrated.active = conflict.active !== false;

  if (conflict.kind === 'war') {
    world.activeWars ||= [];
    if (!world.activeWars.some((war) => war.id === conflict.id)) {
      const sideA = asArray(conflict.belligerents?.sideA);
      const sideB = asArray(conflict.belligerents?.sideB);
      const actorIds = [...sideA, ...sideB];
      const participantPolityIds = actorIds.map((actorId) => resolvePolity(world, actorId)?.id || actorId);
      const war = {
        id: conflict.id,
        active: hydrated.active,
        scenarioSeeded: true,
        participants: actorIds.map((actorId, index) => ({ actorId, polityId: participantPolityIds[index] })),
        participantPolityIds,
        participantScenarioActorIds: actorIds,
        attackerActorId: sideA[0] || null,
        defenderActorId: sideB[0] || null,
        scenarioBelligerents: { sideA, sideB },
        theatres: asArray(conflict.theatres),
        warAims: JSON.parse(JSON.stringify(conflict.warAims || {})),
      };
      world.activeWars.push(war);
    }
  }

  for (const occupation of asArray(conflict.occupation)) {
    const matched = resolveRegion(world, occupation.territorySelector || occupation.selector || occupation.regionId);
    if (!matched.length) report.unresolvedTerritorySelectors.push(occupation.territorySelector || occupation.selector || occupation.regionId);
    const occupierPolity = occupation.occupier ? resolvePolity(world, occupation.occupier) : null;
    for (const region of matched) {
      region.scenarioOccupation = {
        conflictId: conflict.id,
        occupier: occupation.occupier,
        occupierPolityId: occupierPolity?.id || null,
        sovereigntyClaimant: occupation.sovereigntyClaimant || null,
        control: occupation.control || 'occupied',
      };
      if (occupierPolity) region.controllingActorId = occupierPolity.id;
    }
  }

  return hydrated;
}

export function hydrateScenarioInitialState(world, definition, options = {}) {
  if (!world || !definition?.scenarioId) throw new Error('hydrateScenarioInitialState requires a world and scenario initial-state definition');
  const state = ensureScenarioState(world, definition.scenarioId);
  if (state.hydrated && options.force !== true) {
    return { hydrated: false, alreadyHydrated: true, state, unresolvedActors: [], unresolvedTerritorySelectors: [] };
  }

  const report = { hydrated: true, alreadyHydrated: false, state, unresolvedActors: [], unresolvedTerritorySelectors: [] };
  hydrateActors(world, state, definition, report);
  hydrateCamps(world, state, definition);
  hydrateRelationships(world, state, definition);
  state.conflicts = asArray(definition.conflicts).map((conflict) => hydrateConflict(world, conflict, report));
  state.defaultExternalAlignment = { ...(definition.defaultExternalAlignment || {}) };
  state.openingState.year = definition.year;
  state.hydrated = true;
  state.hydratedAtTick = Number(options.currentTick || 0);
  world.scenarioInitialStateHydrated = true;
  return report;
}

function mappedSovereignActorIds(world) {
  const ids = new Set();
  const actorByPolityId = new Map(Object.entries(world?.scenarioActorToPolityId || {}).map(([actorId, polityId]) => [polityId, actorId]));
  for (const region of asArray(world?.regions)) {
    if (region?.scenarioCountryId) ids.add(region.scenarioCountryId);
    const polityId = region?.governance?.sovereignPolityId || region?.polityId || null;
    if (!polityId) continue;
    ids.add(polityId);
    const actorId = actorByPolityId.get(polityId);
    if (actorId) ids.add(actorId);
  }
  return ids;
}

export function scenarioPlayablePolities(world, playability = {}) {
  const policy = playability?.policy || {};
  const playableKinds = new Set(policy.playableActorKinds || ['country']);
  const actors = asArray(world?.scenarioState?.actors);
  const actorById = indexById(actors);
  const polities = asArray(world?.polities);

  if (policy.allMappedSovereignCountriesPlayable === true) {
    const mappedSovereigns = mappedSovereignActorIds(world);
    return polities.filter((candidate) => {
      if (!candidate?.id || candidate.extinct === true) return false;
      if (candidate.kind === 'coalition' || candidate.isCoalition === true || candidate.isInternationalOrganisation === true) return false;
      const actorId = candidate.scenarioActorId || candidate.id;
      const actor = actorById.get(actorId);
      if (actor && !playableKinds.has(actor.kind || 'country')) return false;
      if (candidate.scenarioActorKind && !playableKinds.has(candidate.scenarioActorKind)) return false;
      if (candidate.scenarioPlayable === true) return true;
      return mappedSovereigns.has(actorId) || mappedSovereigns.has(candidate.id);
    });
  }

  return actors
    .filter((actor) => playableKinds.has(actor.kind || 'country'))
    .map((actor) => resolvePolity(world, actor.id))
    .filter(Boolean);
}

export function addScenarioWarAim(world, actorId, aim) {
  const polity = resolvePolity(world, actorId);
  if (!polity) return { added: false, reason: 'unknown_actor' };
  polity.scenarioWarAims ||= [];
  const id = aim?.id || aim;
  if (!id) return { added: false, reason: 'invalid_aim' };
  if (polity.scenarioWarAims.some((existing) => (existing?.id || existing) === id)) return { added: false, reason: 'already_present' };
  polity.scenarioWarAims.push(typeof aim === 'string' ? { id: aim, adopted: true } : { adopted: true, ...aim });
  return { added: true, aim: polity.scenarioWarAims.at(-1) };
}
