import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
import { artistPopulation } from '../society/arts.js?v=20260907-art1';
export * from './laborCore.js?v=20260905-merchant1';

function committedMerchantCount(region) {
  const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
  const merchants = Math.max(0, Math.round(
    region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0
  ));
  return Math.min(workingAge, merchants);
}

function committedArtistCount(region, availableAfterMerchants) {
  const artists = Math.max(0, Math.round(artistPopulation(region)));
  return Math.min(Math.max(0, availableAfterMerchants), artists);
}

function normaliseReportMetadata(region) {
  // buildReportSection() treats ordinary report entries as production
  // activities and expects them to contain a numeric `workers` field.
  // `conflict` is metadata produced by laborCore rather than an activity, so
  // give it an explicit zero-worker marker. This makes the existing report UI
  // skip it instead of calling toLocaleString() on undefined and aborting the
  // whole simulation tick while a region sheet is open.
  if (region.report?.conflict && !Number.isFinite(region.report.conflict.workers)) {
    region.report.conflict.workers = 0;
  }
}

// Persistent merchants and professional artists are committed labour, like
// soldiers: they do not become farmers/miners for a convenient week while
// retaining their careers. Keep the core allocator unchanged by temporarily
// presenting it with only genuinely allocatable workers.
export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {
  const reservations = [];
  for (const region of regions) {
    const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
    const merchants = committedMerchantCount(region);
    const artists = committedArtistCount(region, workingAge - merchants);
    const reserved = merchants + artists;
    reservations.push([region, merchants, artists]);
    if (reserved > 0 && region.demographics) {
      region.demographics.workingAge = Math.max(0, region.demographics.workingAge - reserved);
    }
  }

  try {
    // Forward the time arguments too. Extra arguments are harmless for older
    // laborCore signatures, while current laborCore uses elapsedDays for
    // monthly scheduling, wear and seasonal production scaling.
    tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick, elapsedDays, endDay);
    for (const region of regions) normaliseReportMetadata(region);
  } finally {
    for (const [region, merchants, artists] of reservations) {
      if (region.demographics) region.demographics.workingAge += merchants + artists;
      if (!region.occupations) region.occupations = {};
      // The core allocator already excluded these people, so general labour
      // must not be reduced a second time here.
      region.occupations.trader = merchants;
      region.occupations.artist = artists;
    }
  }
}
