import { effectivePower } from './army.js';
import { removeFromBands, syncPopulation } from '../society/demographics.js';

// Even with zero army, a bandit group doesn't last forever — disorganized,
// exposed, some natural die-off. Suppression on top of that scales with
// army power relative to bandit numbers, so a real force actively grinds
// bandit population down rather than just capping how bad things get.
const BANDIT_NATURAL_ATTRITION = 0.003; // ~15%/year
const SUPPRESSION_REFERENCE = 0.3;      // max weekly suppression fraction even with overwhelming force

const ARMY_REFERENCE_DENSITY = 0.01; // army power per capita that starts to feel like real protection

const RAID_INTENSITY = 0.25;        // max weekly stockpile loss fraction under total lawlessness
const BANDIT_DEATH_INTENSITY = 0.01; // max weekly death rate on regular population under total lawlessness

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function tickBanditry(regions, toolTypes) {
  for (const region of regions) {
    const power = effectivePower(region, toolTypes);
    const banditPop = region.banditPopulation;
    const totalLocal = region.population + banditPop;
    const banditPressure = totalLocal > 0 ? banditPop / totalLocal : 0;

    // Diminishing-returns defense: army power matters a lot at first, less
    // for each additional unit beyond what the population size warrants.
    const armyDefense = power / (power + region.population * ARMY_REFERENCE_DENSITY + 1);
    region.safetyRating = clamp01(1 - banditPressure * (1 - armyDefense));

    // Suppression — this is what finally gives the ever-growing bandit
    // number from last pass somewhere to go.
    const suppressionRate = power > 0 ? power / (power + banditPop + 1) : 0;
    const suppressed = banditPop * (suppressionRate * SUPPRESSION_REFERENCE + BANDIT_NATURAL_ATTRITION);
    region.banditPopulation = Math.max(0, banditPop - suppressed);

    // Ongoing raiding: bandits steal from the stockpile and cause some
    // deaths, both scaled down by how safe the region currently is (a
    // strong army suppresses the *impact*, not just the eventual headcount).
    const severity = banditPressure * (1 - region.safetyRating);
    const raidLossFraction = RAID_INTENSITY * severity;
    if (raidLossFraction > 0) {
      for (const key of Object.keys(region.stockpile)) {
        region.stockpile[key] *= (1 - raidLossFraction);
      }
    }

    const banditDeathRate = BANDIT_DEATH_INTENSITY * severity;
    if (banditDeathRate > 0) {
      removeFromBands(region, region.population * banditDeathRate);
      syncPopulation(region);
    }
  }
}
