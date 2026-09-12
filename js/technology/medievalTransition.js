import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';
import { maritimeSkillLevel, MARITIME_SKILLS } from './seamanship.js?v=20260906-maritime1';
import { operationalInfrastructure } from '../economy/construction.js?v=20260907-classical1';
import { militaryExperienceProfile } from '../military/professionalisation.js?v=20260908-prof1';

export const CROSSBOW_TECH_ID = 'crossbows';
export const HEAVY_CAVALRY_TECH_ID = 'heavy_cavalry';
export const OCEAN_SAILING_TECH_ID = 'ocean_sailing';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function diffuse(region, regionsById, techId, chance) {
  let exposure = 0;
  for (const id of region.neighbors || []) if (regionsById.get(id)?.unlockedTechIds?.has(techId)) exposure += 1;
  const tradeIds = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.keys()]
    : [...(region.tradePartnerIds || [])];
  for (const id of tradeIds) if (regionsById.get(id)?.unlockedTechIds?.has(techId)) exposure += 0.75;
  return 1 - Math.pow(1 - chance, exposure);
}

function combined(independent, diffusion) {
  return 1 - (1 - clamp01(independent)) * (1 - clamp01(diffusion));
}

export function medievalBreakthroughChances(region, regionsById) {
  const smithing = Math.max(0, effectiveExperience(region, 'smithing'));
  const boatbuilding = Math.max(0, effectiveExperience(region, 'boatbuilding'));
  const horses = Math.max(0, effectiveExperience(region, 'horseHusbandry'));
  const military = militaryExperienceProfile(region, null);
  const army = Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0));
  const warHorses = Math.max(0, region.horseEconomy?.war || 0);
  const ironReady = region.unlockedTechIds?.has('iron_smelting') ? Math.max(0.1, region.ironWorkingReadiness || 0) : 0;
  const drill = operationalInfrastructure(region, 'drill_ground');
  const arsenal = operationalInfrastructure(region, 'royal_arsenal');
  const harbour = operationalInfrastructure(region, 'harbour');

  const crossbowIndependent = ironReady > 0.25 && smithing > 40_000 && army >= 120
    ? (1 - Math.exp(-smithing / 180_000)) * (0.000004 + military.institutional * 0.000018 + (arsenal ? 0.000010 : 0))
    : 0;

  const heavyCavalryIndependent = region.unlockedTechIds?.has('mounted_cavalry') && ironReady > 0.45 &&
      warHorses >= Math.max(40, army * 0.08) && army >= 220
    ? (1 - Math.exp(-horses / 320_000)) * (1 - Math.exp(-smithing / 220_000)) *
      (0.000003 + military.institutional * 0.000014 + (drill ? 0.000008 : 0) + (arsenal ? 0.000006 : 0))
    : 0;

  const navigation = Math.max(
    maritimeSkillLevel(region, MARITIME_SKILLS.TRADE),
    maritimeSkillLevel(region, MARITIME_SKILLS.SCOUTING),
  );
  const advancedFleet = Math.max(0, region.tradeEconomy?.advancedMerchantBoats || 0) +
    Math.max(0, region.navy?.advancedBoats || 0) + Math.max(0, region.advancedFishingBoats || 0);
  const oceanIndependent = region.unlockedTechIds?.has('advanced_boatbuilding') && harbour && advancedFleet >= 3
    ? (1 - Math.exp(-boatbuilding / 420_000)) * (0.20 + navigation * 0.80) *
      (0.000004 + navigation * 0.000020)
    : 0;

  return {
    [CROSSBOW_TECH_ID]: combined(crossbowIndependent, diffuse(region, regionsById, CROSSBOW_TECH_ID, 0.0014)),
    [HEAVY_CAVALRY_TECH_ID]: combined(heavyCavalryIndependent, diffuse(region, regionsById, HEAVY_CAVALRY_TECH_ID, 0.0010)),
    [OCEAN_SAILING_TECH_ID]: combined(oceanIndependent, diffuse(region, regionsById, OCEAN_SAILING_TECH_ID, 0.0012)),
  };
}

export function tickMedievalBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const adjusted = (p) => 1 - Math.pow(1 - clamp01(p), weekScale);
  const discoveries = [];
  for (const region of regions) {
    const chances = medievalBreakthroughChances(region, regionsById);
    for (const [techId, chance] of Object.entries(chances)) {
      if (!region.unlockedTechIds?.has(techId) && rng() < adjusted(chance)) discoveries.push([region, techId]);
    }
  }
  return discoveries.map(([region, techId]) => {
    region.unlockedTechIds.add(techId);
    return { type: `${techId}_breakthrough`, regionId: region.id, regionName: region.name, tick: currentTick };
  });
}

export function oceanSailingProfile(region) {
  const known = region.unlockedTechIds?.has(OCEAN_SAILING_TECH_ID);
  const navigation = Math.max(
    maritimeSkillLevel(region, MARITIME_SKILLS.TRADE),
    maritimeSkillLevel(region, MARITIME_SKILLS.SCOUTING),
  );
  if (!known) return { known: false, navigation, rangeMultiplier: 1, speedMultiplier: 1, riskMultiplier: 1 };
  return {
    known: true,
    navigation,
    rangeMultiplier: 1.8 + navigation * 0.7,
    speedMultiplier: 1.08 + navigation * 0.12,
    riskMultiplier: Math.max(0.45, 0.80 - navigation * 0.28),
  };
}
