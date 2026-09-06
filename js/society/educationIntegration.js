import {
  ensureEducation,
  educatedSpecialists,
  archiveEffectiveness,
  informationQualityMultiplier,
  informationDelayMultiplier,
} from './education.js?v=20260906-education1';
import { KnowledgeLedger } from '../core/knowledge.js?v=20260906-scouting1';
import { centroidDistanceKm } from '../world/distance.js?v=20260904-kingdom1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const REGION_BY_ID = new Map();
const PATCH_FLAG = Symbol.for('worldsim.educationKnowledgePatched');

function primaryCulture(region) {
  const group = region?.cultureGroups?.[0];
  return group?.cultureId || group?.id || group?.name || null;
}

function primaryReligionId(region) {
  const entries = Object.entries(region?.religion?.shares || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function patchKnowledgeLedger() {
  if (KnowledgeLedger.prototype[PATCH_FLAG]) return;
  const originalAdd = KnowledgeLedger.prototype.addObservation;
  const originalPrune = KnowledgeLedger.prototype.prune;

  KnowledgeLedger.prototype.addObservation = function addObservationWithScribes(observation) {
    const owner = REGION_BY_ID.get(this.ownerId);
    if (!owner || !Number.isFinite(observation?.receivedAt)) return originalAdd.call(this, observation);

    const quality = informationQualityMultiplier(owner);
    const improve = (value) => {
      const v = clamp(value);
      // Scribes improve interviewing, comparison, copying and retrieval. They
      // cannot create facts the source never observed, so improve the remaining
      // uncertainty rather than simply multiplying confidence toward infinity.
      return clamp(1 - (1 - v) / quality);
    };
    return originalAdd.call(this, {
      ...observation,
      confidence: improve(observation.confidence),
      specificity: improve(observation.specificity),
    });
  };

  KnowledgeLedger.prototype.prune = function pruneWithArchives(currentTick, maxAgeWeeks = 52) {
    const owner = REGION_BY_ID.get(this.ownerId);
    const archive = owner ? archiveEffectiveness(owner) : 0;
    // Current intelligence still goes stale. Archives extend useful memory from
    // roughly one year toward two-and-a-half years, not centuries. Long-lived
    // technical/agricultural memory is handled separately as recorded practice.
    const retainedWeeks = Math.round(maxAgeWeeks * (1 + archive * 1.5));
    return originalPrune.call(this, currentTick, retainedWeeks);
  };

  Object.defineProperty(KnowledgeLedger.prototype, PATCH_FLAG, { value: true });
}

function administrativeDemand(capital, subjects) {
  let demand = 4 + Math.sqrt(Math.max(1, capital.population || 1)) / 22;
  const capitalCulture = primaryCulture(capital);
  const capitalReligion = primaryReligionId(capital);

  for (const subject of subjects) {
    const distance = centroidDistanceKm(capital, subject) || 100;
    const cultureBurden = capitalCulture && primaryCulture(subject) && primaryCulture(subject) !== capitalCulture ? 4 : 0;
    const religionBurden = capitalReligion && primaryReligionId(subject) && primaryReligionId(subject) !== capitalReligion ? 2.5 : 0;
    const integrationBurden = Math.max(0, 0.85 - (subject.governance?.autonomy ?? 0.85)) * 7;
    demand += 3 + Math.sqrt(Math.max(1, subject.population || 1)) / 38 +
      Math.min(8, distance / 260) + cultureBurden + religionBurden + integrationBurden;
  }
  return Math.max(1, demand);
}

function applyAdministration(sim, elapsedDays) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const territories = new Map();
  for (const region of sim.regions) {
    const polityId = region.governance?.sovereignPolityId || region.polityId;
    if (!territories.has(polityId)) territories.set(polityId, []);
    territories.get(polityId).push(region);
  }

  for (const polity of sim.polities || []) {
    if (polity.subjectToPolityId) continue;
    const capital = REGION_BY_ID.get(polity.capitalRegionId);
    if (!capital) continue;
    const subjects = (territories.get(polity.id) || []).filter((r) => r.id !== capital.id);
    const education = ensureEducation(capital);
    const demand = administrativeDemand(capital, subjects);
    const weightedScribes = education.juniorScribes * 0.35 + education.experiencedScribes + education.masterScribes * 1.8;
    // Not every literate specialist works for the palace: temples, merchants,
    // estates and private households compete for the same tiny educated class.
    const availableForGovernment = weightedScribes * 0.62;
    const coverage = education.writingSystem ? clamp(availableForGovernment / demand) : 0;
    education.administrativeDemand = demand;
    education.administrativeCoverage = coverage;
    education.informationQuality = informationQualityMultiplier(capital);

    polity.report.scribalDemand = demand;
    polity.report.scribalCoverage = coverage;
    polity.report.educatedSpecialists = educatedSpecialists(capital);

    const admin = polity.administration;
    if (admin) {
      // Oral rule remains possible. Writing chiefly raises the ceiling on a
      // large, integrated bureaucracy; a shortage of trained people prevents
      // accumulated institutional experience from becoming usable capacity.
      const staffingFactor = 0.55 + coverage * 0.45;
      for (const key of ['recordKeeping', 'accounting', 'communications', 'officialdom']) {
        if (Number.isFinite(admin[key])) admin[key] *= staffingFactor;
      }
    }

    const archive = archiveEffectiveness(capital);
    for (const subject of subjects) {
      const governance = subject.governance;
      if (!governance) continue;
      const overload = 1 - coverage;
      governance.reportDelayWeeks = Math.max(1, Math.ceil(
        (governance.reportDelayWeeks || 1) * (1 + overload * 1.35) * informationDelayMultiplier(capital)
      ));
      governance.corruption = clamp((governance.corruption || 0) + overload * 0.12 - archive * 0.035, 0.04, 0.9);
      // Administrative control erodes slowly when the centre has conquered more
      // territory than its trained officials can actually supervise.
      governance.administrativeControl = clamp((governance.administrativeControl || 0) *
        Math.pow(1 - overload * 0.0025, weekScale), 0.03, 1);
    }
  }
}

function applyCommercialRecords(regions, currentTick, elapsedDays) {
  const years = Math.max(0, elapsedDays) / 365.2425;
  for (const region of regions) {
    const education = ensureEducation(region);
    const archive = archiveEffectiveness(region);
    if (!education.writingSystem || archive <= 0) continue;
    if (!education.tradeRecords || typeof education.tradeRecords !== 'object') education.tradeRecords = {};
    const habits = region.tradeEconomy?.routeHabits || {};

    for (const [key, habit] of Object.entries(habits)) {
      let record = education.tradeRecords[key];
      if (!record) record = education.tradeRecords[key] = { score: 0, lastSuccessTick: null, lastAttemptTick: null };
      const justSucceeded = Number.isFinite(currentTick) && habit.lastSuccessTick === currentTick;
      if (justSucceeded || (habit.score || 0) > record.score) record.score = Math.max(record.score, habit.score || 0);
      record.lastSuccessTick = habit.lastSuccessTick ?? record.lastSuccessTick;
      record.lastAttemptTick = habit.lastAttemptTick ?? record.lastAttemptTick;

      // Written accounts, destination names, counterparties and previous prices
      // keep a profitable route from disappearing when the merchants who first
      // travelled it retire. Records still age as markets and politics change.
      const recordHalfLifeYears = 2 + archive * 10;
      record.score *= Math.pow(0.5, years / recordHalfLifeYears);
      habit.score = Math.max(habit.score || 0, record.score * (0.55 + archive * 0.4));
    }

    // Old entries are cheap but not free forever.
    for (const [key, record] of Object.entries(education.tradeRecords)) {
      if (habits[key]) continue;
      const halfLife = 1.5 + archive * 8;
      record.score *= Math.pow(0.5, years / halfLife);
      if (record.score < 0.01) delete education.tradeRecords[key];
    }
  }
}

function applyReligiousLiteracy(sim, currentTick, elapsedDays) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const world = sim.religiousWorld;
  if (!world?.religions) return;

  for (const religion of world.religions) {
    if (!religion.adminCentreRegionId || !['organised', 'missionary'].includes(religion.spreadMode)) {
      religion.literateClergyCapacity = 0;
      continue;
    }
    const centre = REGION_BY_ID.get(religion.adminCentreRegionId);
    if (!centre) continue;
    const literacy = archiveEffectiveness(centre);
    const centreEducation = ensureEducation(centre);
    const clericalStaff = centreEducation.experiencedScribes + centreEducation.masterScribes * 2;
    const clericalCapacity = clamp(literacy * Math.min(1, clericalStaff / 12));
    religion.literateClergyCapacity = clericalCapacity;
    religion.doctrinalCohesion = 0.35 + clericalCapacity * 0.6;

    // Written liturgy, correspondence and trained clerks let a religious centre
    // exercise authority across distance. This raises an existing organised
    // religion's capacity; it never turns a local oral faith into missionaries.
    const authorityTarget = 0.35 + clericalCapacity * 0.22;
    if ((religion.authority || 0) < authorityTarget) {
      religion.authority += (authorityTarget - religion.authority) * Math.min(1, 0.003 * weekScale);
    }

    // Texts also make accidental local doctrinal drift less sticky. Deliberate
    // state-created missionary forks are excluded: writing can propagate a
    // schism just as effectively as it can preserve orthodoxy.
    for (const region of sim.regions) {
      const parentShare = region.religion?.shares?.[religion.id] || 0;
      if (parentShare <= 0) continue;
      for (const [variantId, share] of Object.entries(region.religion.shares)) {
        if (variantId === religion.id || share <= 0) continue;
        const variant = world.religions.find((r) => r.id === variantId);
        if (!variant || variant.familyId !== religion.familyId || variant.spreadMode !== 'local') continue;
        const correction = Math.min(share, share * clericalCapacity * 0.00035 * weekScale);
        region.religion.shares[variantId] -= correction;
        region.religion.shares[religion.id] += correction;
      }
      region.religion.doctrinalCohesion = Math.max(region.religion.doctrinalCohesion || 0, clericalCapacity);
    }
  }
}

export function attachEducationIntegration(sim) {
  if (!sim || sim.__educationIntegrationAttached) return false;
  sim.__educationIntegrationAttached = true;
  REGION_BY_ID.clear();
  for (const region of sim.regions || []) {
    REGION_BY_ID.set(region.id, region);
    ensureEducation(region);
  }
  patchKnowledgeLedger();

  sim.clock.onTick((time) => {
    const currentTick = Math.floor((Number(time?.endDay) || 0) / 7);
    const elapsedDays = Math.max(0.01, Number(time?.elapsedDays) || 7);
    applyAdministration(sim, elapsedDays);
    applyCommercialRecords(sim.regions, currentTick, elapsedDays);
    applyReligiousLiteracy(sim, currentTick, elapsedDays);
  });
  return true;
}
