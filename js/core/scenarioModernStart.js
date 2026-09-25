import { seedAutomobileOwnership } from '../economy/civilianTransport.js';
import { syncRailwayConnectionEntry } from '../economy/railways.js';

const arr = (value) => Array.isArray(value) ? value : [];
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const max = (a, b) => Math.max(num(a), num(b));

function mergedSettings(profile, countryId) {
  return { ...(profile?.regionalDefaults || {}), ...(profile?.countryOverrides?.[countryId] || {}) };
}

function modernCultureLabel(region, countryId) {
  return region?.governance?.sovereignPolityName || region?.polityName || String(countryId || 'Modern society');
}

function applyModernCulture(region, countryId) {
  if (!countryId) return false;
  const label = modernCultureLabel(region, countryId);
  const identityId = `modern_civic:${countryId}`;
  const identity = {
    id: identityId,
    label,
    familyId: `modern_national:${countryId}`,
    kind: 'modern_civic',
    confidence: 0.95,
    createdYear: 2027,
    parentIds: [],
    parentWeights: {},
    originRegionId: region.id,
  };
  region.cultureState ||= {};
  region.cultureState.identityArchive = [identity];
  region.cultureState.elapsedYears = 0;
  region.cultureState.tickAccumulatorYears = 0;
  region.cultureState.isolationYears = 0;
  region.cultureState.polityYears = 0;
  region.cultureState.fusionIds = [];
  region.cultureState.branchIds = [];
  region.cultureGroups = [{
    identityId,
    cultureId: identityId,
    ancestryId: identityId,
    ancestry: { [identityId]: 1 },
    affiliations: [`nation:${countryId}`],
    share: 1,
    identityStrength: 0.72,
    cohabitationYears: 0,
  }];
  region.cultureFamiliarity = {};
  region._cultureReady = false;
  region._cultureAffinityCache = {};
  region.scenarioModernCultureApplied = true;
  return true;
}

function regionCountryId(region) {
  return region?.scenarioCountryId || region?.governance?.scenarioCountryId || null;
}

function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function regionalProfileEntry(profile, bucket, region) {
  const table = profile?.[bucket] || {};
  for (const key of [region?.id, slug(region?.name), region?.name]) {
    const value = table?.[key];
    if (value && typeof value === 'object') return value;
  }
  return null;
}

function explicitPopulationWeight(region, profile) {
  const weights = profile?.regionalPopulationWeights || {};
  const candidates = [region?.id, slug(region?.name), region?.name];
  for (const key of candidates) {
    const weight = Number(weights?.[key]);
    if (Number.isFinite(weight) && weight >= 0) return weight;
  }
  return null;
}

function explicitAutomobileRate(region, profile) {
  const rates = profile?.regionalAutomobilesPer1000 || {};
  const candidates = [region?.id, slug(region?.name), region?.name];
  for (const key of candidates) {
    const rate = Number(rates?.[key]);
    if (Number.isFinite(rate) && rate >= 0) return rate;
  }
  return null;
}

function applyModernPopulation(regions, profile) {
  const targets = profile?.countryPopulationTargets || {};
  const fallbackMultiplier = Math.max(1, num(profile.populationMultiplier, 1));
  const byCountry = new Map();
  for (const region of regions) {
    const countryId = regionCountryId(region);
    if (!countryId) continue;
    if (!byCountry.has(countryId)) byCountry.set(countryId, []);
    byCountry.get(countryId).push(region);
  }

  let countriesTargeted = 0;
  let regionsTargeted = 0;
  for (const [countryId, countryRegions] of byCountry) {
    const target = Number(targets[countryId]);
    if (!Number.isFinite(target) || target <= 0) continue;
    countriesTargeted += 1;

    const explicit = countryRegions.map((region) => explicitPopulationWeight(region, profile));
    const explicitTotal = Math.min(0.95, explicit.reduce((sum, weight) => sum + (weight ?? 0), 0));
    const remainingShare = Math.max(0.05, 1 - explicitTotal);
    const unweightedRegions = countryRegions.filter((_, index) => explicit[index] === null);
    const rawTotal = unweightedRegions.reduce((sum, region) => sum + Math.max(1, num(region.population, 1)), 0);

    let assigned = 0;
    countryRegions.forEach((region, index) => {
      let share;
      if (explicit[index] !== null) {
        share = explicit[index];
      } else if (unweightedRegions.length) {
        share = remainingShare * Math.max(1, num(region.population, 1)) / Math.max(1, rawTotal);
      } else {
        share = 1 / countryRegions.length;
      }
      region.population = Math.max(1, Math.round(target * share));
      region.scenarioModernBaselineApplied = true;
      region.scenarioPopulationSource = 'country_target';
      assigned += region.population;
      regionsTargeted += 1;
    });

    const difference = Math.round(target) - assigned;
    if (difference !== 0 && countryRegions.length) {
      const largest = countryRegions.reduce((best, region) => region.population > best.population ? region : best, countryRegions[0]);
      largest.population = Math.max(1, largest.population + difference);
    }
  }

  for (const region of regions) {
    if (region.scenarioModernBaselineApplied) continue;
    region.population = Math.max(1, Math.round(num(region.population, 1) * fallbackMultiplier));
    region.scenarioModernBaselineApplied = true;
    region.scenarioPopulationSource = 'fallback_multiplier';
  }

  return {
    model: countriesTargeted > 0 ? 'country-targets' : 'fallback-multiplier',
    countriesTargeted,
    regionsTargeted,
    fallbackMultiplier,
  };
}

function ensureScenarioConstruction(region) {
  region.construction ||= { projects: [], completed: {}, workersReserved: 0, lastWeek: null, assets: [] };
  region.construction.projects ||= [];
  region.construction.completed ||= {};
  region.construction.assets ||= [];
  return region.construction;
}

function seedInfrastructure(region, typeId) {
  const state = ensureScenarioConstruction(region);
  if (!state.assets.some((asset) => asset.typeId === typeId)) {
    state.assets.push({ id: `scenario-modern:${region.id}:${typeId}`, typeId, condition: 1, scale: 1, scenarioSeeded: true });
  }
  state.completed[typeId] = Math.max(1, Number(state.completed[typeId]) || 0);
}

function seedRegionalInfrastructure(regions, profile) {
  let seededAssets = 0;
  for (const region of regions) {
    const countryId = regionCountryId(region);
    const defaults = arr(profile?.countryInfrastructureDefaults?.[countryId]);
    const regional = arr(profile?.regionalInfrastructure?.[slug(region?.name)] ?? profile?.regionalInfrastructure?.[region?.id]);
    for (const typeId of [...new Set([...defaults, ...regional])]) {
      const before = ensureScenarioConstruction(region).assets.length;
      seedInfrastructure(region, typeId);
      if (ensureScenarioConstruction(region).assets.length > before) seededAssets += 1;
    }
  }

  const bySlug = new Map(regions.map((region) => [slug(region?.name), region]));
  let seededRailLinks = 0;
  for (const link of arr(profile?.regionalRailLinks)) {
    const a = bySlug.get(slug(link?.from));
    const b = bySlug.get(slug(link?.to));
    if (!a || !b || regionCountryId(a) !== regionCountryId(b)) continue;
    const capacity = Math.max(0.05, num(link.capacity, 0.7));
    const lengthKm = Math.max(1, num(link.lengthKm, 80));
    const maxSpeedKph = Math.max(25, num(link.maxSpeedKph, 100));
    const lineId = `scenario-modern:rail:${slug(link?.id || `${a.id}-${b.id}-${seededRailLinks + 1}`)}`;
    const operatorPolityId = a.governance?.sovereignPolityId || regionCountryId(a);
    const highSpeedCapable = Boolean(link.highSpeedCapable || maxSpeedKph >= 200);
    const speedFactor = Math.max(0.35, Math.min(1.9, maxSpeedKph / 160));
    syncRailwayConnectionEntry(a, b, {
      lineId,
      status: 'operational',
      effectiveCapacity: capacity,
      passengerCapacity: capacity * (.65 + speedFactor * .35),
      freightCapacity: capacity,
      lengthKm,
      maxSpeedKph,
      highSpeedCapable,
      electrification: link.electrification || 'none',
      rollingStock: link.rollingStock || { steam: 0, diesel: 1, electric: 0, highSpeedElectric: 0 },
      operatorPolityId,
      scenarioSeeded: true,
    });
    seededRailLinks += 1;
  }
  return { seededAssets, seededRailLinks };
}

function seedRegionalStarterEconomy(region, profile) {
  const stock = regionalProfileEntry(profile, 'regionalStarterStocksPer1000', region);
  const industrial = regionalProfileEntry(profile, 'regionalIndustrialInventoryPer1000', region);
  const machinery = regionalProfileEntry(profile, 'regionalAgriculturalMachineryPer1000', region);
  if (!stock && !industrial && !machinery) return false;

  const scale = Math.max(0.001, num(region.population, 1) / 1000);
  region.stockpile ||= {};
  region.industrialSupply ||= {};
  region.industrialSupply.inventory ||= {};

  for (const [resourceId, per1000] of Object.entries(stock || {})) {
    region.stockpile[resourceId] = max(region.stockpile[resourceId], nonNegative(per1000) * scale);
  }
  for (const [resourceId, per1000] of Object.entries(industrial || {})) {
    region.industrialSupply.inventory[resourceId] = max(region.industrialSupply.inventory[resourceId], nonNegative(per1000) * scale);
  }

  if (machinery) {
    region.agriculturalMachinery ||= {};
    const tractors = nonNegative(machinery.tractors) * scale;
    const combines = nonNegative(machinery.combines) * scale;
    region.agriculturalMachinery.tractors = max(region.agriculturalMachinery.tractors, tractors);
    region.agriculturalMachinery.combines = max(region.agriculturalMachinery.combines, combines);
    region.agriculturalMachinery.serviceableTractors = max(region.agriculturalMachinery.serviceableTractors, tractors);
    region.agriculturalMachinery.serviceableCombines = max(region.agriculturalMachinery.serviceableCombines, combines);
    region.agriculturalMachinery.maintenanceReadiness = max(region.agriculturalMachinery.maintenanceReadiness, 0.95);
    region.agriculturalMachinery.fuelSatisfaction = max(region.agriculturalMachinery.fuelSatisfaction, 0.95);
  }

  region.scenarioModernStarterEconomyApplied = true;
  return true;
}

function nonNegative(value) {
  return Math.max(0, Number(value) || 0);
}

export function applyModernScenarioBaseline(world, profile = {}) {
  const regions = arr(world?.regions);
  const commonTechIds = arr(profile.commonTechIds);
  const touchedCountries = new Set();
  let modernCultureRegions = 0;
  let automobileRegions = 0;
  let starterEconomyRegions = 0;
  const population = applyModernPopulation(regions, profile);

  for (const region of regions) {
    const countryId = regionCountryId(region);
    const settings = mergedSettings(profile, countryId);
    if (countryId) touchedCountries.add(countryId);

    if (!region.scenarioModernCultureApplied && applyModernCulture(region, countryId)) modernCultureRegions += 1;

    region.unlockedTechIds ||= new Set();
    for (const techId of commonTechIds) region.unlockedTechIds.add(techId);

    region.electricity ||= {};
    region.electricity.service = max(region.electricity.service, settings.electricityService);
    region.electricity.industrialService = max(region.electricity.industrialService, settings.industrialElectricityService);

    region.structuralTransformation ||= {};
    region.structuralTransformation.capability ||= {};
    region.structuralTransformation.capability.manufacture = max(region.structuralTransformation.capability.manufacture, settings.manufacturingCapability);

    region.industrialSupply ||= {};
    region.industrialSupply.capability ||= {};
    region.industrialSupply.inventory ||= {};
    region.industrialSupply.capability.precision_machining = max(region.industrialSupply.capability.precision_machining, settings.precisionMachiningCapability);

    region.industrialPlants ||= {};
    region.industrialPlants.componentCapability ||= {};
    region.industrialPlants.componentCapability.electronics = max(region.industrialPlants.componentCapability.electronics, settings.electronicsCapability);
    region.industrialPlants.componentCapability.radio_navigation = max(region.industrialPlants.componentCapability.radio_navigation, settings.radioNavigationCapability);
    region.industrialPlants.componentCapability.optics = max(region.industrialPlants.componentCapability.optics, settings.opticsCapability);

    const regionPopulation = num(region.population, 1);
    region.treasury = max(region.treasury, regionPopulation * num(settings.treasuryPerPerson));
    region.stockpile ||= {};
    region.stockpile.steel = max(region.stockpile.steel, regionPopulation * num(settings.steelStockPerPerson));
    region.stockpile.aviation_fuel = max(region.stockpile.aviation_fuel, regionPopulation * num(settings.aviationFuelStockPerPerson));
    region.stockpile.advanced_rechargeable_cells = max(region.stockpile.advanced_rechargeable_cells, regionPopulation * num(settings.batteryCellsPerPerson));
    region.stockpile.lithium_ion_cells = max(region.stockpile.lithium_ion_cells, regionPopulation * num(settings.batteryCellsPerPerson));
    region.industrialSupply.inventory.machine_components = max(region.industrialSupply.inventory.machine_components, regionPopulation * num(settings.machineComponentsPerPerson));

    if (seedRegionalStarterEconomy(region, profile)) starterEconomyRegions += 1;

    if (!region.scenarioAutomobileBaselineApplied) {
      const regionalRate = explicitAutomobileRate(region, profile);
      seedAutomobileOwnership(region, regionalRate ?? num(settings.automobilesPer1000), {
        scenarioBaseline: true,
        source: regionalRate === null ? 'country_or_scenario_default' : 'regional_override',
      });
      automobileRegions += 1;
    }

    region.army ||= { personnel: 0, away: 0 };
    region.army.personnel = max(region.army.personnel, regionPopulation * num(settings.standingForceShare));
    region.targetArmySize = max(region.targetArmySize, region.army.personnel);

    if (num(settings.orbitalSupport) > 0) {
      region.orbitalSupport ||= {};
      region.orbitalSupport.droneBeyondLineOfSightControl = max(region.orbitalSupport.droneBeyondLineOfSightControl, settings.orbitalSupport);
      region.orbitalSupport.navigation = max(region.orbitalSupport.navigation, settings.orbitalSupport);
    }
  }

  const infrastructure = seedRegionalInfrastructure(regions, profile);
  world.scenarioModernBaseline = {
    applied: true,
    scenarioId: profile.scenarioId || world?.scenarioState?.id || null,
    regionCount: regions.length,
    countryCount: touchedCountries.size,
    modernCultureRegions,
    automobileRegions,
    starterEconomyRegions,
    seededInfrastructureAssets: infrastructure.seededAssets,
    seededRailLinks: infrastructure.seededRailLinks,
    populationModel: population.model,
    populationCountriesTargeted: population.countriesTargeted,
    populationRegionsTargeted: population.regionsTargeted,
    calibrationOnly: true,
  };
  return world.scenarioModernBaseline;
}
