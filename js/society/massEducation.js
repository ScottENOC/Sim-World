import { archiveEffectiveness, educatedSpecialists, ensureEducation } from './education.js?v=20260906-education1';

const DAYS_PER_YEAR = 365.2425;
const MAX_MANDATORY_YEARS = 13;
const SCHOOL_START_AGE = 6;
const CHILD_BAND_END_AGE = 14;
const WORKING_AGE_YEARS = 45;
const BASE_PUPIL_TEACHER_RATIO = 34;
const TEACHER_WAGE_PER_WEEK = 0.12;
const PUPIL_SUPPLIES_PER_WEEK = 0.0025;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const clampYears = (v) => Math.max(0, Math.min(MAX_MANDATORY_YEARS, Math.round(Number(v) || 0)));

function eliteSeed(region) {
  const e = ensureEducation(region);
  if (!e) return 0;
  return Math.max(0, e.juniorScribes * 0.18 + e.experiencedScribes * 0.55 + e.masterScribes * 1.8);
}

function stateCapacity(region) {
  return clamp(region.militaryFinance?.stateCapacity ?? region.governance?.administrativeControl ?? 0.5, 0.05, 1);
}

function householdPressure(region) {
  const foodNeed = Math.max(1, region._foodNeeded || region.population || 1);
  const foodStress = clamp(Math.max(0, foodNeed - (region.stockpile?.food || 0)) / foodNeed);
  const poverty = clamp(1 - Math.log1p(Math.max(0, region.wallet || 0)) / 8);
  return clamp(foodStress * 0.65 + poverty * 0.35);
}

function schoolAgePopulation(region, years) {
  const d = region.demographics || { children: 0, workingAge: 0 };
  const childCohort = Math.max(0, d.children || 0) / CHILD_BAND_END_AGE;
  const workingCohort = Math.max(0, d.workingAge || 0) / WORKING_AGE_YEARS;
  const childYears = Math.min(Math.max(0, years), CHILD_BAND_END_AGE - SCHOOL_START_AGE);
  const teenYears = Math.max(0, years - childYears);
  return {
    childStudents: childCohort * childYears,
    teenStudents: workingCohort * teenYears,
    total: childCohort * childYears + workingCohort * teenYears,
  };
}

export function ensureMassEducation(region) {
  ensureEducation(region);
  region.publicEducation ||= {};
  const s = region.publicEducation;
  if (!Number.isFinite(s.mandatoryYears)) s.mandatoryYears = 0;
  s.mandatoryYears = clampYears(s.mandatoryYears);
  if (!Number.isFinite(s.schoolCapacityYears)) s.schoolCapacityYears = 0;
  if (!Number.isFinite(s.teacherCapacity)) s.teacherCapacity = eliteSeed(region);
  if (!Number.isFinite(s.teacherWorkersReserved)) s.teacherWorkersReserved = 0;
  if (!Number.isFinite(s.studentsEnrolled)) s.studentsEnrolled = 0;
  if (!Number.isFinite(s.deliveredYears)) s.deliveredYears = 0;
  if (!Number.isFinite(s.workforceEntrantYears)) s.workforceEntrantYears = 0;
  if (!Number.isFinite(s.adultAverageYears)) s.adultAverageYears = Math.max(0, (region.educationLevel || 0.05) * 4);
  if (!Number.isFinite(s.literacy)) s.literacy = clamp(s.adultAverageYears / 6);
  if (!Number.isFinite(s.numeracy)) s.numeracy = clamp((s.adultAverageYears - 1) / 7);
  if (!Number.isFinite(s.technicalHumanCapital)) s.technicalHumanCapital = clamp((s.adultAverageYears - 4) / 9);
  if (!Number.isFinite(s.weeklyCost)) s.weeklyCost = 0;
  if (!Number.isFinite(s.fundingRatio)) s.fundingRatio = 1;
  if (!Number.isFinite(s.attendanceRatio)) s.attendanceRatio = 0;
  if (!Number.isFinite(s.childLaborWithdrawn)) s.childLaborWithdrawn = 0;
  if (!Number.isFinite(s.rampYearsEstimate)) s.rampYearsEstimate = 0;
  if (!Number.isFinite(s.lastPolicyChangeDay)) s.lastPolicyChangeDay = 0;
  return s;
}

export function setMandatoryEducationYears(region, years, currentDay = null) {
  const s = ensureMassEducation(region);
  const next = clampYears(years);
  if (next === s.mandatoryYears) return s;
  s.mandatoryYears = next;
  if (Number.isFinite(currentDay)) s.lastPolicyChangeDay = currentDay;
  return s;
}

function teacherCandidatePool(region, s) {
  const adults = Math.max(0, region.demographics?.workingAge || 0);
  const massEducated = adults * clamp((s.adultAverageYears - 4) / 9) * 0.045;
  const elite = eliteSeed(region);
  return Math.max(elite, elite + massEducated);
}

function expandCapacity(region, s, years) {
  const target = s.mandatoryYears;
  if (target <= s.schoolCapacityYears) {
    // Schools can be closed quickly, but buildings and trained staff do not vanish instantly.
    s.schoolCapacityYears += (target - s.schoolCapacityYears) * Math.min(1, years * 2.5);
    return;
  }
  const archive = archiveEffectiveness(region);
  const administration = stateCapacity(region);
  const teacherBase = Math.min(1, (s.teacherCapacity + eliteSeed(region)) / Math.max(2, region.population * 0.001));
  const annualExpansion = 0.08 + archive * 0.28 + administration * 0.22 + teacherBase * 0.18;
  s.schoolCapacityYears = Math.min(target, s.schoolCapacityYears + annualExpansion * years);
}

function trainTeachers(region, s, years) {
  const targetStudents = schoolAgePopulation(region, Math.min(s.mandatoryYears, Math.max(0.25, s.schoolCapacityYears))).total;
  const desiredTeachers = targetStudents / BASE_PUPIL_TEACHER_RATIO;
  const candidatePool = teacherCandidatePool(region, s);
  const targetCapacity = Math.min(candidatePool, Math.max(eliteSeed(region), desiredTeachers * 1.15));
  const archive = archiveEffectiveness(region);
  const trainingRate = 0.12 + archive * 0.22 + clamp(s.adultAverageYears / 10) * 0.18;
  s.teacherCapacity += (targetCapacity - s.teacherCapacity) * Math.min(1, years * trainingRate);
  s.teacherCapacity = Math.max(0, s.teacherCapacity);
}

function payForSchools(region, teacherWorkers, students, weekScale) {
  const gross = Math.max(0, teacherWorkers * TEACHER_WAGE_PER_WEEK + students * PUPIL_SUPPLIES_PER_WEEK) * weekScale;
  if (gross <= 0) return { gross: 0, paid: 0, ratio: 1 };
  // Religious, charitable and household support can keep a rudimentary system alive,
  // but a genuinely public mass system depends on state finance.
  const localShare = gross * 0.28;
  const stateDue = gross - localShare;
  const available = Math.max(0, region.treasury || 0);
  const paid = Math.min(stateDue, available);
  region.treasury = Math.max(0, available - paid);
  const ratio = clamp((localShare + paid) / gross, 0.2, 1);
  return { gross, paid: localShare + paid, ratio };
}

function updateHumanCapital(region, s, years) {
  // New cohorts respond much faster than the whole adult population. Low levels of
  // schooling therefore appear in entrants quickly, while 10-13 years takes much
  // longer to become a mature workforce characteristic.
  const cohortLag = 0.8 + s.deliveredYears * 0.55;
  s.workforceEntrantYears += (s.deliveredYears - s.workforceEntrantYears) * Math.min(1, years / Math.max(0.5, cohortLag));
  const turnoverYears = 28;
  s.adultAverageYears += (s.workforceEntrantYears - s.adultAverageYears) * Math.min(1, years / turnoverYears);
  s.adultAverageYears = clamp(s.adultAverageYears, 0, MAX_MANDATORY_YEARS);
  s.literacy = clamp(s.adultAverageYears / 6);
  s.numeracy = clamp((s.adultAverageYears - 1) / 7);
  s.technicalHumanCapital = clamp((s.adultAverageYears - 4) / 9);
  // Retain the pre-existing 5% floor so Bronze Age calibration and elite scribal
  // capability are not erased by the new mass-schooling model.
  region.educationLevel = Math.max(0.05, clamp(s.adultAverageYears / MAX_MANDATORY_YEARS));
}

export function educationLaborReservation(region) {
  const s = ensureMassEducation(region);
  return {
    teachers: Math.max(0, s.teacherWorkersReserved || 0),
    childLaborEquivalent: Math.max(0, s.childLaborWithdrawn || 0),
    total: Math.max(0, (s.teacherWorkersReserved || 0) + (s.childLaborWithdrawn || 0)),
  };
}

export function educationSkillMultiplier(region, activity = 'general') {
  const s = ensureMassEducation(region);
  const weights = {
    farming: 0.03, gathering: 0.02, fishing: 0.05, horseHusbandry: 0.04,
    lumberjack: 0.06, mining: 0.14, pottery: 0.10, textiles: 0.16,
    smithing: 0.22, boatbuilding: 0.18, administration: 0.32,
    manufacture: 0.24, engineering: 0.28, science: 0.38, general: 0.12,
  };
  const weight = weights[activity] ?? weights.general;
  return 1 + s.literacy * weight * 0.35 + s.numeracy * weight * 0.4 + s.technicalHumanCapital * weight * 0.55;
}

export function educationAdministrativeCapacity(region) {
  const s = ensureMassEducation(region);
  const adults = Math.max(0, region.demographics?.workingAge || 0);
  // Only a small fraction of educated adults are potential clerks/officials; this
  // supplements rather than replaces the specialist scribal bureaucracy.
  return adults * s.literacy * (0.001 + s.numeracy * 0.0025 + s.technicalHumanCapital * 0.0015);
}

export function educationFertilityMultiplier(region) {
  const s = ensureMassEducation(region);
  // Schooling changes family economics gradually through adult cohorts. The effect
  // deliberately depends on attained adult education, not this week's policy slider.
  const schooling = clamp((s.adultAverageYears - 2) / 11);
  const urban = clamp(region.urbanisation?.share ?? region.settlements?.urbanShare ?? 0);
  const mortalityConfidence = clamp(1 - ((region.externalities?.demographicEffects?.childMortalityExtraAnnual || 0) / 0.08));
  return clamp(1 - schooling * (0.16 + urban * 0.10 + mortalityConfidence * 0.08), 0.62, 1);
}

export function educationAdvisorReport(region) {
  const s = ensureMassEducation(region);
  const target = s.mandatoryYears;
  const gap = Math.max(0, target - s.deliveredYears);
  const archive = archiveEffectiveness(region);
  const roundedTeachers = archive > 0.35 ? Math.round(s.teacherWorkersReserved) : Math.round(s.teacherWorkersReserved / 10) * 10;
  const warnings = [];
  if (target > s.schoolCapacityYears + 0.75) warnings.push('The law is ahead of the schools we can presently staff and house.');
  if (s.fundingRatio < 0.8) warnings.push('Treasury support is insufficient for the system now ordered.');
  if (s.attendanceRatio < 0.65 && target > 0) warnings.push('Many families are not keeping children in school for the full required period.');
  if (s.teacherWorkersReserved > Math.max(20, (region.demographics?.workingAge || 0) * 0.03)) warnings.push('Teacher recruitment is taking a noticeable share of adult labour.');
  const benefits = [];
  if (target > s.deliveredYears + 0.5) benefits.push('More schooling should enlarge the future pool of literate clerks and skilled workers.');
  if (target >= 4) benefits.push('Greater literacy and numeracy should make unfamiliar techniques easier to understand and reproduce.');
  if (target >= 8) benefits.push('A larger technically educated workforce should improve administration and machinery-intensive work.');
  if (target >= 6) benefits.push('As educated cohorts form households, children are likely to become more costly in time and foregone work, putting downward pressure on family size.');
  return {
    mandatoryYears: target,
    capacityYears: s.schoolCapacityYears,
    deliveredYears: s.deliveredYears,
    adultAverageYears: s.adultAverageYears,
    entrantYears: s.workforceEntrantYears,
    teachers: roundedTeachers,
    students: archive > 0.35 ? Math.round(s.studentsEnrolled) : Math.round(s.studentsEnrolled / 50) * 50,
    weeklyCost: s.weeklyCost,
    fundingRatio: s.fundingRatio,
    attendanceRatio: s.attendanceRatio,
    laborWithdrawn: s.childLaborWithdrawn,
    rampYearsEstimate: gap <= 0.1 ? 0 : s.rampYearsEstimate,
    warnings, benefits,
  };
}

export function tickMassEducation(regions, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const weekScale = Math.max(0, elapsedDays) / 7;
  if (years <= 0) return;
  for (const region of regions) {
    const s = ensureMassEducation(region);
    expandCapacity(region, s, years);
    trainTeachers(region, s, years);
    const targetYears = Math.min(s.mandatoryYears, s.schoolCapacityYears);
    const targetPupils = schoolAgePopulation(region, targetYears);
    const teachersNeeded = targetPupils.total / BASE_PUPIL_TEACHER_RATIO;
    const teachers = Math.min(teachersNeeded, s.teacherCapacity, Math.max(0, (region.demographics?.workingAge || 0) * 0.10));
    const teacherCoverage = teachersNeeded > 0 ? clamp(teachers / teachersNeeded) : 1;
    const attendance = targetYears > 0
      ? clamp(0.42 + stateCapacity(region) * 0.42 + (1 - householdPressure(region)) * 0.22, 0.2, 1)
      : 0;
    const provisionalStudents = targetPupils.total * teacherCoverage * attendance;
    const finance = payForSchools(region, teachers, provisionalStudents, weekScale);
    const deliveryScale = targetYears > 0 ? teacherCoverage * attendance * finance.ratio : 0;
    s.deliveredYears = targetYears * deliveryScale;
    const actualPupils = schoolAgePopulation(region, s.deliveredYears);
    s.teacherWorkersReserved = teachers * finance.ratio;
    s.studentsEnrolled = actualPupils.total;
    s.attendanceRatio = targetYears > 0 ? attendance : 0;
    s.fundingRatio = finance.ratio;
    s.weeklyCost = weekScale > 0 ? finance.paid / weekScale : 0;
    // Child labour is implicit in the calibrated household economy, so schooling
    // removes an adult-equivalent contribution rather than adding child workers at
    // zero schooling. Older pupils impose a much larger opportunity cost.
    s.childLaborWithdrawn = actualPupils.childStudents * 0.11 + actualPupils.teenStudents * 0.48;
    updateHumanCapital(region, s, years);
    const archive = archiveEffectiveness(region);
    const expansionRate = 0.08 + archive * 0.28 + stateCapacity(region) * 0.22 + Math.min(1, s.teacherCapacity / Math.max(2, teachersNeeded || 1)) * 0.18;
    s.rampYearsEstimate = expansionRate > 0 ? Math.max(0, s.mandatoryYears - s.schoolCapacityYears) / expansionRate : Infinity;
    region.report ||= {};
    region.report.publicEducation = {
      mandatoryYears: s.mandatoryYears, deliveredYears: s.deliveredYears,
      teachers: s.teacherWorkersReserved, students: s.studentsEnrolled,
      weeklyCost: s.weeklyCost, adultAverageYears: s.adultAverageYears,
    };
  }
}
