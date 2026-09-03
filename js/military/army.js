import { toolEfficiencyMultiplier } from '../economy/tools.js?v=20260903-mechanics1';

// Recruitment/demobilization ramps toward the player's target rather than
// snapping instantly — mobilizing an army takes real time, and disbanding
// one is faster than raising it.
const ARMY_MOBILIZATION_RATE = 0.08;
const ARMY_DEMOBILIZATION_RATE = 0.15;

export const CREW_PER_BOAT = 8; // sailors needed to crew one boat

// Adjusts region.army.personnel toward region.targetArmySize, drawing from
// (or releasing back to) `availableLabor`. Gap is measured against total
// army size (home + away raiding), not just who's currently home — otherwise
// sending soldiers off on a raid would look like a shortfall and trigger
// backfill recruitment, silently growing the army beyond what was intended.
// Returns the actual personnel change so the caller can debit it from this
// tick's labor pool.
export function adjustArmySize(region, availableLabor) {
  const totalArmy = region.army.personnel + (region.army.away || 0);
  const gap = region.targetArmySize - totalArmy;
  let change = 0;
  if (gap > 0) {
    change = Math.min(gap * ARMY_MOBILIZATION_RATE, availableLabor);
  } else if (gap < 0) {
    // Demobilization only ever releases people who are actually home —
    // can't stand down troops that are off on a raid.
    change = Math.max(gap * ARMY_DEMOBILIZATION_RATE, -region.army.personnel);
  }
  region.army.personnel = Math.max(0, region.army.personnel + change);
  return change;
}

// Same idea for navy crew, but the target headcount is derived from boats
// (region.navy.boats * CREW_PER_BOAT), not set directly by the player —
// the player sets a target *fleet size* in boats; crew follows from that.
export function adjustNavyCrew(region, availableLabor) {
  const targetCrew = region.navy.boats * CREW_PER_BOAT;
  const gap = targetCrew - region.navy.personnel;
  let change = 0;
  if (gap > 0) {
    change = Math.min(gap * ARMY_MOBILIZATION_RATE, availableLabor);
  } else if (gap < 0) {
    change = gap * ARMY_DEMOBILIZATION_RATE;
  }
  region.navy.personnel = Math.max(0, region.navy.personnel + change);
  return change;
}

// Combat/suppression power — personnel scaled by equipment. Navy counts for
// less on land (boats don't chase inland bandits) — a placeholder weighting
// until piracy gets its own dedicated sea-safety mechanic.
const NAVY_LAND_CONTRIBUTION = 0.3;

export function effectivePower(region, toolTypes) {
  const soldierEfficiency = toolEfficiencyMultiplier(region, 'soldier', toolTypes.soldier, region.unlockedTechIds);
  const armyPower = region.army.personnel * soldierEfficiency;
  const navyPower = region.navy.personnel * soldierEfficiency * NAVY_LAND_CONTRIBUTION;
  return armyPower + navyPower;
}
