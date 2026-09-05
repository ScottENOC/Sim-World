import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
export * from './laborCore.js?v=20260905-merchant1';

function committedMerchantCount(region) {
  const workingAge = Math.max(0, Number(region.demographics?.workingAge) || 0);
  const merchants = Math.max(0, Math.round(
    region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0
  ));
  return Math.min(workingAge, merchants);
}

// Persistent merchants are committed labour, like soldiers: they do not
// become farmers/miners/craftspeople for a convenient week while retaining
// their merchant career and ongoing ventures. Keep the underlying labour
// engine unchanged by presenting it with only genuinely allocatable workers.
export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null) {
  const reservations = [];
  for (const region of regions) {
    const merchants = committedMerchantCount(region);
    reservations.push([region, merchants]);
    if (merchants > 0 && region.demographics) {
      region.demographics.workingAge = Math.max(0, region.demographics.workingAge - merchants);
    }
  }

  try {
    tickCoreEconomy(regions, seaRegions, toolTypes, rng, currentTick);
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
