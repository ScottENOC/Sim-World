import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260903-iron1';
import { directContactIds, hasDirectContact, recordDirectTrade, diffuseTradeNetworkKnowledge } from '../core/knowledge.js?v=20260903-iron1';
import { centroidDistanceKm } from '../world/distance.js?v=20260903-iron1';

const LAND_ADJACENT_COST = 0.1;
const SEA_COST_PER_KM = 0.001;
const MAX_EXPORT_FRACTION_PER_TICK = 0.15;
const TRADE_UNITS_PER_TRADER = 5;
const MIN_PROFIT_THRESHOLD = 0.05;

export function routeCost(regionA, regionB) {
  if (regionA.neighbors.includes(regionB.id)) return LAND_ADJACENT_COST;
  const distanceKm = centroidDistanceKm(regionA, regionB);
  return SEA_COST_PER_KM * (distanceKm ?? 500);
}

function findOpportunities(region, candidateRegions) {
  const opportunities = [];
  for (const dest of candidateRegions) {
    if (dest.id === region.id) continue;
    if (!hasDirectContact(region, dest) || !hasDirectContact(dest, region)) continue;
    const cost = routeCost(region, dest);
    for (const resource of TRADABLE_RESOURCES) {
      const priceHere = localPrice(region, resource);
      const priceThere = localPrice(dest, resource);
      const gap = priceThere - priceHere - cost;
      if (gap <= MIN_PROFIT_THRESHOLD) continue;
      const stockAvailable = (region.stockpile[resource] || 0) * MAX_EXPORT_FRACTION_PER_TICK;
      if (stockAvailable <= 0) continue;
      const price = (priceHere + priceThere) / 2;
      opportunities.push({ resource, dest, gap, stockAvailable, price });
    }
  }
  opportunities.sort((a, b) => b.gap - a.gap);
  return opportunities;
}

function executeTrades(region, opportunities, currentTick = null) {
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
    recordDirectTrade(region, opp.dest, volume, currentTick);
    const laborForThis = volume / TRADE_UNITS_PER_TRADER;
    laborLeft -= laborForThis;
    laborUsed += laborForThis;
  }
  return laborUsed;
}

export function tickTrade(regions, currentTick = null) {
  for (const region of regions) region.tradeLinks = new Map();
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const opportunitiesByRegion = new Map(regions.map((region) => {
    const candidates = [...directContactIds(region)]
      .map((id) => regionsById.get(id))
      .filter(Boolean);
    return [region.id, findOpportunities(region, candidates)];
  }));
  for (const region of regions) {
    const tradersUsed = executeTrades(region, opportunitiesByRegion.get(region.id), currentTick);
    region.occupations.trader = Math.round(tradersUsed);
    region.occupations.general = Math.max(0, region.occupations.general - Math.round(tradersUsed));
  }
  diffuseTradeNetworkKnowledge(regions, currentTick);
}
