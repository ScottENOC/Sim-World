/*
 * Knowledge is deliberately separate from map visibility.
 *
 * A faction does not "know a value" globally. It holds observations about
 * another region, each with:
 *   - topic: what the information is about
 *   - value: the reported value (or a structured claim)
 *   - source: who/what supplied it
 *   - observedAt: when the underlying fact was observed
 *   - receivedAt: when this faction received the report
 *   - confidence: how believable the report currently is
 *   - specificity: how precisely the subject is known
 *
 * This is intentionally an evidence/report ledger rather than a permanent
 * knowledge percentage. Future systems (rumours, espionage, traders,
 * refugees, captured raiders, diplomacy and disinformation) can all create
 * observations with different reliability, delays and subject-matter bias.
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
});

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function makeKey(subjectId, topic) {
  return `${subjectId}::${topic}`;
}

export class KnowledgeLedger {
  constructor(ownerId) {
    this.ownerId = ownerId;
    this.observations = [];
  }

  /*
   * Add an observation without deciding whether it is true.
   * Truth/reconciliation belongs to the simulation layer, not this ledger.
   */
  addObservation({
    subjectId,
    topic,
    value = null,
    source = KNOWLEDGE_SOURCES.DIRECT,
    observedAt,
    receivedAt,
    confidence = 1,
    specificity = 1,
    provenance = null,
    subjectMatter = [],
  }) {
    if (!subjectId || !topic) return null;

    const observation = {
      id: `${this.ownerId}:${this.observations.length + 1}`,
      subjectId,
      topic,
      value,
      source,
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

  forSubject(subjectId) {
    return this.observations.filter((o) => o.subjectId === subjectId);
  }

  forTopic(subjectId, topic) {
    return this.observations.filter(
      (o) => o.subjectId === subjectId && o.topic === topic
    );
  }

  latest(subjectId, topic) {
    const matches = this.forTopic(subjectId, topic);
    return matches[matches.length - 1] || null;
  }

  /*
   * Returns the best currently available report, not necessarily the newest.
   * This lets a future system choose between a fresh but vague rumour and an
   * old but highly reliable trader report.
   */
  best(subjectId, topic) {
    const matches = this.forTopic(subjectId, topic);
    if (matches.length === 0) return null;

    return [...matches].sort((a, b) => {
      const scoreA = a.confidence * a.specificity;
      const scoreB = b.confidence * b.specificity;
      return scoreB - scoreA;
    })[0];
  }

  hasTopic(subjectId, topic, minimumConfidence = 0) {
    return this.forTopic(subjectId, topic)
      .some((o) => o.confidence >= minimumConfidence);
  }

  export() {
    return this.observations.map((o) => ({ ...o, subjectMatter: [...o.subjectMatter] }));
  }
}
