export const IRON_SMELTING_TECH_ID = 'iron_smelting';

// With hundreds of independent regions, even a tiny per-region chance can
// produce an early world-first. These values make accumulated craft knowledge
// the main source of original discovery, while trade spreads a known technique
// much faster than each partner reinventing it independently.
const BASE_WEEKLY_IRON_CHANCE = 1e-8;
const MAX_SMITHING_EXPERIENCE_BONUS = 5e-7;
const SMITHING_EXPERIENCE_SCALE = 75_000;
const CHANCE_PER_IRONWORKING_TRADE_PARTNER = 0.003;

function smithingKnowledge(region) {
  const experience = region.experience?.smithing || 0;
  return 1 - Math.exp(-experience / SMITHING_EXPERIENCE_SCALE);
}

export function ironSmeltingChance(region, regionsById) {
  if (region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) return 0;

  const independentChance = BASE_WEEKLY_IRON_CHANCE +
    smithingKnowledge(region) * MAX_SMITHING_EXPERIENCE_BONUS;
  let knowledgeablePartners = 0;
  for (const partnerId of region.tradePartnerIds || []) {
    if (regionsById.get(partnerId)?.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) {
      knowledgeablePartners++;
    }
  }
  const partnerChance = 1 - Math.pow(
    1 - CHANCE_PER_IRONWORKING_TRADE_PARTNER,
    knowledgeablePartners
  );
  return 1 - (1 - independentChance) * (1 - partnerChance);
}

export function tickBreakthroughs(regions, currentTick, rng = Math.random) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];

  // Calculate all chances from the start-of-tick state. A discovery therefore
  // begins influencing partners next week instead of cascading through an
  // entire trade network in one loop iteration.
  const discoveries = regions.filter((region) => rng() < ironSmeltingChance(region, regionsById));
  for (const region of discoveries) {
    region.unlockedTechIds.add(IRON_SMELTING_TECH_ID);
    events.push({
      type: 'iron_smelting_breakthrough',
      regionId: region.id,
      regionName: region.name,
      tick: currentTick,
    });
  }
  return events;
}
