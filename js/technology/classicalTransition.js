import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';
import { operationalInfrastructure, effectiveInfrastructureCount } from '../economy/construction.js?v=20260907-classical1';

export const LIGHT_CHARIOTRY_TECH_ID = 'light_chariotry';
export const MOUNTED_CAVALRY_TECH_ID = 'mounted_cavalry';
export const HYDRAULIC_ENGINEERING_TECH_ID = 'hydraulic_engineering';
export const URBAN_DRAINAGE_TECH_ID = 'urban_drainage';
export const STANDARD_WEIGHTS_TECH_ID = 'standard_weights';
export const COINAGE_TECH_ID = 'coinage';
export const MASS_HEAVY_INFANTRY_TECH_ID = 'mass_heavy_infantry';
export const MILITARY_DRILL_TECH_ID = 'military_drill';
export const NAVAL_WARFARE_TECH_ID = 'naval_warfare';
export const RELAY_ADMINISTRATION_TECH_ID = 'relay_administration';
export const FORMAL_TAXATION_TECH_ID = 'formal_taxation';
export const COLONISATION_TECH_ID = 'colonisation';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const diffuse = (region, regionsById, techId, chance) => {
  let exposed = 0;
  for (const id of region.neighbors || []) if (regionsById.get(id)?.unlockedTechIds?.has(techId)) exposed++;
  for (const id of region.tradePartnerIds || []) if (regionsById.get(id)?.unlockedTechIds?.has(techId)) exposed += 0.6;
  return 1 - Math.pow(1 - chance, exposed);
};

function probability(independent, diffusion) {
  return 1 - (1 - clamp01(independent)) * (1 - clamp01(diffusion));
}

function adminCapacity(region) {
  const scribes = Math.max(0, region.occupations?.scribe || region.education?.trainedScribes || 0);
  const centre = operationalInfrastructure(region, 'administrative_centre') ? 1 : 0;
  const market = operationalInfrastructure(region, 'market_customs') ? 1 : 0;
  return clamp01(centre * 0.45 + market * 0.2 + Math.log10(1 + scribes) * 0.13 + (region.educationLevel || 0) * 0.35);
}

function urbanPressure(region) {
  ensureUrbanisation(region);
  return clamp01(region.urbanisation.urbanPopulation / Math.max(1, region.urbanisation.urbanCapacity));
}

export function classicalBreakthroughChances(region, regionsById) {
  const horses = region.horseEconomy || {};
  const horseExp = Math.max(0, effectiveExperience(region, 'horseHusbandry'));
  const smithExp = Math.max(0, effectiveExperience(region, 'smithing'));
  const boatExp = Math.max(0, effectiveExperience(region, 'boatbuilding'));
  const population = Math.max(0, region.population || 0);
  const admin = adminCapacity(region);
  const pressure = urbanPressure(region);
  const insecurity = clamp01(1 - (region.safetyRating ?? 1));
  const ironReady = region.unlockedTechIds.has('iron_smelting') ? Math.max(0.1, region.ironWorkingReadiness || 0) : 0;
  const waterManaged = region.unlockedTechIds.has('water_management');
  const advancedBoats = region.unlockedTechIds.has('advanced_boatbuilding');

  const chariotIndependent = (horses.war || 0) >= 20
    ? (1 - Math.exp(-horseExp / 120000)) * (1 - Math.exp(-smithExp / 90000)) * (0.000015 + insecurity * 0.00006)
    : 0;
  const cavalryIndependent = region.unlockedTechIds.has(LIGHT_CHARIOTRY_TECH_ID) && (horses.war || 0) >= 30
    ? (1 - Math.exp(-horseExp / 260000)) * (0.000008 + insecurity * 0.00004)
    : 0;
  const hydraulicIndependent = waterManaged && population >= 7000
    ? (0.000006 + pressure * 0.000045) * (0.45 + admin * 0.8) *
      (operationalInfrastructure(region, 'irrigation') || operationalInfrastructure(region, 'canal') ? 1 : 0.3)
    : 0;
  const drainageIndependent = region.unlockedTechIds.has(HYDRAULIC_ENGINEERING_TECH_ID) && population >= 10000
    ? (0.000004 + pressure * 0.000035) * (0.4 + admin)
    : 0;
  const weightsIndependent = operationalInfrastructure(region, 'market_customs') && population >= 4000
    ? 0.00001 + admin * 0.000035 : 0;
  // Early coinage need not wait for a map-wide silver pass: historically
  // electrum/gold and silver all supplied early monetary systems. Silver is
  // preferred once present, but existing gold-rich regions can originate it.
  const preciousMetal = Math.max(0, region.stockpile?.silver || 0) + Math.max(0, region.stockpile?.gold || 0) * 0.45;
  const coinageIndependent = region.unlockedTechIds.has(STANDARD_WEIGHTS_TECH_ID) &&
      preciousMetal > 5 && admin > 0.25
    ? 0.000006 + admin * 0.000025 : 0;
  const heavyInfantryIndependent = ironReady > 0.35 && population >= 8000
    ? ironReady * (0.000005 + insecurity * 0.00004) : 0;
  const drillIndependent = region.unlockedTechIds.has(MASS_HEAVY_INFANTRY_TECH_ID) && (region.army?.personnel || 0) >= 250
    ? 0.000005 + Math.min(1, (region.army.personnel || 0) / 3000) * 0.00003 : 0;
  const navalIndependent = advancedBoats && (region.navy?.boats || 0) >= 5
    ? (1 - Math.exp(-boatExp / 220000)) * 0.000035 : 0;
  const taxIndependent = region.unlockedTechIds.has(STANDARD_WEIGHTS_TECH_ID) && admin > 0.45
    ? 0.000004 + admin * 0.000025 : 0;
  const relayIndependent = operationalInfrastructure(region, 'road_network') && admin > 0.5 && (horses.transport || 0) >= 20
    ? 0.000004 + admin * 0.00002 : 0;
  const colonisationIndependent = advancedBoats && population >= 12000 && (region.isCoastal || false)
    ? 0.000002 + clamp01((population - 12000) / 40000) * 0.000015 : 0;

  return {
    [LIGHT_CHARIOTRY_TECH_ID]: probability(chariotIndependent, diffuse(region, regionsById, LIGHT_CHARIOTRY_TECH_ID, 0.0012)),
    [MOUNTED_CAVALRY_TECH_ID]: probability(cavalryIndependent, diffuse(region, regionsById, MOUNTED_CAVALRY_TECH_ID, 0.001)),
    [HYDRAULIC_ENGINEERING_TECH_ID]: probability(hydraulicIndependent, diffuse(region, regionsById, HYDRAULIC_ENGINEERING_TECH_ID, 0.0015)),
    [URBAN_DRAINAGE_TECH_ID]: probability(drainageIndependent, diffuse(region, regionsById, URBAN_DRAINAGE_TECH_ID, 0.0015)),
    [STANDARD_WEIGHTS_TECH_ID]: probability(weightsIndependent, diffuse(region, regionsById, STANDARD_WEIGHTS_TECH_ID, 0.002)),
    [COINAGE_TECH_ID]: probability(coinageIndependent, diffuse(region, regionsById, COINAGE_TECH_ID, 0.0018)),
    [MASS_HEAVY_INFANTRY_TECH_ID]: probability(heavyInfantryIndependent, diffuse(region, regionsById, MASS_HEAVY_INFANTRY_TECH_ID, 0.001)),
    [MILITARY_DRILL_TECH_ID]: probability(drillIndependent, diffuse(region, regionsById, MILITARY_DRILL_TECH_ID, 0.0012)),
    [NAVAL_WARFARE_TECH_ID]: probability(navalIndependent, diffuse(region, regionsById, NAVAL_WARFARE_TECH_ID, 0.0015)),
    [FORMAL_TAXATION_TECH_ID]: probability(taxIndependent, diffuse(region, regionsById, FORMAL_TAXATION_TECH_ID, 0.0018)),
    [RELAY_ADMINISTRATION_TECH_ID]: probability(relayIndependent, diffuse(region, regionsById, RELAY_ADMINISTRATION_TECH_ID, 0.0015)),
    [COLONISATION_TECH_ID]: probability(colonisationIndependent, diffuse(region, regionsById, COLONISATION_TECH_ID, 0.0012)),
  };
}

export function tickClassicalBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const adjusted = (p) => 1 - Math.pow(1 - clamp01(p), weekScale);
  const events = [];
  const discoveries = [];
  for (const region of regions) {
    const chances = classicalBreakthroughChances(region, regionsById);
    for (const [techId, chance] of Object.entries(chances)) {
      if (!region.unlockedTechIds.has(techId) && rng() < adjusted(chance)) discoveries.push([region, techId]);
    }
  }
  for (const [region, techId] of discoveries) {
    region.unlockedTechIds.add(techId);
    events.push({ type: `${techId}_breakthrough`, regionId: region.id, regionName: region.name, tick: currentTick });
  }
  return events;
}

export function ensureUrbanisation(region) {
  if (!region.urbanisation) region.urbanisation = {};
  const u = region.urbanisation;
  if (!Number.isFinite(u.urbanPopulation)) u.urbanPopulation = Math.min(region.population || 0, Math.max(250, (region.population || 0) * 0.08));
  if (!Number.isFinite(u.urbanCapacity)) u.urbanCapacity = Math.max(500, u.urbanPopulation * 1.15);
  if (!u.limitingFactor) u.limitingFactor = 'local water and food distribution';
  return u;
}

export function urbanCapacity(region) {
  const pop = Math.max(1, region.population || 1);
  const wells = effectiveInfrastructureCount(region, 'wells_cisterns');
  const irrigation = effectiveInfrastructureCount(region, 'irrigation');
  const canal = effectiveInfrastructureCount(region, 'canal');
  const aqueduct = effectiveInfrastructureCount(region, 'aqueduct');
  const drainage = effectiveInfrastructureCount(region, 'urban_drainage');
  const market = effectiveInfrastructureCount(region, 'market_customs');
  const admin = effectiveInfrastructureCount(region, 'administrative_centre');
  const harbour = effectiveInfrastructureCount(region, 'harbour');
  const waterCap = 1800 + wells * 4500 + irrigation * 2200 + canal * 7000 + aqueduct * 18000;
  const sanitationCap = 5000 + wells * 2500 + drainage * 18000 +
    (region.unlockedTechIds.has(URBAN_DRAINAGE_TECH_ID) ? 3500 : 0);
  const economyCap = 2500 + market * 7000 + admin * 9000 + harbour * 6500 + Math.sqrt(pop) * 45;
  const foodLogisticsCap = 3000 + effectiveInfrastructureCount(region, 'road_network') * 7000 +
    effectiveInfrastructureCount(region, 'public_granary') * 6500 + harbour * 9000 + canal * 4500;
  const caps = { water: waterCap, sanitation: sanitationCap, economy: economyCap, foodLogistics: foodLogisticsCap };
  const limitingFactor = Object.entries(caps).sort((a, b) => a[1] - b[1])[0][0];
  return { capacity: Math.max(500, Math.min(...Object.values(caps), pop * 0.85)), limitingFactor, caps };
}

export function tickUrbanisation(region, elapsedDays = 7) {
  const u = ensureUrbanisation(region);
  const result = urbanCapacity(region);
  u.urbanCapacity = result.capacity;
  u.limitingFactor = result.limitingFactor;
  u.capacityByFactor = result.caps;
  const specialists = (region.occupations?.trader || 0) + (region.occupations?.smith || 0) +
    (region.occupations?.potter || 0) + (region.occupations?.textileWorker || 0) +
    (region.occupations?.scribe || 0) + (region.navy?.personnel || 0) * 0.25;
  const desired = Math.min(result.capacity, Math.max(350, specialists * 2.7 + (region.population || 0) * 0.06));
  const years = Math.max(0, elapsedDays) / 365.2425;
  const adjustment = 1 - Math.exp(-years / 5);
  u.urbanPopulation = Math.max(0, Math.min(region.population || 0, u.urbanPopulation + (desired - u.urbanPopulation) * adjustment));
  u.urbanShare = u.urbanPopulation / Math.max(1, region.population || 1);
  return u;
}
