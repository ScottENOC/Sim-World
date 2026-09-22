import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
import { artistPopulation } from '../society/arts.js?v=20260907-art1';
import { finalizeStructuralTransformation, prepareStructuralTransformation } from './structuralTransformation.js?v=20260915-structural1';
import { tickIndustrialSupply } from './industrialSupply.js?v=20260915-industrial1';
import { enforceHousingEmployment, housingSummary, prepareHousingConstruction } from './housing.js?v=20260916-housing1';
import { tickEmploymentAndHardship } from './employmentAndHardship.js?v=20260918-employment1';
import { tickHouseholdFoodSecurity } from './householdFoodSecurity.js?v=20260919-household-food1';
import { tickLightMetals } from './lightMetals.js?v=20260919-light-metals1';
import { updateCultivatedLand, agriculturalLandSummary } from './agriculturalLand.js?v=20260921-arable1';
import { tickAgriculturalPests } from './agriculturalPests.js?v=20260921-pests2';
import { tickBatterySupplyChain } from './batterySupplyChain.js?v=20260921-battery-chain1';
import { tickSoilDegradation, soilDegradationSummary } from './soilDegradation.js?v=20260921-soil1';
import { tickAgriculturalGenetics, agriculturalGeneticsSummary } from './agriculturalGenetics.js?v=20260921-genetics1';
import { cropBreedingSummary } from './cropBreeding.js?v=20260921-breeding1';
import { tickPrecisionAgriculture, precisionAgricultureSummary } from './precisionAgriculture.js?v=20260921-precision-ag1';
import { tickCropBiotechnology, cropBiotechnologySummary } from './cropBiotechnology.js?v=20260921-biotech1';
import { tickLivestockAgriculture, livestockAgricultureSummary } from './livestockAgriculture.js?v=20260921-livestock1';
import { tickAlternativeProteins, alternativeProteinSummary } from './alternativeProteins.js?v=20260922-alt-protein1';
import { recordMaterialUse, tickCircularEconomy } from './circularEconomy.js?v=20260922-circular1';
import { tickNuclearWarRisk } from '../military/nuclearWarRisk.js?v=20260921-nuclear-risk1';
import { tickNuclearExchange } from '../military/nuclearExchange.js?v=20260921-nuclear-exchange1';
import { measureActivePerformanceDetail, recordActivePerformanceMetric } from '../core/performanceProfiler.js?v=20260912-deep-profiler1';
export * from './laborCore.js?v=20260905-merchant1';
export * from './housing.js?v=20260916-housing1';
export * from './employmentAndHardship.js?v=20260918-employment1';
export * from './householdFoodSecurity.js?v=20260919-household-food1';
export * from './lightMetals.js?v=20260919-light-metals1';
export * from './agriculturalLand.js?v=20260921-arable1';
export * from './agriculturalPests.js?v=20260921-pests2';
export * from './batterySupplyChain.js?v=20260921-battery-chain1';
export * from './soilDegradation.js?v=20260921-soil1';
export * from './agriculturalGenetics.js?v=20260921-genetics1';
export * from './cropBreeding.js?v=20260921-breeding1';
export * from './precisionAgriculture.js?v=20260921-precision-ag1';
export * from './cropBiotechnology.js?v=20260921-biotech1';
export * from './livestockAgriculture.js?v=20260921-livestock1';
export * from './alternativeProteins.js?v=20260922-alt-protein1';
export * from './circularEconomy.js?v=20260922-circular1';

const economyDetail = (label, fn) => measureActivePerformanceDetail(`Economy · ${label}`, fn);
const positive = (value) => Math.max(0, Number(value) || 0);
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

function committedMerchantCount(region) {
  const workingAge = positive(region.demographics?.workingAge);
  const merchants = Math.max(0, Math.round(region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0));
  return Math.min(workingAge, merchants);
}

function committedArtistCount(region, availableAfterMerchants) {
  const professionalArtists = Math.max(0, Math.round(artistPopulation(region)));
  const schoolStudents = region.culturalLife?.artSchool?.founded
    ? Math.max(0, Math.round(region.culturalLife.artSchool.students || 0)) : 0;
  const total = professionalArtists + schoolStudents;
  return { total: Math.min(Math.max(0, availableAfterMerchants), total), professionalArtists, schoolStudents };
}

function hasLivePrecisionAgriculture(region) {
  const s = region.precisionAgriculture;
  if (s && [s.capability, s.adoption, s.sensorCoverage, s.variableRateCoverage].some((value) => positive(value) > 0)) return true;
  return hasTech(region, 'industrial_electrification') && positive(region.electricity?.industrialService) >= 0.12;
}

function hasLiveCropBiotechnology(region) {
  const s = region.cropBiotechnology;
  if (s && [s.capability, s.platformMaturity, s.aggregateAdoption].some((value) => positive(value) > 0)) return true;
  return positive(region.electricity?.industrialService) >= 0.35;
}

function hasLiveAlternativeProteins(region) {
  const s = region.alternativeProteins;
  if (s && [s.precisionFermentationMaturity, s.cultivatedMeatMaturity, s.precisionFermentationScale, s.cultivatedMeatScale, s.totalOutput]
    .some((value) => positive(value) > 0)) return true;
  const biotech = region.cropBiotechnology || {};
  return positive(region.electricity?.industrialService) >= 0.35 &&
    Math.max(positive(biotech.platformMaturity), positive(biotech.capability) * 0.7) >= 0.20;
}

function hasLiveBatteryIndustry(region) {
  if (['lead_acid_batteries', 'advanced_rechargeable_batteries', 'lithium_ion_batteries', 'battery_mineral_processing', 'battery_cell_manufacturing']
    .some((id) => hasTech(region, id))) return true;
  const s = region.batteryIndustry;
  return Boolean(s && (
    positive(s.facilities?.mineralProcessing) > 0 || positive(s.facilities?.cellManufacturing) > 0 ||
    positive(s.experience?.mineralProcessing) > 0 || positive(s.experience?.cellManufacturing) > 0 ||
    positive(s.totalCellsMade) > 0
  ));
}

function hasLiveLightMetals(region) {
  if (region.lightMetals) return true;
  if (hasTech(region, 'advanced_factories') || hasTech(region, 'industrial_electrification')) return true;
  return positive(region.structuralTransformation?.capability?.manufacture) > 0.24;
}

function hasCircularMaterialActivity(state) {
  if (!state) return false;
  for (const bucket of [state.pendingUse, state.inUse, state.scrap]) {
    if (bucket && Object.values(bucket).some((value) => positive(value) > 0)) return true;
  }
  return false;
}

function hasLiveCircularEconomy(region) {
  return hasTech(region, 'advanced_factories') || hasTech(region, 'industrial_electrification') ||
    hasTech(region, 'industrial_materials_recycling') || hasCircularMaterialActivity(region.circularEconomy);
}

function recordExistingMaterialFlows(region, batteryOutput) {
  const d = region.lightMetals?.demand || {};
  recordMaterialUse(region, 'aluminium', d.aluminiumUsed || 0, 'civilian_light_metals');
  recordMaterialUse(region, 'titanium', d.titaniumUsed || 0, 'civilian_light_metals');
  const cells = batteryOutput?.cells || {};
  const lead = positive(cells.lead_acid_battery_cells);
  const advanced = positive(cells.advanced_rechargeable_cells);
  const lithium = positive(cells.lithium_ion_cells);
  recordMaterialUse(region, 'lead', lead * .78, 'batteries');
  recordMaterialUse(region, 'copper', lead * .025, 'batteries');
  recordMaterialUse(region, 'nickel', advanced * .34, 'batteries');
  recordMaterialUse(region, 'steel', advanced * .06, 'batteries');
  recordMaterialUse(region, 'copper', advanced * .04, 'batteries');
  recordMaterialUse(region, 'lithium', lithium * .10, 'batteries');
  recordMaterialUse(region, 'cobalt', lithium * .06, 'batteries');
  recordMaterialUse(region, 'nickel', lithium * .22, 'batteries');
  recordMaterialUse(region, 'graphite', lithium * .30, 'batteries');
  recordMaterialUse(region, 'aluminium', lithium * .035, 'batteries');
  recordMaterialUse(region, 'copper', lithium * .055, 'batteries');
}

function normaliseReportMetadata(region) {
  for (const key of ['conflict','structuralTransformation','industrialSupply','lightMetals','housing','employment','landUse','soil','agriculturalGenetics','cropBreeding','precisionAgriculture','cropBiotechnology','livestockAgriculture','alternativeProteins','agriculturalPests','batteryIndustry','circularEconomy']) {
    if (region.report?.[key] && !Number.isFinite(region.report[key].workers)) region.report[key].workers = 0;
  }
}

export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {
  const reservations = [];
  economyDetail('reservation and land setup', () => {
    for (const region of regions) {
      updateCultivatedLand(region);
      tickSoilDegradation(region, elapsedDays);
      updateCultivatedLand(region);
      const previousOccupations = { ...(region.occupations || {}) };
      const housingConstruction = prepareHousingConstruction(region, elapsedDays);
      const fullWorkingAge = positive(region.demographics?.workingAge);
      const housingBuilders = Math.min(fullWorkingAge, positive(housingConstruction.workers));
      if (housingBuilders > 0 && region.demographics) region.demographics.workingAge = Math.max(0, fullWorkingAge - housingBuilders);
      const workingAge = positive(region.demographics?.workingAge);
      const merchants = committedMerchantCount(region);
      const artists = committedArtistCount(region, workingAge - merchants);
      const structural = prepareStructuralTransformation(region, elapsedDays);
      const availableForStructural = Math.max(0, workingAge - merchants - artists.total);
      const structuralScale = structural.total > availableForStructural && structural.total > 0 ? availableForStructural / structural.total : 1;
      const industrialSupport = structural.industrialSupport * structuralScale;
      const services = structural.services * structuralScale;
      const reserved = merchants + artists.total + industrialSupport + services;
      reservations.push([region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services]);
      if (reserved > 0 && region.demographics) region.demographics.workingAge = Math.max(0, region.demographics.workingAge - reserved);
    }
  });

  economyDetail('agricultural genetics', () => tickAgriculturalGenetics(regions, elapsedDays));

  let precisionActors = 0, biotechActors = 0, alternativeProteinActors = 0;
  economyDetail('agriculture extensions', () => {
    for (const region of regions) {
      if (hasLivePrecisionAgriculture(region)) { tickPrecisionAgriculture(region, elapsedDays); precisionActors += 1; }
      if (hasLiveCropBiotechnology(region)) { tickCropBiotechnology(region, elapsedDays); biotechActors += 1; }
      tickLivestockAgriculture(region, elapsedDays);
      if (hasLiveAlternativeProteins(region)) { tickAlternativeProteins(region, elapsedDays); alternativeProteinActors += 1; }
    }
  });
  economyDetail('agricultural pests', () => tickAgriculturalPests(regions, elapsedDays, rng));

  try {
    economyDetail('core labour economy', () => tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick, elapsedDays, endDay));
  } finally {
    let batteryActors = 0, lightMetalActors = 0, circularActors = 0;
    economyDetail('post-core industry and reports', () => {
      for (const [region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services] of reservations) {
        if (region.demographics) region.demographics.workingAge += housingBuilders + merchants + artists.total + industrialSupport + services;
        region.occupations ||= {};
        region.occupations.trader = merchants;
        region.occupations.artist = Math.min(artists.professionalArtists, artists.total);
        region.occupations.artStudent = Math.max(0, artists.total - region.occupations.artist);
        region.occupations.industrialSupport = industrialSupport;
        region.occupations.services = services;
        region.occupations.housingBuilder = housingBuilders;
        finalizeStructuralTransformation(region, elapsedDays);
        tickIndustrialSupply(region, elapsedDays);

        if (hasLiveLightMetals(region)) { tickLightMetals(region, elapsedDays); lightMetalActors += 1; }
        let batteryOutput = null;
        if (hasLiveBatteryIndustry(region)) { batteryOutput = tickBatterySupplyChain(region, elapsedDays); batteryActors += 1; }
        recordExistingMaterialFlows(region, batteryOutput);
        if (hasLiveCircularEconomy(region)) { tickCircularEconomy(region, elapsedDays); circularActors += 1; }

        tickHouseholdFoodSecurity(region, elapsedDays);
        const housingEmployment = enforceHousingEmployment(region, previousOccupations);
        region.report ||= {};
        region.report.housing = {
          workers: Math.round(housingBuilders),
          capacityBuilt: housingConstruction.capacityBuilt || 0,
          materials: housingConstruction.materials || { wood: 0, stone: 0, clay: 0 },
          blockedWorkers: housingEmployment.blockedTotal || 0,
          blockedBySite: housingEmployment.blockedBySite || {},
          ...housingSummary(region),
        };
        region.report.industrialSupply = {
          workers: 0,
          capability: { ...region.industrialSupply.capability },
          outputCapacity: { ...region.industrialSupply.outputCapacity },
        };
        if (batteryOutput) region.report.batteryIndustry = { workers: 0, ...batteryOutput, shortages: { ...(region.batteryIndustry?.shortages || {}) } };
        updateCultivatedLand(region);
        region.report.landUse = { workers: 0, ...agriculturalLandSummary(region) };
        region.report.soil = { workers: 0, ...soilDegradationSummary(region) };
        region.report.agriculturalGenetics = { workers: 0, ...agriculturalGeneticsSummary(region) };
        region.report.cropBreeding = { workers: 0, ...cropBreedingSummary(region) };
        if (region.precisionAgriculture) region.report.precisionAgriculture = { workers: 0, ...precisionAgricultureSummary(region) };
        if (region.cropBiotechnology) region.report.cropBiotechnology = { workers: 0, ...cropBiotechnologySummary(region) };
        region.report.livestockAgriculture = { workers: 0, ...livestockAgricultureSummary(region) };
        if (region.alternativeProteins) region.report.alternativeProteins = { workers: 0, ...alternativeProteinSummary(region) };
        if (region.report.farming) {
          region.report.farming.land = { ...region.report.landUse };
          region.report.farming.soil = { ...region.report.soil };
          region.report.farming.genetics = { ...region.report.agriculturalGenetics };
          region.report.farming.breeding = { ...region.report.cropBreeding };
          if (region.report.precisionAgriculture) region.report.farming.precisionAgriculture = { ...region.report.precisionAgriculture };
          if (region.report.cropBiotechnology) region.report.farming.biotechnology = { ...region.report.cropBiotechnology };
          region.report.farming.livestock = { ...region.report.livestockAgriculture };
          if (region.report.alternativeProteins) region.report.farming.alternativeProteins = { ...region.report.alternativeProteins };
          region.report.farming.pests = { ...(region.report.agriculturalPests || {}) };
        }
        normaliseReportMetadata(region);
      }
    });
    recordActivePerformanceMetric('Economy precision agriculture actors', precisionActors);
    recordActivePerformanceMetric('Economy crop biotechnology actors', biotechActors);
    recordActivePerformanceMetric('Economy alternative protein actors', alternativeProteinActors);
    recordActivePerformanceMetric('Economy light metals actors', lightMetalActors);
    recordActivePerformanceMetric('Economy battery actors', batteryActors);
    recordActivePerformanceMetric('Economy circular economy actors', circularActors);
  }

  const activeWars = globalThis.__worldsim?.activeWars || [];
  economyDetail('nuclear economy effects', () => {
    tickNuclearWarRisk(regions, activeWars, currentTick ?? 0, elapsedDays, rng);
    const nuclearEvents = tickNuclearExchange(regions, activeWars, currentTick ?? 0, elapsedDays, rng);
    if (nuclearEvents.length && globalThis.__worldsim) {
      globalThis.__worldsim.events ||= [];
      globalThis.__worldsim.events.push(...nuclearEvents);
    }
  });
  return economyDetail('employment and hardship', () => tickEmploymentAndHardship(regions, currentTick ?? 0, elapsedDays, {
    playerPolityId: globalThis.__worldsim?.activePlayerPolityId || null,
  }));
}
