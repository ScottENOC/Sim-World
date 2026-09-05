import { extractionRate, selectActiveTier } from '../world/resources/extraction.js?v=20260904-weather1';
import { regrow, neighborSpreadBonus } from '../world/resources/renewables.js?v=20260904-weather1';
import { toolEfficiencyMultiplier, desiredToolInvestment, investInTools, wearOutTools, materialUnitCost } from './tools.js?v=20260904-weather1';
import { adjustArmySize, adjustNavyCrew, usableAdvancedFishingBoats } from '../military/army.js?v=20260905-infra1';
import { spendMilitaryProcurement } from './stateFinance.js?v=20260904-weather1';
import { accumulateExperience, skillMultiplier } from '../technology/learningByDoing.js?v=20260904-weather1';
import { tickHorseEconomy, draughtFarmMultiplier } from './horses.js?v=20260904-policy1';
import { tickWeather } from '../world/weather.js?v=20260904-weather1';
import { navalMissionProfile } from '../military/policies.js?v=20260904-policy1';
import { conflictResourceAccess } from '../military/campaigns.js?v=20260905-infra1';
import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260905-projects1';

// --- Tunable constants -----------------------------------------------------
// All placeholders, calibrated so a "typical" region can just about feed
// itself with somewhere around half its population farming — deliberately
// not so generous that food is a non-issue, and not so tight that every
// region starves in week one. Some regions WILL come out under-fed given
// the population noise vs. land-quality noise below are independent random
// draws — that's the point (see the Bronze Age collapse conversation).
export const FOOD_PER_PERSON_PER_WEEK = 1; // 1 "ration" per person per tick, arbitrary unit
const FOOD_YIELD_PER_KM2 = 4.0;     // full bronze equipment raises the effective ceiling back toward 5.8
const FARM_LABOR_SATURATION_PER_KM2 = 1.5; // people/km² before diminishing returns bite hard
const MAX_FARMER_FRACTION = 0.9; // always leave some working-age labor for gathering/other pursuits
const MIN_FOOD_STORAGE_WEEKS = 2;
const MAX_FOOD_STORAGE_WEEKS = 20;
const MAX_FOOD_WEEKLY_SPOILAGE = 0.04;
const MIN_FOOD_WEEKLY_SPOILAGE = 0.008;
const SEASONAL_STORAGE_MARGIN = 1.15;
const POTTERY_PER_PERSON_FOR_FULL_STORAGE = 0.6;
const POTTERY_ANNUAL_BREAKAGE = 0.10;
const POTTERY_PER_POTTER = 2;
const POTTERY_CLAY_COST = 1;
const POTTERY_WOOD_COST = 0.2;

// Gathering: a real profession, not a fallback hack — foraging/hunting that
// barely benefits from bronze tools but is genuinely productive when there
// aren't many people competing for the same wild resources. This is what
// lets a low-density region like Scotland reach subsistence without needing
// to out-farm its land quality — people really did live at Bronze Age tech
// levels in places far harsher than Scotland.
const BASE_GATHER_YIELD_PER_WORKER = 1.2;
const GATHER_DENSITY_CEILING = 6;
const GATHER_MIN_FACTOR = 0.05;
const MAX_GATHERER_FRACTION = 0.85;

const WOOD_PER_LUMBERJACK = 0.8;
const WOOD_REGROWTH_RATE = 0.015;
const FOREST_SPREAD_RATE = 0.002;

const ORE_YIELD_PER_MINER = 3.0;
const BRONZE_PER_SMITH = 2.0;
const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, stone: 1 };
const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, clay: 1000 };
const BASELINE_BRONZE_DEMAND = 0.5;
const IRON_PER_SMITH = 1.2;
const BRONZE_RESERVE_PER_PERSON = 0.0005;
const BRONZE_RESERVE_BUILD_WEEKS = 26;
const MAX_IMPORTED_FOOD_DEPENDENCE = 0.25;
const MAX_FOOD_EXPORT_SURPLUS = 0.16;
const FOOD_ACCOUNTING_VALUE = 0.2;

const SHORE_FISH_YIELD_PER_WORKER_BASE = 0.5;
const BOAT_FISH_YIELD_PER_WORKER_BASE = 1.2;
const SHORE_FISH_CAPACITY_DIVISOR = 300;
const BOAT_FISH_CAPACITY_DIVISOR = 150;
const FISHERS_PER_FISHING_BOAT = 4;
const FISH_REGROWTH_RATE = 0.02;

const LUMBER_CAPACITY_DIVISOR = 400;
const WOOD_RESERVE_PER_PERSON = 0.05;
const WOOD_RESERVE_BUILD_WEEKS = 52;
const TRADE_LABOR_RESERVE_FRACTION = 0.01;

const BOAT_MOBILIZATION_RATE = 0.05;
const BOATMAKER_BUILD_RATE = 0.02;
const BOAT_WOOD_COST = 200;
const ADVANCED_BOAT_BUILD_RATE_MULTIPLIER = 0.6;
const ADVANCED_BOAT_COST = { wood: 300, pitch: 20, textiles: 15, metal: 5 };
const BASIC_BOAT_ANNUAL_WEAR = 0.08;
const ADVANCED_BOAT_ANNUAL_WEAR = 0.03;
const PITCH_PER_WORKER = 0.5;
const WOOD_PER_PITCH = 2;
const TEXTILES_PER_WORKER = 0.4;

function foodYieldNoise(region, rng) {
  if (region._foodNoise === undefined) region._foodNoise = 0.85 + rng() * 0.3;
  return region._foodNoise;
}

function foodOutput(farmers, maxFoodOutput, kLabor) {
  if (kLabor <= 0) return 0;
  return maxFoodOutput * (1 - Math.exp(-farmers / kLabor));
}

function farmersNeededFor(targetFood, maxFoodOutput, kLabor) {
  if (targetFood <= 0) return 0;
  if (targetFood >= maxFoodOutput) return Infinity;
  return -kLabor * Math.log(1 - targetFood / maxFoodOutput);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function weeklyAttrition(annualRate) {
  return 1 - Math.pow(1 - annualRate, 1 / 52);
}

function wearBoatFleet(total, advanced) {
  const safeAdvanced = Math.min(Math.max(0, advanced || 0), Math.max(0, total || 0));
  const basic = Math.max(0, total - safeAdvanced);
  const basicLost = basic * weeklyAttrition(BASIC_BOAT_ANNUAL_WEAR);
  const advancedLost = safeAdvanced * weeklyAttrition(ADVANCED_BOAT_ANNUAL_WEAR);
  return { total: Math.max(0, total - basicLost - advancedLost), advanced: Math.max(0, safeAdvanced - advancedLost),
    lost: basicLost + advancedLost };
}

export function potteryStorageProfile(region) {
  const coverage = clamp01((region.stockpile.pottery || 0) /
    Math.max(1, region.population * POTTERY_PER_PERSON_FOR_FULL_STORAGE));
  const granaries = effectiveInfrastructureCount(region, 'public_granary');
  const granaryEffectiveness = 0.45 + coverage * 0.55;
  return {
    coverage,
    granaries,
    weeks: Math.min(52, MIN_FOOD_STORAGE_WEEKS +
      (MAX_FOOD_STORAGE_WEEKS - MIN_FOOD_STORAGE_WEEKS) * coverage + granaries * 4 * granaryEffectiveness),
    spoilage: Math.max(0.004, (MAX_FOOD_WEEKLY_SPOILAGE -
      (MAX_FOOD_WEEKLY_SPOILAGE - MIN_FOOD_WEEKLY_SPOILAGE) * coverage) *
      Math.pow(0.85, granaries * granaryEffectiveness)),
  };
}

function consumeAdvancedBoatMetal(region, boatsBuilt) {
  let metalNeeded = boatsBuilt * ADVANCED_BOAT_COST.metal;
  const bronzeUsed = Math.min(region.stockpile.bronze || 0, metalNeeded);
  region.stockpile.bronze = (region.stockpile.bronze || 0) - bronzeUsed;
  metalNeeded -= bronzeUsed;
  const ironUsed = Math.min(region.stockpile.iron || 0, metalNeeded);
  region.stockpile.iron = (region.stockpile.iron || 0) - ironUsed;
  return { bronzeUsed, ironUsed };
}

export function buildFleetBoats(region, gap, makersAvailable) {
  if (gap <= 0 || makersAvailable <= 0) return { built: 0, advanced: 0, makers: 0 };
  let built = 0;
  let advanced = 0;
  let makers = 0;
  if (region.unlockedTechIds.has('advanced_boatbuilding') && operationalInfrastructure(region, 'harbour') &&
      operationalInfrastructure(region, 'shipyard')) {
    const advancedRate = BOATMAKER_BUILD_RATE * ADVANCED_BOAT_BUILD_RATE_MULTIPLIER;
    const metalAvailable = (region.stockpile.bronze || 0) + (region.stockpile.iron || 0);
    const possible = Math.min(gap, makersAvailable * advancedRate,
      (region.stockpile.wood || 0) / ADVANCED_BOAT_COST.wood,
      (region.stockpile.pitch || 0) / ADVANCED_BOAT_COST.pitch,
      (region.stockpile.textiles || 0) / ADVANCED_BOAT_COST.textiles,
      metalAvailable / ADVANCED_BOAT_COST.metal);
    advanced = Math.max(0, possible);
    if (advanced > 0) {
      region.stockpile.wood -= advanced * ADVANCED_BOAT_COST.wood;
      region.stockpile.pitch -= advanced * ADVANCED_BOAT_COST.pitch;
      region.stockpile.textiles -= advanced * ADVANCED_BOAT_COST.textiles;
      consumeAdvancedBoatMetal(region, advanced);
      const used = advanced / advancedRate;
      makers += used; makersAvailable -= used; gap -= advanced; built += advanced;
    }
  }
  const basic = Math.max(0, Math.min(gap, makersAvailable * BOATMAKER_BUILD_RATE,
    (region.stockpile.wood || 0) / BOAT_WOOD_COST));
  if (basic > 0) {
    region.stockpile.wood -= basic * BOAT_WOOD_COST;
    const used = basic / BOATMAKER_BUILD_RATE;
    makers += used; built += basic;
  }
  return { built, advanced, makers };
}

function plannedFoodProduction(region, foodNeeded) {
  const economy = region.tradeEconomy || {};
  const importCoverage = foodNeeded > 0 ? (economy.foodImportEma || 0) / foodNeeded : 0;
  const industrialIncomeCoverage = foodNeeded > 0
    ? (economy.nonFoodExportIncomeEma || 0) / (foodNeeded * FOOD_ACCOUNTING_VALUE) : 0;
  const deliveryConfidence = clamp01(Math.max(importCoverage / 0.001, economy.routeReliabilityEma || 0));
  const affordableDependence = Math.min(MAX_IMPORTED_FOOD_DEPENDENCE,
    industrialIncomeCoverage * 0.75 * deliveryConfidence);
  const previousDependence = region.foodImportDependence || 0;
  const targetDependence = previousDependence > 0.005
    ? Math.min(MAX_IMPORTED_FOOD_DEPENDENCE, industrialIncomeCoverage * 0.75) : affordableDependence;
  const adjustmentWeeks = targetDependence > previousDependence ? 40 * 52 : 60 * 52;
  region.foodImportDependence = previousDependence + (targetDependence - previousDependence) / adjustmentWeeks;

  const hasSurfaceMetal = ['copper', 'tin'].some((key) =>
    region.deposits?.[key]?.tiers?.some((tier) => tier.requiredTechId === null && tier.remainingStock > 0));
  const farmAdvantage = clamp01((region.landQuality - 0.75) / 0.55);
  const exportSurplus = hasSurfaceMetal ? 0 : farmAdvantage * MAX_FOOD_EXPORT_SURPLUS;
  const importDependence = region.foodImportDependence;
  return { target: foodNeeded * Math.max(0.65, 1 + exportSurplus - importDependence), importDependence, exportSurplus };
}

function allocateWithCaps(totalRequested, items, priorityFn) {
  let remaining = totalRequested;
  const state = items.map((i) => ({ ...i, allocated: 0 }));
  for (let iter = 0; iter < 5 && remaining > 0.01; iter++) {
    const withRoom = state.filter((i) => i.allocated < i.cap);
    if (withRoom.length === 0) break;
    const priorityTotal = withRoom.reduce((s, i) => s + priorityFn(i.key), 0);
    let distributed = 0;
    for (const i of withRoom) {
      const share = remaining * (priorityFn(i.key) / priorityTotal);
      const give = Math.min(share, i.cap - i.allocated);
      i.allocated += give;
      distributed += give;
    }
    remaining -= distributed;
  }
  const allocation = {};
  let used = 0;
  for (const i of state) { allocation[i.key] = i.allocated; used += i.allocated; }
  return { allocation, used };
}

export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const seaRegionsById = new Map(seaRegions.map((s) => [s.id, s]));
  tickWeather(regions, currentTick, rng);
  for (const region of regions) {
    region._externalBronzeDemand = region.neighbors.reduce((sum, id) =>
      sum + (regionsById.get(id)?.marketDemand?.bronze || 0), 0) * 0.25;
  }
  for (const region of regions) allocateAndProduce(region, seaRegionsById, toolTypes, rng);
  for (const region of regions) applyForestRegrowth(region, regionsById);
  for (const sea of seaRegions) {
    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: FISH_REGROWTH_RATE });
  }
}

function allocateAndProduce(region, seaRegionsById, toolTypes, rng) {
  const report = {};
  report.toolWear = { tools: wearOutTools(region) };
  const navyWear = wearBoatFleet(region.navy.boats, region.navy.advancedBoats);
  region.navy.boats = navyWear.total; region.navy.advancedBoats = navyWear.advanced;
  const fishingWear = wearBoatFleet(region.fishingBoats, region.advancedFishingBoats);
  region.fishingBoats = fishingWear.total; region.advancedFishingBoats = fishingWear.advanced;
  const potteryBroken = (region.stockpile.pottery || 0) * weeklyAttrition(POTTERY_ANNUAL_BREAKAGE);
  region.stockpile.pottery = Math.max(0, (region.stockpile.pottery || 0) - potteryBroken);
  report.maintenance = { boatLosses: navyWear.lost + fishingWear.lost, potteryBroken };

  const totalPop = region.population;
  const workingAge = region.demographics.workingAge;
  const emergencyMilitia = Math.max(0, region.emergencyMilitiaPersonnel || 0);
  const civilianWorkingAge = Math.max(0, workingAge - emergencyMilitia);
  // Persistent merchants are already committed to their occupation, whether
  // currently at home or away on a venture. They are not free generic labour
  // that can be reassigned to farming, mining, construction or the military
  // for one convenient week and then magically become merchants again.
  const committedMerchants = Math.min(civilianWorkingAge, Math.max(0, Math.round(
    region.tradeEconomy?.merchantPopulation ?? region.occupations?.trader ?? 0
  )));
  const resourceAccess = conflictResourceAccess(region);
  const horseReport = tickHorseEconomy(region, civilianWorkingAge);
  report.horses = horseReport;

  const requestedBuilders = Math.max(0, region.construction?.workersReserved || 0);
  const maintenanceWorkers = Math.max(0, region.construction?.maintenanceWorkersReserved || 0);
  const requestedSiegeWorkers = Math.max(0, region.siegeEquipment?.workersReserved || 0);
  adjustArmySize(region, Math.max(0, civilianWorkingAge - committedMerchants - region.army.personnel - region.navy.personnel - horseReport.workers - requestedBuilders - maintenanceWorkers - requestedSiegeWorkers));
  adjustNavyCrew(region, Math.max(0, civilianWorkingAge - committedMerchants - region.army.personnel - region.navy.personnel - horseReport.workers - requestedBuilders - maintenanceWorkers - requestedSiegeWorkers));
  const constructionWorkers = Math.min(requestedBuilders,
    Math.max(0, civilianWorkingAge - committedMerchants - region.army.personnel - region.navy.personnel - horseReport.workers));
  if (region.construction) region.construction.workersReserved = constructionWorkers;
  const actualMaintenanceWorkers = Math.min(maintenanceWorkers,
    Math.max(0, civilianWorkingAge - committedMerchants - region.army.personnel - region.navy.personnel - horseReport.workers - constructionWorkers));
  if (region.construction) region.construction.maintenanceWorkersReserved = actualMaintenanceWorkers;
  const siegeWorkers = Math.min(requestedSiegeWorkers,
    Math.max(0, civilianWorkingAge - committedMerchants - region.army.personnel - region.navy.personnel - horseReport.workers - constructionWorkers - actualMaintenanceWorkers));
  if (region.siegeEquipment) region.siegeEquipment.workersReserved = siegeWorkers;
  const laborPool = Math.max(0, civilianWorkingAge - committedMerchants - region.army.personnel - region.navy.personnel - horseReport.workers - constructionWorkers - actualMaintenanceWorkers - siegeWorkers);
  report.construction = { workers: Math.round(constructionWorkers) };
  report.siegeEquipment = { workers: Math.round(siegeWorkers) };
  report.infrastructureMaintenance = { workers: Math.round(actualMaintenanceWorkers) };

  const noise = foodYieldNoise(region, rng);
  const seasonalMultiplier = region.weather?.seasonalMultiplier ?? 1;
  const weatherMultiplier = region.weather?.yieldMultiplier ?? 1;
  const farmerToolMultiplier = toolEfficiencyMultiplier(region, 'farmer', toolTypes.farmer, region.unlockedTechIds);
  const toolYieldMultiplier = 0.7 + 0.3 * farmerToolMultiplier;
  const irrigation = effectiveInfrastructureCount(region, 'irrigation');
  const canal = effectiveInfrastructureCount(region, 'canal');
  const waterYieldMultiplier = 1 + Math.min(0.32, irrigation * 0.2 + canal * 0.12);
  const droughtProtection = 1 + Math.max(0, 1 - weatherMultiplier) * Math.min(0.55,
    effectiveInfrastructureCount(region, 'wells_cisterns') * 0.18 + irrigation * 0.25 + canal * 0.12);
  const maxFoodOutput = region.areaSqKm * region.landQuality * FOOD_YIELD_PER_KM2 * noise *
    (1 - horseReport.pastureFraction) * seasonalMultiplier * weatherMultiplier * droughtProtection *
    toolYieldMultiplier * resourceAccess * waterYieldMultiplier;
  const kLabor = region.areaSqKm * FARM_LABOR_SATURATION_PER_KM2;
  const humanFoodNeeded = totalPop * FOOD_PER_PERSON_PER_WEEK;
  const foodNeeded = humanFoodNeeded + horseReport.fodderNeeded;
  const foodPlan = plannedFoodProduction(region, foodNeeded);
  const foodProductionTarget = foodPlan.target * seasonalMultiplier * SEASONAL_STORAGE_MARGIN;

  const farmerEfficiency = farmerToolMultiplier * skillMultiplier(region, 'farming') *
    draughtFarmMultiplier(region, region.occupations?.farmer || workingAge * 0.5);
  const farmersNeededRaw = farmersNeededFor(foodProductionTarget, maxFoodOutput, kLabor) / farmerEfficiency;
  const farmers = Math.min(laborPool * MAX_FARMER_FRACTION, farmersNeededRaw);
  const foodFromFarming = foodOutput(farmers * farmerEfficiency, maxFoodOutput, kLabor);
  accumulateExperience(region, 'farming', farmers);
  report.farming = { workers: Math.round(farmers), food: foodFromFarming, seasonalMultiplier, weatherMultiplier };
  report.weather = { condition: region.weather?.condition || 'normal', index: region.weather?.index || 0,
    seasonalMultiplier, weatherMultiplier };

  const density = region.areaSqKm > 0 ? totalPop / region.areaSqKm : 0;
  const gatherYieldPerWorker = BASE_GATHER_YIELD_PER_WORKER *
    Math.max(GATHER_MIN_FACTOR, 1 - density / GATHER_DENSITY_CEILING) * skillMultiplier(region, 'gathering');
  const remainingFoodNeeded = Math.max(0, foodProductionTarget - foodFromFarming);
  const laborAfterFarming = Math.max(0, laborPool - farmers);
  const gatherersNeeded = gatherYieldPerWorker > 0 ? remainingFoodNeeded / gatherYieldPerWorker : 0;
  const gatherers = Math.min(laborAfterFarming * MAX_GATHERER_FRACTION, gatherersNeeded);
  const foodFromGathering = gatherers * gatherYieldPerWorker;
  accumulateExperience(region, 'gathering', gatherers);
  report.gathering = { workers: Math.round(gatherers), food: foodFromGathering };

  let shoreFishers = 0;
  let boatFishers = 0;
  let foodFromFishing = 0;
  const laborAfterGathering = Math.max(0, laborAfterFarming - gatherers);
  const remainingAfterGather = Math.max(0, foodProductionTarget - foodFromFarming - foodFromGathering);
  if (region.adjacentSeaIds.length > 0 && remainingAfterGather > 0 && laborAfterGathering > 0) {
    const sea = seaRegionsById.get(region.adjacentSeaIds[0]);
    if (sea) {
      const fishingSkill = skillMultiplier(region, 'fishing');
      const stockFraction = sea.fish.K > 0 ? sea.fish.currentStock / sea.fish.K : 0;
      const shoreCapacityTotal = Math.round(sea.fish.K / SHORE_FISH_CAPACITY_DIVISOR);
      const shoreCapacity = Math.round(shoreCapacityTotal / Math.max(1, sea.adjacentLand.length));
      const shoreYieldPerWorker = SHORE_FISH_YIELD_PER_WORKER_BASE * stockFraction * fishingSkill;
      const shoreFishersWanted = shoreYieldPerWorker > 0 ? remainingAfterGather / shoreYieldPerWorker : 0;
      shoreFishers = Math.min(shoreCapacity, laborAfterGathering, shoreFishersWanted);
      const foodFromShore = shoreFishers * shoreYieldPerWorker;
      const stillNeeded = Math.max(0, remainingAfterGather - foodFromShore);
      const usableAdvancedFishing = usableAdvancedFishingBoats(region);
      const advancedShare = region.fishingBoats > 0 ? Math.min(1, usableAdvancedFishing / region.fishingBoats) : 0;
      const navalMission = navalMissionProfile(region);
      const fisheryPatrolCoverage = clamp01((region.navy?.personnel || 0) / Math.max(1, region.population * 0.005));
      const fisheryProtection = 1 + Math.max(0, navalMission.fishing - 1) * fisheryPatrolCoverage;
      const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * (1 + advancedShare * 0.5) *
        stockFraction * fishingSkill * fisheryProtection;
      const boatCapacityTotal = Math.round(sea.fish.K / BOAT_FISH_CAPACITY_DIVISOR);
      const boatCapacityShare = Math.round(boatCapacityTotal / Math.max(1, sea.adjacentLand.length));
      const effectiveFishingBoats = Math.max(0, region.fishingBoats - (region.advancedFishingBoats || 0)) +
        usableAdvancedFishing * 2;
      const boatFishCapacity = Math.min(effectiveFishingBoats * FISHERS_PER_FISHING_BOAT, boatCapacityShare);
      const boatFishersWanted = boatYieldPerWorker > 0 ? stillNeeded / boatYieldPerWorker : 0;
      boatFishers = Math.min(boatFishCapacity, Math.max(0, laborAfterGathering - shoreFishers), boatFishersWanted);
      const foodFromBoat = boatFishers * boatYieldPerWorker;
      const totalWanted = foodFromShore + foodFromBoat;
      foodFromFishing = Math.min(totalWanted, sea.fish.currentStock);
      sea.fish.currentStock -= foodFromFishing;
      const catchScale = totalWanted > 0 ? foodFromFishing / totalWanted : 0;
      report.shoreFishing = { workers: Math.round(shoreFishers), food: foodFromShore * catchScale, seaName: sea.name };
      report.boatFishing = { workers: Math.round(boatFishers), food: foodFromBoat * catchScale,
        advancedShare, fisheryProtection, seaName: sea.name };
      if (stillNeeded > foodFromBoat + 0.5 && effectiveFishingBoats * FISHERS_PER_FISHING_BOAT < boatCapacityShare) {
        if (boatFishCapacity > 0 && boatFishers >= boatFishCapacity * 0.95) {
          region.targetFishingBoats = Math.max(region.targetFishingBoats, region.fishingBoats + Math.max(1, region.fishingBoats * 0.1));
        } else if (region.fishingBoats === 0) region.targetFishingBoats = Math.max(region.targetFishingBoats, 2);
      }
      accumulateExperience(region, 'fishing', shoreFishers + boatFishers);
    }
  }

  const foodProduced = foodFromFarming + foodFromGathering + foodFromFishing;
  report.foodPlan = { target: foodProductionTarget, importDependence: foodPlan.importDependence,
    exportSurplus: foodPlan.exportSurplus };
  report.conflict = { pressure: region.conflictPressure || 0, resourceAccess, emergencyMilitia };
  region._foodNeeded = humanFoodNeeded;
  const surplus = Math.max(0, laborAfterGathering - shoreFishers - boatFishers);

  const forestFraction = region.forest.K > 0 ? region.forest.currentStock / region.forest.K : 0;
  const lumberCapacity = forestFraction > 0.05 ? Math.round(region.forest.K / LUMBER_CAPACITY_DIVISOR) : 0;
  const woodReserveTarget = region.population * WOOD_RESERVE_PER_PERSON;
  const woodWanted = Math.max(0, woodReserveTarget - (region.stockpile.wood || 0)) / WOOD_RESERVE_BUILD_WEEKS;
  const lumberjacksWanted = WOOD_PER_LUMBERJACK > 0 ? woodWanted / WOOD_PER_LUMBERJACK : 0;
  const lumberjacks = Math.min(lumberCapacity, surplus, lumberjacksWanted);
  let remainingSurplus = surplus - lumberjacks;

  const totalBoatGap = region.isCoastal ? Math.max(0, region.targetNavySize - region.navy.boats) +
    Math.max(0, region.targetFishingBoats - region.fishingBoats) : 0;
  const advancedDemandBoats = region.unlockedTechIds.has('advanced_boatbuilding') ? Math.min(2, totalBoatGap) : 0;
  const pitchTarget = region.population * 0.001 + advancedDemandBoats * ADVANCED_BOAT_COST.pitch;
  const textileTarget = region.population * 0.002 + advancedDemandBoats * ADVANCED_BOAT_COST.textiles;
  const pitchWanted = Math.max(0, pitchTarget - (region.stockpile.pitch || 0));
  const textilesWanted = Math.max(0, textileTarget - (region.stockpile.textiles || 0));
  const craftLaborCap = remainingSurplus * 0.05;
  const pitchWorkers = Math.min(craftLaborCap, pitchWanted / PITCH_PER_WORKER,
    (region.stockpile.wood || 0) / (PITCH_PER_WORKER * WOOD_PER_PITCH));
  const pitchMade = pitchWorkers * PITCH_PER_WORKER;
  region.stockpile.wood = (region.stockpile.wood || 0) - pitchMade * WOOD_PER_PITCH;
  region.stockpile.pitch = (region.stockpile.pitch || 0) + pitchMade;
  const textileLaborCapacity = Math.max(1, region.areaSqKm * region.landQuality * 0.01);
  const textileWorkers = Math.min(Math.max(0, craftLaborCap - pitchWorkers), textileLaborCapacity,
    textilesWanted / (TEXTILES_PER_WORKER * skillMultiplier(region, 'textiles')));
  const textilesMade = textileWorkers * TEXTILES_PER_WORKER * skillMultiplier(region, 'textiles');
  region.stockpile.textiles = (region.stockpile.textiles || 0) + textilesMade;
  accumulateExperience(region, 'textiles', textileWorkers);
  remainingSurplus -= pitchWorkers + textileWorkers;
  report.materialCrafts = { workers: Math.round(pitchWorkers + textileWorkers), pitch: pitchMade, textiles: textilesMade };

  let boatMakers = 0;
  if (region.isCoastal) {
    const navyGap = Math.max(0, region.targetNavySize - region.navy.boats);
    const navyBoatsWanted = navyGap * BOAT_MOBILIZATION_RATE;
    const navyMakersWanted = BOATMAKER_BUILD_RATE > 0 ? navyBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const navyMakersAvailable = Math.min(navyMakersWanted, remainingSurplus);
    const navyBuild = buildFleetBoats(region, Math.min(navyGap, navyBoatsWanted), navyMakersAvailable);
    region.navy.boats += navyBuild.built;
    region.navy.advancedBoats = (region.navy.advancedBoats || 0) + navyBuild.advanced;
    const navyMakersUsed = navyBuild.makers;
    const fishGap = Math.max(0, region.targetFishingBoats - region.fishingBoats);
    const fishBoatsWanted = fishGap * BOAT_MOBILIZATION_RATE;
    const fishMakersWanted = BOATMAKER_BUILD_RATE > 0 ? fishBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const fishMakersAvailable = Math.min(fishMakersWanted, Math.max(0, remainingSurplus - navyMakersUsed));
    const fishBuild = buildFleetBoats(region, Math.min(fishGap, fishBoatsWanted), fishMakersAvailable);
    region.fishingBoats += fishBuild.built;
    region.advancedFishingBoats = (region.advancedFishingBoats || 0) + fishBuild.advanced;
    const fishMakersUsed = fishBuild.makers;
    boatMakers = navyMakersUsed + fishMakersUsed;
    accumulateExperience(region, 'boatbuilding', boatMakers);
    report.boatmaking = { workers: Math.round(boatMakers), navyBoats: navyBuild.built,
      advancedNavyBoats: navyBuild.advanced, fishingBoats: fishBuild.built,
      advancedFishingBoats: fishBuild.advanced };
  }
  remainingSurplus -= boatMakers;

  const tradeLaborReserve = Math.min(remainingSurplus, laborPool * TRADE_LABOR_RESERVE_FRACTION);
  remainingSurplus -= tradeLaborReserve;
  const miningTech = new Set(region.unlockedTechIds);
  if (!operationalInfrastructure(region, 'deep_mine')) miningTech.delete('shaft_mining');
  if (!operationalInfrastructure(region, 'mine_drainage')) miningTech.delete('mine_drainage');
  const activeTiers = {};
  for (const [key, deposit] of Object.entries(region.deposits)) activeTiers[key] = selectActiveTier(deposit.tiers, miningTech);
  const ironReadiness = region.unlockedTechIds.has('iron_smelting')
    ? Math.max(0.02, Math.min(1, region.ironWorkingReadiness || 0)) : 0;
  const openResources = Object.keys(activeTiers).filter((key) =>
    activeTiers[key] !== null && (key !== 'ironOre' || region.unlockedTechIds.has('iron_smelting')));
  const canSupply = (resource) => (region.stockpile[resource] || 0) > 0 || Boolean(activeTiers[resource]);
  const materialAvailability = { bronze: true, iron: region.unlockedTechIds.has('iron_smelting') &&
    ((region.stockpile.iron || 0) > 0 || canSupply('ironOre')) };

  const prevMiners = region.occupations?.miner || 0;
  const toolWants = [
    ['farmer', desiredToolInvestment(region, 'farmer', farmers, toolTypes.farmer, region.unlockedTechIds, materialAvailability)],
    ['lumberjack', desiredToolInvestment(region, 'lumberjack', lumberjacks, toolTypes.lumberjack, region.unlockedTechIds, materialAvailability)],
    ['miner', desiredToolInvestment(region, 'miner', prevMiners, toolTypes.miner, region.unlockedTechIds, materialAvailability)],
    ['soldier', desiredToolInvestment(region, 'soldier', Math.round(region.army.personnel), toolTypes.soldier, region.unlockedTechIds, materialAvailability)],
  ];
  const wantedByMaterial = { bronze: 0, iron: 0 };
  for (const [, want] of toolWants) if (want.material) wantedByMaterial[want.material] += want.materialWanted;

  const hasLocalCopperAndTin = Boolean(region.deposits.copper && region.deposits.tin);
  const isIntermediaryHub = !region.deposits.copper && !region.deposits.tin && region.neighbors.length >= 7;
  const hasSmeltingInputs = (region.stockpile.copper || 0) >= 2 && (region.stockpile.tin || 0) >= 1;
  const isBronzeWorkshop = hasLocalCopperAndTin || isIntermediaryHub || hasSmeltingInputs ||
    (region.experience.smithing || 0) > 100;
  region.canSmeltBronze = isBronzeWorkshop;
  const bronzeReserveTarget = Math.max(5, region.population * BRONZE_RESERVE_PER_PERSON);
  const commercialBronzeDemand = Math.max(0,
    (bronzeReserveTarget - (region.stockpile.bronze || 0)) / BRONZE_RESERVE_BUILD_WEEKS);
  const desiredBronzeOutput = isBronzeWorkshop ? wantedByMaterial.bronze + BASELINE_BRONZE_DEMAND +
    region.militaryBronzeDemand + commercialBronzeDemand + (region._externalBronzeDemand || 0) : 0;
  const desiredIronOutput = wantedByMaterial.iron;
  const potteryTarget = region.population * POTTERY_PER_PERSON_FOR_FULL_STORAGE;
  const desiredPotteryOutput = potteryBroken + Math.max(0, potteryTarget - (region.stockpile.pottery || 0)) / 52;
  region.marketDemand = {
    bronze: isBronzeWorkshop ? 0 : wantedByMaterial.bronze,
    copper: isBronzeWorkshop ? Math.max(0, desiredBronzeOutput * 2 - (region.stockpile.copper || 0)) : 0,
    tin: isBronzeWorkshop ? Math.max(0, desiredBronzeOutput - (region.stockpile.tin || 0)) : 0,
    ironOre: desiredIronOutput,
    clay: Math.max(0, desiredPotteryOutput * POTTERY_CLAY_COST - (region.stockpile.clay || 0)),
    pitch: Math.max(0, pitchTarget - (region.stockpile.pitch || 0)),
    textiles: Math.max(0, textileTarget - (region.stockpile.textiles || 0)),
    horses: horseReport.unmetDemand,
  };

  const bronzePerSmith = BRONZE_PER_SMITH * skillMultiplier(region, 'smithing');
  const ironPerSmith = IRON_PER_SMITH * skillMultiplier(region, 'smithing') * ironReadiness;
  const desiredSmithsLabor = Math.min(remainingSurplus * 0.6,
    (bronzePerSmith > 0 ? desiredBronzeOutput / bronzePerSmith : 0) +
    (ironPerSmith > 0 ? desiredIronOutput / ironPerSmith : 0));
  const desiredPotteryLabor = desiredPotteryOutput / (POTTERY_PER_POTTER * skillMultiplier(region, 'pottery'));
  const potteryLaborReserve = Math.min(remainingSurplus * 0.2, desiredPotteryLabor);
  const minerBudget = Math.max(0, remainingSurplus - desiredSmithsLabor - potteryLaborReserve);

  const copperTarget = region.deposits.copper ? Math.max(desiredBronzeOutput * 2, MINE_SALE_BUFFER.copper) : desiredBronzeOutput * 2;
  const tinTarget = region.deposits.tin ? Math.max(desiredBronzeOutput, MINE_SALE_BUFFER.tin) : desiredBronzeOutput;
  const ironOreTarget = region.deposits.ironOre ? Math.max(desiredIronOutput, MINE_SALE_BUFFER.ironOre) : desiredIronOutput;
  const clayTarget = region.deposits.clay ? Math.max(desiredPotteryOutput * POTTERY_CLAY_COST, MINE_SALE_BUFFER.clay) : desiredPotteryOutput * POTTERY_CLAY_COST;
  const copperNeeded = Math.max(0, copperTarget - (region.stockpile.copper || 0));
  const tinNeeded = Math.max(0, tinTarget - (region.stockpile.tin || 0));
  const ironOreNeeded = Math.max(0, ironOreTarget - (region.stockpile.ironOre || 0));
  const clayNeeded = Math.max(0, clayTarget - (region.stockpile.clay || 0));
  const miningSkill = skillMultiplier(region, 'mining');
  const oreYieldPerMiner = ORE_YIELD_PER_MINER * miningSkill;
  const targetLabor = {
    copper: activeTiers.copper ? Math.min(copperNeeded / oreYieldPerMiner, activeTiers.copper.maxWorkers) : 0,
    tin: activeTiers.tin ? Math.min(tinNeeded / oreYieldPerMiner, activeTiers.tin.maxWorkers) : 0,
    ironOre: activeTiers.ironOre && region.unlockedTechIds.has('iron_smelting') ? Math.min(ironOreNeeded / oreYieldPerMiner, activeTiers.ironOre.maxWorkers) : 0,
    clay: activeTiers.clay ? Math.min(clayNeeded / oreYieldPerMiner, activeTiers.clay.maxWorkers) : 0,
  };
  const targetLaborTotal = targetLabor.copper + targetLabor.tin + targetLabor.ironOre + targetLabor.clay;
  const minerAllocation = {};
  for (const key of openResources) minerAllocation[key] = 0;
  let budgetLeft = minerBudget;
  if (targetLaborTotal > 0) {
    const scale = Math.min(1, budgetLeft / targetLaborTotal);
    for (const key of ['copper', 'tin', 'ironOre', 'clay']) {
      if (activeTiers[key]) { minerAllocation[key] = targetLabor[key] * scale; budgetLeft -= minerAllocation[key]; }
    }
  }
  if (budgetLeft > 0.01) {
    const backgroundResources = openResources.filter((key) => key === 'gold' || key === 'stone');
    const items = backgroundResources.map((key) => ({ key, cap: activeTiers[key].maxWorkers - minerAllocation[key] }));
    const { allocation } = allocateWithCaps(budgetLeft, items, (key) => ORE_PRIORITY[key] || 1);
    for (const key of backgroundResources) minerAllocation[key] += allocation[key] || 0;
  }

  let minersUsed = 0;
  const minedThisTick = {};
  for (const key of openResources) {
    const tier = activeTiers[key];
    const gathered = extractionRate({ initialStock: tier.initialStock, remainingStock: tier.remainingStock,
      workers: minerAllocation[key], baseYieldPerWorker: oreYieldPerMiner * resourceAccess *
        (key === 'ironOre' ? ironReadiness : 1) * (key === 'stone' ? 1 + Math.min(0.35,
          effectiveInfrastructureCount(region, 'state_quarry') * 0.35) : 1), difficulty: tier.difficulty });
    tier.remainingStock -= gathered;
    region.stockpile[key] = (region.stockpile[key] || 0) + gathered;
    minersUsed += minerAllocation[key]; minedThisTick[key] = gathered;
  }
  accumulateExperience(region, 'mining', minersUsed);
  report.mining = { workers: Math.round(minersUsed), ...minedThisTick };

  const maxBronzeByCopper = (region.stockpile.copper || 0) / 2;
  const maxBronzeByTin = (region.stockpile.tin || 0);
  const bronzeLaborCap = bronzePerSmith > 0 ? Math.min(desiredBronzeOutput, maxBronzeByCopper, maxBronzeByTin) / bronzePerSmith : 0;
  const ironLaborCap = ironPerSmith > 0 ? Math.min(desiredIronOutput, region.stockpile.ironOre || 0) / ironPerSmith : 0;
  const smithPriorities = { bronze: bronzePerSmith > 0 ? desiredBronzeOutput / bronzePerSmith : 0,
    iron: ironPerSmith > 0 ? desiredIronOutput / ironPerSmith : 0 };
  const { allocation: smithAllocation } = allocateWithCaps(desiredSmithsLabor,
    [{ key: 'bronze', cap: bronzeLaborCap }, { key: 'iron', cap: ironLaborCap }],
    (key) => smithPriorities[key]);
  const bronzeMade = (smithAllocation.bronze || 0) * bronzePerSmith;
  const ironMade = (smithAllocation.iron || 0) * ironPerSmith;
  const actualSmiths = (smithAllocation.bronze || 0) + (smithAllocation.iron || 0);
  accumulateExperience(region, 'smithing', actualSmiths);
  report.smithing = { workers: Math.round(actualSmiths), bronze: bronzeMade, iron: ironMade, ironReadiness };
  region.stockpile.copper = (region.stockpile.copper || 0) - bronzeMade * 2;
  region.stockpile.tin = (region.stockpile.tin || 0) - bronzeMade;
  region.stockpile.bronze = (region.stockpile.bronze || 0) + bronzeMade;
  region.stockpile.ironOre = (region.stockpile.ironOre || 0) - ironMade;
  region.stockpile.iron = (region.stockpile.iron || 0) + ironMade;

  const potterySkill = skillMultiplier(region, 'pottery');
  const potteryLaborAvailable = Math.max(0, remainingSurplus - minersUsed - actualSmiths);
  const potteryByLabor = potteryLaborAvailable * POTTERY_PER_POTTER * potterySkill;
  const potteryByClay = (region.stockpile.clay || 0) / POTTERY_CLAY_COST;
  const potteryByWood = (region.stockpile.wood || 0) / POTTERY_WOOD_COST;
  const potteryMade = Math.max(0, Math.min(desiredPotteryOutput, potteryByLabor, potteryByClay, potteryByWood));
  const potters = potteryMade > 0 ? potteryMade / (POTTERY_PER_POTTER * potterySkill) : 0;
  region.stockpile.clay = (region.stockpile.clay || 0) - potteryMade * POTTERY_CLAY_COST;
  region.stockpile.wood = (region.stockpile.wood || 0) - potteryMade * POTTERY_WOOD_COST;
  region.stockpile.pottery = (region.stockpile.pottery || 0) + potteryMade;
  accumulateExperience(region, 'pottery', potters);
  report.pottery = { workers: Math.round(potters), pottery: potteryMade };

  const consumedOffTop = Math.min(region.stockpile.bronze, BASELINE_BRONZE_DEMAND + region.militaryBronzeDemand);
  region.stockpile.bronze -= consumedOffTop;
  for (const material of ['bronze', 'iron']) {
    const totalToolWant = wantedByMaterial[material];
    if (totalToolWant <= 0 || (region.stockpile[material] || 0) <= 0) continue;
    const pool = region.stockpile[material];
    for (const [occupation, want] of toolWants) {
      if (want.material !== material || want.materialWanted <= 0) continue;
      let materialAvailable = pool * (want.materialWanted / totalToolWant);
      const unitCost = materialUnitCost(region, material);
      if (occupation === 'soldier') materialAvailable = Math.min(materialAvailable,
        (region.militaryFinance?.procurementBudget || 0) / Math.max(0.001, unitCost));
      const materialSpent = investInTools(region, occupation, want, materialAvailable);
      region.stockpile[material] -= materialSpent;
      if (occupation === 'soldier' && materialSpent > 0) spendMilitaryProcurement(region, materialSpent * unitCost);
    }
  }

  const leftover = Math.round(Math.max(0, surplus - lumberjacks - pitchWorkers - textileWorkers -
    boatMakers - minersUsed - actualSmiths - potters));
  region._availableForTrade = leftover;
  region.occupations = {
    farmer: Math.round(farmers), gatherer: Math.round(gatherers), shoreFisher: Math.round(shoreFishers),
    boatFisher: Math.round(boatFishers), lumberjack: Math.round(lumberjacks), boatmaker: Math.round(boatMakers),
    pitchMaker: Math.round(pitchWorkers), textileWorker: Math.round(textileWorkers), potter: Math.round(potters),
    miner: Math.round(minersUsed), smith: Math.round(actualSmiths), soldier: Math.round(region.army.personnel),
    sailor: Math.round(region.navy.personnel), horseBreeder: Math.round(horseReport.breeders),
    horseTrainer: Math.round(horseReport.trainers), builder: Math.round(constructionWorkers),
    siegeEngineer: Math.round(siegeWorkers), maintenanceWorker: Math.round(actualMaintenanceWorkers),
    trader: committedMerchants,
    general: leftover,
  };

  let foodBalance = (region.stockpile.food || 0) + foodProduced - foodNeeded;
  if (foodBalance > 0) {
    const storage = potteryStorageProfile(region);
    foodBalance = Math.min(foodBalance * (1 - storage.spoilage), foodNeeded * storage.weeks);
    report.foodStorage = { potteryCoverage: storage.coverage, publicGranaries: storage.granaries,
      weeks: storage.weeks, spoilage: storage.spoilage };
  }
  region.stockpile.food = foodBalance;
  const lumberjackEfficiency = toolEfficiencyMultiplier(region, 'lumberjack', toolTypes.lumberjack,
    region.unlockedTechIds) * skillMultiplier(region, 'lumberjack');
  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK * lumberjackEfficiency * resourceAccess,
    region.forest.currentStock);
  region.forest.currentStock -= woodGathered;
  region.stockpile.wood = (region.stockpile.wood || 0) + woodGathered;
  accumulateExperience(region, 'lumberjack', lumberjacks);
  report.lumberjack = { workers: Math.round(lumberjacks), wood: woodGathered };
  region.report = report;
}

function applyForestRegrowth(region, regionsById) {
  const neighborStocks = region.neighbors.map((id) => regionsById.get(id).forest.currentStock);
  const neighborKs = region.neighbors.map((id) => regionsById.get(id).forest.K);
  const bonus = neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate: FOREST_SPREAD_RATE });
  const grown = regrow({ currentStock: region.forest.currentStock, K: region.forest.K, rate: WOOD_REGROWTH_RATE });
  region.forest.currentStock = Math.min(region.forest.K, grown + bonus * region.forest.K);
}
