export const IRON_SMELTING_TECH_ID = 'iron_smelting';
export const ADVANCED_BOATBUILDING_TECH_ID = 'advanced_boatbuilding';
export const HILL_FORT_TECH_ID = 'hill_forts';
export const CATAPULT_TECH_ID = 'torsion_catapults';

// With hundreds of independent regions, even a tiny per-region chance can
// produce an early world-first. These values make accumulated craft knowledge
// the main source of original discovery, while trade spreads a known technique
// much faster than each partner reinventing it independently.
const BASE_WEEKLY_IRON_CHANCE = 1e-8;
const MAX_SMITHING_EXPERIENCE_BONUS = 5e-7;
const SMITHING_EXPERIENCE_SCALE = 75_000;
const CHANCE_PER_IRONWORKING_TRADE_PARTNER = 0.00005;
const TRADE_DIFFUSION_MEMORY_WEEKS = 104;
const MAX_SCARCITY_EXPERIMENT_CHANCE = 3e-6;
const IRON_ADOPTION_BASE_WEEKS = 520; // roughly a decade from first furnace to mature industry
const MIGRANT_EXPOSURE_CHANCE = 0.02;
const BOATBUILDING_EXPERIENCE_SCALE = 120_000;
const MAX_ADVANCED_BOAT_CHANCE = 2e-5;
const CHANCE_PER_ADVANCED_BOAT_PARTNER = 0.002;
const BASE_HILL_FORT_CHANCE = 0.000015;
const HILL_FORT_NEED_CHANCE = 0.0008;
const HILL_FORT_DIFFUSION_CHANCE = 0.004;
const CATAPULT_EARLIEST_TICK = 35_000;
const MAX_CATAPULT_INNOVATION_CHANCE = 0.00005;
const CATAPULT_DIFFUSION_CHANCE = 0.001;

export function hillFortChance(region, regionsById) {
  if (region.unlockedTechIds.has(HILL_FORT_TECH_ID)) return 0;
  const settlementScale = Math.min(1, Math.max(0, (region.population || 0) - 2000) / 18000);
  const insecurity = Math.min(1, Math.max(0, 0.8 - (region.safetyRating ?? 1)) / 0.6 +
    Math.max(0, region.banditPopulation || 0) / Math.max(1, region.population) * 10);
  const stoneAccess = region.deposits?.stone ? 1 : 0.35;
  const needChance = settlementScale * (0.2 + insecurity * 0.8) * stoneAccess * HILL_FORT_NEED_CHANCE;
  const knownNeighbours = (region.neighbors || []).filter((id) =>
    regionsById.get(id)?.unlockedTechIds.has(HILL_FORT_TECH_ID)).length;
  const diffusionChance = 1 - Math.pow(1 - HILL_FORT_DIFFUSION_CHANCE, knownNeighbours);
  return 1 - (1 - BASE_HILL_FORT_CHANCE - needChance) * (1 - diffusionChance);
}

export function catapultChance(region, regionsById, currentTick) {
  if (region.unlockedTechIds.has(CATAPULT_TECH_ID) || currentTick < CATAPULT_EARLIEST_TICK) return 0;
  const siegeExperience = Math.max(0, region.siegeEquipment?.experience || 0);
  const craftExperience = Math.max(0, region.experience?.smithing || 0) +
    Math.max(0, region.experience?.boatbuilding || 0);
  const hasRams = ((region.siegeEquipment?.inventory?.ram?.bronze || 0) +
    (region.siegeEquipment?.inventory?.ram?.iron || 0)) > 0;
  const independent = hasRams
    ? (1 - Math.exp(-siegeExperience / 500)) * (1 - Math.exp(-craftExperience / 100_000)) * MAX_CATAPULT_INNOVATION_CHANCE
    : 0;
  const knowledgeable = (region.neighbors || []).filter((id) =>
    regionsById.get(id)?.unlockedTechIds.has(CATAPULT_TECH_ID)).length;
  const diffusion = 1 - Math.pow(1 - CATAPULT_DIFFUSION_CHANCE, knowledgeable);
  return 1 - (1 - independent) * (1 - diffusion);
}

function smithingKnowledge(region) {
  const experience = region.experience?.smithing || 0;
  return 1 - Math.exp(-experience / SMITHING_EXPERIENCE_SCALE);
}

function boatbuildingKnowledge(region) {
  const experience = region.experience?.boatbuilding || 0;
  return 1 - Math.exp(-experience / BOATBUILDING_EXPERIENCE_SCALE);
}

export function advancedBoatbuildingChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds.has(ADVANCED_BOATBUILDING_TECH_ID) || !region.isCoastal) return 0;
  const independentChance = boatbuildingKnowledge(region) * MAX_ADVANCED_BOAT_CHANCE;
  let knowledgeablePartners = 0;
  const recentPartners = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.entries()]
        .filter(([, tick]) => currentTick === null || currentTick - tick <= TRADE_DIFFUSION_MEMORY_WEEKS)
        .map(([id]) => id)
    : [...(region.tradePartnerIds || [])];
  for (const partnerId of recentPartners) {
    if (regionsById.get(partnerId)?.unlockedTechIds.has(ADVANCED_BOATBUILDING_TECH_ID)) knowledgeablePartners++;
  }
  const partnerChance = 1 - Math.pow(1 - CHANCE_PER_ADVANCED_BOAT_PARTNER, knowledgeablePartners);
  return 1 - (1 - independentChance) * (1 - partnerChance);
}

function bronzeScarcityPressure(region) {
  const unmet = Math.max(0, region.marketDemand?.bronze || 0);
  const bronze = Math.max(0, region.stockpile?.bronze || 0);
  const recentWear = Math.max(0, region.report?.toolWear?.tools || 0);
  const replacementPressure = unmet + recentWear;
  return replacementPressure / (replacementPressure + bronze + 1);
}

export function ironSmeltingChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) return 0;

  const independentChance = BASE_WEEKLY_IRON_CHANCE +
    smithingKnowledge(region) * MAX_SMITHING_EXPERIENCE_BONUS +
    bronzeScarcityPressure(region) * (0.1 + 0.9 * smithingKnowledge(region)) * MAX_SCARCITY_EXPERIMENT_CHANCE;
  let knowledgeablePartners = 0;
  const recentPartners = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.entries()]
        .filter(([, lastTradeTick]) => currentTick === null || currentTick - lastTradeTick <= TRADE_DIFFUSION_MEMORY_WEEKS)
        .map(([partnerId]) => partnerId)
    : [...(region.tradePartnerIds || [])];
  for (const partnerId of recentPartners) {
    if (regionsById.get(partnerId)?.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) {
      knowledgeablePartners++;
    }
  }
  const partnerChance = 1 - Math.pow(
    1 - CHANCE_PER_IRONWORKING_TRADE_PARTNER,
    knowledgeablePartners
  );
  const migrantChance = 1 - Math.exp(-Math.max(0, region.ironWorkingExposure || 0) * MIGRANT_EXPOSURE_CHANCE);
  return 1 - (1 - independentChance) * (1 - partnerChance) * (1 - migrantChance);
}

function advanceIronIndustry(region) {
  if (!region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) return;
  const readiness = Math.max(0.02, region.ironWorkingReadiness || 0);
  const craftSkill = smithingKnowledge(region);
  const urgency = bronzeScarcityPressure(region);
  const oreExists = Boolean(region.deposits?.ironOre);
  const weeklyRate = (0.45 + craftSkill * 0.75 + urgency * 0.55 + (oreExists ? 0.25 : 0)) /
    IRON_ADOPTION_BASE_WEEKS;
  region.ironWorkingReadiness = Math.min(1, readiness + weeklyRate * (1 - readiness));
}

export function tickBreakthroughs(regions, currentTick, rng = Math.random) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];

  // Calculate all chances from the start-of-tick state. A discovery therefore
  // begins influencing partners next week instead of cascading through an
  // entire trade network in one loop iteration.
  const ironDiscoveries = regions.filter((region) => rng() < ironSmeltingChance(region, regionsById, currentTick));
  const boatDiscoveries = regions.filter((region) => rng() < advancedBoatbuildingChance(region, regionsById, currentTick));
  const hillFortDiscoveries = regions.filter((region) => rng() < hillFortChance(region, regionsById));
  const catapultDiscoveries = regions.filter((region) => rng() < catapultChance(region, regionsById, currentTick));
  for (const region of ironDiscoveries) {
    region.unlockedTechIds.add(IRON_SMELTING_TECH_ID);
    region.ironWorkingReadiness = Math.max(0.02, region.ironWorkingReadiness || 0);
    events.push({
      type: 'iron_smelting_breakthrough',
      regionId: region.id,
      regionName: region.name,
      tick: currentTick,
    });
  }
  for (const region of boatDiscoveries) {
    region.unlockedTechIds.add(ADVANCED_BOATBUILDING_TECH_ID);
    events.push({
      type: 'advanced_boatbuilding_breakthrough',
      regionId: region.id,
      regionName: region.name,
      tick: currentTick,
    });
  }
  for (const region of hillFortDiscoveries) {
    region.unlockedTechIds.add(HILL_FORT_TECH_ID);
    events.push({ type: 'hill_fort_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const region of catapultDiscoveries) {
    region.unlockedTechIds.add(CATAPULT_TECH_ID);
    events.push({ type: 'catapult_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const region of regions) {
    advanceIronIndustry(region);
    // Travelling craftspeople cease to be a permanent lottery ticket.
    region.ironWorkingExposure = Math.max(0, (region.ironWorkingExposure || 0) * 0.99);
  }
  return events;
}
