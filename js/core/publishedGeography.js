import { KNOWLEDGE_TOPICS, compassDirection, knowledgeStage } from './knowledge.js?v=20260918-atlas1';
import { ensureRenaissanceState } from '../society/renaissanceNetworks.js?v=20260918-atlas1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function educationLevel(region) {
  return clamp(Math.max(
    region?.educationLevel || 0,
    region?.medievalSociety?.education?.knowledgeCapacity || 0,
    region?.massEducation?.literacy || 0,
    region?.massEducation?.adultLiteracy || 0,
  ));
}

function publicationCapability(region) {
  const printing = ensureRenaissanceState(region).printing;
  const literacy = educationLevel(region);
  if (!printing.mechanicalPress || literacy < 0.24) return 0;
  return clamp(printing.publicationFlow * 0.52 + printing.informationVelocity * 0.28 + literacy * 0.2);
}

function distributionLinks(region) {
  const ids = new Set(region?.neighbors || []);
  for (const id of region?.tradePartnerIds || []) ids.add(id);
  if (region?.recentTradePartners?.keys) for (const id of region.recentTradePartners.keys()) ids.add(id);
  ids.delete(region?.id);
  return ids;
}

function sourceSubjectIds(region) {
  if (!region?.knowledge?.knownSubjectIds) return [];
  return [...region.knowledge.knownSubjectIds];
}

function addPublishedObservation(listener, source, subject, currentTick, capability) {
  if (!listener?.knowledge?.addObservation || !subject || listener.id === subject.id) return false;
  const sourceStage = knowledgeStage(source, subject);
  if (sourceStage === 'unknown') return false;

  const existenceConfidence = clamp(0.52 + capability * 0.38);
  listener.knowledge.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.EXISTENCE,
    value: { name: subject.name },
    source: 'publication',
    observedAt: currentTick,
    receivedAt: currentTick,
    confidence: existenceConfidence,
    specificity: clamp(0.5 + capability * 0.34),
    provenance: { type: 'published_geography', publisherRegionId: source.id },
    subjectMatter: ['identity', 'published_geography'],
  });

  // Publications only transmit mapped location if the publisher itself has at
  // least mapped knowledge. A rumoured name does not turn into a precise atlas.
  if (!['map', 'resources', 'economy', 'population', 'detailed'].includes(sourceStage)) return true;
  listener.knowledge.addObservation({
    subjectId: subject.id,
    topic: KNOWLEDGE_TOPICS.LOCATION,
    value: { direction: compassDirection(listener, subject), publishedMap: true },
    source: 'publication',
    observedAt: currentTick,
    receivedAt: currentTick,
    confidence: clamp(0.46 + capability * 0.36),
    specificity: clamp(0.42 + capability * 0.38),
    provenance: { type: 'published_geography', publisherRegionId: source.id },
    subjectMatter: ['location', 'published_geography'],
  });
  return true;
}

export function tickPublishedGeography(regions, currentTick, elapsedDays = 30) {
  if (!regions?.length) return { publications: 0, observations: 0 };
  const world = regions[0];
  world._publishedGeographyClock ||= { elapsedDays: 0 };
  world._publishedGeographyClock.elapsedDays += Math.max(0, Number(elapsedDays) || 0);
  if (world._publishedGeographyClock.elapsedDays < DAYS_PER_YEAR) return { publications: 0, observations: 0 };
  world._publishedGeographyClock.elapsedDays %= DAYS_PER_YEAR;

  const byId = new Map(regions.map((region) => [region.id, region]));
  let publications = 0;
  let observations = 0;

  for (const source of regions) {
    const capability = publicationCapability(source);
    if (capability < 0.3) continue;
    const subjects = sourceSubjectIds(source).map((id) => byId.get(id)).filter(Boolean);
    if (!subjects.length) continue;

    for (const listenerId of distributionLinks(source)) {
      const listener = byId.get(listenerId);
      if (!listener || educationLevel(listener) < 0.16) continue;
      let shared = 0;
      for (const subject of subjects) if (addPublishedObservation(listener, source, subject, currentTick, capability)) shared += 1;
      if (shared) {
        publications += 1;
        observations += shared;
      }
    }
  }

  return { publications, observations };
}
