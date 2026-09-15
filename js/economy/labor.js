import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
import { artistPopulation } from '../society/arts.js?v=20260907-art1';
import { finalizeStructuralTransformation, prepareStructuralTransformation } from './structuralTransformation.js?v=20260915-structural1';
import { tickIndustrialSupply } from './industrialSupply.js?v=20260915-industrial1';
export * from './laborCore.js?v=20260905-merchant1';

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
  for (const key of ['conflict', 'structuralTransformation', 'industrialSupply']) {
    if (region.report?.[key] && !Number.isFinite(region.report[key].workers)) region.report[key].workers = 0;
  }
}

export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {
  const reservations = [];
  for (const region of regions) {
    const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
    const merchants = committedMerchantCount(region);
    const artists = committedArtistCount(region, workingAge - merchants);
    const structural = prepareStructuralTransformation(region, elapsedDays);
    const availableForStructural = Math.max(0, workingAge - merchants - artists.total);
    const structuralScale = structural.total > availableForStructural && structural.total > 0 ? availableForStructural / structural.total : 1;
    const industrialSupport = structural.industrialSupport * structuralScale;
    const services = structural.services * structuralScale;
    const reserved = merchants + artists.total + industrialSupport + services;
    reservations.push([region, merchants, artists, industrialSupport, services]);
    if (reserved > 0 && region.demographics) region.demographics.workingAge = Math.max(0, region.demographics.workingAge - reserved);
  }

  try {
    tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick, elapsedDays, endDay);
  } finally {
    for (const [region, merchants, artists, industrialSupport, services] of reservations) {
      if (region.demographics) region.demographics.workingAge += merchants + artists.total + industrialSupport + services;
      if (!region.occupations) region.occupations = {};
      region.occupations.trader = merchants;
      region.occupations.artist = Math.min(artists.professionalArtists, artists.total);
      region.occupations.artStudent = Math.max(0, artists.total - region.occupations.artist);
      region.occupations.industrialSupport = industrialSupport;
      region.occupations.services = services;
      finalizeStructuralTransformation(region, elapsedDays);
      tickIndustrialSupply(region, elapsedDays);
      region.report ||= {};
      region.report.industrialSupply = { workers: 0, capability: { ...region.industrialSupply.capability }, outputCapacity: { ...region.industrialSupply.outputCapacity } };
      normaliseReportMetadata(region);
    }
  }
}