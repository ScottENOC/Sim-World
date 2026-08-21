import { localPrice, TRADABLE_RESOURCES } from './prices.js';

const LAND_ADJACENT_COST = 0.1;   // flat — established overland paths, land-border regions only
const SEA_COST_PER_KM = 0.001;    // everything else goes by sea, cost scales with distance

const MAX_EXPORT_FRACTION_PER_TICK = 0.15; // don't let one great trade empty a whole stockpile in a week
const TRADE_UNITS_PER_TRADER = 5;          // goods-units one trader can move per week (flat, placeholder)
const MIN_PROFIT_THRESHOLD = 0.05;         // ignore noise-level price gaps, not worth a trip

export function routeCost(regionA, regionB) {
  if (regionA.neighbors.includes(regionB.id)) return LAND_ADJACENT_COST;
  return SEA_COST_PER_KM * regionA.distanceKm[regionB.id];
}

// All profitable (resource, destination) exports this region *could* make
// this tick, ignoring labor for now — executeTrades() below is what caps
// this by how many traders are actually available.
function findOpportunities(region, regions) {
  const opportunities = [];
  for (const dest of regions) {
    if (dest.id === region.id) continue;
    const cost = routeCost(region, dest);
    for (const resource of TRADABLE_RESOURCES) {
      const priceHere = localPrice(region, resource);
      const priceThere = localPrice(dest, resource);
      const gap = priceThere - priceHere - cost;
      if (gap <= MIN_PROFIT_THRESHOLD) continue;
      const stockAvailable = (region.stockpile[resource] || 0) * MAX_EXPORT_FRACTION_PER_TICK;
      if (stockAvailable <= 0) continue;
      // Transaction price splits the surplus between buyer and seller rather
      // than handing it all to one side — the route cost itself is simply
      // lost (consumed labor/wear), not collected by anyone.
      const price = (priceHere + priceThere) / 2;
      opportunities.push({ resource, dest, gap, stockAvailable, price });
    }
  }
  opportunities.sort((a, b) => b.gap - a.gap); // best trades first
  return opportunities;
}

// Spends `region`'s available trade labor (region._availableForTrade, set
// by labor.js as whatever surplus wasn't used by farming/lumber/mining/
// smithing) on its best opportunities in order, moving goods and currency
// for real. Returns how much labor was actually used (-> occupations.trader).
function executeTrades(region, opportunities) {
  let laborLeft = region._availableForTrade || 0;
  let laborUsed = 0;

  for (const opp of opportunities) {
    if (laborLeft <= 0.01) break;
    const maxByBuyerWallet = opp.price > 0 ? opp.dest.wallet / opp.price : Infinity;
    const maxByLabor = laborLeft * TRADE_UNITS_PER_TRADER;
    const volume = Math.max(0, Math.min(opp.stockAvailable, maxByBuyerWallet, maxByLabor));
    if (volume <= 0.01) continue;

    region.stockpile[opp.resource] -= volume;
    opp.dest.stockpile[opp.resource] = (opp.dest.stockpile[opp.resource] || 0) + volume;

    const payment = volume * opp.price;
    opp.dest.wallet -= payment;
    region.wallet += payment;

    const laborForThis = volume / TRADE_UNITS_PER_TRADER;
    laborLeft -= laborForThis;
    laborUsed += laborForThis;
  }

  return laborUsed;
}

export function tickTrade(regions) {
  // Compute every region's opportunities before executing any of them, so
  // one region's trade this tick doesn't change the price signal another
  // region is reading mid-pass.
  const opportunitiesByRegion = new Map(regions.map((r) => [r.id, findOpportunities(r, regions)]));

  for (const region of regions) {
    const tradersUsed = executeTrades(region, opportunitiesByRegion.get(region.id));
    region.occupations.trader = Math.round(tradersUsed);
    region.occupations.general = Math.max(0, region.occupations.general - Math.round(tradersUsed));
  }
}
