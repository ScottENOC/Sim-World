import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';

export const CHARIOTRY_TECH_ID = 'light_chariotry';
export const CAVALRY_TECH_ID = 'mounted_cavalry';
export const HYDRAULIC_ENGINEERING_TECH_ID = 'hydraulic_engineering';
export const STANDARD_MEASURES_TECH_ID = 'standard_weights_measures';
export const COINAGE_TECH_ID = 'coinage';
export const MASS_INFANTRY_TECH_ID = 'mass_heavy_infantry';
export const MILITARY_DRILL_TECH_ID = 'military_drill';
export const RELAY_ADMIN_TECH_ID = 'relay_administration';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function knowledgeableNeighbours(region, regionsById, techId) {
  return (region.neighbors || []).reduce((n, id) =>
    n + (regionsById.get(id)?.unlockedTechIds?.has(techId) ? 1 : 0), 0);
}

function diffusion(region, regionsById, techId, chancePerNeighbour = 0.0015) {
  const n = knowledgeableNeighbours(region, regionsById, techId);
  return 1 - Math.pow(1 - chancePerNeighbour, n);
}

function finishedInfrastructure(region, ids) {
  const assets = region.construction?.assets || [];
  const set = new Set(assets.filter((a) => (a.condition ?? 1) > 0.35).map((a) => a.typeId));
  return ids.reduce((n, id) => n + (set.has(id) ? 1 : 0), 0);
}

export function chariotryChance(region, regionsById) {
  if (region.unlockedTechIds.has(CHARIOTRY_TECH_ID)) return 0;
  const horses = Math.max(0, region.horseEconomy?.war || 0);
  const husbandry = Math.max(0, effectiveExperience(region, 'horseHusbandry'));
  const smithing = Math.max(0, effectiveExperience(region, 'smithing'));
  const craft = Math.max(0, effectiveExperience(region, 'boatbuilding'));
  const horseReadiness = 1 - Math.exp(-(horses + husbandry / 500) / 120);
  const craftReadiness = 1 - Math.exp(-(smithing + craft * 0.5) / 140_000);
  const pressure = clamp01((1 - (region.safetyRating ?? 1)) * 0.8 +
    Math.max(0, region.army?.personnel || 0) / Math.max(3000, region.population || 1));
  const independent = horseReadiness * craftReadiness * (0.25 + pressure * 0.75) * 0.000045;
  const spread = diffusion(region, regionsById, CHARIOTRY_TECH_ID, 0.003);
  return 1 - (1 - independent) * (1 - spread);
}

export function cavalryChance(region, regionsById) {
  if (region.unlockedTechIds.has(CAVALRY_TECH_ID)) return 0;
  const husbandry = Math.max(0, effectiveExperience(region, 'horseHusbandry'));
  const warHorses = Math.max(0, region.horseEconomy?.war || 0);
  const hasChariots = region.unlockedTechIds.has(CHARIOTRY_TECH_ID);
  const readiness = (1 - Math.exp(-husbandry / 180_000)) * (1 - Math.exp(-warHorses / 180));
  const independent = readiness * (hasChariots ? 1 : 0.25) * 0.000025;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, CAVALRY_TECH_ID, 0.002));
}

export function hydraulicEngineeringChance(region, regionsById) {
  if (region.unlockedTechIds.has(HYDRAULIC_ENGINEERING_TECH_ID) ||
      !region.unlockedTechIds.has('water_management')) return 0;
  const infra = finishedInfrastructure(region, ['wells_cisterns', 'irrigation', 'canal', 'road_network', 'administrative_centre']);
  if (infra < 2) return diffusion(region, regionsById, HYDRAULIC_ENGINEERING_TECH_ID, 0.00035);
  const populationPressure = clamp01(((region.population || 0) - 6000) / 30000);
  const waterNeed = clamp01(1 - (region.weather?.yieldMultiplier ?? 1));
  const independent = (0.2 + populationPressure * 0.6 + waterNeed * 0.4) * Math.min(1, infra / 4) * 0.00003;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, HYDRAULIC_ENGINEERING_TECH_ID, 0.0017));
}

export function standardMeasuresChance(region, regionsById) {
  if (region.unlockedTechIds.has(STANDARD_MEASURES_TECH_ID)) return 0;
  const admin = finishedInfrastructure(region, ['market_customs', 'administrative_centre']);
  const traders = Math.max(0, region.occupations?.trader || 0);
  const independent = Math.min(1, traders / 600) * (admin ? 1 : 0.2) * 0.000035;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, STANDARD_MEASURES_TECH_ID, 0.002));
}

export function coinageChance(region, regionsById) {
  if (region.unlockedTechIds.has(COINAGE_TECH_ID) ||
      !region.unlockedTechIds.has(STANDARD_MEASURES_TECH_ID)) return 0;
  const silver = Math.max(0, region.stockpile?.silver || 0);
  const markets = finishedInfrastructure(region, ['market_customs', 'administrative_centre']);
  const independent = Math.min(1, silver / 80) * Math.min(1, markets / 2) * 0.00002;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, COINAGE_TECH_ID, 0.0025));
}

export function massInfantryChance(region, regionsById) {
  if (region.unlockedTechIds.has(MASS_INFANTRY_TECH_ID) || !region.unlockedTechIds.has('iron_smelting')) return 0;
  const population = clamp01(((region.population || 0) - 8000) / 50000);
  const armyShare = clamp01((region.army?.personnel || 0) / Math.max(1, (region.population || 1) * 0.06));
  const independent = population * (0.3 + armyShare * 0.7) * 0.000018;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, MASS_INFANTRY_TECH_ID, 0.0015));
}

export function militaryDrillChance(region, regionsById) {
  if (region.unlockedTechIds.has(MILITARY_DRILL_TECH_ID)) return 0;
  const army = Math.max(0, region.army?.personnel || 0);
  const independent = Math.min(1, army / 5000) * (region.unlockedTechIds.has(MASS_INFANTRY_TECH_ID) ? 1 : 0.35) * 0.000015;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, MILITARY_DRILL_TECH_ID, 0.0012));
}

export function relayAdministrationChance(region, regionsById) {
  if (region.unlockedTechIds.has(RELAY_ADMIN_TECH_ID)) return 0;
  const roads = finishedInfrastructure(region, ['road_network', 'administrative_centre']);
  const horses = Math.max(0, region.horseEconomy?.transport || 0);
  const independent = Math.min(1, roads / 2) * Math.min(1, horses / 120) * 0.000012;
  return 1 - (1 - independent) * (1 - diffusion(region, regionsById, RELAY_ADMIN_TECH_ID, 0.001));
}

export function tickClassicalBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const chance = (p) => 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), weekScale);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const specs = [
    [CHARIOTRY_TECH_ID, chariotryChance, 'chariotry_breakthrough'],
    [CAVALRY_TECH_ID, cavalryChance, 'cavalry_breakthrough'],
    [HYDRAULIC_ENGINEERING_TECH_ID, hydraulicEngineeringChance, 'hydraulic_engineering_breakthrough'],
    [STANDARD_MEASURES_TECH_ID, standardMeasuresChance, 'standard_measures_breakthrough'],
    [COINAGE_TECH_ID, coinageChance, 'coinage_breakthrough'],
    [MASS_INFANTRY_TECH_ID, massInfantryChance, 'mass_infantry_breakthrough'],
    [MILITARY_DRILL_TECH_ID, militaryDrillChance, 'military_drill_breakthrough'],
    [RELAY_ADMIN_TECH_ID, relayAdministrationChance, 'relay_administration_breakthrough'],
  ];
  const discovered = [];
  for (const region of regions) {
    for (const [techId, fn, type] of specs) {
      if (!region.unlockedTechIds.has(techId) && rng() < chance(fn(region, byId))) {
        discovered.push([region, techId, type]);
      }
    }
  }
  for (const [region, techId] of discovered) region.unlockedTechIds.add(techId);
  return discovered.map(([region, , type]) => ({ type, regionId: region.id, regionName: region.name, tick: currentTick }));
}
