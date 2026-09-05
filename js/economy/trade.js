import { localPrice, TRADABLE_RESOURCES } from './prices.js?v=20260905-goods1';
import { cargoKgPerUnit } from './tradeGoods.js?v=20260905-goods2';
import { tradeAllowed } from './tradePolicy.js?v=20260905-policy1';
import { directContactIds, knownRegionIds, recordDirectTrade, diffuseTradeNetworkKnowledge } from '../core/knowledge.js?v=20260904-weather1';
import { centroidDistanceKm } from '../world/distance.js?v=20260904-weather1';
import { advancedMaritimeShare } from '../military/army.js?v=20260905-infra1';
import { effectiveInfrastructureCount, operationalInfrastructure, overlandInfrastructureMultiplier } from './construction.js?v=20260905-projects1';
import { horseTransportMultiplier } from './horses.js?v=20260904-weather1';
import { recordDiplomaticTrade, tradeRelationMultiplier } from '../diplomacy/relations.js?v=20260904-save1';
import { navalMissionProfile, postureProfile } from '../military/policies.js?v=20260904-policy1';

const LAND_ADJACENT_COST = 0.02;
const SEA_COST_PER_KM = 0.0002;
const MAX_EXPORT_FRACTION_PER_TICK = 0.15;
const MIN_PROFIT_THRESHOLD = 0.01;
const TRADE_HISTORY_ALPHA = 1 / 52;
const CREDIT_WEEKS_OF_EXPORT_INCOME = 2;
const CREDIT_PER_CAPITA_CAP = 0.002;
const CREDIT_REPAYMENT_SHARE_OF_EXPORTS = 0.25;
const ARREARS_STABILITY_LOSS = 0.001;
const MAX_OPPORTUNITIES_PER_REGION = 48;
const BASIC_SEA_RANGE_KM = 600;
const ADVANCED_SEA_RANGE_KM = 1800;

// Merchant ventures are persistent journeys rather than instantaneous weekly
// reallocations of generic labour. A small established merchant population is
// away for most of a long-distance trip and only makes a new decision after
// returning home.
const INITIAL_MERCHANT_SHARE = 0.0005;
const MAX_MERCHANT_SHARE = 0.02;
const MERCHANT_RECRUITMENT_RATE = 0.04;
const MERCHANT_RETIREMENT_RATE = 0.06;
const MAX_NEW_VENTURES_PER_WEEK = 3;
const LAND_KM_PER_WEEK = 90;
const SEA_KM_PER_WEEK = 220;
const LAND_KG_PER_MERCHANT = 80;
const SEA_KG_PER_MERCHANT = 250;
const MAX_LAND_HOPS = 14;
const MARKET_TURNAROUND_DAYS = 7;

// Merchants are habitual. Most returned merchants reconsider only places where
// they already have successful routes, plus unusually salient new information.
const BROAD_SEARCH_INTERVAL = 26;
const HUB_CHECK_INTERVAL = 4;
const IMITATION_INTERVAL = 8;
const FRESH_REPORT_WEEKS = 8;
const MAX_ROUTE_HABITS = 16;
const MAX_MAJOR_HUBS = 6;
const HUB_MIN_ACTIVE_PARTNERS = 4;
const ROUTE_HABIT_DECAY = 0.85;
const CRISIS_SEARCH_PRESSURE = 3;
const TRADE_RELEVANT_REPORT_TOPICS = new Set([
  'food', 'mining', 'metallurgy', 'trade', 'economy', 'resources',
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function staggeredDue(region, currentTick, interval) {
  if (!Number.isFinite(currentTick)) return true;
  // A monthly scheduler jumps over several calendar weeks at once. Remember
  // which stagger bucket was last serviced instead of requiring an exact
  // modulo hit that may never occur.
  if (!region._tradeCadenceBuckets || typeof region._tradeCadenceBuckets !== 'object') region._tradeCadenceBuckets = {};
  const offset = stableHash(region.id) % interval;
  const bucket = Math.floor((currentTick - offset) / interval);
  const key = String(interval);
  const previous = region._tradeCadenceBuckets[key];
  region._tradeCadenceBuckets[key] = bucket;
  if (previous === undefined) return currentTick >= offset;
  return bucket > previous;
}

function sharesSea(regionA, regionB) {
  return (regionA.adjacentSeaIds || []).some((id) => (regionB.adjacentSeaIds || []).includes(id));
}

function seaTransportProfile(regionA, regionB) {
  const canDockAdvanced = operationalInfrastructure(regionA, 'harbour') && operationalInfrastructure(regionB, 'harbour');
  const merchantFleet = regionA.tradeEconomy;
  const merchantShare = merchantFleet?.merchantBoats > 0
    ? Math.min(1, Math.max(0, merchantFleet.advancedMerchantBoats || 0) / merchantFleet.merchantBoats)
    : 0;
  const legacyShare = Math.max(advancedMaritimeShare(regionA), advancedMaritimeShare(regionB));
  const advancedShare = canDockAdvanced ? Math.max(merchantShare, legacyShare) : 0;
  return {
    advancedShare,
    rangeKm: BASIC_SEA_RANGE_KM + (ADVANCED_SEA_RANGE_KM - BASIC_SEA_RANGE_KM) * advancedShare,
    capacityMultiplier: 1 + advancedShare * 1.5,
    costMultiplier: 1 - advancedShare * 0.45,
    speedMultiplier: 1 + advancedShare * 0.9,
  };
}

function routeGeometry(regionA, regionB) {
  if (!(regionA._routeGeometryCache instanceof Map)) regionA._routeGeometryCache = new Map();
  let geometry = regionA._routeGeometryCache.get(regionB.id);
  if (!geometry) {
    geometry = {
      adjacent: (regionA.neighbors || []).includes(regionB.id),
      sharedSea: sharesSea(regionA, regionB),
      distanceKm: centroidDistanceKm(regionA, regionB) ?? 500,
    };
    regionA._routeGeometryCache.set(regionB.id, geometry);
  }
  return geometry;
}

function landPathIds(origin, dest, regionsById) {
  if (!(origin._tradeLandPathCache instanceof Map)) origin._tradeLandPathCache = new Map();
  if (origin._tradeLandPathCache.has(dest.id)) return origin._tradeLandPathCache.get(dest.id);
  if (origin.id === dest.id) return [origin.id];
  const queue = [[origin.id]];
  const visited = new Set([origin.id]);
  let result = null;
  while (queue.length && !result) {
    const path = queue.shift();
    if (path.length > MAX_LAND_HOPS + 1) continue;
    const here = regionsById.get(path[path.length - 1]);
    if (!here) continue;
    for (const nextId of here.neighbors || []) {
      if (visited.has(nextId)) continue;
      const next = regionsById.get(nextId);
      if (!next) continue;
      const nextPath = [...path, nextId];
      if (nextId === dest.id) {
        result = nextPath;
        break;
      }
      visited.add(nextId);
      queue.push(nextPath);
    }
  }
  origin._tradeLandPathCache.set(dest.id, result);
  return result;
}

function landTransportProfile(origin, dest, regionsById) {
  const pathIds = landPathIds(origin, dest, regionsById);
  if (!pathIds) return null;
  let roadTotal = 0;
  let canalTotal = 0;
  for (const id of pathIds) {
    const region = regionsById.get(id);
    if (!region) continue;
    roadTotal += overlandInfrastructureMultiplier(region);
    canalTotal += Math.min(0.18, effectiveInfrastructureCount(region, 'canal') * 0.06);
  }
  const count = Math.max(1, pathIds.length);
  const throughInfrastructure = roadTotal / count;
  const canalAssist = canalTotal / count;
  const horses = horseTransportMultiplier(origin);
  return {
    pathIds,
    speedMultiplier: Math.sqrt(Math.max(1, throughInfrastructure) * Math.max(1, horses)) + canalAssist,
    capacityMultiplier: Math.max(1, horses) * Math.sqrt(Math.max(1, throughInfrastructure)),
  };
}

function routeSecurity(region) {
  const posture = postureProfile(region);
  const naval = navalMissionProfile(region);
  const patrolCoverage = clamp01((region.navy?.personnel || 0) /
    Math.max(1, (region.population || 0) * 0.005));
  const publicSecurity = Math.min(0.16, effectiveInfrastructureCount(region, 'watchtowers') * 0.1 +
    effectiveInfrastructureCount(region, 'market_customs') * 0.06);
  return clamp01((region.safetyRating ?? 1) * posture.tradeSecurity + publicSecurity +
    patrolCoverage * Math.max(0, naval.trade - 1) * 0.35);
}

function routeReliability(regionA, regionB) {
  const security = Math.min(routeSecurity(regionA), routeSecurity(regionB));
  return clamp01(Math.pow(clamp01((security - 0.2) / 0.8), 2) * tradeRelationMultiplier(regionA, regionB));
}

function ensureTradeEconomy(region) {
  if (!region.tradeEconomy) region.tradeEconomy = {};
  const defaults = {
    debt: 0, creditLimit: 0, arrearsWeeks: 0,
    exportIncomeEma: 0, nonFoodExportIncomeEma: 0, importSpendEma: 0,
    foodImportEma: 0, bronzeExportEma: 0, routeReliabilityEma: 0,
    weeklyExports: 0, weeklyImports: 0, searchPressure: 0,
    merchantPopulation: NaN, merchantConfidence: 0,
    merchantBoats: NaN, advancedMerchantBoats: NaN,
    nextVentureId: 1,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!Number.isFinite(region.tradeEconomy[key])) region.tradeEconomy[key] = value;
  }
  if (!region.tradeEconomy.routeHabits || typeof region.tradeEconomy.routeHabits !== 'object' ||
      Array.isArray(region.tradeEconomy.routeHabits)) region.tradeEconomy.routeHabits = {};
  if (!Array.isArray(region.tradeEconomy.ventures)) region.tradeEconomy.ventures = [];

  if (!Number.isFinite(region.tradeEconomy.merchantPopulation)) {
    const previous = Math.max(0, Number(region.occupations?.trader) || 0);
    const available = Math.max(0, Number(region._availableForTrade ?? region.occupations?.general) || 0);
    const seed = Math.max(1, Math.round((region.population || 0) * INITIAL_MERCHANT_SHARE));
    region.tradeEconomy.merchantPopulation = Math.min(available || seed, previous || seed);
  }
  if (!Number.isFinite(region.tradeEconomy.merchantBoats)) {
    region.tradeEconomy.merchantBoats = Math.max(1, Math.ceil(region.tradeEconomy.merchantPopulation / 4));
  }
  if (!Number.isFinite(region.tradeEconomy.advancedMerchantBoats)) region.tradeEconomy.advancedMerchantBoats = 0;
  return region.tradeEconomy;
}

function commissionMerchantBoats(region) {
  const economy = ensureTradeEconomy(region);
  const target = Math.max(1, Math.ceil(economy.merchantPopulation / 4));
  let gap = Math.max(0, target - economy.merchantBoats);
  if (gap <= 0) return;
  const canUseAdvanced = operationalInfrastructure(region, 'harbour');
  if (canUseAdvanced) {
    const advanced = Math.min(gap, Math.max(0, region.stockpile?.advanced_boat || 0));
    if (advanced > 0) {
      region.stockpile.advanced_boat -= advanced;
      economy.merchantBoats += advanced;
      economy.advancedMerchantBoats += advanced;
      gap -= advanced;
    }
  }
  const basic = Math.min(gap, Math.max(0, region.stockpile?.basic_boat || 0));
  if (basic > 0) {
    region.stockpile.basic_boat -= basic;
    economy.merchantBoats += basic;
  }
}

function beginTradeWeek(region) {
  const economy = ensureTradeEconomy(region);
  commissionMerchantBoats(region);
  economy.weeklyExports = 0;
  economy.weeklyImports = 0;
  economy.weeklyFoodImports = 0;
  economy.weeklyBronzeExports = 0;
  economy.weeklyNonFoodExportIncome = 0;
  economy.weeklyRouteReliability = 0;
  economy.weeklyTradeCount = 0;
  economy.weeklyReturns = 0;
  economy.weeklySuccessfulReturns = 0;
  economy.weeklyExportsByResource = {};
  economy.creditLimit = Math.max(0, Math.min(
    economy.exportIncomeEma * CREDIT_WEEKS_OF_EXPORT_INCOME,
    (region.population || 0) * CREDIT_PER_CAPITA_CAP
  ));
  const repayment = Math.min(economy.debt, Math.max(0, region.wallet || 0) * 0.1);
  region.wallet = Math.max(0, (region.wallet || 0) - repayment);
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
    ? economy.weeklyRouteReliability / economy.weeklyTradeCount : 0;
  economy.routeReliabilityEma = ema(economy.routeReliabilityEma, reliability);
  if (economy.weeklyReturns > 0) {
    economy.searchPressure = economy.weeklySuccessfulReturns > 0
      ? Math.max(0, economy.searchPressure - 1)
      : Math.min(12, economy.searchPressure + 1);
  }
}

export function routeCost(regionA, regionB) {
  const geometry = routeGeometry(regionA, regionB);
  const landTransport = Math.max(horseTransportMultiplier(regionA) * overlandInfrastructureMultiplier(regionA),
    horseTransportMultiplier(regionB) * overlandInfrastructureMultiplier(regionB));
  if (geometry.adjacent) return LAND_ADJACENT_COST / landTransport;
  if (geometry.sharedSea) {
    return SEA_COST_PER_KM * geometry.distanceKm * seaTransportProfile(regionA, regionB).costMultiplier;
  }
  return (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / landTransport;
}

function ventureRouteProfile(origin, dest, regionsById) {
  const geometry = routeGeometry(origin, dest);
  const seaRoute = geometry.sharedSea && !geometry.adjacent;
  if (seaRoute) {
    const sea = seaTransportProfile(origin, dest);
    if (geometry.distanceKm > sea.rangeKm) return null;
    const oneWayDays = Math.max(1, geometry.distanceKm / (SEA_KM_PER_WEEK * sea.speedMultiplier) * 7);
    return {
      mode: 'sea',
      oneWayDays,
      roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
      capacityKgPerMerchant: SEA_KG_PER_MERCHANT * sea.capacityMultiplier,
      transportMultiplier: sea.capacityMultiplier,
      reliability: routeReliability(origin, dest),
    };
  }
  const land = landTransportProfile(origin, dest, regionsById);
  if (!land) return null;
  const oneWayDays = Math.max(1, geometry.distanceKm / (LAND_KM_PER_WEEK * land.speedMultiplier) * 7);
  return {
    mode: 'land',
    oneWayDays,
    roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
    capacityKgPerMerchant: LAND_KG_PER_MERCHANT * land.capacityMultiplier,
    transportMultiplier: land.capacityMultiplier,
    reliability: routeReliability(origin, dest),
    pathIds: land.pathIds,
  };
}

function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById) {
  const opportunities = [];
  const pricesHere = pricesByRegion.get(region.id);
  const stockedResources = TRADABLE_RESOURCES.filter((resource) =>
    (region.stockpile[resource] || 0) > 0.01);

  const habits = ensureTradeEconomy(region).routeHabits;
  for (const dest of candidateRegions) {
    if (dest.id === region.id) continue;
    if (!knownIdsByRegion.get(dest.id)?.has(region.id)) continue;
    const route = ventureRouteProfile(region, dest, regionsById);
    if (!route || route.reliability <= 0.001) continue;
    const cost = routeCost(region, dest) + (1 - route.reliability) * 0.1;
    const pricesThere = pricesByRegion.get(dest.id);
    for (const resource of stockedResources) {
      if (!tradeAllowed(region, dest, resource)) continue;
      const priceHere = pricesHere[resource];
      const priceThere = pricesThere[resource];
      const gap = priceThere - priceHere - cost;
      if (gap <= MIN_PROFIT_THRESHOLD) continue;
      const stockAvailable = Math.max(0, (region.stockpile[resource] || 0) * MAX_EXPORT_FRACTION_PER_TICK);
      if (stockAvailable <= 0) continue;
      const habit = habits[`${dest.id}|${resource}`];
      const habitBoost = habit ? 1 + Math.min(0.35, Math.log1p(Math.max(0, habit.score || 0)) * 0.03) : 1;
      const score = (gap * habitBoost) / Math.max(1, route.roundTripDays / 7);
      opportunities.push({
        resource, dest, gap, score, stockAvailable,
        expectedPrice: (priceHere + priceThere) / 2,
        originPrice: priceHere,
        route,
      });
    }
  }
  opportunities.sort((a, b) => b.score - a.score);
  return opportunities.slice(0, MAX_OPPORTUNITIES_PER_REGION);
}

function recordRouteHabit(region, venture, payment, currentTick, profitable) {
  const economy = ensureTradeEconomy(region);
  const key = `${venture.destId}|${venture.resource}`;
  const old = economy.routeHabits[key];
  const oldScore = old?.score || 0;
  economy.routeHabits[key] = {
    destId: venture.destId,
    resource: venture.resource,
    score: Math.max(0, oldScore * ROUTE_HABIT_DECAY + (profitable ? payment : -Math.max(1, oldScore * 0.15))),
    lastSuccessTick: profitable && Number.isFinite(currentTick) ? currentTick : (old?.lastSuccessTick ?? null),
    lastAttemptTick: Number.isFinite(currentTick) ? currentTick : (old?.lastAttemptTick ?? null),
  };
  const habits = Object.entries(economy.routeHabits);
  if (habits.length > MAX_ROUTE_HABITS) {
    habits.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    economy.routeHabits = Object.fromEntries(habits.slice(0, MAX_ROUTE_HABITS));
  }
}

function activeMerchants(region) {
  return ensureTradeEconomy(region).ventures.reduce((sum, venture) => sum + Math.max(0, venture.merchants || 0), 0);
}

function reconcileMerchantOccupation(region) {
  const economy = ensureTradeEconomy(region);
  const maxMerchants = Math.max(1, Math.floor((region.demographics?.workingAge || region.population || 0) * MAX_MERCHANT_SHARE));
  economy.merchantPopulation = Math.max(activeMerchants(region), Math.min(maxMerchants, Math.round(economy.merchantPopulation)));
  if (!region.occupations) region.occupations = {};
  const previousTrader = Math.max(0, Number(region.occupations.trader) || 0);
  const additional = Math.max(0, economy.merchantPopulation - previousTrader);
  region.occupations.trader = economy.merchantPopulation;
  region.occupations.general = Math.max(0, (region.occupations.general || 0) - additional);
}

function adjustMerchantCareerPopulation(region) {
  const economy = ensureTradeEconomy(region);
  const active = activeMerchants(region);
  const idle = Math.max(0, economy.merchantPopulation - active);
  const maxMerchants = Math.max(1, Math.floor((region.demographics?.workingAge || region.population || 0) * MAX_MERCHANT_SHARE));
  if (economy.merchantConfidence > 0.25 && economy.weeklySuccessfulReturns > 0 && economy.merchantPopulation < maxMerchants) {
    const recruits = Math.max(1, Math.ceil(economy.merchantPopulation * MERCHANT_RECRUITMENT_RATE));
    const availableGeneral = Math.max(0, region.occupations?.general || 0);
    const actual = Math.min(recruits, availableGeneral, maxMerchants - economy.merchantPopulation);
    economy.merchantPopulation += actual;
    if (region.occupations) region.occupations.general = Math.max(0, region.occupations.general - actual);
  } else if (economy.merchantConfidence < -0.25 && idle > 0) {
    const retirements = Math.min(idle, Math.max(1, Math.ceil(economy.merchantPopulation * MERCHANT_RETIREMENT_RATE)));
    economy.merchantPopulation = Math.max(active, economy.merchantPopulation - retirements);
    if (region.occupations) region.occupations.general = (region.occupations.general || 0) + retirements;
  }
  if (region.occupations) region.occupations.trader = Math.round(economy.merchantPopulation);
}

function settleReturnedVenture(origin, dest, venture, currentTick) {
  const economy = ensureTradeEconomy(origin);
  const payment = Math.max(0, venture.payment || 0);
  const returnedCargo = Math.max(0, venture.unsoldCargo || 0);
  origin.stockpile[venture.resource] = (origin.stockpile[venture.resource] || 0) + returnedCargo;
  const debtRepaid = Math.min(economy.debt, payment * CREDIT_REPAYMENT_SHARE_OF_EXPORTS);
  economy.debt -= debtRepaid;
  origin.wallet = (origin.wallet || 0) + payment - debtRepaid;

  const costBasis = (venture.cargo || 0) * (venture.originPrice || 0) + (venture.cargo || 0) * (venture.routeCost || 0);
  const profit = payment - costBasis;
  const profitable = profit > Math.max(0.01, costBasis * 0.02);
  economy.weeklyReturns += 1;
  if (profitable) economy.weeklySuccessfulReturns += 1;
  economy.merchantConfidence = Math.max(-1, Math.min(1,
    economy.merchantConfidence * 0.8 + (profitable ? 0.25 : -0.2)));

  if (dest && venture.soldVolume > 0) {
    economy.weeklyExports += payment;
    economy.weeklyExportsByResource[venture.resource] =
      (economy.weeklyExportsByResource[venture.resource] || 0) + payment;
    if (venture.resource !== 'food') economy.weeklyNonFoodExportIncome += payment;
    if (venture.resource === 'bronze') economy.weeklyBronzeExports += venture.soldVolume;
    economy.weeklyRouteReliability += venture.reliability || 0;
    economy.weeklyTradeCount += 1;
    if (!(origin.recentTradePartners instanceof Map)) origin.recentTradePartners = new Map();
    if (!(dest.recentTradePartners instanceof Map)) dest.recentTradePartners = new Map();
    origin.recentTradePartners.set(dest.id, currentTick);
    dest.recentTradePartners.set(origin.id, currentTick);
    recordRouteHabit(origin, venture, payment, currentTick, profitable);
    recordDirectTrade(origin, dest, venture.soldVolume, currentTick);
    recordDiplomaticTrade(origin, dest, payment, currentTick);
  } else {
    recordRouteHabit(origin, venture, 0, currentTick, false);
  }
}

function processVentures(regions, regionsById, currentTick, time) {
  if (!Number.isFinite(currentTick)) return;
  const currentDay = Number.isFinite(time?.endDay) ? time.endDay : currentTick * 7;
  for (const origin of regions) {
    const economy = ensureTradeEconomy(origin);
    const remaining = [];
    for (const venture of economy.ventures) {
      const dest = regionsById.get(venture.destId);
      if (!dest) {
        origin.stockpile[venture.resource] = (origin.stockpile[venture.resource] || 0) + (venture.cargo || 0);
        continue;
      }
      const arrivalDay = Number.isFinite(venture.arrivalDay) ? venture.arrivalDay : (venture.arrivalTick || currentTick) * 7;
      const returnDay = Number.isFinite(venture.returnDay) ? venture.returnDay : (venture.returnTick || currentTick) * 7;
      if (!venture.arrived && currentDay >= arrivalDay) {
        if (!tradeAllowed(origin, dest, venture.resource)) {
          venture.payment = 0;
          venture.soldVolume = 0;
          venture.unsoldCargo = Math.max(0, venture.cargo || 0);
          venture.arrived = true;
        }
        const buyerEconomy = ensureTradeEconomy(dest);
        const destinationPrice = localPrice(dest, venture.resource);
        const price = Math.max(0.001, destinationPrice);
        const creditAvailable = Math.max(0, buyerEconomy.creditLimit - buyerEconomy.debt);
        const purchasingPower = Math.max(0, dest.wallet || 0) + creditAvailable;
        const saleable = Math.min(venture.cargo || 0, purchasingPower / price);
        const sold = Math.max(0, saleable);
        const payment = sold * price;
        const cashPaid = Math.min(Math.max(0, dest.wallet || 0), payment);
        dest.wallet = Math.max(0, (dest.wallet || 0) - cashPaid);
        buyerEconomy.debt += payment - cashPaid;
        dest.stockpile[venture.resource] = (dest.stockpile[venture.resource] || 0) + sold;
        buyerEconomy.weeklyImports += payment;
        if (venture.resource === 'food') buyerEconomy.weeklyFoodImports += sold;
        buyerEconomy.weeklyRouteReliability += venture.reliability || 0;
        buyerEconomy.weeklyTradeCount += sold > 0 ? 1 : 0;
        venture.payment = payment;
        venture.soldVolume = sold;
        venture.unsoldCargo = Math.max(0, (venture.cargo || 0) - sold);
        venture.arrived = true;
      }
      if (currentDay >= returnDay) {
        settleReturnedVenture(origin, dest, venture, currentTick);
      } else {
        remaining.push(venture);
      }
    }
    economy.ventures = remaining;
  }
}

function launchVentures(region, opportunities, currentTick, time) {
  const departureDay = Number.isFinite(time?.endDay) ? time.endDay : currentTick * 7;
  const economy = ensureTradeEconomy(region);
  let idle = Math.max(0, economy.merchantPopulation - activeMerchants(region));
  if (idle < 1) return 0;
  let launched = 0;
  const exportRemaining = Object.fromEntries(TRADABLE_RESOURCES.map((resource) => [
    resource, Math.max(0, region.stockpile[resource] || 0) * MAX_EXPORT_FRACTION_PER_TICK,
  ]));
  for (const opp of opportunities) {
    if (idle < 1 || launched >= MAX_NEW_VENTURES_PER_WEEK) break;
    const capacityPerMerchant = Math.max(0.01, (opp.route.capacityKgPerMerchant / cargoKgPerUnit(opp.resource)) * opp.route.reliability);
    const availableCargo = Math.min(
      Math.max(0, region.stockpile[opp.resource] || 0),
      Math.max(0, exportRemaining[opp.resource] || 0),
      opp.stockAvailable
    );
    if (availableCargo <= 0.01) continue;
    const merchantsNeeded = Math.max(1, Math.ceil(availableCargo / capacityPerMerchant));
    const merchants = Math.min(idle, merchantsNeeded);
    const cargo = Math.min(availableCargo, merchants * capacityPerMerchant);
    if (cargo <= 0.01) continue;
    region.stockpile[opp.resource] -= cargo;
    exportRemaining[opp.resource] -= cargo;
    economy.ventures.push({
      id: `${region.id}:venture:${economy.nextVentureId++}`,
      destId: opp.dest.id,
      resource: opp.resource,
      cargo,
      merchants,
      originPrice: opp.originPrice,
      expectedPrice: opp.expectedPrice,
      routeCost: routeCost(region, opp.dest),
      reliability: opp.route.reliability,
      transportMode: opp.route.mode,
      pathIds: opp.route.pathIds || null,
      departureTick: currentTick,
      departureDay,
      arrivalDay: departureDay + opp.route.oneWayDays,
      returnDay: departureDay + opp.route.roundTripDays,
      arrived: false,
      payment: 0,
      soldVolume: 0,
      unsoldCargo: 0,
    });
    idle -= merchants;
    launched += 1;
  }
  return launched;
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
    for (const nextId of candidate.neighbors || []) if (!visited.has(nextId)) queue.push(nextId);
  }
  region._nearbyMarketIds = result;
  return result;
}

function habitDestinationIds(region) {
  return Object.values(ensureTradeEconomy(region).routeHabits)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((habit) => habit.destId);
}

function freshTradeLeadIds(region, currentTick) {
  if (!Number.isFinite(currentTick) || !Array.isArray(region.knowledge?.observations)) return [];
  const result = [];
  const seen = new Set();
  for (let i = region.knowledge.observations.length - 1; i >= 0; i -= 1) {
    const report = region.knowledge.observations[i];
    if (!TRADE_RELEVANT_REPORT_TOPICS.has(report.topic)) continue;
    const receivedAt = Number.isFinite(report.receivedAt) ? report.receivedAt : report.observedAt;
    if (!Number.isFinite(receivedAt) || currentTick - receivedAt > FRESH_REPORT_WEEKS) continue;
    if (report.subjectId && report.subjectId !== region.id && !seen.has(report.subjectId)) {
      seen.add(report.subjectId);
      result.push(report.subjectId);
      if (result.length >= 8) break;
    }
  }
  return result;
}

function activePartnerCount(region, currentTick) {
  if (!(region.recentTradePartners instanceof Map)) return 0;
  if (!Number.isFinite(currentTick)) return region.recentTradePartners.size;
  let count = 0;
  for (const lastTick of region.recentTradePartners.values()) {
    if (!Number.isFinite(lastTick) || currentTick - lastTick <= 52) count += 1;
  }
  return count;
}

function majorTradeHubIds(regions, currentTick) {
  return regions
    .map((region) => {
      const economy = ensureTradeEconomy(region);
      const partners = activePartnerCount(region, currentTick);
      const throughput = economy.exportIncomeEma + economy.importSpendEma;
      return { id: region.id, partners, score: partners * 4 + Math.log1p(Math.max(0, throughput)) };
    })
    .filter((entry) => entry.partners >= HUB_MIN_ACTIVE_PARTNERS)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MAJOR_HUBS)
    .map((entry) => entry.id);
}

function imitatedDestinationIds(region, regionsById) {
  const result = [];
  const seen = new Set();
  for (const contactId of directContactIds(region)) {
    const contact = regionsById.get(contactId);
    if (!contact) continue;
    const habits = Object.values(ensureTradeEconomy(contact).routeHabits)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    for (const habit of habits.slice(0, 2)) {
      if (habit.destId !== region.id && !seen.has(habit.destId)) {
        seen.add(habit.destId);
        result.push(habit.destId);
      }
    }
    if (result.length >= 8) break;
  }
  return result;
}

function candidateMarketIds(region, regionsById, knownIds, hubIds, currentTick) {
  const economy = ensureTradeEconomy(region);
  const candidateIds = new Set(habitDestinationIds(region));
  for (const id of freshTradeLeadIds(region, currentTick)) candidateIds.add(id);
  const noHabitsYet = Object.keys(economy.routeHabits).length === 0;
  const crisis = economy.searchPressure >= CRISIS_SEARCH_PRESSURE;
  // A merchant community that found nothing on its first survey should not
  // re-scan the entire known world every month forever. Give every region one
  // initial broad search, then fall back to the normal half-year cadence unless
  // failed ventures create crisis search pressure. Fresh reports and direct
  // contacts are still considered every tick outside that broad search.
  const initialBroadSearch = noHabitsYet && !economy.initialBroadSearchCompleted;
  const scheduledBroadSearch = staggeredDue(region, currentTick, BROAD_SEARCH_INTERVAL);
  const broadSearch = initialBroadSearch || crisis || scheduledBroadSearch;
  if (broadSearch) {
    economy.initialBroadSearchCompleted = true;
    for (const id of knownIds) candidateIds.add(id);
    for (const id of nearbyMarketIds(region, regionsById)) if (knownIds.has(id)) candidateIds.add(id);
  } else {
    for (const id of directContactIds(region)) candidateIds.add(id);
  }
  if (staggeredDue(region, currentTick, HUB_CHECK_INTERVAL)) {
    for (const id of hubIds) if (knownIds.has(id)) candidateIds.add(id);
  }
  if (staggeredDue(region, currentTick, IMITATION_INTERVAL)) {
    for (const id of imitatedDestinationIds(region, regionsById)) if (knownIds.has(id)) candidateIds.add(id);
  }
  candidateIds.delete(region.id);
  return candidateIds;
}

export function tickTrade(regions, currentTick = null, time = null) {
  for (const region of regions) {
    region.tradeLinks = new Map();
    beginTradeWeek(region);
  }
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  processVentures(regions, regionsById, currentTick, time);
  for (const region of regions) reconcileMerchantOccupation(region);

  const knownIdsByRegion = new Map(regions.map((region) => [region.id, knownRegionIds(region)]));
  const hubIds = majorTradeHubIds(regions, currentTick);
  const pricesByRegion = new Map(regions.map((region) => [region.id,
    Object.fromEntries(TRADABLE_RESOURCES.map((resource) => [resource, localPrice(region, resource)]))
  ]));

  for (const region of regions) {
    const economy = ensureTradeEconomy(region);
    const idle = Math.max(0, economy.merchantPopulation - activeMerchants(region));
    if (idle < 1) continue;
    const knownIds = knownIdsByRegion.get(region.id);
    const candidateIds = candidateMarketIds(region, regionsById, knownIds, hubIds, currentTick);
    const candidates = [...candidateIds].map((id) => regionsById.get(id)).filter(Boolean);
    if (!candidates.length) continue;
    const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById);
    launchVentures(region, opportunities, currentTick, time);
  }

  for (const region of regions) {
    adjustMerchantCareerPopulation(region);
    finishTradeWeek(region);
  }
  diffuseTradeNetworkKnowledge(regions, currentTick);
}
