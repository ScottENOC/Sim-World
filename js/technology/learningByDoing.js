import { recordPractice, effectiveRecordedExperience } from '../society/education.js?v=20260906-education1';

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

export const LEARNABLE_ACTIVITIES = Object.keys(CEILING);

export function accumulateExperience(region, activity, workers) {
  if (!(activity in CEILING) || workers <= 0) return;
  if (!region.experience) region.experience = {};
  region.experience[activity] = (region.experience[activity] || 0) + workers;
  recordPractice(region, activity, workers);
}

export function effectiveExperience(region, activity) {
  const tacit = Math.max(0, region.experience?.[activity] || 0);
  const recorded = effectiveRecordedExperience(region, activity);
  return tacit + recorded * RECORDED_EXPERIENCE_WEIGHT;
}

export function skillMultiplier(region, activity) {
  const ceiling = CEILING[activity];
  const halflife = EXPERIENCE_HALFLIFE[activity];
  if (ceiling === undefined || halflife === undefined) return 1;
  const experience = effectiveExperience(region, activity);
  const skillLevel = ceiling * (1 - Math.exp(-experience / halflife));
  return 1 + skillLevel;
}
