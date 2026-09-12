const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const GUNPOWDER_TECH_ID = 'gunpowder';

const POWDER_PER_SOLDIER_TARGET = 0.18;
const FIREARM_METAL_COST = 0.045;
const FIREARM_WOOD_COST = 0.018;
const POWDER_SALTPETRE_COST = 0.75;
const POWDER_SULFUR_COST = 0.10;
const POWDER_CHARCOAL_COST = 0.15;
const POWDER_PER_FIREARM_WEEK = 0.020;
const SHOT_METAL_PER_FIREARM_WEEK = 0.004;

export function ensureFirearmsState(region) {
  region.firearms ||= {};
  const state = region.firearms;
  state.readiness = clamp01(state.readiness);
  state.exposure = clamp01(state.exposure);
  state.combatExperience = clamp01(state.combatExperience);
  state.lastCombatProfile ||= null;
  return state;
}

function consumeMetal(region, amount) {
  let remaining = Math.max(0, amount);
  const iron = Math.min(remaining, Math.max(0, region.stockpile?.iron || 0));
  if (iron > 0) region.stockpile.iron -= iron;
  remaining -= iron;
  const bronze = Math.min(remaining, Math.max(0, region.stockpile?.bronze || 0));
  if (bronze > 0) region.stockpile.bronze -= bronze;
  remaining -= bronze;
  return amount - remaining;
}

function availableMetal(region) {
  return Math.max(0, region.stockpile?.iron || 0) + Math.max(0, region.stockpile?.bronze || 0);
}

export function tickGunpowderIndustry(regions, elapsedDays = 30) {
  const yearScale = Math.max(0, elapsedDays) / 365.2425;
  const reports = [];
  for (const region of regions) {
    const state = ensureFirearmsState(region);
    if (!region.unlockedTechIds?.has(GUNPOWDER_TECH_ID)) continue;

    // Adoption is intentionally slow: knowing the recipe is not the same as
    // having workshops, drill, reliable weapons, and logistics built around it.
    state.readiness = clamp01(Math.max(0.02, state.readiness) + (0.14 + state.combatExperience * 0.16) * yearScale);

    region.stockpile ||= {};
    region.marketDemand ||= {};
    const personnel = Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0));
    const firearmTarget = personnel * Math.min(0.82, 0.08 + state.readiness * 0.78);
    const firearmGap = Math.max(0, firearmTarget - (region.stockpile.firearms || 0));
    const maxByMetal = availableMetal(region) / FIREARM_METAL_COST;
    const maxByWood = Math.max(0, region.stockpile.wood || 0) / FIREARM_WOOD_COST;
    const buildRateCap = Math.max(1, personnel * 0.025) * Math.max(0.05, elapsedDays / 30);
    const firearmsBuilt = Math.min(firearmGap, maxByMetal, maxByWood, buildRateCap);
    if (firearmsBuilt > 0) {
      consumeMetal(region, firearmsBuilt * FIREARM_METAL_COST);
      region.stockpile.wood = Math.max(0, (region.stockpile.wood || 0) - firearmsBuilt * FIREARM_WOOD_COST);
      region.stockpile.firearms = (region.stockpile.firearms || 0) + firearmsBuilt;
    }

    const powderTarget = personnel * POWDER_PER_SOLDIER_TARGET * (0.25 + state.readiness * 0.75);
    const powderGap = Math.max(0, powderTarget - (region.stockpile.gunpowder || 0));
    const saltpetre = Math.max(0, region.stockpile.saltpetre || 0);
    const sulfur = Math.max(0, region.stockpile.sulfur || 0);
    const wood = Math.max(0, region.stockpile.wood || 0);
    const powderMade = Math.min(
      powderGap,
      saltpetre / POWDER_SALTPETRE_COST,
      sulfur / POWDER_SULFUR_COST,
      wood / POWDER_CHARCOAL_COST,
      Math.max(1, personnel * 0.04) * Math.max(0.05, elapsedDays / 30),
    );
    if (powderMade > 0) {
      region.stockpile.saltpetre -= powderMade * POWDER_SALTPETRE_COST;
      region.stockpile.sulfur -= powderMade * POWDER_SULFUR_COST;
      region.stockpile.wood -= powderMade * POWDER_CHARCOAL_COST;
      region.stockpile.gunpowder = (region.stockpile.gunpowder || 0) + powderMade;
    }

    // Once the recipe is known these become meaningful market demands, so an
    // inland army can sustain firearms through trade rather than only local mines.
    region.marketDemand.saltpetre = Math.max(region.marketDemand.saltpetre || 0, powderGap * POWDER_SALTPETRE_COST / Math.max(1, elapsedDays / 7));
    region.marketDemand.sulfur = Math.max(region.marketDemand.sulfur || 0, powderGap * POWDER_SULFUR_COST / Math.max(1, elapsedDays / 7));
    region.marketDemand.gunpowder = Math.max(region.marketDemand.gunpowder || 0, powderGap / Math.max(1, elapsedDays / 7));
    region.marketDemand.firearms = Math.max(region.marketDemand.firearms || 0, firearmGap / Math.max(1, elapsedDays / 7));

    reports.push({ regionId: region.id, firearmsBuilt, powderMade, readiness: state.readiness });
  }
  return reports;
}

export function firearmCombatProfile(region, opponent, personnel, { consumeSupplies = true, elapsedDays = 7 } = {}) {
  const state = ensureFirearmsState(region);
  const opponentState = ensureFirearmsState(opponent);
  if (!region.unlockedTechIds?.has(GUNPOWDER_TECH_ID) || personnel <= 0) {
    return { multiplier: 1, firearmShare: 0, suppliedShare: 0, surpriseBonus: 0, dryPenalty: 0, powderUsed: 0, shotMetalUsed: 0 };
  }

  region.stockpile ||= {};
  const firearmsAvailable = Math.max(0, region.stockpile.firearms || 0);
  const firearmShare = clamp01(firearmsAvailable / Math.max(1, personnel));
  const weeks = Math.max(0.1, elapsedDays / 7);
  const powderNeeded = personnel * firearmShare * POWDER_PER_FIREARM_WEEK * weeks;
  const metalNeeded = personnel * firearmShare * SHOT_METAL_PER_FIREARM_WEEK * weeks;
  const powderFraction = powderNeeded > 0 ? clamp01((region.stockpile.gunpowder || 0) / powderNeeded) : 1;
  const metalFraction = metalNeeded > 0 ? clamp01(availableMetal(region) / metalNeeded) : 1;
  const supplyFraction = Math.min(powderFraction, metalFraction);
  const suppliedShare = firearmShare * supplyFraction;

  let powderUsed = 0;
  let shotMetalUsed = 0;
  if (consumeSupplies && suppliedShare > 0) {
    powderUsed = powderNeeded * supplyFraction;
    shotMetalUsed = metalNeeded * supplyFraction;
    region.stockpile.gunpowder = Math.max(0, (region.stockpile.gunpowder || 0) - powderUsed);
    consumeMetal(region, shotMetalUsed);
  }

  // Novel firearms are disproportionately frightening/effective until an
  // opponent gains battlefield exposure and adapts formations and morale.
  const opponentFamiliarity = Math.max(opponentState.exposure, opponentState.readiness * 0.55);
  const surpriseBonus = suppliedShare * (1 - opponentFamiliarity) * 0.48;
  const sustainedBonus = suppliedShare * 0.52;

  // A force that has reorganised around firearms but cannot feed those weapons
  // is worse off than a force that never abandoned bows/spears in the first place.
  const dryShare = firearmShare * (1 - supplyFraction);
  const doctrineWithoutWorkingGuns = Math.max(0, state.readiness - suppliedShare);
  const dryPenalty = dryShare * 0.38 + doctrineWithoutWorkingGuns * 0.10;
  const multiplier = Math.max(0.68, 1 + sustainedBonus + surpriseBonus - dryPenalty);

  if (consumeSupplies) {
    state.combatExperience = clamp01(state.combatExperience + suppliedShare * 0.012 * weeks);
    state.readiness = clamp01(state.readiness + suppliedShare * 0.004 * weeks);
    opponentState.exposure = clamp01(opponentState.exposure + suppliedShare * 0.055 * weeks);
  }

  const profile = { multiplier, firearmShare, suppliedShare, surpriseBonus, dryPenalty, powderUsed, shotMetalUsed, supplyFraction };
  state.lastCombatProfile = profile;
  return profile;
}
