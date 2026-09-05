const SAVE_VERSION = 1;
export const SAVE_KEY = 'worldsim.save.v1';

const STATIC_REGION_KEYS = new Set(['id', 'name', 'feature', 'centroid', 'areaSqKm', 'neighbors']);

function encode(value) {
  if (value instanceof Map) return { __worldsimType: 'Map', entries: [...value.entries()].map(([key, item]) => [encode(key), encode(item)]) };
  if (value instanceof Set) return { __worldsimType: 'Set', values: [...value].map(encode) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  return value;
}

function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (!value || typeof value !== 'object') return value;
  if (value.__worldsimType === 'Map') return new Map(value.entries.map(([key, item]) => [decode(key), decode(item)]));
  if (value.__worldsimType === 'Set') return new Set(value.values.map(decode));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
}

function regionSnapshot(region) {
  const state = {};
  for (const [key, value] of Object.entries(region)) {
    if (!STATIC_REGION_KEYS.has(key) && key !== 'knowledge') state[key] = encode(value);
  }
  state.knowledge = encode({
    ownerId: region.knowledge.ownerId,
    observations: region.knowledge.observations,
    knownSubjectIds: region.knowledge.knownSubjectIds,
    directContactIds: region.knowledge.directContactIds,
    _observationByStream: region.knowledge._observationByStream,
  });
  return { id: region.id, state };
}

function restoreRegion(region, saved) {
  const knowledge = region.knowledge;
  for (const key of Object.keys(region)) {
    if (!STATIC_REGION_KEYS.has(key) && key !== 'knowledge') delete region[key];
  }
  const state = decode(saved.state);
  const knowledgeState = state.knowledge;
  delete state.knowledge;
  Object.assign(region, state);
  for (const key of Object.keys(knowledge)) delete knowledge[key];
  Object.assign(knowledge, knowledgeState);
  region.knowledge = knowledge;
  if (!(knowledge.knownSubjectIds instanceof Set)) knowledge.knownSubjectIds = new Set();
  if (!(knowledge.directContactIds instanceof Set)) knowledge.directContactIds = new Set();
  if (!(knowledge._observationByStream instanceof Map)) knowledge._observationByStream = new Map();
}

export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, playerRegionId, fogOfWar }) {
  if (!playerRegionId) throw new Error('Choose a starting region before saving.');
  return {
    format: 'worldsim-save', version: SAVE_VERSION, savedAt: new Date().toISOString(),
    worldRegionIds: regions.map((region) => region.id), playerRegionId,
    clock: { tickIndex: clock.tickIndex, speed: clock.speed, resumeSpeed: clock._resumeSpeed, estimatedTickMs: clock._estimatedTickMs },
    fogOfWar: { devMode: fogOfWar.devMode },
    regions: regions.map(regionSnapshot), polities: encode(polities), religiousWorld: encode(religiousWorld),
    seaRegions: seaRegions.map((sea) => ({ id: sea.id, fish: encode(sea.fish) })),
    agreements: encode(agreements), activeRaids: encode(activeRaids), activeCampaigns: encode(activeCampaigns),
  };
}

export function restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, fogOfWar }) {
  if (!snapshot || snapshot.format !== 'worldsim-save') throw new Error('This is not a Worldsim save.');
  if (snapshot.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${snapshot.version}.`);
  const expectedIds = regions.map((region) => region.id);
  if (snapshot.worldRegionIds.length !== expectedIds.length || snapshot.worldRegionIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error('This save belongs to a different version of the world map.');
  }
  const savedById = new Map(snapshot.regions.map((entry) => [entry.id, entry]));
  for (const region of regions) {
    const saved = savedById.get(region.id);
    if (!saved) throw new Error(`Save is missing region ${region.id}.`);
    restoreRegion(region, saved);
  }
  const savedSeas = new Map((snapshot.seaRegions || []).map((entry) => [entry.id, entry]));
  for (const sea of seaRegions) {
    const saved = savedSeas.get(sea.id);
    if (!saved) throw new Error(`Save is missing sea region ${sea.id}.`);
    sea.fish = decode(saved.fish);
  }
  polities.splice(0, polities.length, ...decode(snapshot.polities));
  if (religiousWorld && snapshot.religiousWorld) {
    for (const key of Object.keys(religiousWorld)) delete religiousWorld[key];
    Object.assign(religiousWorld, decode(snapshot.religiousWorld));
  }
  agreements.splice(0, agreements.length, ...decode(snapshot.agreements));
  activeRaids.splice(0, activeRaids.length, ...decode(snapshot.activeRaids));
  activeCampaigns.splice(0, activeCampaigns.length, ...decode(snapshot.activeCampaigns || []));
  clock.stop();
  clock.tickIndex = Math.max(0, Number(snapshot.clock.tickIndex) || 0);
  clock._pendingResponseRequired = 0;
  clock._estimatedTickMs = Number.isFinite(snapshot.clock.estimatedTickMs) ? snapshot.clock.estimatedTickMs : null;
  clock._resumeSpeed = [0.5, 1, 2, 4].includes(snapshot.clock.resumeSpeed) ? snapshot.clock.resumeSpeed : 1;
  const restoredSpeed = [0, 0.5, 1, 2, 4].includes(snapshot.clock.speed) ? snapshot.clock.speed : 0;
  clock.speed = Number.NaN;
  clock._applySpeed(restoredSpeed, { automatic: false, reason: 'load' });
  clock._nextTickAt = null;
  fogOfWar.setPlayerRegion(snapshot.playerRegionId);
  fogOfWar.setDevMode(Boolean(snapshot.fogOfWar?.devMode));
  return { playerRegionId: snapshot.playerRegionId, savedAt: snapshot.savedAt };
}

export function writeSave(snapshot, storage = localStorage) { storage.setItem(SAVE_KEY, JSON.stringify(snapshot)); }
export function readSave(storage = localStorage) { const raw = storage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; }
export function saveSummary(storage = localStorage) {
  try { const save = readSave(storage); return save ? { savedAt: save.savedAt, tickIndex: save.clock?.tickIndex || 0 } : null; }
  catch { return { invalid: true }; }
}
