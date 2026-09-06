// Literacy in 1300 BCE is specialist infrastructure, not universal schooling.
// This module models scribal cohorts, archives, writing adoption and the split
// between tacit knowledge (held by living workers) and recorded knowledge that
// can survive personnel turnover and rare events.

const YEAR_DAYS = 365.2425;
const STUDY_YEARS = 7;
const JUNIOR_YEARS = 8;
const EXPERIENCED_ATTRITION_YEARS = 32;
const MASTER_ATTRITION_YEARS = 24;
const TACIT_HALFLIFE_YEARS = 55;

const WRITING_SEEDS = Object.freeze({
  EGY: 'hieroglyphic/hieratic',
  IRQ: 'cuneiform',
  SYR: 'cuneiform',
  LBN: 'cuneiform',
  ISR: 'regional writing tradition',
  PSE: 'regional writing tradition',
  JOR: 'regional writing tradition',
  TUR: 'cuneiform',
  CYP: 'Cypro-Minoan',
  GRC: 'Linear B',
});

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, Number(value) || 0));
}

function sourceGroup(region) {
  return region?.feature?.properties?.sourceGroup || '';
}

function initialWritingSystem(region) {
  return WRITING_SEEDS[sourceGroup(region)] || null;
}

function defaultTarget(region, writingSystem) {
  if (!writingSystem) return 0;
  const population = Math.max(0, region.population || 0);
  // A small professional pipeline: tens of students in ordinary centres,
  // hundreds only in genuinely large population centres.
  return Math.max(4, Math.round(Math.sqrt(population) * 0.22));
}

export function ensureEducation(region) {
  if (!region) return null;
  if (!region.education) region.education = {};
  const e = region.education;
  if (e.writingSystem === undefined) e.writingSystem = initialWritingSystem(region);
  if (!Number.isFinite(e.targetStudents)) e.targetStudents = defaultTarget(region, e.writingSystem);
  if (!Number.isFinite(e.students)) e.students = e.writingSystem ? e.targetStudents * 0.7 : 0;
  if (!Number.isFinite(e.juniorScribes)) e.juniorScribes = e.writingSystem ? e.targetStudents * 0.45 : 0;
  if (!Number.isFinite(e.experiencedScribes)) e.experiencedScribes = e.writingSystem ? e.targetStudents * 0.9 : 0;
  if (!Number.isFinite(e.masterScribes)) e.masterScribes = e.writingSystem ? Math.max(1, e.targetStudents * 0.08) : 0;
  if (!Number.isFinite(e.archiveLevel)) e.archiveLevel = e.writingSystem ? 0.12 : 0;
  if (!e.recordedExperience || typeof e.recordedExperience !== 'object') e.recordedExperience = {};
  if (!Number.isFinite(e.lastTick)) e.lastTick = 0;
  if (!Number.isFinite(e.adoptionProgress)) e.adoptionProgress = 0;
  if (!Number.isFinite(e.administrativeDemand)) e.administrativeDemand = 0;
  if (!Number.isFinite(e.administrativeCoverage)) e.administrativeCoverage = e.writingSystem ? 0.5 : 0;
  return e;
}

export function setScribalStudentTarget(region, target) {
  const e = ensureEducation(region);
  if (!e) return false;
  e.targetStudents = Math.max(0, Math.round(Number(target) || 0));
  return true;
}

export function educatedSpecialists(region) {
  const e = ensureEducation(region);
  return e ? e.juniorScribes + e.experiencedScribes + e.masterScribes : 0;
}

export function scribalCapacity(region) {
  const e = ensureEducation(region);
  if (!e?.writingSystem) return 0;
  const weighted = e.juniorScribes * 0.45 + e.experiencedScribes + e.masterScribes * 2.2;
  const populationScale = Math.max(8, Math.sqrt(Math.max(1, region.population || 1)) * 0.18);
  return clamp(weighted / populationScale);
}

export function archiveEffectiveness(region) {
  const e = ensureEducation(region);
  if (!e?.writingSystem) return 0;
  return clamp(e.archiveLevel * 0.55 + scribalCapacity(region) * 0.45);
}

export function recordingFraction(region, activity = null) {
  const e = ensureEducation(region);
  if (!e?.writingSystem) return 0;
  let subjectFit = 0.28;
  if (['smithing', 'mining', 'pottery', 'textiles', 'boatbuilding'].includes(activity)) subjectFit = 0.5;
  else if (['farming', 'horseHusbandry'].includes(activity)) subjectFit = 0.42;
  // Even a sophisticated archive records only a minority of craft knowledge:
  // much remains embodied skill. Rare-event observations and reproducible
  // recipes are precisely the sort of knowledge that writing preserves well.
  return clamp(archiveEffectiveness(region) * subjectFit, 0, 0.55);
}

export function recordPractice(region, activity, workerEffort) {
  if (!region || workerEffort <= 0) return;
  const e = ensureEducation(region);
  const fraction = recordingFraction(region, activity);
  if (fraction <= 0) return;
  e.recordedExperience[activity] = (e.recordedExperience[activity] || 0) + workerEffort * fraction;
}

export function effectiveRecordedExperience(region, activity) {
  const e = ensureEducation(region);
  return Math.max(0, e?.recordedExperience?.[activity] || 0);
}

export function informationQualityMultiplier(region) {
  // Better interviewing, copying, comparison and record retrieval. Deliberately
  // capped: scribes cannot make an eyewitness see something they never saw.
  return 1 + archiveEffectiveness(region) * 0.28;
}

export function informationDelayMultiplier(region) {
  // Organised correspondence and records shorten the administrative part of a
  // report's journey, but geography still dominates travel time.
  return 1 - archiveEffectiveness(region) * 0.35;
}

export function administrationMultiplier(region) {
  const e = ensureEducation(region);
  if (!e?.writingSystem) return 0.65 + scribalCapacity(region) * 0.1;
  return 0.8 + archiveEffectiveness(region) * 0.45;
}

function writingExposure(region, regionsById) {
  let exposure = 0;
  for (const neighbourId of region.neighbors || []) {
    if (ensureEducation(regionsById.get(neighbourId))?.writingSystem) exposure += 0.08;
  }
  const recentPartners = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.keys()]
    : [...(region.tradePartnerIds || [])];
  for (const partnerId of recentPartners) {
    if (ensureEducation(regionsById.get(partnerId))?.writingSystem) exposure += 0.12;
  }
  return clamp(exposure, 0, 1);
}

function maybeAdoptWriting(region, regionsById, years) {
  const e = ensureEducation(region);
  if (e.writingSystem) return;
  const exposure = writingExposure(region, regionsById);
  if (exposure <= 0) return;
  // Adoption is usually borrowing/adaptation, not independent invention.
  e.adoptionProgress += exposure * years * 0.025;
  if (e.adoptionProgress < 1) return;
  const candidates = [];
  for (const id of [...(region.neighbors || []), ...(
    region.recentTradePartners instanceof Map ? region.recentTradePartners.keys() : region.tradePartnerIds || [])]) {
    const system = ensureEducation(regionsById.get(id))?.writingSystem;
    if (system) candidates.push(system);
  }
  e.writingSystem = candidates[0] || 'adapted writing tradition';
  e.targetStudents = Math.max(e.targetStudents, defaultTarget(region, e.writingSystem));
  e.students = Math.max(e.students, 2);
  e.archiveLevel = Math.max(e.archiveLevel, 0.02);
}

function advanceCohorts(region, years) {
  const e = ensureEducation(region);
  if (!e.writingSystem) return;
  const teacherCapacity = Math.max(2, e.experiencedScribes * 0.55 + e.masterScribes * 3);
  const intakeCapacity = teacherCapacity * 1.7 + e.archiveLevel * 30;
  const desired = Math.min(e.targetStudents, intakeCapacity);
  e.students += (desired - e.students) * Math.min(1, years * 0.8);

  const graduates = e.students * (years / STUDY_YEARS);
  e.students = Math.max(0, e.students - graduates);
  e.juniorScribes += graduates;

  const promoted = e.juniorScribes * (years / JUNIOR_YEARS);
  e.juniorScribes = Math.max(0, e.juniorScribes - promoted);
  e.experiencedScribes += promoted;

  const masters = e.experiencedScribes * years * 0.012;
  e.experiencedScribes = Math.max(0, e.experiencedScribes - masters);
  e.masterScribes += masters;

  e.experiencedScribes *= Math.exp(-years / EXPERIENCED_ATTRITION_YEARS);
  e.masterScribes *= Math.exp(-years / MASTER_ATTRITION_YEARS);

  const total = educatedSpecialists(region);
  const archiveTarget = clamp(total / Math.max(30, Math.sqrt(Math.max(1, region.population || 1)) * 0.8));
  e.archiveLevel += (archiveTarget - e.archiveLevel) * Math.min(1, years * 0.06);
}

function decayTacitKnowledge(region, years) {
  if (!region.experience || years <= 0) return;
  // Skills embodied in people fade as generations turn over. Written records
  // slow the loss because old observations, recipes and precedents can be
  // recovered and taught, but they never preserve all tacit craft technique.
  const archive = archiveEffectiveness(region);
  const effectiveHalflife = TACIT_HALFLIFE_YEARS * (1 + archive * 1.8);
  const retention = Math.pow(0.5, years / effectiveHalflife);
  for (const key of Object.keys(region.experience)) region.experience[key] *= retention;

  // Records themselves are durable but not immortal: loss, copying errors,
  // damp, fire and institutional collapse slowly erode collections.
  const e = ensureEducation(region);
  const recordRetention = Math.pow(0.5, years / (180 + archive * 420));
  for (const key of Object.keys(e.recordedExperience)) e.recordedExperience[key] *= recordRetention;
}

export function tickEducation(regions, currentTick, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / YEAR_DAYS;
  if (years <= 0) return;
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  for (const region of regions) ensureEducation(region);
  for (const region of regions) maybeAdoptWriting(region, regionsById, years);
  for (const region of regions) {
    advanceCohorts(region, years);
    decayTacitKnowledge(region, years);
    region.education.lastTick = currentTick;
  }
}
