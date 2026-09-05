import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260904-weather1';
import { directContactIds, knownRegionIds, recordDirectTrade, diffuseTradeNetworkKnowledge } from '../core/knowledge.js?v=20260904-weather1';
import { centroidDistanceKm } from '../world/distance.js?v=20260904-weather1';
import { advancedMaritimeShare } from '../military/army.js?v=20260905-infra1';
import { operationalInfrastructure } from './construction.js?v=20260905-infra1';
import { horseTransportMultiplier } from './horses.js?v=20260904-weather1';
import { recordDiplomaticTrade, tradeRelationMultiplier } from '../diplomacy/relations.js?v=20260904-save1';
import { navalMissionProfile, postureProfile } from '../military/policies.js?v=20260904-policy1';

const LAND_ADJACENT_COST = 0.02;
const SEA_COST_PER_KM = 0.0002;
const MAX_EXPORT_FRACTION_PER_TICK = 0.15;
const TRADE_UNITS_PER_TRADER = 25;
const MIN_PROFIT_THRESHOLD = 0.01;
const TRADE_HISTORY_ALPHA = 1 / 52;
const CREDIT_WEEKS_OF_EXPORT_INCOME = 2;
const CREDIT_PER_CAPITA_CAP = 0.002;
const CREDIT_REPAYMENT_SHARE_OF_EXPORTS = 0.25;
const ARREARS_STABILITY_LOSS = 0.001;
const MAX_OPPORTUNITIES_PER_REGION = 64;
const BASIC_SEA_RANGE_KM = 600;
const ADVANCED_SEA_RANGE_KM = 1800;

function sharesSea(regionA, regionB) {
  return regionA.adjacentSeaIds.some((id) => regionB.adjacentSeaIds.includes(id));
}

function seaTransportProfile(regionA, regionB) {
  const canDockAdvanced = operationalInfrastructure(regionA, 'harbour') && operationalInfrastructure(regionB, 'harbour');
  const advancedShare = canDockAdvanced ? Math.max(advancedMaritimeShare(regionA), advancedMaritimeShare(regionB)) : 0;
  return {
    advancedShare,
    rangeKm: BASIC_SEA_RANGE_KM + (ADVANCED_SEA_RANGE_KM - BASIC_SEA_RANGE_KM) * advancedShare,
    capacityMultiplier: 1 + advancedShare * 1.5,
    costMultiplier: 1 - advancedShare * 0.45,
  };
}

function routeGeometry(regionA, regionB) {
  if (!(regionA._routeGeometryCache instanceof Map)) regionA._routeGeometryCache = new Map();
  let geometry = regionA._routeGeometryCache.get(regionB.id);
  if (!geometry) {
    geometry = {
      adjacent: regionA.neighbors.includes(regionB.id),
      sharedSea: sharesSea(regionA, regionB),
      distanceKm: centroidDistanceKm(regionA, regionB) ?? 500,
    };
    regionA._routeGeometryCache.set(regionB.id, geometry);
  }
  return geometry;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function ensureTradeEconomy(region) {
  if (!region.tradeEconomy) region.tradeEconomy = {};
  const defaults = {
    debt: 0, creditLimit: 0, arrearsWeeks: 0,
    exportIncomeEma: 0, nonFoodExportIncomeEma: 0, importSpendEma: 0,
    foodImportEma: 0, bronzeExportEma: 0, routeReliabilityEma: 0,
    weeklyExports: 0, weeklyImports: 0,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!Number.isFinite(region.tradeEconomy[key])) region.tradeEconomy[key] = value;
  }
  return region.tradeEconomy;
}

function routeReliability(regionA, regionB) {
  const routeSecurity = (region) => {
    const posture = postureProfile(region);
    const naval = navalMissionProfile(region);
    const patrolCoverage = clamp01((region.navy?.personnel || 0) /
      Math.max(1, (region.population || 0) * 0.005));
    return clamp01((region.safetyRating ?? 1) * posture.tradeSecurity +
      patrolCoverage * Math.max(0, naval.trade - 1) * 0.35);
  };
  const security = Math.min(routeSecurity(regionA), routeSecurity(regionB));
  // Below 20% security ordinary commerce is effectively impossible. The
  // squared curve makes worsening banditry bite route capacity early.
  return clamp01(Math.pow(clamp01((security - 0.2) / 0.8), 2) * tradeRelationMultiplier(regionA, regionB));
}

function beginTradeWeek(region) {
  const economy = ensureTradeEconomy(region);
  economy.weeklyExports = 0;
  economy.weeklyImports = 0;
  economy.weeklyFoodImports = 0;
  economy.weeklyBronzeExports = 0;
  economy.weeklyNonFoodExportIncome = 0;
  economy.weeklyRouteReliability = 0;
  economy.weeklyTradeCount = 0;
  economy.weeklyExportsByResource = {};
  economy.creditLimit = Math.max(0, Math.min(
    economy.exportIncomeEma * CREDIT_WEEKS_OF_EXPORT_INCOME,
    region.population * CREDIT_PER_CAPITA_CAP
  ));

  // Cash earned since last week services old obligations first. The share is
  // intentionally material, because Bronze Age credit is scarce and short.
  const repayment = Math.min(economy.debt, region.wallet * 0.1);
  region.wallet -= repayment;
  economy.debt -= repayment;

  if (economy.debt > economy.creditLimit + 0.01) {
    economy.arrearsWeeks += 1;
    region.stability = Math.max(0, region.stability - ARREARS_STABILITY_LOSS);
  } else {
    economy.arrearsWeeks = Math.max(0, economy.arrearsWeeks - 1);
  }
}

function finishTradeWeek(region) {
  const economy = ensureTradeEconomy(region);
  const ema = (oldValue, currentValue) => oldValue + (currentValue - oldValue) * TRADE_HISTORY_ALPHA;
  economy.exportIncomeEma = ema(economy.exportIncomeEma, economy.weeklyExports);
  economy.nonFoodExportIncomeEma = ema(economy.nonFoodExportIncomeEma, economy.weeklyNonFoodExportIncome);
  economy.importSpendEma = ema(economy.importSpendEma, economy.weeklyImports);
  economy.foodImportEma = ema(economy.foodImportEma, economy.weeklyFoodImports);
  economy.bronzeExportEma = ema(economy.bronzeExportEma, economy.weeklyBronzeExports);
  const reliability = economy.weeklyTradeCount > 0
    ? economy.weeklyRouteReliability / economy.weeklyTradeCount
    : 0;
  economy.routeReliabilityEma = ema(economy.routeReliabilityEma, reliability);
}

export function routeCost(regionA, regionB) {
  const geometry = routeGeometry(regionA, regionB);
  const landTransport = Math.max(horseTransportMultiplier(regionA), horseTransportMultiplier(regionB));
  if (geometry.adjacent) return LAND_ADJACENT_COST / landTransport;
  if (geometry.sharedSea) {
    return SEA_COST_PER_KM * geometry.distanceKm * seaTransportProfile(regionA, regionB).costMultiplier;
  }
  // Non-adjacent inland markets represent a chain of short overland legs,
  // not a magically available ocean route.
  return (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / landTransport;
}

function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion) {
  const opportunities = [];
  const pricesHere = pricesByRegion.get(region.id);
  const stockedResources = TRADABLE_RESOURCES.filter((resource) => (region.stockpile[resource] || 0) > 0.01);
  for (const dest of candidateRegions) {
    if (dest.id === region.id) continue;
    if (!knownIdsByRegion.get(dest.id)?.has(region.id)) continue;
    const geometry = routeGeometry(region, dest);
    const seaRoute = geometry.sharedSea && !geometry.adjacent;
    const distanceKm = seaRoute ? geometry.distanceKm : 0;
    const transport = seaRoute ? seaTransportProfile(region, dest) : {
      capacityMultiplier: Math.max(horseTransportMultiplier(region), horseTransportMultiplier(dest)),
      rangeKm: Infinity,
    };
    if (seaRoute && distanceKm > transport.rangeKm) continue;
    const reliability = routeReliability(region, dest);
    if (reliability <= 0.001) continue;
    const cost = routeCost(region, dest) + (1 - reliability) * 0.1;
    const pricesThere = pricesByRegion.get(dest.id);
    for (const resource of stockedResources) {
      const priceHere = pricesHere[resource];
      const priceThere = pricesThere[resource];
      const gap = priceThere - priceHere - cost;
      if (gap <= MIN_PROFIT_THRESHOLD) continue;
      const stockAvailable = (region.stockpile[resource] || 0) * MAX_EXPORT_FRACTION_PER_TICK;
      if (stockAvailable <= 0) continue;
      const price = (priceHere + priceThere) / 2;
      opportunities.push({ resource, dest, gap, stockAvailable, stockRemaining: stockAvailable, price, reliability,
        transportMultiplier: transport.capacityMultiplier });
    }
  }
  opportunities.sort((a, b) => b.gap - a.gap);
  // Once a region has dozens of profitable routes, evaluating hundreds of
  // inferior alternatives in all three settlement rounds adds cost without
  // changing what its limited traders can actually carry.
  return opportunities.slice(0, MAX_OPPORTUNITIES_PER_REGION);
}

function executeTrades(region, opportunities, currentTick = null) {
  let laborLeft = region._tradeLaborRemaining || 0;
  let laborUsed = 0;
  for (const opp of opportunities) {
    if (laborLeft <= 0.01) break;
    const buyerEconomy = ensureTradeEconomy(opp.dest);
    const creditAvailable = Math.max(0, buyerEconomy.creditLimit - buyerEconomy.debt);
    const purchasingPower = Math.max(0, opp.dest.wallet) + creditAvailable;
    const maxByBuyerFunds = opp.price > 0 ? purchasingPower / opp.price : Infinity;
    const maxByLabor = laborLeft * TRADE_UNITS_PER_TRADER * opp.reliability * (opp.transportMultiplier || 1);
    const exportBudget = Math.max(0, region._exportRemaining?.[opp.resource] || 0);
    const actualStock = Math.max(0, region.stockpile[opp.resource] || 0);
    const volume = Math.max(0, Math.min(
      opp.stockRemaining, maxByBuyerFunds, maxByLabor, exportBudget, actualStock
    ));
    if (volume <= 0.01) continue;
    region.stockpile[opp.resource] -= volume;
    region._exportRemaining[opp.resource] -= volume;
    opp.stockRemaining -= volume;
    opp.dest.stockpile[opp.resource] = (opp.dest.stockpile[opp.resource] || 0) + volume;
    const payment = volume * opp.price;
    const cashPaid = Math.min(opp.dest.wallet, payment);
    const borrowed = payment - cashPaid;
    opp.dest.wallet -= cashPaid;
    buyerEconomy.debt += borrowed;

    const sellerEconomy = ensureTradeEconomy(region);
    const debtRepaid = Math.min(sellerEconomy.debt, payment * CREDIT_REPAYMENT_SHARE_OF_EXPORTS);
    sellerEconomy.debt -= debtRepaid;
    region.wallet += payment - debtRepaid;

    sellerEconomy.weeklyExports += payment;
    sellerEconomy.weeklyExportsByResource[opp.resource] =
      (sellerEconomy.weeklyExportsByResource[opp.resource] || 0) + payment;
    buyerEconomy.weeklyImports += payment;
    if (opp.resource !== 'food') sellerEconomy.weeklyNonFoodExportIncome += payment;
    if (opp.resource === 'food') buyerEconomy.weeklyFoodImports += volume;
    if (opp.resource === 'bronze') sellerEconomy.weeklyBronzeExports += volume;
    sellerEconomy.weeklyRouteReliability += opp.reliability;
    buyerEconomy.weeklyRouteReliability += opp.reliability;
    sellerEconomy.weeklyTradeCount += 1;
    buyerEconomy.weeklyTradeCount += 1;
    if (!(region.recentTradePartners instanceof Map)) region.recentTradePartners = new Map();
    if (!(opp.dest.recentTradePartners instanceof Map)) opp.dest.recentTradePartners = new Map();
    if (currentTick !== null) {
      region.recentTradePartners.set(opp.dest.id, currentTick);
      opp.dest.recentTradePartners.set(region.id, currentTick);
    }
    recordDirectTrade(region, opp.dest, volume, currentTick);
    recordDiplomaticTrade(region, opp.dest, payment, currentTick);
    const laborForThis = volume / (TRADE_UNITS_PER_TRADER * (opp.transportMultiplier || 1));
    laborLeft -= laborForThis;
    laborUsed += laborForThis;
  }
  region._tradeLaborRemaining = laborLeft;
  return laborUsed;
}

function nearbyMarketIds(region, regionsById, limit = 32) {
  if (Array.isArray(region._nearbyMarketIds)) return region._nearbyMarketIds;
  const visited = new Set([region.id]);
  const queue = [...(region.neighbors || [])];
  const result = [];
  while (queue.length > 0 && result.length < limit) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const candidate = regionsById.get(id);
    if (!candidate) continue;
    result.push(id);
    for (const nextId of candidate.neighbors || []) {
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }
  region._nearbyMarketIds = result;
  return result;
}

export function tickTrade(regions, currentTick = null) {
  for (const region of regions) {
    region.tradeLinks = new Map();
    beginTradeWeek(region);
  }
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const knownIdsByRegion = new Map(regions.map((region) => [region.id, knownRegionIds(region)]));
  // Local scarcity prices are invariant throughout opportunity discovery.
  // Calculate each region/resource once rather than once per candidate pair.
  const pricesByRegion = new Map(regions.map((region) => [region.id,
    Object.fromEntries(TRADABLE_RESOURCES.map((resource) => [resource, localPrice(region, resource)]))
  ]));
  const opportunitiesByRegion = new Map(regions.map((region) => {
    // A merchant chain may connect mutually-known markets beyond a literal
    // border. A cached breadth-first neighbourhood bounds this to 32 without
    // sorting or scanning the whole map every week.
    const knownIds = knownIdsByRegion.get(region.id);
    const candidateIds = new Set([
      ...directContactIds(region),
      ...nearbyMarketIds(region, regionsById).filter((id) => knownIds.has(id)),
    ]);
    const candidates = [...candidateIds]
      .map((id) => regionsById.get(id))
      .filter(Boolean);
    return [region.id, findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion)];
  }));
  const laborUsedByRegion = new Map();
  for (const region of regions) {
    region._tradeLaborRemaining = region._availableForTrade || 0;
    region._exportRemaining = Object.fromEntries(TRADABLE_RESOURCES.map((resource) => [
      resource,
      Math.max(0, region.stockpile[resource] || 0) * MAX_EXPORT_FRACTION_PER_TICK,
    ]));
    laborUsedByRegion.set(region.id, 0);
  }
  // Several clearing rounds let a region spend proceeds it earned earlier in
  // the same week. That is settlement, not long-term credit, and avoids the
  // outcome depending on array order while keeping the actual credit limit tiny.
  for (let round = 0; round < 3; round++) {
    for (const region of regions) {
      const used = executeTrades(region, opportunitiesByRegion.get(region.id), currentTick);
      laborUsedByRegion.set(region.id, laborUsedByRegion.get(region.id) + used);
    }
  }
  for (const region of regions) {
    const tradersUsed = laborUsedByRegion.get(region.id) || 0;
    region.occupations.trader = Math.round(tradersUsed);
    region.occupations.general = Math.max(0, region.occupations.general - Math.round(tradersUsed));
  }
  for (const region of regions) finishTradeWeek(region);
  diffuseTradeNetworkKnowledge(regions, currentTick);
}
