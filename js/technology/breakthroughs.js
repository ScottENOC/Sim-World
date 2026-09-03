export const IRON_SMELTING_TECH_ID = 'iron_smelting';

// With hundreds of independent regions, even a tiny per-region chance can
// produce an early world-first. These values make accumulated craft knowledge
// the main source of original discovery, while trade spreads a known technique
// much faster than each partner reinventing it independently.
const BASE_WEEKLY_IRON_CHANCE = 1e-8;
const MAX_SMITHING_EXPERIENCE_BONUS = 5e-7;
const SMITHING_EXPERIENCE_SCALE = 75_000;
const CHANCE_PER_IRONWORKING_TRADE_PARTNER = 0.003;
const TRADE_DIFFUSION_MEMORY_WEEKS = 104;
const MAX_SCARCITY_EXPERIMENT_CHANCE = 3e-6;
const IRON_ADOPTION_BASE_WEEKS = 520; // roughly a decade from first furnace to mature industry
const MIGRANT_EXPOSURE_CHANCE = 0.02;

function smithingKnowledge(region) {
  const experience = region.experience?.smithing || 0;
  return 1 - Math.exp(-experience / SMITHING_EXPERIENCE_SCALE);
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
  const discoveries = regions.filter((region) => rng() < ironSmeltingChance(region, regionsById, currentTick));
  for (const region of discoveries) {
    region.unlockedTechIds.add(IRON_SMELTING_TECH_ID);
    region.ironWorkingReadiness = Math.max(0.02, region.ironWorkingReadiness || 0);
    events.push({
      type: 'iron_smelting_breakthrough',
      regionId: region.id,
      regionName: region.name,
      tick: currentTick,
    });
  }
  for (const region of regions) {
    advanceIronIndustry(region);
    // Travelling craftspeople cease to be a permanent lottery ticket.
    region.ironWorkingExposure = Math.max(0, (region.ironWorkingExposure || 0) * 0.99);
  }
  return events;
}
