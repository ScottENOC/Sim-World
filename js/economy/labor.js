import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
export * from './laborCore.js?v=20260905-merchant1';

function committedMerchantCount(region) {
  const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
  const merchants = Math.max(0, Math.round(
    region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0
  ));
  return Math.min(workingAge, merchants);
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

// Persistent merchants are committed labour, like soldiers: they do not
// become farmers/miners/craftspeople for a convenient week while retaining
// their merchant career and ongoing ventures. Keep the underlying labour
// engine unchanged by presenting it with only genuinely allocatable workers.
export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, endDay = null) {
  const reservations = [];
  for (const region of regions) {
    const merchants = committedMerchantCount(region);
    reservations.push([region, merchants]);
    if (merchants > 0 && region.demographics) {
      region.demographics.workingAge = Math.max(0, region.demographics.workingAge - merchants);
    }
  }

  try {
    // Forward the time arguments too. Extra arguments are harmless for older
    // laborCore signatures, while current laborCore uses elapsedDays for
    // monthly scheduling, wear and seasonal production scaling.
    tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick, elapsedDays, endDay);
    for (const region of regions) normaliseReportMetadata(region);
  } finally {
    for (const [region, merchants] of reservations) {
      if (region.demographics) region.demographics.workingAge += merchants;
      if (!region.occupations) region.occupations = {};
      // The core allocator already excluded these people, so general labour
      // must not be reduced a second time here.
      region.occupations.trader = merchants;
    }
  }
}
