const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function ensureMemoryState(region) {
  region.culturalMemory ||= { memories: [], nextSerial: 1, effects: {} };
  region.culturalMemory.memories ||= [];
  region.culturalMemory.nextSerial ||= 1;
  region.culturalMemory.effects ||= {};
  region.culturalMemory.episodes ||= {};
  return region.culturalMemory;
}

export function recordSocietalMemory(region, spec = {}) {
  if (!region || !spec.sourceType || spec.sourceId === undefined || spec.sourceId === null) return null;
  const state = ensureMemoryState(region);
  const role = spec.role || 'community';
  const existing = state.memories.find((m) => m.sourceType === spec.sourceType &&
    String(m.sourceId) === String(spec.sourceId) && (m.role || 'community') === role);
  if (existing) {
    existing.strength = clamp01(Math.max(existing.strength || 0, spec.strength || 0));
    existing.symbolicLegacy = clamp01(Math.max(existing.symbolicLegacy || 0, spec.symbolicLegacy || 0));
    return existing;
  }
  const strength = clamp01(spec.strength ?? 0.12);
  const memory = {
    id: `${region.id}:memory:${state.nextSerial++}`,
    sourceType: spec.sourceType,
    sourceId: spec.sourceId,
    role,
    label: spec.label || `${spec.sourceType} remembered in ${region.name}`,
    createdTick: spec.createdTick ?? null,
    ageYears: 0,
    theme: spec.theme || 'community',
    motif: spec.motif || null,
    valence: Number(spec.valence) || 0,
    historicalAccuracy: clamp01(spec.historicalAccuracy ?? 0.92),
    strength,
    practicalRelevance: clamp01(spec.practicalRelevance ?? 0.75),
    symbolicLegacy: clamp01(spec.symbolicLegacy ?? strength * 0.3),
    reinforcement: 0,
    artReinforcement: 0,
    defining: false,
  };
  state.memories.push(memory);
  return memory;
}

export function recordFamineStress(region, severity, elapsedDays = 7) {
  if (!region) return null;
  const state = ensureMemoryState(region);
  const s = clamp01(severity);
  if (s < 0.03) {
    state.episodes.activeFamineId = null;
    return null;
  }
  if (s < 0.12 && !state.episodes.activeFamineId) return null;
  if (!state.episodes.activeFamineId) {
    state.episodes.famineSerial = (state.episodes.famineSerial || 0) + 1;
    state.episodes.activeFamineId = `famine-${state.episodes.famineSerial}`;
  }
  const id = state.episodes.activeFamineId;
  let memory = state.memories.find((m) => m.sourceType === 'famine' && m.sourceId === id);
  if (!memory) {
    memory = recordSocietalMemory(region, {
      sourceType: 'famine', sourceId: id,
      label: `The Hunger in ${region.name}`,
      theme: 'famine', motif: 'survival', valence: -1,
      strength: 0.12 + s * 0.34, practicalRelevance: 0.9,
      symbolicLegacy: 0.04 + s * 0.08,
    });
  }
  const years = Math.max(0, elapsedDays) / 365.2425;
  memory.strength = clamp01(memory.strength + s * years * 0.18);
  memory.symbolicLegacy = clamp01(memory.symbolicLegacy + s * years * 0.025);
  memory.practicalRelevance = clamp01(Math.max(memory.practicalRelevance, 0.55 + s * 0.4));
  return memory;
}

export function recordMonumentMemory(region, event, currentTick = null) {
  const type = event?.constructionType;
  const project = event?.project;
  if (!region || !type?.monumental || !project) return null;
  const scale = Math.max(0.5, Number(project.scale) || 1);
  const religious = type.id === 'great_temple';
  const authority = type.id === 'monumental_tomb' || type.id === 'ceremonial_complex';
  return recordSocietalMemory(region, {
    sourceType: 'monument', sourceId: `${project.id}:${type.id}`,
    label: `Building of the ${type.name} in ${region.name}`,
    createdTick: currentTick,
    theme: religious ? 'religion' : authority ? 'rulership' : 'achievement',
    motif: type.id,
    valence: 1,
    strength: clamp01(0.14 + Math.log2(1 + scale) * 0.12),
    practicalRelevance: religious || authority ? 0.75 : 0.45,
    symbolicLegacy: clamp01(0.08 + (type.prestige?.legacy || 0) * 0.22 * Math.sqrt(scale)),
  });
}
