const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const EMPTY_OBSERVATION = Object.freeze({ familiarity: 0, sources: Object.freeze({}) });

export function ensureTechnologyKnowledge(region) {
  region.technologyKnowledge ||= {};
  region.technologyKnowledge.observations ||= {};
  return region.technologyKnowledge;
}

export function observeTechnology(region, techId, amount = 0.01, source = 'contact') {
  const state = ensureTechnologyKnowledge(region);
  const current = state.observations[techId] || { familiarity: 0, sources: {} };
  current.familiarity = clamp01(current.familiarity + Math.max(0, Number(amount) || 0));
  current.sources ||= {};
  current.sources[source] = (current.sources[source] || 0) + 1;
  state.observations[techId] = current;
  return current;
}

export function technologyObservation(region, techId) {
  // This is an extremely hot read path during breakthrough checks. Reading an
  // unseen technology must not initialise region state or allocate a new empty
  // observation object every time; the immutable singleton is equivalent to the
  // previous fallback for callers that only inspect familiarity/sources.
  return region.technologyKnowledge?.observations?.[techId] || EMPTY_OBSERVATION;
}

// A technology may be seen long before it can be understood. Hard prerequisites
// represent conceptual scaffolding; practice/readiness represents hands-on craft
// capability. Observation can accelerate diffusion only after that scaffolding exists.
export function technologyComprehension({
  prerequisitesMet = true,
  practice = 0,
  minimumPractice = 0,
  observation = 0,
  observationWeight = 0.25,
} = {}) {
  if (!prerequisitesMet) return 0;
  const practical = clamp01(practice);
  if (practical < Math.max(0, minimumPractice)) return 0;
  const observed = clamp01(observation);
  return clamp01(practical * (1 - observationWeight) + Math.max(practical, observed) * observationWeight);
}

export function boundedDiffusionChance(baseChance, sourceCount, comprehension) {
  const sources = Math.max(0, Math.floor(Number(sourceCount) || 0));
  const gate = clamp01(comprehension);
  if (!sources || gate <= 0) return 0;
  const raw = 1 - Math.pow(1 - clamp01(baseChance), sources);
  return raw * gate;
}

export function combineIndependentChances(...chances) {
  return 1 - chances.reduce((remaining, chance) => remaining * (1 - clamp01(chance)), 1);
}
