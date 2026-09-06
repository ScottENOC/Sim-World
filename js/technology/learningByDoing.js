// Bronze Age technology isn't a tree of discrete unlocks yet — mostly it's
// tacit knowledge that accumulates from actually doing the work: soil
// reading, timing, ore sense, hammer control, seamanship and navigation. The
// more cumulative worker-effort a region has put into an activity, the better
// it gets at it — same saturating-curve shape used everywhere else in this sim
// (fast early gains, tapering toward a ceiling). Genuine technological leaps
// (such as iron smelting or advanced boatbuilding) remain separate breakthroughs.

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
  seamanship: 0.55, // navigation, weather-reading, coastal piloting, sail handling and fleet coordination
};

// Cumulative worker-ticks to reach ~63% of the ceiling (1 - 1/e). Scaled
// against each activity's typical workforce. Seamanship deliberately takes
// generations of repeated maritime activity to approach its ceiling: a few
// successful expeditions help, but do not create an instant naval superpower.
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
  seamanship: 300_000,
};

export const LEARNABLE_ACTIVITIES = Object.keys(CEILING);

export function accumulateExperience(region, activity, workers) {
  if (!(activity in CEILING) || workers <= 0) return;
  if (!region.experience) region.experience = {};
  region.experience[activity] = (region.experience[activity] || 0) + workers;
}

export function skillMultiplier(region, activity) {
  const ceiling = CEILING[activity];
  const halflife = EXPERIENCE_HALFLIFE[activity];
  if (ceiling === undefined || halflife === undefined) return 1;
  const experience = region.experience?.[activity] || 0;
  const skillLevel = ceiling * (1 - Math.exp(-experience / halflife));
  return 1 + skillLevel;
}
