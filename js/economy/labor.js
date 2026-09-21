import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
import { artistPopulation } from '../society/arts.js?v=20260907-art1';
import { finalizeStructuralTransformation, prepareStructuralTransformation } from './structuralTransformation.js?v=20260915-structural1';
import { tickIndustrialSupply } from './industrialSupply.js?v=20260915-industrial1';
import { enforceHousingEmployment, housingSummary, prepareHousingConstruction } from './housing.js?v=20260916-housing1';
import { tickEmploymentAndHardship } from './employmentAndHardship.js?v=20260918-employment1';
import { tickHouseholdFoodSecurity } from './householdFoodSecurity.js?v=20260919-household-food1';
import { tickLightMetals } from './lightMetals.js?v=20260919-light-metals1';
import { tickAgriculturalLand, agriculturalLandSummary } from './agriculturalLand.js?v=20260921-arable1';
import { tickAgriculturalPests } from './agriculturalPests.js?v=20260921-pests1';
import { tickBatterySupplyChain } from './batterySupplyChain.js?v=20260921-battery-chain1';
import { tickSoilDegradation, soilDegradationSummary } from './soilDegradation.js?v=20260921-soil1';
export * from './laborCore.js?v=20260905-merchant1';
export * from './housing.js?v=20260916-housing1';
export * from './employmentAndHardship.js?v=20260918-employment1';
export * from './householdFoodSecurity.js?v=20260919-household-food1';
export * from './lightMetals.js?v=20260919-light-metals1';
export * from './agriculturalLand.js?v=20260921-arable1';
export * from './agriculturalPests.js?v=20260921-pests1';
export * from './batterySupplyChain.js?v=20260921-battery-chain1';
export * from './soilDegradation.js?v=20260921-soil1';

function committedMerchantCount(region) {
  const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
  const merchants = Math.max(0, Math.round(region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0));
  return Math.min(workingAge, merchants);
}

function committedArtistCount(region, availableAfterMerchants) {
  const professionalArtists = Math.max(0, Math.round(artistPopulation(region)));
  const schoolStudents = region.culturalLife?.artSchool?.founded ? Math.max(0, Math.round(region.culturalLife.artSchool.students || 0)) : 0;
  const total = professionalArtists + schoolStudents;
  return { total: Math.min(Math.max(0, availableAfterMerchants), total), professionalArtists, schoolStudents };
}

function normaliseReportMetadata(region) {
  for (const key of ['conflict', 'structuralTransformation', 'industrialSupply', 'lightMetals', 'housing', 'employment', 'landUse', 'soil', 'agriculturalPests', 'batteryIndustry']) {
    if (region.report?.[key] && !Number.isFinite(region.report[key].workers)) region.report[key].workers = 0;
  }
}

export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {
  const reservations = [];
  for (const region of regions) {
    tickAgriculturalLand(region);
    // Soil responds to the previous period's cultivation and weather, then its
    // degraded/recovered effective land quality feeds this period's economy.
    tickSoilDegradation(region, elapsedDays);
    tickAgriculturalLand(region);
    const previousOccupations = { ...(region.occupations || {}) };
    const housingConstruction = prepareHousingConstruction(region, elapsedDays);
    const fullWorkingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
    const housingBuilders = Math.min(fullWorkingAge, Math.max(0, housingConstruction.workers || 0));
    if (housingBuilders > 0 && region.demographics) region.demographics.workingAge = Math.max(0, fullWorkingAge - housingBuilders);

    const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
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

  // Pest ecology advances once per economy tick. It reads the previous weather
  // state plus current crop mix and established trade contacts, giving outbreaks
  // memory rather than making them a second instantaneous weather roll.
  tickAgriculturalPests(regions, elapsedDays, rng);

  try {
    tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick, elapsedDays, endDay);
  } finally {
    for (const [region, housingBuilders, housingConstruction, previousOccupations, merchants, artists, industrialSupport, services] of reservations) {
      if (region.demographics) region.demographics.workingAge += housingBuilders + merchants + artists.total + industrialSupport + services;
      if (!region.occupations) region.occupations = {};
      region.occupations.trader = merchants;
      region.occupations.artist = Math.min(artists.professionalArtists, artists.total);
      region.occupations.artStudent = Math.max(0, artists.total - region.occupations.artist);
      region.occupations.industrialSupport = industrialSupport;
      region.occupations.services = services;
      region.occupations.housingBuilder = housingBuilders;
      finalizeStructuralTransformation(region, elapsedDays);
      tickIndustrialSupply(region, elapsedDays);
      tickLightMetals(region, elapsedDays);
      const batteryOutput = tickBatterySupplyChain(region, elapsedDays);
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
      region.report.industrialSupply = { workers: 0, capability: { ...region.industrialSupply.capability }, outputCapacity: { ...region.industrialSupply.outputCapacity } };
      region.report.batteryIndustry = { workers: 0, ...batteryOutput, shortages: { ...(region.batteryIndustry?.shortages || {}) } };
      tickAgriculturalLand(region);
      region.report.landUse = { workers: 0, ...agriculturalLandSummary(region) };
      region.report.soil = { workers: 0, ...soilDegradationSummary(region) };
      if (region.report.farming) {
        region.report.farming.land = { ...region.report.landUse };
        region.report.farming.soil = { ...region.report.soil };
        region.report.farming.pests = { ...(region.report.agriculturalPests || {}) };
      }
      normaliseReportMetadata(region);
    }
  }
  return tickEmploymentAndHardship(regions, currentTick ?? 0, elapsedDays, { playerPolityId: globalThis.__worldsim?.activePlayerPolityId || null });
}
