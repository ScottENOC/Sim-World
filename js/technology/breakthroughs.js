import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';
import { tickClassicalBreakthroughs } from './classicalTransition.js?v=20260907-classical1';
import { tickMedievalBreakthroughs } from './medievalTransition.js?v=20260912-medieval1';
import { tickPetroleumBreakthroughs } from './petroleum.js?v=20260917-oil1';
import { GUNPOWDER_TECH_ID, RIFLING_TECH_ID } from '../military/firearms.js?v=20260914-rifling1';
import { STEELMAKING_TECH_ID, steelmakingBreakthroughChance } from './steel.js?v=20260912-steel1';
import { boundedDiffusionChance, combineIndependentChances, observeTechnology, technologyComprehension, technologyObservation } from './technologyComprehension.js?v=20260914-rifling1';

export { GUNPOWDER_TECH_ID, RIFLING_TECH_ID, STEELMAKING_TECH_ID };

export const IRON_SMELTING_TECH_ID = 'iron_smelting';
export const ADVANCED_BOATBUILDING_TECH_ID = 'advanced_boatbuilding';
export const HILL_FORT_TECH_ID = 'hill_forts';
export const CATAPULT_TECH_ID = 'torsion_catapults';
export const WATER_MANAGEMENT_TECH_ID = 'water_management';
export const SHAFT_MINING_TECH_ID = 'shaft_mining';
export const MINE_DRAINAGE_TECH_ID = 'mine_drainage';

const BASE_WEEKLY_IRON_CHANCE = 1e-8;
const MAX_SMITHING_EXPERIENCE_BONUS = 5e-7;
const SMITHING_EXPERIENCE_SCALE = 75_000;
const CHANCE_PER_IRONWORKING_TRADE_PARTNER = 0.00005;
const TRADE_DIFFUSION_MEMORY_WEEKS = 104;
const MAX_SCARCITY_EXPERIMENT_CHANCE = 3e-6;
const IRON_ADOPTION_BASE_WEEKS = 520;
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
const CIVIL_ENGINEERING_DIFFUSION_CHANCE = 0.0015;
const MAX_LOCAL_GUNPOWDER_DISCOVERY_CHANCE = 4.5e-7;
const MAX_NETWORK_GUNPOWDER_DISCOVERY_CHANCE = 1.5e-7;
const GUNPOWDER_DIFFUSION_CHANCE_PER_PARTNER = 0.0012;
const MAX_RIFLING_INNOVATION_CHANCE = 0.00002;
const RIFLING_NEIGHBOUR_DIFFUSION_CHANCE = 0.0045;
const RIFLING_TRADE_DIFFUSION_CHANCE = 0.0015;

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

function neighbourKnowledgeCount(region, regionsById, techId) {
  return (region.neighbors || []).filter((id) => regionsById.get(id)?.unlockedTechIds.has(techId)).length;
}

function neighbourDiffusion(region, regionsById, techId, chance = CIVIL_ENGINEERING_DIFFUSION_CHANCE, comprehension = 1) {
  return boundedDiffusionChance(chance, neighbourKnowledgeCount(region, regionsById, techId), comprehension);
}

function experienceReadiness(value, scale) {
  return 1 - Math.exp(-Math.max(0, Number(value) || 0) / Math.max(1, scale));
}

export function waterManagementChance(region, regionsById) {
  if (region.unlockedTechIds.has(WATER_MANAGEMENT_TECH_ID)) return 0;
  const farmers = Math.max(0, region.report?.farming?.workers || 0);
  const need = Math.max(0, 1 - (region.weather?.yieldMultiplier ?? 1));
  const independent = Math.min(0.00004, farmers / 5_000_000) * (0.35 + need * 2);
  const comprehension = technologyComprehension({ practice: clamp01(farmers / 1000), minimumPractice: 0.01 });
  return combineIndependentChances(independent,
    neighbourDiffusion(region, regionsById, WATER_MANAGEMENT_TECH_ID, CIVIL_ENGINEERING_DIFFUSION_CHANCE, comprehension));
}

export function shaftMiningChance(region, regionsById) {
  if (region.unlockedTechIds.has(SHAFT_MINING_TECH_ID)) return 0;
  const experience = Math.max(0, effectiveExperience(region, 'mining'));
  const hasOre = Object.keys(region.deposits || {}).some((key) => key !== 'clay' && key !== 'stone');
  const practice = experienceReadiness(experience, 100_000);
  const independent = hasOre ? practice * 0.000035 : 0;
  const comprehension = technologyComprehension({ practice, minimumPractice: 0.02 });
  return combineIndependentChances(independent,
    neighbourDiffusion(region, regionsById, SHAFT_MINING_TECH_ID, CIVIL_ENGINEERING_DIFFUSION_CHANCE, comprehension));
}

export function mineDrainageChance(region, regionsById) {
  if (region.unlockedTechIds.has(MINE_DRAINAGE_TECH_ID) || !region.unlockedTechIds.has(SHAFT_MINING_TECH_ID)) return 0;
  const experience = Math.max(0, effectiveExperience(region, 'mining'));
  const practice = experienceReadiness(experience, 250_000);
  const independent = practice * 0.000018;
  const comprehension = technologyComprehension({ prerequisitesMet: true, practice, minimumPractice: 0.03 });
  return combineIndependentChances(independent,
    neighbourDiffusion(region, regionsById, MINE_DRAINAGE_TECH_ID, 0.0008, comprehension));
}

export function hillFortChance(region, regionsById) {
  if (region.unlockedTechIds.has(HILL_FORT_TECH_ID)) return 0;
  const settlementScale = Math.min(1, Math.max(0, (region.population || 0) - 2000) / 18000);
  const insecurity = Math.min(1, Math.max(0, 0.8 - (region.safetyRating ?? 1)) / 0.6 +
    Math.max(0, region.banditPopulation || 0) / Math.max(1, region.population) * 10);
  const stoneAccess = region.deposits?.stone ? 1 : 0.35;
  const needChance = settlementScale * (0.2 + insecurity * 0.8) * stoneAccess * HILL_FORT_NEED_CHANCE;
  const comprehension = technologyComprehension({ practice: Math.max(0.08, settlementScale), minimumPractice: 0.05 });
  const diffusionChance = boundedDiffusionChance(HILL_FORT_DIFFUSION_CHANCE,
    neighbourKnowledgeCount(region, regionsById, HILL_FORT_TECH_ID), comprehension);
  return combineIndependentChances(BASE_HILL_FORT_CHANCE + needChance, diffusionChance);
}

export function catapultChance(region, regionsById, currentTick) {
  if (region.unlockedTechIds.has(CATAPULT_TECH_ID) || currentTick < CATAPULT_EARLIEST_TICK) return 0;
  const siegeExperience = Math.max(0, region.siegeEquipment?.experience || 0);
  const craftExperience = Math.max(0, effectiveExperience(region, 'smithing')) +
    Math.max(0, effectiveExperience(region, 'boatbuilding'));
  const hasRams = ((region.siegeEquipment?.inventory?.ram?.bronze || 0) +
    (region.siegeEquipment?.inventory?.ram?.iron || 0)) > 0;
  const siegePractice = experienceReadiness(siegeExperience, 500);
  const craftPractice = experienceReadiness(craftExperience, 100_000);
  const practice = siegePractice * 0.55 + craftPractice * 0.45;
  const independent = hasRams ? siegePractice * craftPractice * MAX_CATAPULT_INNOVATION_CHANCE : 0;
  const comprehension = technologyComprehension({ prerequisitesMet: hasRams || siegeExperience > 20, practice, minimumPractice: 0.05 });
  const diffusion = boundedDiffusionChance(CATAPULT_DIFFUSION_CHANCE,
    neighbourKnowledgeCount(region, regionsById, CATAPULT_TECH_ID), comprehension);
  return combineIndependentChances(independent, diffusion);
}

function recentTradePartnerRegions(region, regionsById, currentTick = null) {
  const ids = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.entries()]
        .filter(([, lastTradeTick]) => currentTick === null || currentTick - lastTradeTick <= TRADE_DIFFUSION_MEMORY_WEEKS)
        .map(([id]) => id)
    : [...(region.tradePartnerIds || [])];
  return ids.map((id) => regionsById.get(id)).filter(Boolean);
}

function hasGunpowderIngredient(region, ingredient) {
  if (ingredient === 'wood') return (region.stockpile?.wood || 0) > 5 || (region.forest?.currentStock || 0) > 100;
  return (region.stockpile?.[ingredient] || 0) > 1 || Boolean(region.deposits?.[ingredient]);
}

export function gunpowderBreakthroughChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds.has(GUNPOWDER_TECH_ID)) return 0;
  const partners = recentTradePartnerRegions(region, regionsById, currentTick);
  const ingredients = ['saltpetre', 'sulfur', 'wood'];
  const localComplete = ingredients.every((ingredient) => hasGunpowderIngredient(region, ingredient));
  const networkComplete = ingredients.every((ingredient) =>
    hasGunpowderIngredient(region, ingredient) || partners.some((partner) => hasGunpowderIngredient(partner, ingredient)));
  const experimentalExperience = Math.max(0, effectiveExperience(region, 'mining')) * 0.35 +
    Math.max(0, effectiveExperience(region, 'smithing')) * 0.35 +
    Math.max(0, effectiveExperience(region, 'pottery')) * 0.30;
  const experimentation = experienceReadiness(experimentalExperience, 180_000);
  const independent = localComplete
    ? (0.10 + experimentation * 0.90) * MAX_LOCAL_GUNPOWDER_DISCOVERY_CHANCE
    : networkComplete
      ? (0.08 + experimentation * 0.92) * MAX_NETWORK_GUNPOWDER_DISCOVERY_CHANCE
      : 0;
  const knowledgeablePartners = partners.filter((partner) => partner.unlockedTechIds.has(GUNPOWDER_TECH_ID)).length;
  const comprehension = technologyComprehension({ prerequisitesMet: networkComplete, practice: experimentation, minimumPractice: 0.015 });
  const diffusion = boundedDiffusionChance(GUNPOWDER_DIFFUSION_CHANCE_PER_PARTNER, knowledgeablePartners, comprehension);
  return combineIndependentChances(independent, diffusion);
}

function smithingKnowledge(region) {
  return experienceReadiness(effectiveExperience(region, 'smithing'), SMITHING_EXPERIENCE_SCALE);
}

function boatbuildingKnowledge(region) {
  return experienceReadiness(effectiveExperience(region, 'boatbuilding'), BOATBUILDING_EXPERIENCE_SCALE);
}

export function advancedBoatbuildingChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds.has(ADVANCED_BOATBUILDING_TECH_ID) || !region.isCoastal) return 0;
  const practice = boatbuildingKnowledge(region);
  const independentChance = practice * MAX_ADVANCED_BOAT_CHANCE;
  const recentPartners = recentTradePartnerRegions(region, regionsById, currentTick);
  const knowledgeablePartners = recentPartners.filter((partner) => partner.unlockedTechIds.has(ADVANCED_BOATBUILDING_TECH_ID)).length;
  const comprehension = technologyComprehension({ prerequisitesMet: region.isCoastal, practice, minimumPractice: 0.02 });
  const partnerChance = boundedDiffusionChance(CHANCE_PER_ADVANCED_BOAT_PARTNER, knowledgeablePartners, comprehension);
  return combineIndependentChances(independentChance, partnerChance);
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
  const smithing = smithingKnowledge(region);
  const independentChance = BASE_WEEKLY_IRON_CHANCE +
    smithing * MAX_SMITHING_EXPERIENCE_BONUS +
    bronzeScarcityPressure(region) * (0.1 + 0.9 * smithing) * MAX_SCARCITY_EXPERIMENT_CHANCE;
  const recentPartners = recentTradePartnerRegions(region, regionsById, currentTick);
  const knowledgeablePartners = recentPartners.filter((partner) => partner.unlockedTechIds.has(IRON_SMELTING_TECH_ID)).length;
  const observation = technologyObservation(region, IRON_SMELTING_TECH_ID).familiarity;
  const comprehension = technologyComprehension({ practice: smithing, minimumPractice: 0.015, observation });
  const partnerChance = boundedDiffusionChance(CHANCE_PER_IRONWORKING_TRADE_PARTNER, knowledgeablePartners, comprehension);
  const migrantChance = (1 - Math.exp(-Math.max(0, region.ironWorkingExposure || 0) * MIGRANT_EXPOSURE_CHANCE)) * comprehension;
  return combineIndependentChances(independentChance, partnerChance, migrantChance);
}

export function riflingComprehension(region) {
  const firearms = region.firearms || {};
  const hasGunpowder = region.unlockedTechIds?.has(GUNPOWDER_TECH_ID);
  const totalBuilt = Math.max(0, firearms.totalBuilt || 0);
  const arsenal = Math.max(0, region.stockpile?.firearms || 0);
  const manufacturing = 1 - Math.exp(-totalBuilt / 180);
  const arsenalPractice = 1 - Math.exp(-arsenal / 100);
  const craft = smithingKnowledge(region);
  const readiness = clamp01(firearms.readiness);
  const combat = clamp01(firearms.combatExperience);
  const practical = readiness * 0.35 + manufacturing * 0.30 + arsenalPractice * 0.10 + craft * 0.15 + combat * 0.10;
  const hasHandsOnFirearms = totalBuilt >= 5 || (arsenal >= 10 && readiness >= 0.08);
  return technologyComprehension({
    prerequisitesMet: Boolean(hasGunpowder && hasHandsOnFirearms),
    practice: practical,
    minimumPractice: 0.08,
    observation: technologyObservation(region, RIFLING_TECH_ID).familiarity,
    observationWeight: 0.20,
  });
}

function riflingKnowledgeSources(region, regionsById, currentTick = null) {
  const neighbours = (region.neighbors || []).map((id) => regionsById.get(id)).filter(Boolean)
    .filter((other) => other.unlockedTechIds.has(RIFLING_TECH_ID));
  const neighbourIds = new Set(neighbours.map((other) => other.id));
  const tradePartners = recentTradePartnerRegions(region, regionsById, currentTick)
    .filter((other) => other.unlockedTechIds.has(RIFLING_TECH_ID) && !neighbourIds.has(other.id));
  return { neighbours, tradePartners };
}

function observeAdvancedTechnologyContacts(regions, regionsById, currentTick, weekScale) {
  for (const region of regions) {
    if (!region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) {
      const ironSources = recentTradePartnerRegions(region, regionsById, currentTick)
        .filter((partner) => partner.unlockedTechIds.has(IRON_SMELTING_TECH_ID)).length;
      if (ironSources) observeTechnology(region, IRON_SMELTING_TECH_ID, Math.min(0.04, ironSources * 0.004 * weekScale), 'trade');
    }
    if (!region.unlockedTechIds.has(RIFLING_TECH_ID)) {
      const sources = riflingKnowledgeSources(region, regionsById, currentTick);
      if (sources.neighbours.length) observeTechnology(region, RIFLING_TECH_ID,
        Math.min(0.08, sources.neighbours.length * 0.008 * weekScale), 'neighbour');
      if (sources.tradePartners.length) observeTechnology(region, RIFLING_TECH_ID,
        Math.min(0.04, sources.tradePartners.length * 0.003 * weekScale), 'trade');
    }
  }
}

export function riflingBreakthroughChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds.has(RIFLING_TECH_ID)) return 0;
  const comprehension = riflingComprehension(region);
  if (comprehension <= 0) return 0;
  const firearms = region.firearms || {};
  const manufacturing = 1 - Math.exp(-Math.max(0, firearms.totalBuilt || 0) / 300);
  const experimentation = manufacturing * 0.45 + clamp01(firearms.readiness) * 0.30 +
    smithingKnowledge(region) * 0.15 + clamp01(firearms.combatExperience) * 0.10;
  const independent = experimentation * MAX_RIFLING_INNOVATION_CHANCE;
  const sources = riflingKnowledgeSources(region, regionsById, currentTick);
  const neighbour = boundedDiffusionChance(RIFLING_NEIGHBOUR_DIFFUSION_CHANCE, sources.neighbours.length, comprehension);
  const trade = boundedDiffusionChance(RIFLING_TRADE_DIFFUSION_CHANCE, sources.tradePartners.length, comprehension);
  return combineIndependentChances(independent, neighbour, trade);
}

function advanceIronIndustry(region) {
  if (!region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) return;
  const readiness = Math.max(0.02, region.ironWorkingReadiness || 0);
  const craftSkill = smithingKnowledge(region);
  const urgency = bronzeScarcityPressure(region);
  const oreExists = Boolean(region.deposits?.ironOre);
  const weeklyRate = (0.45 + craftSkill * 0.75 + urgency * 0.55 + (oreExists ? 0.25 : 0)) / IRON_ADOPTION_BASE_WEEKS;
  region.ironWorkingReadiness = Math.min(1, readiness + weeklyRate * (1 - readiness));
}

export function tickBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const chance = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), weekScale);
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];

  observeAdvancedTechnologyContacts(regions, regionsById, currentTick, weekScale);

  const ironDiscoveries = regions.filter((region) => rng() < chance(ironSmeltingChance(region, regionsById, currentTick)));
  const boatDiscoveries = regions.filter((region) => rng() < chance(advancedBoatbuildingChance(region, regionsById, currentTick)));
  const hillFortDiscoveries = regions.filter((region) => rng() < chance(hillFortChance(region, regionsById)));
  const catapultDiscoveries = regions.filter((region) => rng() < chance(catapultChance(region, regionsById, currentTick)));
  const waterDiscoveries = regions.filter((region) => rng() < chance(waterManagementChance(region, regionsById)));
  const shaftDiscoveries = regions.filter((region) => rng() < chance(shaftMiningChance(region, regionsById)));
  const drainageDiscoveries = regions.filter((region) => rng() < chance(mineDrainageChance(region, regionsById)));
  const gunpowderDiscoveries = regions.filter((region) => rng() < chance(gunpowderBreakthroughChance(region, regionsById, currentTick)));
  const steelDiscoveries = regions.filter((region) => rng() < chance(steelmakingBreakthroughChance(region, regionsById, currentTick)));
  const riflingDiscoveries = regions.filter((region) => rng() < chance(riflingBreakthroughChance(region, regionsById, currentTick)));

  for (const region of ironDiscoveries) {
    region.unlockedTechIds.add(IRON_SMELTING_TECH_ID);
    region.ironWorkingReadiness = Math.max(0.02, region.ironWorkingReadiness || 0);
    events.push({ type: 'iron_smelting_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const region of boatDiscoveries) {
    region.unlockedTechIds.add(ADVANCED_BOATBUILDING_TECH_ID);
    events.push({ type: 'advanced_boatbuilding_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const region of steelDiscoveries) {
    region.unlockedTechIds.add(STEELMAKING_TECH_ID);
    region.steelIndustry ||= {};
    region.steelIndustry.readiness = Math.max(0.03, region.steelIndustry.readiness || 0);
    events.push({ type: 'steelmaking_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const region of gunpowderDiscoveries) {
    region.unlockedTechIds.add(GUNPOWDER_TECH_ID);
    region.firearms ||= {};
    region.firearms.readiness = Math.max(0.02, region.firearms.readiness || 0);
    events.push({ type: 'gunpowder_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick,
      title: 'Gunpowder discovered', message: `${region.name} has discovered a powerful explosive mixture of saltpetre, sulfur and charcoal.` });
  }
  for (const region of riflingDiscoveries) {
    region.unlockedTechIds.add(RIFLING_TECH_ID);
    region.firearms ||= {};
    region.firearms.riflingReadiness = Math.max(0.02, region.firearms.riflingReadiness || 0);
    events.push({ type: 'rifling_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick,
      title: 'Rifled barrels understood', message: `${region.name}'s gunmakers have learned to cut spiral grooves that stabilise projectiles and improve firearm accuracy.` });
  }
  for (const region of hillFortDiscoveries) {
    region.unlockedTechIds.add(HILL_FORT_TECH_ID);
    events.push({ type: 'hill_fort_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const region of catapultDiscoveries) {
    region.unlockedTechIds.add(CATAPULT_TECH_ID);
    events.push({ type: 'catapult_breakthrough', regionId: region.id, regionName: region.name, tick: currentTick });
  }
  for (const [discoveries, techId, type] of [
    [waterDiscoveries, WATER_MANAGEMENT_TECH_ID, 'water_management_breakthrough'],
    [shaftDiscoveries, SHAFT_MINING_TECH_ID, 'shaft_mining_breakthrough'],
    [drainageDiscoveries, MINE_DRAINAGE_TECH_ID, 'mine_drainage_breakthrough'],
  ]) for (const region of discoveries) {
    region.unlockedTechIds.add(techId);
    events.push({ type, regionId: region.id, regionName: region.name, tick: currentTick });
  }

  for (const region of regions) {
    for (let i = 0; i < Math.max(1, Math.floor(weekScale)); i++) advanceIronIndustry(region);
    const readinessRemainder = weekScale - Math.floor(weekScale);
    if (readinessRemainder > 0 && region.unlockedTechIds.has(IRON_SMELTING_TECH_ID)) {
      const before = region.ironWorkingReadiness; advanceIronIndustry(region);
      region.ironWorkingReadiness = before + (region.ironWorkingReadiness - before) * readinessRemainder;
    }
    region.ironWorkingExposure = Math.max(0, (region.ironWorkingExposure || 0) * Math.pow(0.99, weekScale));
  }
  events.push(...tickClassicalBreakthroughs(regions, currentTick, rng, elapsedDays));
  events.push(...tickMedievalBreakthroughs(regions, currentTick, rng, elapsedDays));
  events.push(...tickPetroleumBreakthroughs(regions, currentTick, rng, elapsedDays));
  return events;
}
