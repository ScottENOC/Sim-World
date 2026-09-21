const arr = (value) => Array.isArray(value) ? value : [];
const clone = (value) => JSON.parse(JSON.stringify(value));

function resolvePolity(world, actorId) {
  const mappedId = world?.scenarioActorToPolityId?.[actorId] || actorId;
  return arr(world?.polities).find((polity) => polity?.id === mappedId || polity?.scenarioActorId === actorId) || null;
}

export function scenarioFormationsForActor(world, actorId) {
  return arr(world?.scenarioForceDeployments?.formations).filter((formation) => formation.actorId === actorId);
}

export function scenarioLandConcentrationForActor(world, actorId) {
  return arr(world?.scenarioForceDeployments?.landConcentration).find((entry) => entry.actorId === actorId) || null;
}

export function hydrateScenarioForceDeployments(world, definition) {
  if (!world || !definition?.scenarioId) throw new Error('hydrateScenarioForceDeployments requires a world and scenario force definition');
  const unresolvedActors = new Set();
  const formations = arr(definition.formations).map((source) => {
    const formation = clone(source);
    const polity = resolvePolity(world, formation.actorId);
    formation.polityId = polity?.id || null;
    formation.scenarioSeeded = true;
    if (!polity) unresolvedActors.add(formation.actorId);
    if (polity) {
      polity.scenarioForcePosture ||= { formations: [], landConcentration: null };
      polity.scenarioForcePosture.formations.push(formation);
    }
    return formation;
  });

  const landConcentration = arr(definition.landConcentration).map((source) => {
    const concentration = clone(source);
    const polity = resolvePolity(world, concentration.actorId);
    concentration.polityId = polity?.id || null;
    concentration.scenarioSeeded = true;
    if (!polity) unresolvedActors.add(concentration.actorId);
    if (polity) {
      polity.scenarioForcePosture ||= { formations: [], landConcentration: null };
      polity.scenarioForcePosture.landConcentration = concentration;
    }
    return concentration;
  });

  world.scenarioForceDeployments = {
    scenarioId: definition.scenarioId,
    model: definition.model,
    calibrationNote: definition.calibrationNote,
    formations,
    landConcentration,
    designRules: [...arr(definition.designRules)],
    hydrated: true,
  };

  return {
    hydrated: true,
    formationCount: formations.length,
    landConcentrationCount: landConcentration.length,
    unresolvedActors: [...unresolvedActors],
  };
}
