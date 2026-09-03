// Bronze Age technology isn't a tree of discrete unlocks yet — mostly it's
// tacit knowledge that accumulates from actually doing the work: soil
// reading, timing, ore sense, hammer control. The more cumulative
// worker-effort a region has put into an activity, the better it gets at
// it — same saturating-curve shape used everywhere else in this sim (fast
// early gains, tapering toward a ceiling). A genuine technological leap
// (such as iron smelting) is a separate breakthrough. Smithing experience
// raises that breakthrough's chance, and bronze and iron work both continue
// contributing to this same shared store of practical metallurgy knowledge.

const CEILING = {
  farming: 0.50,     // up to +50% from technique alone: rotation instinct, soil reading, timing
  gathering: 0.25,   // less room for "technique" in foraging than in a cultivated practice
  fishing: 0.35,     // reading currents, seasonal runs, net/line technique
  lumberjack: 0.35,
  mining: 0.40,
  smithing: 0.45,
};

// Cumulative worker-ticks to reach ~63% of the ceiling (1 - 1/e). Scaled
// against each activity's actual typical workforce, not a uniform guess —
// farming/gathering involve hundreds of thousands of workers, lumberjack
// (forest-capacity-capped) involves single digits to low hundreds, and
// mining/smithing sit in between. Checked against a 200-year headless run
// before shipping: first-pass values had farming/gathering fully saturated
// within 2 years (workforce far bigger than assumed) and lumberjack barely
// moving at all after 200 years (workforce far smaller than assumed).
const EXPERIENCE_HALFLIFE = {
  farming: 700_000_000,
  gathering: 400_000_000,
  fishing: 150_000_000,
  lumberjack: 20_000,
  mining: 2_500_000,
  smithing: 75_000,
};

export const LEARNABLE_ACTIVITIES = Object.keys(CEILING);

export function accumulateExperience(region, activity, workers) {
  if (!(activity in CEILING) || workers <= 0) return;
  region.experience[activity] = (region.experience[activity] || 0) + workers;
}

// Efficiency multiplier from experience alone — combine with tools.js's
// multiplier the same way farming already combines with equipment: they
// stack multiplicatively (well-practiced AND well-equipped is better than
// either alone).
export function skillMultiplier(region, activity) {
  const ceiling = CEILING[activity];
  const halflife = EXPERIENCE_HALFLIFE[activity];
  if (ceiling === undefined || halflife === undefined) return 1;
  const experience = region.experience?.[activity] || 0;
  const skillLevel = ceiling * (1 - Math.exp(-experience / halflife));
  return 1 + skillLevel;
}
