/*
 * Knowledge is a report/evidence ledger, deliberately separate from map visibility.
 *
 * Reports can be delayed, stale, vague, reliable or second-hand.  The small
 * compatibility helpers at the bottom are used by the current trade/raid code;
 * they create observations rather than permanent knowledge flags.
 */
export const KNOWLEDGE_TOPICS = Object.freeze({
  EXISTENCE: 'existence', LOCATION: 'location', POPULATION: 'population',
  FOOD: 'food', MINING: 'mining', METALLURGY: 'metallurgy', TRADE: 'trade',
  ECONOMY: 'economy', MILITARY: 'military', POLITICS: 'politics', RESOURCES: 'resources',
});

export const KNOWLEDGE_SOURCES = Object.freeze({
  DIRECT: 'direct', TRADER: 'trader', FISHER: 'fisher', RAID_SURVIVOR: 'raid_survivor',
  PRISONER: 'prisoner', DIPLOMAT: 'diplomat', REFUGEE: 'refugee', RUMOUR: 'rumour',
  SECOND_HAND_RUMOUR: 'second_hand_rumour', SPY: 'spy',
});

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

function getLedger(region) {
  if (!region) return null;
  if (!region.knowledge || typeof region.knowledge.addObservation !== 'function') {
    region.knowledge = new KnowledgeLedger(region.id);
  }
  return region.knowledge;
}

export class KnowledgeLedger {
  constructor(ownerId) {
    this.ownerId = ownerId;
    this.observations = [];
  }

  addObservation({ subjectId, topic, value = null, source = KNOWLEDGE_SOURCES.DIRECT,
    observedAt, receivedAt, confidence = 1, specificity = 1, provenance = null,
    subjectMatter = [] }) {
    if (!subjectId || !topic) return null;
    const observation = {
      id: `${this.ownerId}:${this.observations.length + 1}`,
      subjectId, topic, value, source,
      observedAt: observedAt ?? null,
      receivedAt: receivedAt ?? null,
      confidence: clamp01(confidence),
      specificity: clamp01(specificity),
      provenance,
      subjectMatter: [...subjectMatter],
    };
    this.observations.push(observation);
    return observation;
  }

  forSubject(subjectId) { return this.observations.filter((o) => o.subjectId === subjectId); }
  forTopic(subjectId, topic) { return this.observations.filter((o) => o.subjectId === subjectId && o.topic === topic); }
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
    return this.forTopic(subjectId, topic).some((o) => o.confidence >= minimumConfidence);
  }
  export() { return this.observations.map((o) => ({ ...o, subjectMatter: [...o.subjectMatter] })); }
}

// Compatibility layer for the current simulation. Direct land neighbours have
// met automatically. A trade creates a report proving commercial contact.
export function hasDirectContact(regionA, regionB) {
  if (!regionA || !regionB || regionA.id === regionB.id) return false;
  return Array.isArray(regionA.neighbors) && regionA.neighbors.includes(regionB.id);
}

export function recordDirectTrade(regionA, regionB, volume, receivedAt = null) {
  if (!regionA || !regionB) return null;
  const a = getLedger(regionA);
  const b = getLedger(regionB);
  const observedAt = receivedAt;
  const provenance = { type: 'direct_trade', from: regionA.id, to: regionB.id, volume };
  a?.addObservation({ subjectId: regionB.id, topic: KNOWLEDGE_TOPICS.EXISTENCE, value: true,
    source: KNOWLEDGE_SOURCES.TRADER, observedAt, receivedAt, confidence: 1, specificity: 1, provenance,
    subjectMatter: ['trade'] });
  b?.addObservation({ subjectId: regionA.id, topic: KNOWLEDGE_TOPICS.EXISTENCE, value: true,
    source: KNOWLEDGE_SOURCES.TRADER, observedAt, receivedAt, confidence: 1, specificity: 1, provenance,
    subjectMatter: ['trade'] });
  return true;
}

// Current raids still call this helper. It now creates an intelligence report
// instead of incrementing a permanent "knowledge" number.
export function learnAbout(observer, subject, confidence = 0.5, receivedAt = null) {
  if (!observer || !subject) return null;
  return getLedger(observer)?.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: KNOWLEDGE_SOURCES.RAID_SURVIVOR,
    observedAt: receivedAt,
    receivedAt,
    confidence,
    specificity: confidence,
    provenance: { type: 'raid', subjectId: subject.id },
    subjectMatter: ['military', 'location'],
  });
}

// A trade hub becomes an information hub: traders can carry a weak, second-hand
// existence report from one trading partner to another. This is intentionally
// vague and does not reveal economic/resource values yet.
export function diffuseTradeNetworkKnowledge(regions, receivedAt = null) {
  for (const intermediary of regions) {
    const partners = regions.filter((candidate) =>
      candidate.id !== intermediary.id && hasDirectContact(intermediary, candidate) &&
      hasDirectContact(candidate, intermediary));
    for (const source of partners) {
      for (const listener of partners) {
        if (source.id === listener.id) continue;
        getLedger(listener)?.addObservation({
          subjectId: source.id,
          topic: KNOWLEDGE_TOPICS.EXISTENCE,
          value: { name: source.name },
          source: KNOWLEDGE_SOURCES.SECOND_HAND_RUMOUR,
          observedAt: receivedAt,
          receivedAt,
          confidence: 0.25,
          specificity: 0.25,
          provenance: { type: 'trade_network', intermediaryId: intermediary.id },
          subjectMatter: ['trade'],
        });
      }
    }
  }
}
