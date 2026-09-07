const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const MAX_MEMORIES = 24;

function ensureMemoryState(region) {
  region.culturalMemory ||= { memories: [], nextSerial: 1, effects: {} };
  region.culturalMemory.memories ||= [];
  region.culturalMemory.nextSerial ||= 1;
  region.culturalMemory.effects ||= {};
  region.culturalMemory.episodes ||= {};
  return region.culturalMemory;
}

function pruneMemoryAttention(state) {
  if (state.memories.length <= MAX_MEMORIES) return;
  state.memories.sort((a, b) =>
    ((b.strength || 0) + (b.symbolicLegacy || 0) * 0.5) -
    ((a.strength || 0) + (a.symbolicLegacy || 0) * 0.5));
  state.memories.length = MAX_MEMORIES;
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
    existing.practicalRelevance = clamp01(Math.max(existing.practicalRelevance || 0, spec.practicalRelevance || 0));
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
  pruneMemoryAttention(state);
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

export function recordReligionEventMemory(region, event, currentTick = null) {
  if (!region || !event) return null;
  if (event.type === 'religious_variant' && event.religion) {
    return recordSocietalMemory(region, {
      sourceType: 'religious_variant', sourceId: event.religion.id,
      label: `Emergence of ${event.religion.name} in ${region.name}`,
      createdTick: currentTick,
      theme: 'religion', motif: 'reform', valence: 0,
      strength: 0.09, practicalRelevance: 0.7, symbolicLegacy: 0.025,
    });
  }
  if (event.type === 'religious_directive' && event.directive) {
    const holyWar = event.directive.type === 'holy_war';
    return recordSocietalMemory(region, {
      sourceType: 'religious_directive', sourceId: event.directive.id,
      label: `${event.leaderName || 'Religious leadership'} called for ${holyWar ? 'holy war' : 'peace'}`,
      createdTick: currentTick,
      theme: 'religion', motif: holyWar ? 'holy_war' : 'sacred_peace',
      valence: 0, strength: holyWar ? 0.14 : 0.11,
      practicalRelevance: 0.85, symbolicLegacy: 0.035,
    });
  }
  return null;
}

export function recordPoliticalSettlementMemory(attacker, defender, event, currentTick = null) {
  if (!event || !defender) return [];
  const created = [];
  if (event.type === 'claimant_retreat') {
    created.push(recordSocietalMemory(defender, {
      sourceType: 'political_loss', sourceId: `${event.campaign?.id || currentTick}:${defender.id}`,
      label: `The Loss of ${defender.name}`,
      createdTick: currentTick,
      theme: 'political_loss', motif: event.wasCapital ? 'fallen_capital' : 'lost_homeland',
      valence: -1, strength: event.wasCapital ? 0.34 : 0.24,
      practicalRelevance: 0.95, symbolicLegacy: event.wasCapital ? 0.13 : 0.07,
    }));
    return created.filter(Boolean);
  }

  const offer = event.offer || event.campaign?.settlement;
  if (!offer) return created;
  const direct = offer.type === 'direct_rule';
  created.push(recordSocietalMemory(defender, {
    sourceType: 'political_settlement', sourceId: offer.id,
    role: 'defeated',
    label: direct ? `Imposition of direct rule over ${defender.name}` : `Settlement after the conquest of ${defender.name}`,
    createdTick: currentTick,
    theme: direct ? 'political_loss' : 'political_settlement',
    motif: offer.type,
    valence: direct ? -1 : -0.25,
    strength: direct ? 0.28 : 0.18,
    practicalRelevance: 0.9,
    symbolicLegacy: direct ? 0.09 : 0.05,
  }));
  if (attacker) {
    created.push(recordSocietalMemory(attacker, {
      sourceType: 'political_settlement', sourceId: offer.id,
      role: 'conqueror',
      label: `Settlement imposed on ${defender.name}`,
      createdTick: currentTick,
      theme: 'rulership', motif: offer.type,
      valence: 0.5, strength: 0.12,
      practicalRelevance: 0.7, symbolicLegacy: 0.035,
    }));
  }
  return created.filter(Boolean);
}
