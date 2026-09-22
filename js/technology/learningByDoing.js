import { recordPractice, effectiveRecordedExperience } from '../society/education.js?v=20260906-education1';
import { educationSkillMultiplier } from '../society/massEducation.js?v=20260914-mass-education1';

// Bronze Age technology isn't a tree of discrete unlocks yet — mostly it's
// tacit knowledge that accumulates from actually doing the work: soil
// reading, timing, ore sense and hammer control. The more cumulative
// worker-effort a region has put into an activity, the better it gets at it —
// same saturating-curve shape used everywhere else in this sim (fast early
// gains, tapering toward a ceiling). Genuine technological leaps (such as iron
// smelting or advanced boatbuilding) remain separate breakthroughs.
//
// Writing changes retention rather than replacing practice. Scribes and
// archives preserve a fraction of observations, recipes and precedents, so a
// later generation can recover some knowledge that is no longer held tacitly
// by living workers. Recorded experience contributes less than lived practice
// because many craft skills cannot be captured fully in text.
//
// Maritime practice uses its own related-skill family in seamanship.js because
// fishing, trading, exploration and naval combat share techniques without
// being the same profession.

const CEILING = {
  farming: 0.50,
  gathering: 0.25,
  fishing: 0.35,
  lumberjack: 0.35,
  mining: 0.40,
  smithing: 0.45,
  pottery: 0.35,
  textiles: 0.30,
  boatbuilding: 0.45,
  horseHusbandry: 0.40,
};

const EXPERIENCE_HALFLIFE = {
  farming: 700_000_000,
  gathering: 400_000_000,
  fishing: 150_000_000,
  lumberjack: 20_000,
  mining: 2_500_000,
  smithing: 75_000,
  pottery: 250_000,
  textiles: 300_000,
  boatbuilding: 120_000,
  horseHusbandry: 100_000,
};

const RECORDED_EXPERIENCE_WEIGHT = 0.7;
const EDUCATION_SKILL_WEIGHTS = Object.freeze({
  farming: 0.03, gathering: 0.02, fishing: 0.05, horseHusbandry: 0.04,
  lumberjack: 0.06, mining: 0.14, pottery: 0.10, textiles: 0.16,
  smithing: 0.22, boatbuilding: 0.18, administration: 0.32,
  manufacture: 0.24, engineering: 0.28, science: 0.38, general: 0.12,
});

export const LEARNABLE_ACTIVITIES = Object.keys(CEILING);

export function accumulateExperience(region, activity, workers) {
  if (!(activity in CEILING) || workers <= 0) return;
  if (!region.experience) region.experience = {};
  region.experience[activity] = (region.experience[activity] || 0) + workers;
  recordPractice(region, activity, workers);
}

function hotEducationSkillMultiplier(region, activity) {
  const s = region.publicEducation;
  // publicEducation is initialised by the mass-education tick. Once present,
  // reading three bounded scalar fields is equivalent to repeatedly running
  // ensureMassEducation(), but avoids its long validation chain in the hottest
  // technology/economy path. Fall back defensively for old/incomplete saves.
  if (!s || !Number.isFinite(s.literacy) || !Number.isFinite(s.numeracy) || !Number.isFinite(s.technicalHumanCapital)) {
    return educationSkillMultiplier(region, activity);
  }
  const weight = EDUCATION_SKILL_WEIGHTS[activity] ?? EDUCATION_SKILL_WEIGHTS.general;
  return 1 + s.literacy * weight * 0.35 + s.numeracy * weight * 0.4 + s.technicalHumanCapital * weight * 0.55;
}

export function effectiveExperience(region, activity) {
  const tacit = Math.max(0, region.experience?.[activity] || 0);
  // Reading recorded experience must not initialise or validate the complete
  // education model. If it has not been initialised yet, the recorded amount is
  // simply zero; the existing helper remains the defensive fallback for malformed
  // state rather than the normal per-call path.
  const recordedValue = region.education?.recordedExperience?.[activity];
  const recorded = Number.isFinite(recordedValue)
    ? Math.max(0, recordedValue)
    : effectiveRecordedExperience(region, activity);
  return (tacit + recorded * RECORDED_EXPERIENCE_WEIGHT) * hotEducationSkillMultiplier(region, activity);
}

export function skillMultiplier(region, activity) {
  const ceiling = CEILING[activity];
  const halflife = EXPERIENCE_HALFLIFE[activity];
  if (ceiling === undefined || halflife === undefined) return 1;
  const experience = effectiveExperience(region, activity);
  const skillLevel = ceiling * (1 - Math.exp(-experience / halflife));
  return 1 + skillLevel;
}
