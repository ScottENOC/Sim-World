/*
 * Knowledge is an evidence/report ledger, deliberately separate from the map.
 *
 * The UI and simulation still need convenient questions such as "has this
 * country been mapped?". Those answers are DERIVED from reports here; they
 * are not stored as permanent omniscient facts on a region.
 */

export const KNOWLEDGE_TOPICS = Object.freeze({
  EXISTENCE: 'existence',
  LOCATION: 'location',
  POPULATION: 'population',
  FOOD: 'food',
  MINING: 'mining',
  METALLURGY: 'metallurgy',
  TRADE: 'trade',
  ECONOMY: 'economy',
  MILITARY: 'military',
  POLITICS: 'politics',
  RESOURCES: 'resources',
});

export const KNOWLEDGE_SOURCES = Object.freeze({
  DIRECT: 'direct',
  TRADER: 'trader',
  FISHER: 'fisher',
  RAID_SURVIVOR: 'raid_survivor',
  PRISONER: 'prisoner',
  DIPLOMAT: 'diplomat',
  REFUGEE: 'refugee',
  RUMOUR: 'rumour',
  SECOND_HAND_RUMOUR: 'second_hand_rumour',
  SPY: 'spy',
  SCOUT: 'scout',
});

// Reports from these sources establish direct contact for trade/raiding.
// Keep this indexed rather than rediscovering it by scanning the complete
// evidence ledger for every possible region pair on every tick.
const DIRECT_CONTACT_SOURCES = new Set([
  KNOWLEDGE_SOURCES.DIRECT,
  KNOWLEDGE_SOURCES.TRADER,
  KNOWLEDGE_SOURCES.FISHER,
  KNOWLEDGE_SOURCES.RAID_SURVIVOR,
  KNOWLEDGE_SOURCES.PRISONER,
  KNOWLEDGE_SOURCES.DIPLOMAT,
  KNOWLEDGE_SOURCES.REFUGEE,
  KNOWLEDGE_SOURCES.SPY,
  KNOWLEDGE_SOURCES.SCOUT,
]);

// Dated reports which have not been refreshed for a year cease to be useful
// current intelligence. Undated starting knowledge (notably land borders) is
// structural and deliberately permanent.
export const MAX_OBSERVATION_AGE_WEEKS = 52;

// These are presentation thresholds, not stored knowledge percentages.
// knowledgeLevel() derives a temporary familiarity score from the reports in
// a ledger so the current fog/UI/AI code can continue to ask simple questions.
export const KNOWLEDGE_THRESHOLDS = Object.freeze({
  NAME: 0.05,
  DIRECTION: 0.15,
  MAP: 0.30,
  RESOURCES: 0.50,
  ECONOMY: 0.70,
  POPULATION: 0.85,
  DETAILED: 0.95,
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getLedger(region) {
  if (!region) return null;
  if (!region.knowledge || typeof region.knowledge.addObservation !== 'function') {
    region.knowledge = new KnowledgeLedger(region.id);
  }
  return region.knowledge;
}

function evidenceStrength(observations) {
  // Independent imperfect reports reinforce one another without becoming an
  // irreversible flag. One 25% rumour is weak; several reports can add up.
  let missChance = 1;
  for (const report of observations) {
    const strength = clamp01(report.confidence) * clamp01(report.specificity);
    // Repeated equivalent reports are compacted into one observation while
    // retaining exactly the same corroboration effect they had when stored as
    // separate objects.
    missChance *= Number.isFinite(report.evidenceMissChance)
      ? clamp01(report.evidenceMissChance)
      : (1 - strength);
  }
  return clamp01(1 - missChance);
}

function observationMatches(observation, { subjectId, topic, source, provenanceType }) {
  if (subjectId && observation.subjectId !== subjectId) return false;
  if (topic && observation.topic !== topic) return false;
  if (source && observation.source !== source) return false;
  if (provenanceType && observation.provenance?.type !== provenanceType) return false;
  return true;
}

export class KnowledgeLedger {
  constructor(ownerId) {
    this.ownerId = ownerId;
    this.observations = [];
    this.knownSubjectIds = new Set();
    this.directContactIds = new Set();
    this._observationByStream = new Map();
  }

  _streamKey({ subjectId, topic, source, provenance }) {
    // A stream is the same observer receiving the same kind of information
    // about the same subject through the same route. Volatile details such as
    // trade volume are values within the stream, not reasons to retain a new
    // permanent record every week.
    const provenanceKey = provenance?.type === 'trade_network'
      ? `${provenance.type}:${provenance.intermediaryId || ''}`
      : provenance?.type === 'shared_sea_fishing'
        ? `${provenance.type}:${[...(provenance.seaIds || [])].sort().join(',')}`
        : provenance?.type || '';
    return `${subjectId}|${topic}|${source}|${provenanceKey}`;
  }

  _rebuildIndexes() {
    this.knownSubjectIds.clear();
    this.directContactIds.clear();
    this._observationByStream.clear();
    for (const observation of this.observations) {
      this._observationByStream.set(this._streamKey(observation), observation);
      this.knownSubjectIds.add(observation.subjectId);
      if (DIRECT_CONTACT_SOURCES.has(observation.source)) {
        this.directContactIds.add(observation.subjectId);
      }
    }
  }

  addObservation({
    subjectId,
    topic,
    value = null,
    source = KNOWLEDGE_SOURCES.DIRECT,
    observedAt = null,
    receivedAt = null,
    confidence = 1,
    specificity = 1,
    provenance = null,
    subjectMatter = [],
  }) {
    if (!subjectId || !topic) return null;

    const candidate = { subjectId, topic, source, provenance };
    const streamKey = this._streamKey(candidate);
    const existing = this._observationByStream.get(streamKey);
    const confidenceValue = clamp01(confidence);
    const specificityValue = clamp01(specificity);
    const newMissChance = 1 - confidenceValue * specificityValue;

    if (existing) {
      // Consolidate repeated evidence instead of appending forever. The
      // cumulative miss chance preserves corroboration mathematically, while
      // the visible report fields are refreshed with the newest information.
      const oldMissChance = Number.isFinite(existing.evidenceMissChance)
        ? existing.evidenceMissChance
        : 1 - clamp01(existing.confidence) * clamp01(existing.specificity);
      existing.evidenceMissChance = clamp01(oldMissChance * newMissChance);
      existing.corroborationCount = (existing.corroborationCount || 1) + 1;
      existing.value = value;
      existing.observedAt = observedAt;
      existing.receivedAt = receivedAt;
      existing.confidence = confidenceValue;
      existing.specificity = specificityValue;
      existing.provenance = provenance;
      existing.subjectMatter = [...subjectMatter];
      return existing;
    }

    const observation = {
      id: `${this.ownerId}:${this.observations.length + 1}`,
      subjectId,
      topic,
      value,
      source,
      observedAt,
      receivedAt,
      confidence: confidenceValue,
      specificity: specificityValue,
      evidenceMissChance: newMissChance,
      corroborationCount: 1,
      provenance,
      subjectMatter: [...subjectMatter],
    };

    this.observations.push(observation);
    this._observationByStream.set(streamKey, observation);
    this.knownSubjectIds.add(subjectId);
    if (DIRECT_CONTACT_SOURCES.has(source)) this.directContactIds.add(subjectId);
    return observation;
  }

  prune(currentTick, maxAgeWeeks = MAX_OBSERVATION_AGE_WEEKS) {
    if (!Number.isFinite(currentTick)) return 0;
    const before = this.observations.length;
    this.observations = this.observations.filter((observation) => {
      const ageFrom = Number.isFinite(observation.receivedAt)
        ? observation.receivedAt
        : observation.observedAt;
      return !Number.isFinite(ageFrom) || currentTick - ageFrom <= maxAgeWeeks;
    });
    if (this.observations.length !== before) this._rebuildIndexes();
    return before - this.observations.length;
  }

  forSubject(subjectId) {
    return this.observations.filter((o) => o.subjectId === subjectId);
  }

  forTopic(subjectId, topic) {
    return this.observations.filter((o) => o.subjectId === subjectId && o.topic === topic);
  }

  latest(subjectId, topic) {
    const matches = this.forTopic(subjectId, topic);
    return matches[matches.length - 1] || null;
  }

  best(subjectId, topic) {
    const matches = this.forTopic(subjectId, topic);
    if (!matches.length) return null;
    return [...matches].sort((a, b) =>
      (b.confidence * b.specificity) - (a.confidence * a.specificity))[0];
  }

  hasTopic(subjectId, topic, minimumConfidence = 0) {
    return this.forTopic(subjectId, topic)
      .some((o) => o.confidence >= minimumConfidence);
  }

  hasObservation(criteria) {
    return this.observations.some((o) => observationMatches(o, criteria));
  }

  levelFor(subjectId) {
    return derivedLevelFromLedger(this, subjectId);
  }

  // Compatibility with the old Map-based UI. Values are calculated from the
  // report ledger each time rather than stored as a permanent knowledge map.
  entries() {
    const subjectIds = [...new Set(this.observations.map((o) => o.subjectId))];
    return subjectIds.map((subjectId) => [subjectId, this.levelFor(subjectId)])[Symbol.iterator]();
  }

  export() {
    return this.observations.map((o) => ({ ...o, subjectMatter: [...o.subjectMatter] }));
  }
}

function derivedLevelFromLedger(ledger, subjectId) {
  if (!ledger || !subjectId) return 0;
  if (ledger.ownerId === subjectId) return 1;

  const all = ledger.forSubject(subjectId);
  if (!all.length) return 0;

  const existence = evidenceStrength(all.filter((o) => o.topic === KNOWLEDGE_TOPICS.EXISTENCE));
  const location = evidenceStrength(all.filter((o) => o.topic === KNOWLEDGE_TOPICS.LOCATION));
  const resources = evidenceStrength(all.filter((o) =>
    [KNOWLEDGE_TOPICS.RESOURCES, KNOWLEDGE_TOPICS.MINING, KNOWLEDGE_TOPICS.METALLURGY]
      .includes(o.topic)));
  const economy = evidenceStrength(all.filter((o) =>
    [KNOWLEDGE_TOPICS.ECONOMY, KNOWLEDGE_TOPICS.TRADE, KNOWLEDGE_TOPICS.FOOD]
      .includes(o.topic)));
  const population = evidenceStrength(all.filter((o) => o.topic === KNOWLEDGE_TOPICS.POPULATION));
  const detailed = evidenceStrength(all.filter((o) =>
    [KNOWLEDGE_TOPICS.MILITARY, KNOWLEDGE_TOPICS.POLITICS].includes(o.topic)));

  let level = existence > 0
    ? KNOWLEDGE_THRESHOLDS.NAME + existence * (KNOWLEDGE_THRESHOLDS.DIRECTION - KNOWLEDGE_THRESHOLDS.NAME)
    : 0;

  if (location > 0) {
    level = Math.max(
      level,
      KNOWLEDGE_THRESHOLDS.DIRECTION + location * (KNOWLEDGE_THRESHOLDS.MAP - KNOWLEDGE_THRESHOLDS.DIRECTION)
    );
  }
  if (resources > 0) {
    level = Math.max(level, KNOWLEDGE_THRESHOLDS.MAP + resources * (KNOWLEDGE_THRESHOLDS.RESOURCES - KNOWLEDGE_THRESHOLDS.MAP));
  }
  if (economy > 0) {
    level = Math.max(level, KNOWLEDGE_THRESHOLDS.RESOURCES + economy * (KNOWLEDGE_THRESHOLDS.ECONOMY - KNOWLEDGE_THRESHOLDS.RESOURCES));
  }
  if (population > 0) {
    level = Math.max(level, KNOWLEDGE_THRESHOLDS.ECONOMY + population * (KNOWLEDGE_THRESHOLDS.POPULATION - KNOWLEDGE_THRESHOLDS.ECONOMY));
  }
  if (detailed > 0) {
    level = Math.max(level, KNOWLEDGE_THRESHOLDS.POPULATION + detailed * (1 - KNOWLEDGE_THRESHOLDS.POPULATION));
  }

  return clamp01(level);
}

export function knowledgeOf(observer, subjectOrId) {
  if (!observer) return 0;
  const subjectId = typeof subjectOrId === 'string' ? subjectOrId : subjectOrId?.id;
  if (!subjectId) return 0;
  if (observer.id === subjectId) return 1;
  return getLedger(observer)?.levelFor(subjectId) || 0;
}

export function knowledgeLevel(observer, subject) {
  return knowledgeOf(observer, subject);
}

export function knowledgeStage(observer, subject) {
  const level = knowledgeLevel(observer, subject);
  if (level >= KNOWLEDGE_THRESHOLDS.DETAILED) return 'detailed';
  if (level >= KNOWLEDGE_THRESHOLDS.POPULATION) return 'population';
  if (level >= KNOWLEDGE_THRESHOLDS.ECONOMY) return 'economy';
  if (level >= KNOWLEDGE_THRESHOLDS.RESOURCES) return 'resources';
  if (level >= KNOWLEDGE_THRESHOLDS.MAP) return 'map';
  if (level >= KNOWLEDGE_THRESHOLDS.DIRECTION) return 'direction';
  if (level >= KNOWLEDGE_THRESHOLDS.NAME) return 'name';
  return 'unknown';
}

export function canSeeMap(observer, subject) {
  if (!observer || !subject) return false;
  if (observer.id === subject.id) return true;
  return knowledgeLevel(observer, subject) >= KNOWLEDGE_THRESHOLDS.MAP;
}

export function compassDirection(observer, subject) {
  const [fromLon, fromLat] = observer?.centroid || [];
  const [toLon, toLat] = subject?.centroid || [];
  if (![fromLon, fromLat, toLon, toLat].every(Number.isFinite)) return 'unknown direction';

  const east = toLon - fromLon;
  const north = toLat - fromLat;
  const degrees = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
  const directions = [
    'north', 'north-north-east', 'north-east', 'east-north-east',
    'east', 'east-south-east', 'south-east', 'south-south-east',
    'south', 'south-south-west', 'south-west', 'west-south-west',
    'west', 'west-north-west', 'north-west', 'north-north-west',
  ];
  return directions[Math.round(degrees / 22.5) % 16];
}

function addInitialNeighbourReports(observer, subject) {
  const ledger = getLedger(observer);
  if (!ledger || !subject) return;

  if (!ledger.hasObservation({ subjectId: subject.id, topic: KNOWLEDGE_TOPICS.EXISTENCE, provenanceType: 'land_neighbour' })) {
    ledger.addObservation({
      subjectId: subject.id,
      topic: KNOWLEDGE_TOPICS.EXISTENCE,
      value: { name: subject.name },
      source: KNOWLEDGE_SOURCES.DIRECT,
      confidence: 1,
      specificity: 1,
      provenance: { type: 'land_neighbour' },
      subjectMatter: ['identity'],
    });
  }

  if (!ledger.hasObservation({ subjectId: subject.id, topic: KNOWLEDGE_TOPICS.LOCATION, provenanceType: 'land_neighbour' })) {
    ledger.addObservation({
      subjectId: subject.id,
      topic: KNOWLEDGE_TOPICS.LOCATION,
      value: { direction: compassDirection(observer, subject), borderKnown: true },
      source: KNOWLEDGE_SOURCES.DIRECT,
      confidence: 1,
      specificity: 1,
      provenance: { type: 'land_neighbour' },
      subjectMatter: ['location', 'border'],
    });
  }
}

function addInitialRumour(observer, subject, provenanceType, confidence = 0.35, locationConfidence = 0.25) {
  const ledger = getLedger(observer);
  if (!ledger || !subject || observer.id === subject.id) return;
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.RUMOUR,
    confidence,
    specificity: confidence,
    provenance: { type: provenanceType },
    subjectMatter: ['identity', 'inherited_geography'],
  });
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject) },
    source: KNOWLEDGE_SOURCES.RUMOUR,
    confidence: locationConfidence,
    specificity: locationConfidence,
    provenance: { type: provenanceType },
    subjectMatter: ['location', 'inherited_geography'],
  });
}

function initialDistanceKm(a, b) {
  const [lon1, lat1] = a?.centroid || [];
  const [lon2, lat2] = b?.centroid || [];
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return Infinity;
  const toRad = Math.PI / 180;
  const p1 = lat1 * toRad, p2 = lat2 * toRad;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function addHistoricalContact(observer, subject, label = 'historical_contact') {
  const ledger = getLedger(observer);
  if (!ledger || !subject || observer.id === subject.id) return;
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.DIPLOMAT,
    confidence: 1,
    specificity: 1,
    provenance: { type: label },
    subjectMatter: ['identity', 'trade', 'diplomacy'],
  });
  ledger.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject), routeKnown: true },
    source: KNOWLEDGE_SOURCES.DIPLOMAT,
    confidence: 0.95,
    specificity: 0.9,
    provenance: { type: label },
    subjectMatter: ['location', 'trade_route'],
  });
}

export function initialiseKnowledge(regions, seaRegions = []) {
  const byId = new Map(regions.map((region) => [region.id, region]));

  // Immediate land neighbours are certain direct contacts, as before.
  for (const region of regions) {
    getLedger(region);
    for (const neighbourId of region.neighbors || []) {
      const neighbour = byId.get(neighbourId);
      if (neighbour) addInitialNeighbourReports(region, neighbour);
    }
  }

  // People normally inherit some vague geography beyond the next border.
  // This is deliberately only a rumour: enough to know a direction, not enough
  // to trade, raid or inspect the region through fog of war.
  for (const region of regions) {
    const direct = new Set(region.neighbors || []);
    for (const neighbourId of direct) {
      const neighbour = byId.get(neighbourId);
      for (const secondId of neighbour?.neighbors || []) {
        if (secondId === region.id || direct.has(secondId)) continue;
        const second = byId.get(secondId);
        if (second) addInitialRumour(region, second, 'neighbour_of_neighbour', 0.4, 0.28);
      }
    }
  }

  // Very short sea crossings are usually part of inherited local geography,
  // but still do not automatically create diplomatic/trading contact.
  for (const sea of seaRegions || []) {
    const adjacent = (sea.adjacentLand || []).map((id) => byId.get(id)).filter(Boolean);
    for (let i = 0; i < adjacent.length; i += 1) for (let j = i + 1; j < adjacent.length; j += 1) {
      const a = adjacent[i], b = adjacent[j];
      if (initialDistanceKm(a, b) > 120) continue;
      addInitialRumour(a, b, 'short_sea_horizon', 0.5, 0.38);
      addInitialRumour(b, a, 'short_sea_horizon', 0.5, 0.38);
    }
  }

  // Historical 1300 BCE exception: Cyprus/Alashiya was already embedded in
  // eastern Mediterranean trade and diplomacy. Do this explicitly rather than
  // inventing a universal island-mainland rule.
  const names = new Map(regions.map((region) => [region.name, region]));
  const cyprus = ['Central Cyprus', 'Eastern Cyprus', 'Western Cyprus'].map((name) => names.get(name)).filter(Boolean);
  const easternContacts = ['Ugarit Coast', 'Cilicia', 'Lycia & Pamphylia', 'Northern Phoenician Coast', 'Central Phoenician Coast']
    .map((name) => names.get(name)).filter(Boolean);
  for (const island of cyprus) for (const coast of easternContacts) {
    addHistoricalContact(island, coast, 'late_bronze_age_cyprus_network');
    addHistoricalContact(coast, island, 'late_bronze_age_cyprus_network');
  }
}

export function recordScoutContact(observer, subject, receivedAt = null, mode = 'land') {
  if (!observer || !subject) return null;
  const ledger = getLedger(observer);
  const provenance = { type: 'government_scouting', mode };
  const existence = ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.SCOUT,
    observedAt: receivedAt,
    receivedAt,
    confidence: 0.9,
    specificity: 0.85,
    provenance,
    subjectMatter: ['identity', 'military_scouting'],
  });
  ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject), routeKnown: true },
    source: KNOWLEDGE_SOURCES.SCOUT,
    observedAt: receivedAt,
    receivedAt,
    confidence: 0.8,
    specificity: 0.75,
    provenance,
    subjectMatter: ['location', 'military_scouting'],
  });
  return existence;
}

function fishingEffort(region) {
  const occ = region?.occupations || {};
  return Math.max(0,
    Number(occ.shoreFisher || 0) +
    Number(occ.boatFisher || 0) * 2 +
    Number(region?.fishingBoats || 0) * 5
  );
}

function addFishingReport(observer, subject, sharedSeaIds, confidence, receivedAt = null) {
  const ledger = getLedger(observer);
  ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.FISHER,
    observedAt: receivedAt,
    receivedAt,
    confidence,
    specificity: Math.min(1, confidence + 0.15),
    provenance: { type: 'shared_sea_fishing', seaIds: [...sharedSeaIds] },
    subjectMatter: ['fishing', 'coast', 'identity'],
  });
  ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject), seaIds: [...sharedSeaIds] },
    source: KNOWLEDGE_SOURCES.FISHER,
    observedAt: receivedAt,
    receivedAt,
    confidence: confidence * 0.8,
    specificity: confidence * 0.75,
    provenance: { type: 'shared_sea_fishing', seaIds: [...sharedSeaIds] },
    subjectMatter: ['fishing', 'coast', 'location'],
  });
}

// Coastlines are static. Build the relatively small set of land pairs which
// share a sea once at world load, rather than testing every possible pair on
// every game week. A pair can share more than one sea, so retain all sea IDs.
export function buildFishingContactPairs(regions, seaRegions) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const pairsByKey = new Map();

  for (const sea of seaRegions) {
    const adjacent = (sea.adjacentLand || []).filter((id) => regionsById.has(id));
    for (let i = 0; i < adjacent.length; i += 1) {
      for (let j = i + 1; j < adjacent.length; j += 1) {
        const firstId = adjacent[i];
        const secondId = adjacent[j];
        const [aId, bId] = firstId < secondId ? [firstId, secondId] : [secondId, firstId];
        const key = `${aId}|${bId}`;
        let pair = pairsByKey.get(key);
        if (!pair) {
          pair = { a: regionsById.get(aId), b: regionsById.get(bId), sharedSeaIds: [] };
          pairsByKey.set(key, pair);
        }
        if (!pair.sharedSeaIds.includes(sea.id)) pair.sharedSeaIds.push(sea.id);
      }
    }
  }

  return [...pairsByKey.values()];
}

export function tickFishingKnowledge(contactPairs, currentTick = null) {
  for (const { a, b, sharedSeaIds } of contactPairs) {
    const effortA = fishingEffort(a);
    const effortB = fishingEffort(b);
    const totalEffort = effortA + effortB;
    if (totalEffort <= 0) continue;

    // More fishing produces better reports, while repeated weeks provide
    // further corroborating reports through evidenceStrength().
    const confidence = Math.min(0.85, 0.08 + Math.log10(totalEffort + 1) * 0.12);
    addFishingReport(a, b, sharedSeaIds, confidence, currentTick);
    addFishingReport(b, a, sharedSeaIds, confidence, currentTick);
  }
}

export function hasDirectContact(regionA, regionB) {
  if (!regionA || !regionB || regionA.id === regionB.id) return false;
  if ((regionA.neighbors || []).includes(regionB.id)) return true;
  return getLedger(regionA)?.directContactIds.has(regionB.id) || false;
}

export function directContactIds(region) {
  if (!region) return new Set();
  return new Set([...(region.neighbors || []), ...(getLedger(region)?.directContactIds || [])]);
}

export function knownRegionIds(region) {
  if (!region) return new Set();
  return new Set([...(region.neighbors || []), ...(getLedger(region)?.knownSubjectIds || [])]);
}

export function pruneKnowledge(regions, currentTick, maxAgeWeeks = MAX_OBSERVATION_AGE_WEEKS) {
  let removed = 0;
  for (const region of regions) removed += getLedger(region)?.prune(currentTick, maxAgeWeeks) || 0;
  return removed;
}

export function recordDirectTrade(regionA, regionB, volume, receivedAt = null) {
  if (!regionA || !regionB) return null;

  if (!(regionA.tradeLinks instanceof Map)) regionA.tradeLinks = new Map();
  if (!(regionB.tradeLinks instanceof Map)) regionB.tradeLinks = new Map();
  regionA.tradeLinks.set(regionB.id, (regionA.tradeLinks.get(regionB.id) || 0) + volume);
  regionB.tradeLinks.set(regionA.id, (regionB.tradeLinks.get(regionA.id) || 0) + volume);
  if (!(regionA.tradePartnerIds instanceof Set)) regionA.tradePartnerIds = new Set();
  if (!(regionB.tradePartnerIds instanceof Set)) regionB.tradePartnerIds = new Set();
  regionA.tradePartnerIds.add(regionB.id);
  regionB.tradePartnerIds.add(regionA.id);

  const provenance = { type: 'direct_trade', from: regionA.id, to: regionB.id, volume };
  const add = (observer, subject) => {
    const ledger = getLedger(observer);
    ledger?.addObservation({
      subjectId: subject.id,
      topic: KNOWLEDGE_TOPICS.EXISTENCE,
      value: { name: subject.name },
      source: KNOWLEDGE_SOURCES.TRADER,
      observedAt: receivedAt,
      receivedAt,
      confidence: 1,
      specificity: 1,
      provenance,
      subjectMatter: ['trade', 'identity'],
    });
    ledger?.addObservation({
      subjectId: subject.id,
      topic: KNOWLEDGE_TOPICS.LOCATION,
      value: { direction: compassDirection(observer, subject) },
      source: KNOWLEDGE_SOURCES.TRADER,
      observedAt: receivedAt,
      receivedAt,
      confidence: 0.9,
      specificity: 0.8,
      provenance,
      subjectMatter: ['trade', 'location'],
    });
    ledger?.addObservation({
      subjectId: subject.id,
      topic: KNOWLEDGE_TOPICS.TRADE,
      value: { tradeVolume: volume },
      source: KNOWLEDGE_SOURCES.TRADER,
      observedAt: receivedAt,
      receivedAt,
      confidence: 0.9,
      specificity: 0.6,
      provenance,
      subjectMatter: ['trade'],
    });
  };

  add(regionA, regionB);
  add(regionB, regionA);
  return true;
}

export function learnAbout(observer, subject, confidence = 0.5, receivedAt = null) {
  if (!observer || !subject) return null;
  const source = confidence >= 0.7 ? KNOWLEDGE_SOURCES.PRISONER : KNOWLEDGE_SOURCES.RAID_SURVIVOR;
  const ledger = getLedger(observer);

  const existence = ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source,
    observedAt: receivedAt,
    receivedAt,
    confidence,
    specificity: Math.min(1, confidence + 0.1),
    provenance: { type: 'raid', subjectId: subject.id },
    subjectMatter: ['military', 'identity'],
  });

  ledger?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(observer, subject) },
    source,
    observedAt: receivedAt,
    receivedAt,
    confidence,
    specificity: confidence,
    provenance: { type: 'raid', subjectId: subject.id },
    subjectMatter: ['military', 'location'],
  });

  return existence;
}

export function diffuseTradeNetworkKnowledge(regions, receivedAt = null) {
  const byId = new Map(regions.map((region) => [region.id, region]));

  for (const intermediary of regions) {
    if (!(intermediary.tradeLinks instanceof Map)) continue;
    const partnerIds = [...intermediary.tradeLinks.keys()].filter((id) => byId.has(id));

    for (const listenerId of partnerIds) {
      const listener = byId.get(listenerId);
      for (const subjectId of partnerIds) {
        if (listenerId === subjectId) continue;
        const subject = byId.get(subjectId);

        getLedger(listener)?.addObservation({
          subjectId,
          topic: KNOWLEDGE_TOPICS.EXISTENCE,
          value: { name: subject.name },
          source: KNOWLEDGE_SOURCES.SECOND_HAND_RUMOUR,
          observedAt: receivedAt,
          receivedAt,
          confidence: 0.25,
          specificity: 0.25,
          provenance: { type: 'trade_network', intermediaryId: intermediary.id },
          subjectMatter: ['trade', 'rumour'],
        });
      }
    }
  }
}
