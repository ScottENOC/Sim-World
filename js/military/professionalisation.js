import { operationalInfrastructure } from '../economy/construction.js?v=20260907-classical1';

const DAYS_PER_YEAR = 365.2425;
const WEEKS_PER_YEAR = DAYS_PER_YEAR / 7;
const FIELD_BASE_HALF_LIFE_YEARS = 12;
const INSTITUTIONAL_BASE_HALF_LIFE_YEARS = 55;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function ensureMilitaryExperience(region) {
  region.militaryExperience ||= {};
  const state = region.militaryExperience;
  // Migrate the first terrain-system save format without throwing away experience.
  if (!Number.isFinite(state.field)) state.field = clamp01(state.combat || 0);
  if (!Number.isFinite(state.institutional)) state.institutional = 0;
  if (!Number.isFinite(state.lastFieldTick)) state.lastFieldTick = Number(state.lastTick) || 0;
  if (!Number.isFinite(state.engagementWeeks)) state.engagementWeeks = 0;
  if (!Number.isFinite(state.trainingYears)) state.trainingYears = 0;
  region.militaryInstitutions ||= {};
  const institutions = region.militaryInstitutions;
  if (!Number.isFinite(institutions.officerSchoolProgress)) institutions.officerSchoolProgress = 0;
  institutions.officerSchoolActive = Boolean(institutions.officerSchoolActive);
  return state;
}

function permanence(region) { return clamp01(region.militaryPolicy?.armyPermanence ?? 0.5); }
function hasInfra(region, id) { return operationalInfrastructure(region, id); }

export function officerSchoolStatus(region) {
  ensureMilitaryExperience(region);
  const institution = region.militaryInstitutions;
  return { active: Boolean(institution.officerSchoolActive), progress: clamp01(institution.officerSchoolProgress || 0) };
}

export function tickMilitaryProfessionalisation(region, elapsedDays = 7) {
  const state = ensureMilitaryExperience(region);
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  if (years <= 0) return state;
  const drill = hasInfra(region, 'drill_ground');
  const arsenal = hasInfra(region, 'royal_arsenal');
  const admin = hasInfra(region, 'administrative_centre');
  const army = Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0));
  const permanent = permanence(region);
  const militaryDrill = region.unlockedTechIds?.has('military_drill');
  const formations = (region.militaryFormations?.traditions || []).filter((f) => f.status === 'active');
  const formationPractice = formations.reduce((sum, f) => sum + clamp01(f.coverage) * clamp01(f.readiness), 0);

  // Institutions preserve lessons between generations. Drill can create a modest
  // professional tradition even in peace; formations and permanent service raise the ceiling.
  const trainingTarget = clamp01(
    (drill ? 0.24 : 0) + (arsenal ? 0.06 : 0) + permanent * 0.22 +
    Math.min(0.24, formationPractice * 0.12) + (region.militaryInstitutions?.officerSchoolActive ? 0.24 : 0)
  );
  if (drill && militaryDrill && army >= 150) {
    const rateYears = region.militaryInstitutions?.officerSchoolActive ? 9 : 16;
    state.institutional += (trainingTarget - state.institutional) * (1 - Math.exp(-years / rateYears));
    state.trainingYears += years;
    // Repeated instruction also prevents a standing army from becoming completely green.
    const fieldFloor = clamp01(0.035 + permanent * 0.11 + state.institutional * 0.16);
    if (state.field < fieldFloor) state.field += (fieldFloor - state.field) * (1 - Math.exp(-years / 3));
  } else {
    const retention = admin ? 1.18 : 1;
    const halfLife = INSTITUTIONAL_BASE_HALF_LIFE_YEARS * retention;
    state.institutional *= Math.pow(0.5, years / halfLife);
  }
  state.institutional = clamp01(state.institutional);
  state.field = clamp01(state.field);

  // An officer school/corps is emergent, not an era unlock. It needs bureaucracy,
  // a real drill establishment, a sizeable standing army and accumulated practice.
  const eligibleOfficerSchool = drill && admin && militaryDrill && army >= 600 && permanent >= 0.48 && state.institutional >= 0.28;
  const institution = region.militaryInstitutions;
  if (!institution.officerSchoolActive) {
    if (eligibleOfficerSchool) {
      const learning = 0.65 + state.institutional * 0.55 + permanent * 0.35;
      institution.officerSchoolProgress = clamp01(institution.officerSchoolProgress + years / 18 * learning);
      if (institution.officerSchoolProgress >= 1) institution.officerSchoolActive = true;
    } else {
      institution.officerSchoolProgress = Math.max(0, institution.officerSchoolProgress - years / 45);
    }
  } else if (!(drill && admin) && years > 0) {
    // The institution can survive temporary weakness, but not centuries without a home.
    institution.officerSchoolProgress = Math.max(0.55, institution.officerSchoolProgress - years / 80);
    if (institution.officerSchoolProgress <= 0.55 && !drill && !admin) institution.officerSchoolActive = false;
  }
  return state;
}

function decayFieldTo(region, currentTick) {
  const state = ensureMilitaryExperience(region);
  const tick = Math.max(0, Number(currentTick) || 0);
  const elapsedWeeks = Math.max(0, tick - state.lastFieldTick);
  if (elapsedWeeks <= 0) return state;
  const drill = hasInfra(region, 'drill_ground');
  const officer = officerSchoolStatus(region).active;
  const retention = 1 + (drill ? 0.65 : 0) + (officer ? 0.95 : 0) + state.institutional * 0.75;
  const halfLifeWeeks = FIELD_BASE_HALF_LIFE_YEARS * retention * WEEKS_PER_YEAR;
  state.field *= Math.pow(0.5, elapsedWeeks / halfLifeWeeks);
  state.lastFieldTick = tick;
  return state;
}

export function militaryExperienceProfile(region, currentTick = null) {
  const state = currentTick == null ? ensureMilitaryExperience(region) : decayFieldTo(region, currentTick);
  const officer = officerSchoolStatus(region).active;
  // Institutions cannot substitute entirely for veterans, but they make recruits
  // and replacement officers much more useful than a completely green levy.
  const effective = clamp01(state.field * 0.72 + state.institutional * 0.48 - state.field * state.institutional * 0.20);
  return { field: clamp01(state.field), institutional: clamp01(state.institutional), effective, officerSchool: officer };
}

export function recordBattleExperience(region, currentTick, { intensity = 0.01, casualtyShare = 0, defender = false } = {}) {
  const state = decayFieldTo(region, currentTick);
  const losses = clamp01(casualtyShare);
  // Veteran casualties destroy embodied knowledge; institutions partially preserve it.
  const retention = 0.35 + state.institutional * 0.45 + (officerSchoolStatus(region).active ? 0.12 : 0);
  state.field *= 1 - losses * (1 - retention) * 0.85;
  const gain = 0.0032 + clamp01(intensity / 0.05) * 0.008 + Math.min(0.006, losses * 0.04) + (defender ? 0.0006 : 0);
  state.field = clamp01(state.field + gain * (1 - state.field * 0.62));
  // Some battlefield learning is captured institutionally if a training system exists.
  if (hasInfra(region, 'drill_ground')) {
    const capture = officerSchoolStatus(region).active ? 0.22 : 0.10;
    state.institutional = clamp01(state.institutional + gain * capture * (1 - state.institutional));
  }
  state.engagementWeeks += 1;
  return militaryExperienceProfile(region, currentTick);
}

export function professionalCombatMultiplier(region, currentTick = null) {
  const p = militaryExperienceProfile(region, currentTick);
  // Intentionally modest: professionalisation wins more through coordination and
  // avoiding bad situations than through turning each human into two humans.
  return 1 + p.effective * 0.12;
}

export function professionalLogisticsMultiplier(region, currentTick = null) {
  const p = militaryExperienceProfile(region, currentTick);
  return 1 + p.institutional * 0.18 + p.field * 0.07 + (p.officerSchool ? 0.08 : 0);
}

export function moraleShockMultiplier(region, currentTick = null) {
  const p = militaryExperienceProfile(region, currentTick);
  return Math.max(0.62, 1 - p.field * 0.18 - p.institutional * 0.12 - (p.officerSchool ? 0.07 : 0));
}

export function retreatLossMultiplier(region, currentTick = null) {
  const p = militaryExperienceProfile(region, currentTick);
  return Math.max(0.48, 1 - p.effective * 0.32 - (p.officerSchool ? 0.12 : 0));
}

export function marchSpeedMultiplier(region, currentTick = null) {
  const p = militaryExperienceProfile(region, currentTick);
  return 1 + p.institutional * 0.06 + p.field * 0.04 + (p.officerSchool ? 0.03 : 0);
}

export function mobilisationQuality(region) {
  const p = militaryExperienceProfile(region, null);
  return clamp01(0.18 + p.institutional * 0.52 + (hasInfra(region, 'drill_ground') ? 0.16 : 0) + (p.officerSchool ? 0.14 : 0));
}
