import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
import { artistPopulation } from '../society/arts.js?v=20260907-art1';
import { finalizeStructuralTransformation, prepareStructuralTransformation } from './structuralTransformation.js?v=20260915-structural1';
export * from './laborCore.js?v=20260905-merchant1';

function committedMerchantCount(region) {
  const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
  const merchants = Math.max(0, Math.round(
    region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0
  ));
  return Math.min(workingAge, merchants);
}

function committedArtistCount(region, availableAfterMerchants) {
  const professionalArtists = Math.max(0, Math.round(artistPopulation(region)));
  const schoolStudents = region.culturalLife?.artSchool?.founded
    ? Math.max(0, Math.round(region.culturalLife.artSchool.students || 0)) : 0;
  const total = professionalArtists + schoolStudents;
  return {
    total: Math.min(Math.max(0, availableAfterMerchants), total),
    professionalArtists,
    schoolStudents,
  };
}

function normaliseReportMetadata(region) {
  // buildReportSection() treats ordinary report entries as production
  // activities and expects them to contain a numeric `workers` field.
  // Metadata reports therefore carry workers: 0 so the existing report UI
  // skips them instead of trying to render them as ordinary production.
  for (const key of ['conflict', 'structuralTransformation']) {
    if (region.report?.[key] && !Number.isFinite(region.report[key].workers)) {
      region.report[key].workers = 0;
    }
  }
}

// Persistent merchants, professional artists, school students and the new
// urban industrial/service support occupations are committed labour, like
// soldiers: they do not become farmers/miners for a convenient week while
// retaining those careers. The structural layer decides how many workers can
// profitably remain in those occupations; the core allocator then sees only
// genuinely allocatable labour.
export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {
  const reservations = [];
  for (const region of regions) {
    const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
    const merchants = committedMerchantCount(region);
    const artists = committedArtistCount(region, workingAge - merchants);
    const structural = prepareStructuralTransformation(region, elapsedDays);
    const availableForStructural = Math.max(0, workingAge - merchants - artists.total);
    const structuralScale = structural.total > availableForStructural && structural.total > 0
      ? availableForStructural / structural.total : 1;
    const industrialSupport = structural.industrialSupport * structuralScale;
    const services = structural.services * structuralScale;
    const reserved = merchants + artists.total + industrialSupport + services;
    reservations.push([region, merchants, artists, industrialSupport, services]);
    if (reserved > 0 && region.demographics) {
      region.demographics.workingAge = Math.max(0, region.demographics.workingAge - reserved);
    }
  }

  try {
    // Forward the time arguments too. Extra arguments are harmless for older
    // laborCore signatures, while current laborCore uses elapsedDays for
    // monthly scheduling, wear and seasonal production scaling.
    tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick, elapsedDays, endDay);
  } finally {
    for (const [region, merchants, artists, industrialSupport, services] of reservations) {
      if (region.demographics) region.demographics.workingAge += merchants + artists.total + industrialSupport + services;
      if (!region.occupations) region.occupations = {};
      // The core allocator already excluded these people, so general labour
      // must not be reduced a second time here.
      region.occupations.trader = merchants;
      region.occupations.artist = Math.min(artists.professionalArtists, artists.total);
      region.occupations.artStudent = Math.max(0, artists.total - region.occupations.artist);
      region.occupations.industrialSupport = industrialSupport;
      region.occupations.services = services;
      finalizeStructuralTransformation(region, elapsedDays);
      normaliseReportMetadata(region);
    }
  }
}
