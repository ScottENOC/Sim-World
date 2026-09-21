import { boundedDiffusionChance, combineIndependentChances, technologyComprehension } from '../technology/technologyComprehension.js?v=20260914-rifling1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const positive = (v) => Math.max(0, Number(v) || 0);

export const CLIMATE_CHANGE_SCIENCE_TECH_ID = 'anthropogenic_climate_change';

function hasTech(region, id) {
  return Boolean(region?.unlockedTechIds?.has?.(id));
}

function ensureRegionalClimate(region) {
  region.climate ||= {};
  const c = region.climate;
  if (!Number.isFinite(c.rainfallMultiplier)) c.rainfallMultiplier = 1;
  if (!Number.isFinite(c.evaporationMultiplier)) c.evaporationMultiplier = 1;
  if (!Number.isFinite(c.temperatureAnomalyC)) c.temperatureAnomalyC = 0;
  if (!Number.isFinite(c.extremeWeatherMultiplier)) c.extremeWeatherMultiplier = 1;
  if (!Number.isFinite(c.coastalInundationPressure)) c.coastalInundationPressure = 0;
  if (!Number.isFinite(c.coastalDisplacementPressure)) c.coastalDisplacementPressure = 0;
  if (!Number.isFinite(c.adaptationSpend)) c.adaptationSpend = 0;
  if (!Number.isFinite(c.lastForestStock)) c.lastForestStock = positive(region?.forest?.currentStock);
  if (!Number.isFinite(c.baselineForestStock)) c.baselineForestStock = positive(region?.forest?.currentStock);
  region.climateScience ||= { evidence: 0, understanding: 0, observedYears: 0 };
  return c;
}

export function ensureClimateWorld(regions) {
  if (!regions?.length) return null;
  const anchor = regions[0];
  anchor._worldClimate ||= {
    version: 2,
    carbonBurdenIndex: 0,
    methaneBurdenIndex: 0,
    fossilCarbonIndex: 0,
    landUseCarbonIndex: 0,
    livestockMethaneIndex: 0,
    temperatureAnomalyC: 0,
    oceanHeatIndex: 0,
    seaLevelM: 0,
    lastTick: null,
  };
  const world=anchor._worldClimate;
  if(!Number.isFinite(world.methaneBurdenIndex))world.methaneBurdenIndex=0;
  if(!Number.isFinite(world.livestockMethaneIndex))world.livestockMethaneIndex=0;
  world.version=Math.max(2,Number(world.version)||1);
  for (const region of regions) ensureRegionalClimate(region);
  return world;
}

function forestCarbonFlux(regions) {
  let flux = 0;
  for (const region of regions) {
    const c = ensureRegionalClimate(region);
    const current = positive(region?.forest?.currentStock);
    const previous = Number.isFinite(c.lastForestStock) ? c.lastForestStock : current;
    const delta = current - previous;
    // Clearing releases stored carbon quickly. Regrowth removes it more slowly:
    // young forest does not instantly restore the carbon stock of mature forest.
    if (delta < 0) flux += -delta * 0.000012;
    else if (delta > 0) flux -= delta * 0.000006;
    c.lastForestStock = current;
  }
  return flux;
}

function fossilCarbonFlux(regions) {
  // International commitments are not magic: they represent the fraction of
  // otherwise-emitting activity actually avoided through member-state policy,
  // efficiency, substitution and enforcement. Weak/illegitimate organisations
  // generate low commitments and therefore little physical effect.
  return regions.reduce((sum, region) => {
    const commitment = clamp(region?.internationalPolicy?.climateCommitment || 0, 0, 1);
    const abatement = 1 - commitment * 0.65;
    return sum + positive(region?.protoIndustry?.coalHeatUse) * abatement;
  }, 0) * 0.00002;
}

function livestockMethaneFlux(regions){
  return regions.reduce((sum,region)=>sum+positive(region?.livestockAgriculture?.methaneEmissions),0)*0.0012;
}

function updateGlobalClimate(world, regions, elapsedDays) {
  const years = positive(elapsedDays) / DAYS_PER_YEAR;
  const fossil = fossilCarbonFlux(regions);
  const landUse = forestCarbonFlux(regions);
  const methane = livestockMethaneFlux(regions);
  world.fossilCarbonIndex += fossil;
  world.landUseCarbonIndex += landUse;
  world.livestockMethaneIndex += methane;

  const sinkFraction = 1 - Math.pow(0.5, years / 240);
  world.carbonBurdenIndex = Math.max(0,
    world.carbonBurdenIndex * (1 - sinkFraction) + fossil + landUse);
  const methaneSinkFraction=1-Math.pow(0.5,years/12);
  world.methaneBurdenIndex=Math.max(0,world.methaneBurdenIndex*(1-methaneSinkFraction)+methane);

  // Log-like response keeps very large emissions from producing absurd linear
  // warming while allowing centuries of cumulative industrial activity to matter.
  const carbonForcing = 3.1 * Math.log1p(world.carbonBurdenIndex / 18);
  const methaneForcing = 0.72 * Math.log1p(world.methaneBurdenIndex / 3);
  const equilibriumTemperature = carbonForcing + methaneForcing;
  const thermalResponse = 1 - Math.exp(-years / 24);
  world.temperatureAnomalyC += (equilibriumTemperature - world.temperatureAnomalyC) * thermalResponse;

  // Ocean heat and sea level deliberately lag atmospheric warming by decades.
  const oceanResponse = 1 - Math.exp(-years / 70);
  world.oceanHeatIndex += (Math.max(0, world.temperatureAnomalyC) - world.oceanHeatIndex) * oceanResponse;
  const equilibriumSeaLevel = Math.max(0,
    world.oceanHeatIndex * 0.10 + world.oceanHeatIndex * world.oceanHeatIndex * 0.22);
  const seaResponse = 1 - Math.exp(-years / 95);
  world.seaLevelM += (equilibriumSeaLevel - world.seaLevelM) * seaResponse;
  return { fossil, landUse, methane };
}

function latitudeClimateResponse(region, world) {
  const latitude = Math.abs(Number(region?.centroid?.[1]) || 0);
  const polarAmplification = 0.78 + Math.pow(latitude / 90, 1.5) * 0.62;
  const localTemperature = world.temperatureAnomalyC * polarAmplification;
  const subtropicalDrying = Math.exp(-Math.pow((latitude - 28) / 17, 2));
  const highLatitudeWetting = clamp((latitude - 52) / 30, 0, 1);
  const rainfallChange = -localTemperature * (0.012 + 0.038 * subtropicalDrying) +
    localTemperature * 0.012 * highLatitudeWetting;
  const rainfallMultiplier = clamp(1 + rainfallChange, 0.55, 1.25);
  const evaporationMultiplier = clamp(1 + Math.max(0, localTemperature) * 0.065, 0.8, 1.8);
  const extremeWeatherMultiplier = clamp(1 + Math.max(0, localTemperature) * 0.16, 1, 2.4);
  return { localTemperature, rainfallMultiplier, evaporationMultiplier, extremeWeatherMultiplier };
}

function coastalExposure(region) {
  if (!region?.isCoastal) return 0;
  const terrain = region.terrain || {};
  if (Number.isFinite(terrain.lowElevationFraction)) return clamp(terrain.lowElevationFraction, 0, 1);
  // Until detailed elevation rasters are added, wetlands and flat plains provide
  // a conservative proxy. This is intentionally replaceable, not baked geography.
  const wetland = clamp(terrain.wetland || 0);
  const plains = clamp(terrain.plains || 0);
  const mountains = clamp(terrain.mountains || 0);
  return clamp(0.025 + wetland * 1.7 + plains * 0.11 - mountains * 0.05, 0.015, 0.42);
}

function adaptationCapability(region) {
  const water = hasTech(region, 'water_management') ? 0.18 : 0;
  const hydraulic = hasTech(region, 'hydraulic_engineering') ? 0.34 : 0;
  const finance = clamp(region?.corporateCapital?.financialDepth || 0) * 0.18;
  const state = clamp(region?.militaryFinance?.stateCapacity ?? 0.5) * 0.2;
  return clamp(0.08 + water + hydraulic + finance + state, 0.05, 0.92);
}

function applyCoastalPressure(region, world, elapsedDays) {
  const c = ensureRegionalClimate(region);
  const exposure = coastalExposure(region);
  if (!exposure || world.seaLevelM <= 0) {
    c.coastalInundationPressure = 0;
    c.coastalDisplacementPressure = 0;
    c.adaptationSpend = 0;
    return;
  }
  const years = positive(elapsedDays) / DAYS_PER_YEAR;
  const inundation = clamp(exposure * (world.seaLevelM / 0.75), 0, 1.5);
  const annualProtectionCost = positive(region.population) * inundation * 0.0000025;
  const due = annualProtectionCost * years;
  const capability = adaptationCapability(region);
  const liquid = positive(region.treasury) + positive(region.wallet);
  const affordable = Math.min(due, liquid * Math.min(0.03, years * 0.025));
  let remaining = affordable;
  const fromTreasury = Math.min(positive(region.treasury), remaining);
  region.treasury = positive(region.treasury) - fromTreasury;
  remaining -= fromTreasury;
  const fromWallet = Math.min(positive(region.wallet), remaining);
  region.wallet = positive(region.wallet) - fromWallet;
  const paid = fromTreasury + fromWallet;
  const fundingRatio = due > 0 ? paid / due : 1;
  const protection = clamp(fundingRatio * capability);
  c.coastalInundationPressure = inundation;
  c.adaptationSpend = paid;
  c.coastalDisplacementPressure = clamp(inundation * (1 - protection), 0, 1);
}

function scienceCapacity(region) {
  const education = clamp(region.educationLevel || 0);
  const universities = clamp(region?.medievalSociety?.learning?.universities || region?.renaissance?.universities || 0);
  const information = clamp(region?.renaissance?.informationDensity || region?.earlyModernReform?.printDensity || 0);
  const meteorology = hasTech(region, 'meteorological_networks') ? 0.16 : 0;
  const balloons = hasTech(region, 'weather_balloons') ? 0.28 : 0;
  const atmosphericChemistry = hasTech(region, 'atmospheric_chemistry') ? 0.22 : 0;
  return clamp(education * 0.38 + universities * 0.22 + information * 0.16 + meteorology + balloons + atmosphericChemistry);
}

function knowledgeableSources(region, regionsById) {
  const ids = new Set(region.neighbors || []);
  for (const id of region.tradePartnerIds || []) ids.add(id);
  if (region.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  let count = 0;
  for (const id of ids) if (hasTech(regionsById.get(id), CLIMATE_CHANGE_SCIENCE_TECH_ID)) count += 1;
  return count;
}

function maybeDiscoverClimateChange(region, regionsById, world, elapsedDays, rng) {
  const c = ensureRegionalClimate(region);
  const science = region.climateScience;
  const years = positive(elapsedDays) / DAYS_PER_YEAR;
  const signal = clamp(
    Math.abs(c.temperatureAnomalyC) / 2.5 +
    Math.max(0, c.extremeWeatherMultiplier - 1) * 0.7 +
    c.coastalInundationPressure * 0.45,
    0, 1.5);
  science.evidence = clamp(science.evidence + signal * years * 0.018, 0, 2);
  science.observedYears += years;
  if (hasTech(region, CLIMATE_CHANGE_SCIENCE_TECH_ID)) {
    science.understanding = clamp(science.understanding + years * (0.012 + scienceCapacity(region) * 0.04), 0, 1);
    return false;
  }

  const capacity = scienceCapacity(region);
  const prerequisitesMet = capacity >= 0.22 && science.observedYears >= 5;
  const practice = clamp(capacity * 0.62 + Math.min(1, science.evidence) * 0.38);
  const comprehension = technologyComprehension({ prerequisitesMet, practice, minimumPractice: 0.16 });
  if (comprehension <= 0) return false;
  const evidenceChance = years * 0.00035 * Math.pow(Math.max(0.05, Math.min(1.5, signal)), 1.35);
  const diffusionChance = boundedDiffusionChance(years * 0.006,
    knowledgeableSources(region, regionsById), comprehension);
  const chance = combineIndependentChances(evidenceChance * comprehension, diffusionChance);
  if ((rng?.() ?? Math.random()) >= chance) return false;
  region.unlockedTechIds.add(CLIMATE_CHANGE_SCIENCE_TECH_ID);
  science.understanding = Math.max(science.understanding, 0.12);
  return true;
}

export function climateKnowledgeView(region, world = null) {
  const c = ensureRegionalClimate(region);
  if (!hasTech(region, CLIMATE_CHANGE_SCIENCE_TECH_ID)) {
    return {
      understood: false,
      observations: {
        unusualHeat: c.temperatureAnomalyC > 0.45,
        rainfallShift: Math.abs(c.rainfallMultiplier - 1) > 0.06,
        weatherExtremes: c.extremeWeatherMultiplier > 1.12,
        coastalFlooding: c.coastalInundationPressure > 0.04,
      },
    };
  }
  return {
    understood: true,
    confidence: clamp(region.climateScience?.understanding || 0),
    temperatureTrendC: c.temperatureAnomalyC,
    rainfallMultiplier: c.rainfallMultiplier,
    extremeWeatherMultiplier: c.extremeWeatherMultiplier,
    seaLevelRiseM: positive(world?.seaLevelM),
    attribution: 'human activity, especially fossil-fuel combustion, land-cover change and agricultural methane',
  };
}

export function tickClimateChange(regions, currentTick = 0, elapsedDays = 30, rng = Math.random) {
  const world = ensureClimateWorld(regions);
  if (!world) return [];
  const flux = updateGlobalClimate(world, regions, elapsedDays);
  const byId = new Map(regions.map((region) => [region.id, region]));
  const events = [];
  for (const region of regions) {
    const c = ensureRegionalClimate(region);
    const response = latitudeClimateResponse(region, world);
    c.temperatureAnomalyC = response.localTemperature;
    c.rainfallMultiplier = response.rainfallMultiplier;
    c.evaporationMultiplier = response.evaporationMultiplier;
    c.extremeWeatherMultiplier = response.extremeWeatherMultiplier;
    applyCoastalPressure(region, world, elapsedDays);
    if (maybeDiscoverClimateChange(region, byId, world, elapsedDays, rng)) {
      events.push({ type: 'technology_breakthrough', technologyId: CLIMATE_CHANGE_SCIENCE_TECH_ID, regionId: region.id, currentTick });
    }
  }
  world.lastTick = currentTick;
  world.lastFlux = flux;
  return events;
}
