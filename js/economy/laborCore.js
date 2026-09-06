import { extractionRate, selectActiveTier } from '../world/resources/extraction.js?v=20260904-weather1';
import { regrow, neighborSpreadBonus } from '../world/resources/renewables.js?v=20260904-weather1';
import { toolEfficiencyMultiplier, desiredToolInvestment, investInTools, wearOutTools, materialUnitCost } from './tools.js?v=20260905-goods1';
import { adjustArmySize, adjustNavyCrew, usableAdvancedFishingBoats } from '../military/army.js?v=20260905-infra1';
import { spendMilitaryProcurement } from './stateFinance.js?v=20260904-weather1';
import { accumulateExperience, skillMultiplier } from '../technology/learningByDoing.js?v=20260904-weather1';
import { tickHorseEconomy, draughtFarmMultiplier } from './horses.js?v=20260904-policy1';
import { tickWeather } from '../world/weather.js?v=20260904-weather1';
import { navalMissionProfile } from '../military/policies.js?v=20260904-policy1';
import { conflictResourceAccess } from '../military/campaigns.js?v=20260905-infra1';
import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260905-projects1';
import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';
import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';

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
// aren't many mouths competing for the same wild resources. This is what
// lets a low-density region like Scotland reach subsistence without needing
// to out-farm its land quality — people really did live at Bronze Age tech
// levels in places far harsher than Scotland.
const BASE_GATHER_YIELD_PER_WORKER = 1.2; // rations/week per gatherer at near-zero density
const GATHER_DENSITY_CEILING = 6;         // people/km² — beyond this, wild resources are too thin to matter
const GATHER_MIN_FACTOR = 0.05;           // gathering never fully collapses to zero
const MAX_GATHERER_FRACTION = 0.85;       // leave some of the post-farming labor pool free for fishing too

const WOOD_PER_LUMBERJACK = 0.8;
const WOOD_REGROWTH_RATE = 0.015;
const FOREST_SPREAD_RATE = 0.002;

const ORE_YIELD_PER_MINER = 3.0;
const COPPER_ORE_PER_METAL = 8;
const TIN_ORE_PER_METAL = 10;
const NONFERROUS_METAL_PER_SMELTER = 1.5;
const SMELTING_WOOD_PER_METAL = 0.5;
const BRONZE_COPPER_PER_UNIT = 0.9;
const BRONZE_TIN_PER_UNIT = 0.1;
const BRONZE_PER_SMITH = 2.0;

// Fixed priority, not proportional-to-remaining-stock — stone is orders of
// magnitude more abundant than copper/tin, so weighting by raw tonnage let
// it swallow almost the entire miner pool. Real economies allocate by what's
// wanted, not by what's numerically biggest. There's no full price/market
// system yet (that's the trade system), so this is a placeholder stand-in
// for background (non-tool-demand) mining priority.
const ORE_PRIORITY = { copper: 3, tin: 3, ironOre: 2, clay: 1, gold: 2, stone: 1 };
const MINE_SALE_BUFFER = { copper: 2000, tin: 1000, ironOre: 3000, clay: 1000 };
const METAL_SALE_BUFFER = { copper: 200, tin: 100 };

// A little bronze demand exists even with every tool bought — prestige
// goods, trade goods, everyday repairs — so smithing doesn't collapse to
// exactly zero the moment every farmer has a plough. Deliberately small:
// realistic weekly bronze output from a Bronze Age mine-face is itself
// small, and this must never be large enough to structurally starve tool
// investment the way an earlier, too-large value did.
const BASELINE_BRONZE_DEMAND = 0.5;
const IRON_PER_SMITH = 1.2;
// Keep only a working reserve. A ten-times larger target let the bronze
// economy bank several generations of replacement metal, so exhausted tin
// mines had no economic consequence until long after the intended crisis.
const BRONZE_RESERVE_PER_PERSON = 0.0005;
const BRONZE_RESERVE_BUILD_WEEKS = 26;

// Specialisation begins cautiously and only deepens after the market has
// actually delivered food and paid for non-food exports. The one-year EMAs
// in trade.js provide hysteresis: a region cannot turn all its farmers into
// miners on the strength of one good caravan.
const MAX_IMPORTED_FOOD_DEPENDENCE = 0.25;
const MAX_FOOD_EXPORT_SURPLUS = 0.16;
const FOOD_ACCOUNTING_VALUE = 0.2;

// Fishing: a third food source alongside farming and gathering, drawn from
// whichever sea(s) a region borders. Real commons — multiple land regions
// sharing one sea draw from the same stock, same as the Irish Sea touching
// five of our six regions in real life. Yield scales directly with the
// sea's current stock fraction (not a separate difficulty curve like ore —
// fish is renewable, so "yield tracks how full the sea currently is" is
// the whole story), which is what makes overfishing self-punishing: catch
// too much, and next week's yield-per-worker is worse for everyone sharing
// that sea, not just you.
const SHORE_FISH_YIELD_PER_WORKER_BASE = 0.5; // no boat needed, lower reach/yield
const BOAT_FISH_YIELD_PER_WORKER_BASE = 1.2;  // needs a fishing boat, higher yield
const SHORE_FISH_CAPACITY_DIVISOR = 300;      // physical cap on shore fishers a sea can usefully support
const BOAT_FISH_CAPACITY_DIVISOR = 150;       // boats reach further, so somewhat more capacity than shore — but still capped
const FISHERS_PER_FISHING_BOAT = 4;
const FISH_REGROWTH_RATE = 0.02;

const LUMBER_CAPACITY_DIVISOR = 400; // physical cap on lumberjacks a forest can usefully employ
const WOOD_RESERVE_PER_PERSON = 0.05;
const WOOD_RESERVE_BUILD_WEEKS = 52;
const TRADE_LABOR_RESERVE_FRACTION = 0.01;

// Boats: needs a sea border (region.isCoastal), lots of wood, and a
// dedicated profession. Fleet size ramps toward the player's target
// gradually, same shape as army mobilization.
const BOAT_MOBILIZATION_RATE = 0.05;
const BOATMAKER_BUILD_RATE = 0.02; // boats/week per worker — roughly a year per boat for a small crew
const BOAT_WOOD_COST = 200;
const ADVANCED_BOAT_BUILD_RATE_MULTIPLIER = 0.6;
const ADVANCED_BOAT_COST = { wood: 300, pitch: 20, textiles: 15, metal: 5 };
const BASIC_BOAT_ANNUAL_WEAR = 0.08;
const ADVANCED_BOAT_ANNUAL_WEAR = 0.03;
const PITCH_PER_WORKER = 0.5;
const WOOD_PER_PITCH = 2;
const TEXTILES_PER_WORKER = 0.4;
const CLOTHES_PER_TAILOR = 0.5;
const TEXTILES_PER_CLOTHING = 1;
const CLOTHING_PER_PERSON_TARGET = 0.4;
const CLOTHING_ANNUAL_WEAR = 0.45;

// Independent from population's own noise (in census.js) — a region can be
// unusually crowded *and* have average land, or vice versa, which is what
// actually produces a region above its real carrying capacity rather than
// guaranteeing every region is comfortable by construction.
function foodYieldNoise(region, rng) {
  if (region._foodNoise === undefined) region._foodNoise = 0.85 + rng() * 0.3;
  return region._foodNoise;
}

function foodOutput(farmers, maxFoodOutput, kLabor) {
  if (kLabor <= 0) return 0;
  return maxFoodOutput * (1 - Math.exp(-farmers / kLabor));
}

// Inverse of foodOutput — how many farmers does it take to hit a target?
// Infinity means "not achievable even with the whole population farming."
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

function wearBoatFleet(total, advanced, weekScale = 1) {
  const safeAdvanced = Math.min(Math.max(0, advanced || 0), Math.max(0, total || 0));
  const basic = Math.max(0, total - safeAdvanced);
  const basicLost = basic * (1 - Math.pow(1 - weeklyAttrition(BASIC_BOAT_ANNUAL_WEAR), weekScale));
  const advancedLost = safeAdvanced * (1 - Math.pow(1 - weeklyAttrition(ADVANCED_BOAT_ANNUAL_WEAR), weekScale));
  return { total: Math.max(0, total - basicLost - advancedLost), advanced: Math.max(0, safeAdvanced - advancedLost),
    lost: basicLost + advancedLost };
}

export function potteryStorageProfile(region) {
  const coverage = clamp01((region.stockpile.pottery || 0) /
    Math.max(1, region.population * POTTERY_PER_PERSON_FOR_FULL_STORAGE));
  const granaries = effectiveInfrastructureCount(region, 'public_granary');
  // A granary still needs jars, bins and competent handling. Its permanent
  // fabric provides some protection by itself, while widespread pottery lets
  // the public store achieve its full capacity and spoilage benefit.
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
    const possible = Math.min(
      gap,
      makersAvailable * advancedRate,
      (region.stockpile.wood || 0) / ADVANCED_BOAT_COST.wood,
      (region.stockpile.pitch || 0) / ADVANCED_BOAT_COST.pitch,
      (region.stockpile.textiles || 0) / ADVANCED_BOAT_COST.textiles,
      metalAvailable / ADVANCED_BOAT_COST.metal
    );
    advanced = Math.max(0, possible);
    if (advanced > 0) {
      region.stockpile.wood -= advanced * ADVANCED_BOAT_COST.wood;
      region.stockpile.pitch -= advanced * ADVANCED_BOAT_COST.pitch;
      region.stockpile.textiles -= advanced * ADVANCED_BOAT_COST.textiles;
      consumeAdvancedBoatMetal(region, advanced);
      const used = advanced / advancedRate;
      makers += used;
      makersAvailable -= used;
      gap -= advanced;
      built += advanced;
    }
  }
  // Retain the ability to build simpler craft when specialist inputs are
  // unavailable; the breakthrough expands choices rather than deleting old knowledge.
  const basic = Math.max(0, Math.min(
    gap, makersAvailable * BOATMAKER_BUILD_RATE, (region.stockpile.wood || 0) / BOAT_WOOD_COST
  ));
  if (basic > 0) {
    region.stockpile.wood -= basic * BOAT_WOOD_COST;
    const used = basic / BOATMAKER_BUILD_RATE;
    makers += used;
    built += basic;
  }
  return { built, advanced, makers };
}

function plannedFoodProduction(region, foodNeeded) {
  const economy = region.tradeEconomy || {};
  const importCoverage = foodNeeded > 0 ? (economy.foodImportEma || 0) / foodNeeded : 0;
  const industrialIncomeCoverage = foodNeeded > 0
    ? (economy.nonFoodExportIncomeEma || 0) / (foodNeeded * FOOD_ACCOUNTING_VALUE)
    : 0;
  // A small successful delivery proves that a route can carry food; the
  // sustainable scale is then set by what industrial exports can actually
  // pay for. Requiring imports to equal the final dependency would trap the
  // system at zero because a self-feeding region only ever buys a buffer.
  // A successful export route also proves that carriers can bring food back.
  // Requiring an already-self-feeding industrial region to import food before
  // it is willing to specialise creates a circular zero-import equilibrium.
  const deliveryConfidence = clamp01(Math.max(
    importCoverage / 0.001,
    economy.routeReliabilityEma || 0
  ));
  const affordableDependence = Math.min(
    MAX_IMPORTED_FOOD_DEPENDENCE,
    industrialIncomeCoverage * 0.75 * deliveryConfidence
  );
  const previousDependence = region.foodImportDependence || 0;
  const targetDependence = previousDependence > 0.005
    ? Math.min(MAX_IMPORTED_FOOD_DEPENDENCE, industrialIncomeCoverage * 0.75)
    : affordableDependence;
  const adjustmentWeeks = targetDependence > previousDependence ? 40 * 52 : 60 * 52;
  region.foodImportDependence = previousDependence +
    (targetDependence - previousDependence) / adjustmentWeeks;

  const hasSurfaceMetal = ['copper', 'tin'].some((key) =>
    region.deposits?.[key]?.tiers?.some((tier) => tier.requiredTechId === null && tier.remainingStock > 0)
  );
  // Good non-metal farmland intentionally produces a modest market surplus,
  // which lets mining/smelting regions accumulate an imported buffer. They
  // only reduce their own farming after real deliveries and export income
  // prove that the route works; there is no assumed week-one dependence.
  const farmAdvantage = clamp01((region.landQuality - 0.75) / 0.55);
  const exportSurplus = hasSurfaceMetal ? 0 : farmAdvantage * MAX_FOOD_EXPORT_SURPLUS;
  const importDependence = region.foodImportDependence;
  return {
    target: foodNeeded * Math.max(0.65, 1 + exportSurplus - importDependence),
    importDependence,
    exportSurplus,
  };
}

// Distributes `totalRequested` workers across `items` ({key, cap}) by
// priority weight, never exceeding any item's cap, redistributing whatever
// a capped-out item turns away to whichever items still have room. A few
// iterations converge fine with a handful of resources.
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
  for (const i of state) {
    allocation[i.key] = i.allocated;
    used += i.allocated;
  }
  return { allocation, used };
}

// Occupations are careers, not a weekly spot market for labour. The economic
// model still calculates a target workforce each week, but actual headcount
// moves toward that target gradually. Small advantages sit inside a deadband,
// so an experienced smith does not become a farmer because farming is 0.1%
// more attractive this week. Entry/exit rates are deliberately faster for
// general food work and slower for specialised crafts.
const OCCUPATION_MOBILITY = {
  farmer:        { enter: 0.06, exit: 0.035, deadband: 0.025 },
  gatherer:      { enter: 0.10, exit: 0.10,  deadband: 0.02 },
  shoreFisher:   { enter: 0.05, exit: 0.04,  deadband: 0.04 },
  boatFisher:    { enter: 0.035, exit: 0.025, deadband: 0.05 },
  lumberjack:    { enter: 0.035, exit: 0.025, deadband: 0.05 },
  miner:         { enter: 0.025, exit: 0.018, deadband: 0.06 },
  boatmaker:     { enter: 0.015, exit: 0.010, deadband: 0.08 },
  textileWorker: { enter: 0.02, exit: 0.015, deadband: 0.07 },
  tailor:        { enter: 0.02, exit: 0.015, deadband: 0.07 },
  smelter:       { enter: 0.015, exit: 0.010, deadband: 0.08 },
  smith:         { enter: 0.012, exit: 0.008, deadband: 0.08 },
  potter:        { enter: 0.018, exit: 0.012, deadband: 0.07 },
};

function persistentWorkforce(region, occupation, target, available, { crisis = false, impossible = false } = {}) {
  const safeTarget = Math.max(0, Math.min(Number(target) || 0, Math.max(0, Number(available) || 0)));
  const previous = Math.max(0, Number(region.occupations?.[occupation]) || 0);
  const establishedEconomy = Object.values(region.occupations || {}).some((value) => (Number(value) || 0) > 0);
  if (!establishedEconomy) return safeTarget;
  const policy = OCCUPATION_MOBILITY[occupation] || { enter: 0.04, exit: 0.03, deadband: 0.04 };
  const gap = safeTarget - previous;
  const relativeGap = Math.abs(gap) / Math.max(1, previous);
  if (!crisis && !impossible && relativeGap <= policy.deadband) return Math.min(Math.max(0, available), previous);
  let rate = gap >= 0 ? policy.enter : policy.exit;
  const weekScale = Math.max(0.01, Number(region._elapsedWeeks) || 1);
  if (crisis) rate = Math.min(0.35, rate * 4);
  if (impossible && gap < 0) rate = Math.max(rate, 0.08);
  rate = 1 - Math.pow(1 - Math.min(0.95, rate), weekScale);
  const maxChange = Math.max(1, previous * rate, Math.abs(gap) * rate);
  const next = previous + Math.sign(gap) * Math.min(Math.abs(gap), maxChange);
  return Math.max(0, Math.min(Math.max(0, available), next));
}

const MANUFACTURED_ORDER_KEYS = [
  'bronze_plough', 'iron_plough', 'bronze_picks', 'iron_picks',
  'bronze_axes', 'iron_axes', 'bronze_weapons', 'iron_weapons',
  'basic_boat', 'advanced_boat', 'clothes'
];

export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, currentDay = null) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const seaRegionsById = new Map(seaRegions.map((s) => [s.id, s]));
  const weatherDay = Number.isFinite(currentDay) ? currentDay : (Number.isFinite(currentTick) ? currentTick * 7 : null);
  tickWeather(regions, weatherDay, rng, elapsedDays);

  // Workshops see last week's unmet finished-bronze demand in neighbouring
  // markets. This is the order signal that makes them produce for export,
  // rather than stopping once their own farmers and soldiers are equipped.
  for (const region of regions) {
    let externalBronzeDemand = 0;
    const externalManufacturedDemand = Object.fromEntries(
      MANUFACTURED_ORDER_KEYS.map((key) => [key, 0]));
    // One neighbour pass supplies every workshop order signal. Previously we
    // re-walked the same neighbours once for bronze and once for every finished
    // good, multiplying this fixed local calculation by ~12.
    for (const id of region.neighbors) {
      const demand = regionsById.get(id)?.marketDemand;
      if (!demand) continue;
      externalBronzeDemand += demand.bronze || 0;
      for (const key of MANUFACTURED_ORDER_KEYS) {
        externalManufacturedDemand[key] += demand[key] || 0;
      }
    }
    region._externalBronzeDemand = externalBronzeDemand * 0.25;
    region._externalManufacturedDemand = externalManufacturedDemand;
  }

  for (const region of regions) {
    region._elapsedWeeks = Math.max(0.01, elapsedWeeks(elapsedDays));
    allocateAndProduce(region, seaRegionsById, toolTypes, rng, elapsedDays);
  }
  // Forest spread reads neighbours' post-harvest state, so it runs as a
  // second pass once every region's extraction this tick is resolved.
  for (const region of regions) {
    applyForestRegrowth(region, regionsById, elapsedDays);
  }
  // Same idea for fish: every region sharing a sea has already taken this
  // week's catch by the time regrowth runs.
  for (const sea of seaRegions) {
    const fishRate = 1 - Math.pow(1 - FISH_REGROWTH_RATE, Math.max(0.01, elapsedWeeks(elapsedDays)));
    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: fishRate });
  }
}

function allocateAndProduce(region, seaRegionsById, toolTypes, rng, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedWeeks(elapsedDays));
  const report = {}; // this tick's production, by activity — see region.report, read by the UI
  report.toolWear = { tools: wearOutTools(region) };
  const navyWear = wearBoatFleet(region.navy.boats, region.navy.advancedBoats, weekScale);
  region.navy.boats = navyWear.total;
  region.navy.advancedBoats = navyWear.advanced;
  const fishingWear = wearBoatFleet(region.fishingBoats, region.advancedFishingBoats, weekScale);
  region.fishingBoats = fishingWear.total;
  region.advancedFishingBoats = fishingWear.advanced;
  const potteryBroken = (region.stockpile.pottery || 0) * (1 - Math.pow(1 - weeklyAttrition(POTTERY_ANNUAL_BREAKAGE), weekScale));
  region.stockpile.pottery = Math.max(0, (region.stockpile.pottery || 0) - potteryBroken);
  const clothesWornOut = (region.stockpile.clothes || 0) * (1 - Math.pow(1 - weeklyAttrition(CLOTHING_ANNUAL_WEAR), weekScale));
  region.stockpile.clothes = Math.max(0, (region.stockpile.clothes || 0) - clothesWornOut);
  report.maintenance = { boatLosses: navyWear.lost + fishingWear.lost, potteryBroken, clothesWornOut };

  const totalPop = region.population;       // everyone eats
  const workingAge = region.demographics.workingAge;
  const emergencyMilitia = Math.max(0, region.emergencyMilitiaPersonnel || 0);
  const civilianWorkingAge = Math.max(0, workingAge - emergencyMilitia);
  const resourceAccess = conflictResourceAccess(region);
  const horseReport = tickHorseEconomy(region, civilianWorkingAge, elapsedDays);
  report.horses = horseReport;

  // Military recruitment happens first and is sticky — personnel stay
  // committed tick to tick (ramping toward the player's target) rather
  // than being freely reallocated like every other occupation below.
  const requestedBuilders = Math.max(0, region.construction?.workersReserved || 0);
  const maintenanceWorkers = Math.max(0, region.construction?.maintenanceWorkersReserved || 0);
  const requestedSiegeWorkers = Math.max(0, region.siegeEquipment?.workersReserved || 0);
  adjustArmySize(region, Math.max(0, civilianWorkingAge - region.army.personnel - region.navy.personnel - horseReport.workers - requestedBuilders - maintenanceWorkers - requestedSiegeWorkers));
  adjustNavyCrew(region, Math.max(0, civilianWorkingAge - region.army.personnel - region.navy.personnel - horseReport.workers - requestedBuilders - maintenanceWorkers - requestedSiegeWorkers));
  const constructionWorkers = Math.min(requestedBuilders,
    Math.max(0, civilianWorkingAge - region.army.personnel - region.navy.personnel - horseReport.workers));
  if (region.construction) region.construction.workersReserved = constructionWorkers;
  const actualMaintenanceWorkers = Math.min(maintenanceWorkers,
    Math.max(0, civilianWorkingAge - region.army.personnel - region.navy.personnel - horseReport.workers - constructionWorkers));
  if (region.construction) region.construction.maintenanceWorkersReserved = actualMaintenanceWorkers;
  const siegeWorkers = Math.min(requestedSiegeWorkers,
    Math.max(0, civilianWorkingAge - region.army.personnel - region.navy.personnel - horseReport.workers - constructionWorkers - actualMaintenanceWorkers));
  if (region.siegeEquipment) region.siegeEquipment.workersReserved = siegeWorkers;
  const laborPool = Math.max(0, civilianWorkingAge - region.army.personnel - region.navy.personnel - horseReport.workers - constructionWorkers - actualMaintenanceWorkers - siegeWorkers);
  report.construction = { workers: Math.round(constructionWorkers) };
  report.siegeEquipment = { workers: Math.round(siegeWorkers) };
  report.infrastructureMaintenance = { workers: Math.round(actualMaintenanceWorkers) };

  const noise = foodYieldNoise(region, rng);
  const seasonalMultiplier = region.weather?.seasonalMultiplier ?? 1;
  const weatherMultiplier = region.weather?.yieldMultiplier ?? 1;
  const farmerToolMultiplier = toolEfficiencyMultiplier(
    region, 'farmer', toolTypes.farmer, region.unlockedTechIds
  );
  // Equipment changes achievable yield as well as labour efficiency. Full
  // bronze coverage lifts 4.0 base yield to roughly the former 5.8 ceiling;
  // weaker iron recovers less, while tool-less farms cannot compensate merely
  // by assigning every available adult to the same finite acreage.
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
  const humanFoodNeeded = totalPop * FOOD_PER_PERSON_PER_WEEK * weekScale;
  const foodNeeded = humanFoodNeeded + horseReport.fodderNeeded;
  const foodPlan = plannedFoodProduction(region, foodNeeded);
  // Expected seasonality is planned for: harvest-time production builds the
  // stores consumed during winter. Weather is not included in the target, so
  // drought causes a genuine shortfall while unusually good weather creates
  // a buffer rather than prompting farmers to stop early.
  const foodProductionTarget = foodPlan.target * seasonalMultiplier * SEASONAL_STORAGE_MARGIN;

  // Tool bonus is lagged one tick (last tick's headcount/equipment) so this
  // doesn't need to solve "how many farmers" and "how equipped are they"
  // simultaneously — see tools.js. Skill (learningByDoing.js) stacks on
  // top: well-practiced AND well-equipped beats either alone.
  const farmerEfficiency = farmerToolMultiplier
    * skillMultiplier(region, 'farming')
    * draughtFarmMultiplier(region, region.occupations?.farmer || workingAge * 0.5);
  const farmersNeededRaw = farmersNeededFor(foodProductionTarget, maxFoodOutput, kLabor) / farmerEfficiency;
  // Always leave some working-age labor free for gathering and everything
  // else — otherwise a genuine crisis (farmersNeeded >= laborPool) claims
  // 100% of the workforce for farming and leaves nothing for the fallback
  // that's supposed to catch exactly that case.
  const farmerTarget = Math.min(laborPool * MAX_FARMER_FRACTION, farmersNeededRaw);
  const foodCrisis = (region.stockpile.food || 0) < humanFoodNeeded * 0.5;
  const farmers = persistentWorkforce(region, 'farmer', farmerTarget, laborPool * MAX_FARMER_FRACTION,
    { crisis: foodCrisis && farmerTarget > (region.occupations?.farmer || 0) });
  const foodFromFarming = foodOutput(farmers * farmerEfficiency, maxFoodOutput, kLabor) * weekScale;
  accumulateExperience(region, 'farming', farmers);
  report.farming = { workers: Math.round(farmers), food: foodFromFarming,
    seasonalMultiplier, weatherMultiplier };
  report.weather = { condition: region.weather?.condition || 'normal',
    index: region.weather?.index || 0, seasonalMultiplier, weatherMultiplier };

  // --- Gathering: fills whatever farming didn't cover. Effective when
  // there aren't many people competing for the same wild resources, barely
  // effective in a crowded region — the opposite scaling from farming,
  // which is why the two together (not either alone) are what let even a
  // poor-land region reach subsistence.
  const density = region.areaSqKm > 0 ? totalPop / region.areaSqKm : 0;
  const gatherYieldPerWorker = BASE_GATHER_YIELD_PER_WORKER * weekScale *
    Math.max(GATHER_MIN_FACTOR, 1 - density / GATHER_DENSITY_CEILING) *
    skillMultiplier(region, 'gathering');
  const remainingFoodNeeded = Math.max(0, foodProductionTarget - foodFromFarming);
  const laborAfterFarming = Math.max(0, laborPool - farmers);
  const gatherersNeeded = gatherYieldPerWorker > 0 ? remainingFoodNeeded / gatherYieldPerWorker : 0;
  const gathererTarget = Math.min(laborAfterFarming * MAX_GATHERER_FRACTION, gatherersNeeded);
  const gatherers = persistentWorkforce(region, 'gatherer', gathererTarget, laborAfterFarming * MAX_GATHERER_FRACTION,
    { crisis: foodCrisis && gathererTarget > (region.occupations?.gatherer || 0) });
  const foodFromGathering = gatherers * gatherYieldPerWorker;
  accumulateExperience(region, 'gathering', gatherers);
  report.gathering = { workers: Math.round(gatherers), food: foodFromGathering };

  // --- Fishing: fills whatever farming + gathering still didn't cover, if
  // this region borders a sea. A real commons — every land region bordering
  // the same sea draws from the same shared fish stock, so overfishing hurts
  // everyone sharing it, not just whoever did the overfishing.
  let shoreFishers = 0;
  let boatFishers = 0;
  let foodFromFishing = 0;
  const laborAfterGathering = Math.max(0, laborAfterFarming - gatherers);
  const remainingAfterGather = Math.max(0, foodProductionTarget - foodFromFarming - foodFromGathering);

  if (region.adjacentSeaIds.length > 0 && remainingAfterGather > 0 && laborAfterGathering > 0) {
    const sea = seaRegionsById.get(region.adjacentSeaIds[0]); // multi-sea prioritization: future refinement
    if (sea) {
      const fishingSkill = skillMultiplier(region, 'fishing');
      const stockFraction = sea.fish.K > 0 ? sea.fish.currentStock / sea.fish.K : 0;

      // Shore capacity is shared fairly across however many land regions
      // border this sea — a rough fairness heuristic, not a real market.
      const shoreCapacityTotal = Math.round(sea.fish.K / SHORE_FISH_CAPACITY_DIVISOR);
      const shoreCapacity = Math.round(shoreCapacityTotal / Math.max(1, sea.adjacentLand.length));
      const shoreYieldPerWorker = SHORE_FISH_YIELD_PER_WORKER_BASE * weekScale * stockFraction * fishingSkill;
      const shoreFishersWanted = shoreYieldPerWorker > 0 ? remainingAfterGather / shoreYieldPerWorker : 0;
      const shoreFisherTarget = Math.min(shoreCapacity, laborAfterGathering, shoreFishersWanted);
      shoreFishers = persistentWorkforce(region, 'shoreFisher', shoreFisherTarget,
        Math.min(shoreCapacity, laborAfterGathering), { crisis: foodCrisis && remainingAfterGather > 0 });
      const foodFromShore = shoreFishers * shoreYieldPerWorker;

      // Boat fishing: capped by how many fishing boats this region owns
      // AND by the sea's own physical capacity to support boat fishing at
      // all, fair-shared among however many regions border it — otherwise
      // fleet size alone could grow without bound and strip a shared sea
      // to nothing (which is exactly what happened before this cap existed:
      // a population-scale fleet fished both seas to 0% in under 50 years).
      const stillNeeded = Math.max(0, remainingAfterGather - foodFromShore);
      const usableAdvancedFishing = usableAdvancedFishingBoats(region);
      const advancedShare = region.fishingBoats > 0
        ? Math.min(1, usableAdvancedFishing / region.fishingBoats)
        : 0;
      const navalMission = navalMissionProfile(region);
      const fisheryPatrolCoverage = clamp01((region.navy?.personnel || 0) /
        Math.max(1, region.population * 0.005));
      const fisheryProtection = 1 + Math.max(0, navalMission.fishing - 1) * fisheryPatrolCoverage;
      const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * weekScale * (1 + advancedShare * 0.5) *
        stockFraction * fishingSkill * maritimeSkillMultiplier(region, MARITIME_SKILLS.FISHING) * fisheryProtection;
      const boatCapacityTotal = Math.round(sea.fish.K / BOAT_FISH_CAPACITY_DIVISOR);
      const boatCapacityShare = Math.round(boatCapacityTotal / Math.max(1, sea.adjacentLand.length));
      const effectiveFishingBoats = Math.max(0, region.fishingBoats - (region.advancedFishingBoats || 0)) +
        usableAdvancedFishing * 2;
      const boatFishCapacity = Math.min(effectiveFishingBoats * FISHERS_PER_FISHING_BOAT, boatCapacityShare);
      const boatFishersWanted = boatYieldPerWorker > 0 ? stillNeeded / boatYieldPerWorker : 0;
      const boatFisherAvailable = Math.min(boatFishCapacity, Math.max(0, laborAfterGathering - shoreFishers));
      const boatFisherTarget = Math.min(boatFisherAvailable, boatFishersWanted);
      boatFishers = persistentWorkforce(region, 'boatFisher', boatFisherTarget, boatFisherAvailable,
        { crisis: foodCrisis && stillNeeded > 0, impossible: boatFishCapacity <= 0 });
      const foodFromBoat = boatFishers * boatYieldPerWorker;

      const totalWanted = foodFromShore + foodFromBoat;
      foodFromFishing = Math.min(totalWanted, sea.fish.currentStock);
      sea.fish.currentStock -= foodFromFishing;
      // If stock capped the total catch, both methods lose proportionally —
      // reflect that in the report rather than showing an uncapped figure.
      const catchScale = totalWanted > 0 ? foodFromFishing / totalWanted : 0;
      report.shoreFishing = { workers: Math.round(shoreFishers), food: foodFromShore * catchScale, seaName: sea.name };
      report.boatFishing = { workers: Math.round(boatFishers), food: foodFromBoat * catchScale,
        advancedShare, fisheryProtection, seaName: sea.name };

      // Grow fishing-boat demand when boat fishing is capacity-bound and
      // there's still unmet need — but only up to the sea's own physical
      // limit; past that, more boats genuinely wouldn't help, no matter how
      // hungry the region is.
      if (stillNeeded > foodFromBoat + 0.5 && effectiveFishingBoats * FISHERS_PER_FISHING_BOAT < boatCapacityShare) {
        if (boatFishCapacity > 0 && boatFishers >= boatFishCapacity * 0.95) {
          region.targetFishingBoats = Math.max(region.targetFishingBoats, region.fishingBoats + Math.max(1, region.fishingBoats * 0.1));
        } else if (region.fishingBoats === 0) {
          region.targetFishingBoats = Math.max(region.targetFishingBoats, 2); // seed demand for a first couple of boats
        }
      }

      accumulateExperience(region, 'fishing', shoreFishers + boatFishers);
    }
  }

  const foodProduced = foodFromFarming + foodFromGathering + foodFromFishing;
  report.foodPlan = {
    target: foodProductionTarget,
    importDependence: foodPlan.importDependence,
    exportSurplus: foodPlan.exportSurplus,
    plannedImportDemand: humanFoodNeeded * foodPlan.importDependence,
  };
  report.conflict = { pressure: region.conflictPressure || 0, resourceAccess, emergencyMilitia };

  // Stability isn't decided here anymore — trade gets a chance to cover any
  // remaining shortfall first. See society/demographics.js, called after
  // tickTrade().
  region._foodNeeded = humanFoodNeeded;

  const surplus = Math.max(0, laborAfterGathering - shoreFishers - boatFishers);

  // --- Lumberjacks: capped by physical forest capacity, not population share ---
  const forestFraction = region.forest.K > 0 ? region.forest.currentStock / region.forest.K : 0;
  const lumberCapacity = forestFraction > 0.05 ? Math.round(region.forest.K / LUMBER_CAPACITY_DIVISOR) : 0;
  const woodReserveTarget = region.population * WOOD_RESERVE_PER_PERSON;
  const woodWanted = Math.max(0, woodReserveTarget - (region.stockpile.wood || 0)) / WOOD_RESERVE_BUILD_WEEKS;
  const lumberjacksWanted = WOOD_PER_LUMBERJACK > 0 ? woodWanted / WOOD_PER_LUMBERJACK : 0;
  const lumberjackAvailable = Math.min(lumberCapacity, surplus);
  const lumberjackTarget = Math.min(lumberjackAvailable, lumberjacksWanted);
  const lumberjacks = persistentWorkforce(region, 'lumberjack', lumberjackTarget, lumberjackAvailable,
    { impossible: lumberCapacity <= 0 });
  let remainingSurplus = surplus - lumberjacks;

  // Pitch and textiles are ordinary crafts before they become strategic boat
  // inputs. Small local buffers create tradable supply; advanced shipyards
  // increase their targets sharply when they have vessels to build.
  const totalBoatGap = region.isCoastal
    ? Math.max(0, region.targetNavySize - region.navy.boats) +
      Math.max(0, region.targetFishingBoats - region.fishingBoats)
    : 0;
  const advancedDemandBoats = region.unlockedTechIds.has('advanced_boatbuilding')
    ? Math.min(2, totalBoatGap)
    : 0;
  const pitchTarget = region.population * 0.001 + advancedDemandBoats * ADVANCED_BOAT_COST.pitch;
  const clothingTarget = region.population * CLOTHING_PER_PERSON_TARGET;
  const clothingGap = Math.max(0, clothingTarget - (region.stockpile.clothes || 0));
  const textileTarget = region.population * 0.002 + advancedDemandBoats * ADVANCED_BOAT_COST.textiles +
    Math.min(clothingGap, region.population * 0.01) * TEXTILES_PER_CLOTHING;
  const pitchWanted = Math.max(0, pitchTarget - (region.stockpile.pitch || 0));
  const textilesWanted = Math.max(0, textileTarget - (region.stockpile.textiles || 0));
  const craftLaborCap = remainingSurplus * 0.05;
  const pitchWorkers = Math.min(craftLaborCap, pitchWanted / PITCH_PER_WORKER,
    (region.stockpile.wood || 0) / (PITCH_PER_WORKER * WOOD_PER_PITCH));
  const pitchMade = pitchWorkers * PITCH_PER_WORKER * weekScale;
  region.stockpile.wood = (region.stockpile.wood || 0) - pitchMade * WOOD_PER_PITCH;
  region.stockpile.pitch = (region.stockpile.pitch || 0) + pitchMade;
  // Fibre, wool and hides are abstracted into a land-linked capacity for now;
  // textiles still require labour but cannot scale without a rural base.
  const textileLaborCapacity = Math.max(1, region.areaSqKm * region.landQuality * 0.01);
  const textileAvailable = Math.min(Math.max(0, craftLaborCap - pitchWorkers), textileLaborCapacity);
  const textileTargetWorkers = Math.min(textileAvailable,
    textilesWanted / (TEXTILES_PER_WORKER * skillMultiplier(region, 'textiles')));
  const textileWorkers = persistentWorkforce(region, 'textileWorker', textileTargetWorkers, textileAvailable);
  const textilesMade = textileWorkers * TEXTILES_PER_WORKER * weekScale * skillMultiplier(region, 'textiles');
  region.stockpile.textiles = (region.stockpile.textiles || 0) + textilesMade;
  accumulateExperience(region, 'textiles', textileWorkers);
  remainingSurplus -= pitchWorkers + textileWorkers;
  const tailorAvailable = Math.max(0, Math.min(remainingSurplus * 0.05,
    (region.stockpile.textiles || 0) / TEXTILES_PER_CLOTHING));
  const tailorTarget = Math.min(tailorAvailable, clothingGap / CLOTHES_PER_TAILOR);
  const tailors = persistentWorkforce(region, 'tailor', tailorTarget, tailorAvailable,
    { impossible: (region.stockpile.textiles || 0) <= 0 && textilesMade <= 0 });
  const clothesMade = Math.min(tailors * CLOTHES_PER_TAILOR * weekScale,
    (region.stockpile.textiles || 0) / TEXTILES_PER_CLOTHING);
  region.stockpile.textiles = (region.stockpile.textiles || 0) - clothesMade * TEXTILES_PER_CLOTHING;
  region.stockpile.clothes = (region.stockpile.clothes || 0) + clothesMade;
  accumulateExperience(region, 'textiles', tailors * 0.5);
  remainingSurplus -= tailors;
  report.materialCrafts = { workers: Math.round(pitchWorkers + textileWorkers + tailors),
    pitch: pitchMade, textiles: textilesMade, clothes: clothesMade, tailors: Math.round(tailors) };

  // --- Boat-making: needs a sea border, wood, and labor. Crew for navy
  // boats was already recruited above once boats existed to justify it;
  // this grows both fleets — navy toward the player's target, fishing
  // toward whatever unmet fishing demand generated above. Navy gets first
  // claim on the shared labor/wood budget since it's player-directed
  // intent; fishing gets whatever's left.
  let boatMakers = 0;
  if (region.isCoastal) {
    let importedFishingGap = Math.max(0, region.targetFishingBoats - region.fishingBoats);
    if (importedFishingGap > 0 && operationalInfrastructure(region, 'harbour')) {
      const advancedImported = Math.min(importedFishingGap, Math.max(0, region.stockpile.advanced_boat || 0));
      if (advancedImported > 0) {
        region.stockpile.advanced_boat -= advancedImported;
        region.fishingBoats += advancedImported;
        region.advancedFishingBoats = (region.advancedFishingBoats || 0) + advancedImported;
        importedFishingGap -= advancedImported;
      }
    }
    const basicImported = Math.min(importedFishingGap, Math.max(0, region.stockpile.basic_boat || 0));
    if (basicImported > 0) {
      region.stockpile.basic_boat -= basicImported;
      region.fishingBoats += basicImported;
    }

    const navyGap = Math.max(0, region.targetNavySize - region.navy.boats);
    const navyBoatsWanted = navyGap * Math.min(1, BOAT_MOBILIZATION_RATE * weekScale);
    const navyMakersWanted = BOATMAKER_BUILD_RATE > 0 ? navyBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const navyMakersAvailable = Math.min(navyMakersWanted, remainingSurplus);
    const navyBuild = buildFleetBoats(region, Math.min(navyGap, navyBoatsWanted), navyMakersAvailable);
    region.navy.boats += navyBuild.built;
    region.navy.advancedBoats = (region.navy.advancedBoats || 0) + navyBuild.advanced;
    const navyMakersUsed = navyBuild.makers;

    const fishGap = Math.max(0, region.targetFishingBoats - region.fishingBoats);
    const fishBoatsWanted = fishGap * Math.min(1, BOAT_MOBILIZATION_RATE * weekScale);
    const fishMakersWanted = BOATMAKER_BUILD_RATE > 0 ? fishBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const fishMakersAvailable = Math.min(fishMakersWanted, Math.max(0, remainingSurplus - navyMakersUsed));
    const fishBuild = buildFleetBoats(region, Math.min(fishGap, fishBoatsWanted), fishMakersAvailable);
    region.fishingBoats += fishBuild.built;
    region.advancedFishingBoats = (region.advancedFishingBoats || 0) + fishBuild.advanced;
    const fishMakersUsed = fishBuild.makers;

    boatMakers = navyMakersUsed + fishMakersUsed;

    const externalBoatOrders = Math.max(0,
      (region._externalManufacturedDemand?.basic_boat || 0) +
      (region._externalManufacturedDemand?.advanced_boat || 0));
    const marketBoatTarget = Math.min(2, externalBoatOrders * 0.2);
    const marketMakersAvailable = Math.max(0, remainingSurplus - boatMakers);
    const marketBuild = buildFleetBoats(region, marketBoatTarget, marketMakersAvailable);
    const marketBasic = Math.max(0, marketBuild.built - marketBuild.advanced);
    if (marketBasic > 0) region.stockpile.basic_boat = (region.stockpile.basic_boat || 0) + marketBasic;
    if (marketBuild.advanced > 0) region.stockpile.advanced_boat = (region.stockpile.advanced_boat || 0) + marketBuild.advanced;
    boatMakers += marketBuild.makers;

    accumulateExperience(region, 'boatbuilding', boatMakers);
    report.boatmaking = { workers: Math.round(boatMakers), navyBoats: navyBuild.built,
      advancedNavyBoats: navyBuild.advanced, fishingBoats: fishBuild.built,
      advancedFishingBoats: fishBuild.advanced, newBoatsForMarket: marketBuild.built };
  }
  remainingSurplus -= boatMakers;

  // A specialised economy needs carriers as well as producers. Reserve a
  // small share before mines and workshops absorb the entire surplus; any
  // unused reserve remains general labour after trade.js has had its turn.
  const tradeLaborReserve = Math.min(remainingSurplus, laborPool * TRADE_LABOR_RESERVE_FRACTION);
  remainingSurplus -= tradeLaborReserve;

  // Work out which depth tier is accessible before tool demand is chosen.
  // This lets the tool market distinguish "expensive bronze" from bronze
  // which genuinely cannot be produced from any accessible copper/tin.
  const miningTech = new Set(region.unlockedTechIds);
  if (!operationalInfrastructure(region, 'deep_mine')) miningTech.delete('shaft_mining');
  if (!operationalInfrastructure(region, 'mine_drainage')) miningTech.delete('mine_drainage');
  const activeTiers = {};
  for (const [key, deposit] of Object.entries(region.deposits)) {
    activeTiers[key] = selectActiveTier(deposit.tiers, miningTech);
  }
  // Iron is ubiquitous but not commercially useful before the breakthrough.
  // Leaving it in the ground prevents every region quietly accumulating a
  // huge ready-to-smelt ore reserve before iron working is discovered.
  const ironReadiness = region.unlockedTechIds.has('iron_smelting')
    ? Math.max(0.02, Math.min(1, region.ironWorkingReadiness || 0))
    : 0;
  const openResources = Object.keys(activeTiers).filter((key) =>
    activeTiers[key] !== null && (key !== 'ironOre' || region.unlockedTechIds.has('iron_smelting'))
  );
  const canSupply = (resource) => (region.stockpile[resource] || 0) > 0 || Boolean(activeTiers[resource]);
  const materialAvailability = {
    // Bronze can be demanded from the market even where neither ore occurs.
    // If it cannot be bought, the want remains unmet and prices rise.
    bronze: true,
    iron: region.unlockedTechIds.has('iron_smelting') && (
      (region.stockpile.iron || 0) > 0 || canSupply('ironOre')
    ),
  };

  const prevMiners = region.occupations?.miner || 0;
  const toolWants = [
    ['farmer', desiredToolInvestment(region, 'farmer', farmers, toolTypes.farmer, region.unlockedTechIds, materialAvailability)],
    ['lumberjack', desiredToolInvestment(region, 'lumberjack', lumberjacks, toolTypes.lumberjack, region.unlockedTechIds, materialAvailability)],
    ['miner', desiredToolInvestment(region, 'miner', prevMiners, toolTypes.miner, region.unlockedTechIds, materialAvailability)],
    ['soldier', desiredToolInvestment(region, 'soldier', Math.round(region.army.personnel), toolTypes.soldier, region.unlockedTechIds, materialAvailability)],
  ];
  const wantedByMaterial = { bronze: 0, iron: 0 };
  const finishedToolDemand = {};
  for (const [, want] of toolWants) {
    if (want.material) wantedByMaterial[want.material] += want.materialWanted;
    if (want.tier && want.newToolsWanted > 0) {
      finishedToolDemand[want.tier.id] = (finishedToolDemand[want.tier.id] || 0) + want.newToolsWanted;
    }
  }

  // Bronze production concentrates in ore-rich origins and well-connected
  // intermediary hubs. Finished-bronze consumers buy metal from those hubs
  // rather than every village importing two raw ores and smelting for itself.
  const hasLocalCopperAndTin = Boolean(region.deposits.copper && region.deposits.tin);
  const isIntermediaryHub = !region.deposits.copper && !region.deposits.tin && region.neighbors.length >= 7;
  const hasSmeltingInputs = (region.stockpile.copper || 0) >= 2 && (region.stockpile.tin || 0) >= 1;
  const isBronzeWorkshop = hasLocalCopperAndTin || isIntermediaryHub || hasSmeltingInputs ||
    (region.experience.smithing || 0) > 100;
  region.canSmeltBronze = isBronzeWorkshop;
  const bronzeReserveTarget = Math.max(5, region.population * BRONZE_RESERVE_PER_PERSON);
  const commercialBronzeDemand = Math.max(
    0,
    (bronzeReserveTarget - (region.stockpile.bronze || 0)) / BRONZE_RESERVE_BUILD_WEEKS
  );
  const desiredBronzeOutput = isBronzeWorkshop
    ? wantedByMaterial.bronze + BASELINE_BRONZE_DEMAND + region.militaryBronzeDemand +
      commercialBronzeDemand + (region._externalBronzeDemand || 0)
    : 0;
  const desiredIronOutput = wantedByMaterial.iron;
  const potteryTarget = region.population * POTTERY_PER_PERSON_FOR_FULL_STORAGE;
  const desiredPotteryOutput = potteryBroken +
    Math.max(0, potteryTarget - (region.stockpile.pottery || 0)) / 52;
  // Food imports are an intentional input to a specialised economy, not
  // merely an emergency response. Once non-food exports have demonstrated
  // that they can pay for food, publish that planned import requirement as
  // market demand. Food-surplus regions can then see a profitable destination
  // even while this region still has food in storage and is not starving.
  // A modest storage-rebuild component also makes merchants refill buffers
  // after a weak harvest instead of waiting for stocks to go negative.
  const foodStorage = potteryStorageProfile(region);
  const desiredFoodBuffer = humanFoodNeeded * Math.min(8, foodStorage.weeks * 0.5);
  const foodBufferGap = Math.max(0, desiredFoodBuffer - Math.max(0, region.stockpile.food || 0));
  const plannedFoodImportDemand = humanFoodNeeded * foodPlan.importDependence + foodBufferGap / 26;

  const merchantFleet = region.tradeEconomy || {};
  const merchantBoatTarget = Math.max(1, Math.ceil((merchantFleet.merchantPopulation || 0) / 4));
  const merchantBoatGap = Math.max(0, merchantBoatTarget - (merchantFleet.merchantBoats || 0));
  const fishingBoatGap = Math.max(0, region.targetFishingBoats - region.fishingBoats);
  const boatDemand = merchantBoatGap + fishingBoatGap;

  region.marketDemand = {
    ...finishedToolDemand,
    basic_boat: boatDemand,
    advanced_boat: operationalInfrastructure(region, 'harbour') ? boatDemand * 0.5 : 0,
    food: plannedFoodImportDemand,
    bronze: isBronzeWorkshop ? 0 : wantedByMaterial.bronze,
    copperOre: isBronzeWorkshop ? Math.max(0,
      (desiredBronzeOutput * BRONZE_COPPER_PER_UNIT + METAL_SALE_BUFFER.copper - (region.stockpile.copper || 0)) * COPPER_ORE_PER_METAL -
      (region.stockpile.copperOre || 0)) : 0,
    tinOre: isBronzeWorkshop ? Math.max(0,
      (desiredBronzeOutput * BRONZE_TIN_PER_UNIT + METAL_SALE_BUFFER.tin - (region.stockpile.tin || 0)) * TIN_ORE_PER_METAL -
      (region.stockpile.tinOre || 0)) : 0,
    copper: isBronzeWorkshop ? 0 : Math.max(0, desiredBronzeOutput * BRONZE_COPPER_PER_UNIT - (region.stockpile.copper || 0)),
    tin: isBronzeWorkshop ? 0 : Math.max(0, desiredBronzeOutput * BRONZE_TIN_PER_UNIT - (region.stockpile.tin || 0)),
    ironOre: desiredIronOutput,
    clay: Math.max(0, desiredPotteryOutput * POTTERY_CLAY_COST - (region.stockpile.clay || 0)),
    pitch: Math.max(0, pitchTarget - (region.stockpile.pitch || 0)),
    textiles: Math.max(0, textileTarget - (region.stockpile.textiles || 0)),
    clothes: Math.max(0, clothingTarget - (region.stockpile.clothes || 0)),
    horses: horseReport.unmetDemand,
  };

  // Skill computed once, upfront, so the labor reservation below and the
  // actual production later use the same figure — otherwise a region that's
  // gotten good at smithing would over-reserve labor for a bronze target it
  // no longer needs that many hands to hit.
  const bronzePerSmith = BRONZE_PER_SMITH * weekScale * skillMultiplier(region, 'smithing');
  const ironPerSmith = IRON_PER_SMITH * weekScale * skillMultiplier(region, 'smithing') * ironReadiness;

  // Reserve labor for smiths against that demand, up front — this is what
  // stops smith count from depending on a boolean "is there stock" check.
  const smithLaborAvailable = remainingSurplus * 0.6;
  const smithLaborTarget = Math.min(
    smithLaborAvailable,
    (bronzePerSmith > 0 ? desiredBronzeOutput / bronzePerSmith : 0) +
      (ironPerSmith > 0 ? desiredIronOutput / ironPerSmith : 0)
  );
  const smithInputsImpossible = desiredBronzeOutput <= 0 && desiredIronOutput <= 0;
  const desiredSmithsLabor = persistentWorkforce(region, 'smith', smithLaborTarget, smithLaborAvailable,
    { impossible: smithInputsImpossible });
  const desiredPotteryLabor = desiredPotteryOutput / (POTTERY_PER_POTTER * skillMultiplier(region, 'pottery'));
  const potteryAvailable = remainingSurplus * 0.2;
  const potteryLaborReserve = persistentWorkforce(region, 'potter',
    Math.min(potteryAvailable, desiredPotteryLabor), potteryAvailable,
    { impossible: !activeTiers.clay && (region.stockpile.clay || 0) <= 0 });
  const minerBudget = Math.max(0, remainingSurplus - desiredSmithsLabor - potteryLaborReserve);

  // --- Mining, co-optimized with smith demand: mine enough copper/tin to
  // actually cover what smithing wants to make this tick, before falling
  // back to background priority mining for whatever budget is left over. ---
  const copperMetalTarget = region.deposits.copper
    ? Math.max(desiredBronzeOutput * BRONZE_COPPER_PER_UNIT, METAL_SALE_BUFFER.copper)
    : desiredBronzeOutput * BRONZE_COPPER_PER_UNIT;
  const tinMetalTarget = region.deposits.tin
    ? Math.max(desiredBronzeOutput * BRONZE_TIN_PER_UNIT, METAL_SALE_BUFFER.tin)
    : desiredBronzeOutput * BRONZE_TIN_PER_UNIT;
  const copperTarget = copperMetalTarget * COPPER_ORE_PER_METAL;
  const tinTarget = tinMetalTarget * TIN_ORE_PER_METAL;
  const ironOreTarget = region.deposits.ironOre
    ? Math.max(desiredIronOutput, MINE_SALE_BUFFER.ironOre)
    : desiredIronOutput;
  const clayTarget = region.deposits.clay
    ? Math.max(desiredPotteryOutput * POTTERY_CLAY_COST, MINE_SALE_BUFFER.clay)
    : desiredPotteryOutput * POTTERY_CLAY_COST;
  const copperNeeded = Math.max(0, copperTarget - (region.stockpile.copperOre || 0) -
    (region.stockpile.copper || 0) * COPPER_ORE_PER_METAL);
  const tinNeeded = Math.max(0, tinTarget - (region.stockpile.tinOre || 0) -
    (region.stockpile.tin || 0) * TIN_ORE_PER_METAL);
  const ironOreNeeded = Math.max(0, ironOreTarget - (region.stockpile.ironOre || 0));
  const clayNeeded = Math.max(0, clayTarget - (region.stockpile.clay || 0));
  const miningSkill = skillMultiplier(region, 'mining');
  const oreYieldPerMiner = ORE_YIELD_PER_MINER * miningSkill * weekScale;
  const targetLabor = {
    copper: activeTiers.copper ? Math.min(copperNeeded / oreYieldPerMiner, activeTiers.copper.maxWorkers) : 0,
    tin: activeTiers.tin ? Math.min(tinNeeded / oreYieldPerMiner, activeTiers.tin.maxWorkers) : 0,
    ironOre: activeTiers.ironOre && region.unlockedTechIds.has('iron_smelting')
      ? Math.min(ironOreNeeded / oreYieldPerMiner, activeTiers.ironOre.maxWorkers)
      : 0,
    clay: activeTiers.clay
      ? Math.min(clayNeeded / oreYieldPerMiner, activeTiers.clay.maxWorkers)
      : 0,
  };
  const targetLaborTotal = targetLabor.copper + targetLabor.tin + targetLabor.ironOre + targetLabor.clay;

  const minerAllocation = {};
  for (const key of openResources) minerAllocation[key] = 0;

  // Phase 1: satisfy tool-metal demand-driven targets first (split
  // proportionally if the budget can't cover both in full).
  let budgetLeft = minerBudget;
  if (targetLaborTotal > 0) {
    const scale = Math.min(1, budgetLeft / targetLaborTotal);
    for (const key of ['copper', 'tin', 'ironOre', 'clay']) {
      if (activeTiers[key]) {
        minerAllocation[key] = targetLabor[key] * scale;
        budgetLeft -= minerAllocation[key];
      }
    }
  }
  // Phase 2: whatever is left, including spare metal capacity, goes to
  // background priority mining —
  // this is the "keep stockpiling in case it's useful" behavior from before.
  if (budgetLeft > 0.01) {
    const backgroundResources = openResources.filter((key) => key === 'gold' || key === 'stone');
    const items = backgroundResources.map((key) => ({
      key,
      cap: activeTiers[key].maxWorkers - minerAllocation[key],
    }));
    const { allocation } = allocateWithCaps(budgetLeft, items, (key) => ORE_PRIORITY[key] || 1);
    for (const key of backgroundResources) minerAllocation[key] += allocation[key] || 0;
  }

  let minersUsed = 0;
  const minedThisTick = {};
  for (const key of openResources) {
    const tier = activeTiers[key];
    const gathered = extractionRate({
      initialStock: tier.initialStock,
      remainingStock: tier.remainingStock,
      workers: minerAllocation[key],
      baseYieldPerWorker: oreYieldPerMiner * resourceAccess * (key === 'ironOre' ? ironReadiness : 1) *
        (key === 'stone' ? 1 + Math.min(0.35, effectiveInfrastructureCount(region, 'state_quarry') * 0.35) : 1),
      difficulty: tier.difficulty,
    });
    tier.remainingStock -= gathered;
    const stockKey = key === 'copper' ? 'copperOre' : key === 'tin' ? 'tinOre' : key;
    region.stockpile[stockKey] = (region.stockpile[stockKey] || 0) + gathered;
    minersUsed += minerAllocation[key];
    minedThisTick[key] = gathered;
  }
  const minerCareerCount = persistentWorkforce(region, 'miner', minersUsed, minerBudget,
    { impossible: openResources.length === 0 });
  accumulateExperience(region, 'mining', minersUsed);
  report.mining = { workers: Math.round(minersUsed), ...minedThisTick };

  // Ore is refined near the furnace. Gangue and slag never enter the metal
  // stockpile, so transporting refined copper/tin is much cheaper than ore.
  const copperMetalWanted = Math.max(0, copperMetalTarget - (region.stockpile.copper || 0));
  const tinMetalWanted = Math.max(0, tinMetalTarget - (region.stockpile.tin || 0));
  const maxCopperFromOre = (region.stockpile.copperOre || 0) / COPPER_ORE_PER_METAL;
  const maxTinFromOre = (region.stockpile.tinOre || 0) / TIN_ORE_PER_METAL;
  const metalSmeltTarget = Math.min(copperMetalWanted, maxCopperFromOre) + Math.min(tinMetalWanted, maxTinFromOre);
  const smelterAvailable = Math.max(0, remainingSurplus * 0.08);
  const smelterTarget = Math.min(smelterAvailable, metalSmeltTarget / NONFERROUS_METAL_PER_SMELTER);
  const smelters = persistentWorkforce(region, 'smelter', smelterTarget, smelterAvailable,
    { impossible: (region.stockpile.copperOre || 0) <= 0 && (region.stockpile.tinOre || 0) <= 0 });
  const smeltingCapacity = smelters * NONFERROUS_METAL_PER_SMELTER * weekScale;
  const desiredMetalTotal = Math.max(0.0001, copperMetalWanted + tinMetalWanted);
  let copperSmelted = Math.min(copperMetalWanted, maxCopperFromOre, smeltingCapacity * copperMetalWanted / desiredMetalTotal);
  let tinSmelted = Math.min(tinMetalWanted, maxTinFromOre, Math.max(0, smeltingCapacity - copperSmelted));
  const fuelLimitedMetal = (region.stockpile.wood || 0) / SMELTING_WOOD_PER_METAL;
  const totalSmeltedPreFuel = copperSmelted + tinSmelted;
  if (totalSmeltedPreFuel > fuelLimitedMetal && totalSmeltedPreFuel > 0) {
    const scale = fuelLimitedMetal / totalSmeltedPreFuel; copperSmelted *= scale; tinSmelted *= scale;
  }
  const totalSmelted = copperSmelted + tinSmelted;
  region.stockpile.copperOre = (region.stockpile.copperOre || 0) - copperSmelted * COPPER_ORE_PER_METAL;
  region.stockpile.tinOre = (region.stockpile.tinOre || 0) - tinSmelted * TIN_ORE_PER_METAL;
  region.stockpile.wood = (region.stockpile.wood || 0) - totalSmelted * SMELTING_WOOD_PER_METAL;
  region.stockpile.copper = (region.stockpile.copper || 0) + copperSmelted;
  region.stockpile.tin = (region.stockpile.tin || 0) + tinSmelted;
  report.smelting = { workers: Math.round(smelters), copper: copperSmelted, tin: tinSmelted,
    copperOreUsed: copperSmelted * COPPER_ORE_PER_METAL, tinOreUsed: tinSmelted * TIN_ORE_PER_METAL };

  // --- Smithing: bronze and iron share one workforce and the same accumulated
  // smithing experience. Each metal has its own material and labor ceiling;
  // unused smith capacity is redistributed to the other metal. ---
  const maxBronzeByCopper = (region.stockpile.copper || 0) / BRONZE_COPPER_PER_UNIT;
  const maxBronzeByTin = (region.stockpile.tin || 0) / BRONZE_TIN_PER_UNIT;
  const bronzeLaborCap = bronzePerSmith > 0
    ? Math.min(desiredBronzeOutput, maxBronzeByCopper, maxBronzeByTin) / bronzePerSmith
    : 0;
  const ironLaborCap = ironPerSmith > 0
    ? Math.min(desiredIronOutput, region.stockpile.ironOre || 0) / ironPerSmith
    : 0;
  const smithPriorities = {
    bronze: bronzePerSmith > 0 ? desiredBronzeOutput / bronzePerSmith : 0,
    iron: ironPerSmith > 0 ? desiredIronOutput / ironPerSmith : 0,
  };
  const { allocation: smithAllocation } = allocateWithCaps(
    desiredSmithsLabor,
    [
      { key: 'bronze', cap: bronzeLaborCap },
      { key: 'iron', cap: ironLaborCap },
    ],
    (key) => smithPriorities[key]
  );
  const bronzeMade = (smithAllocation.bronze || 0) * bronzePerSmith;
  const ironMade = (smithAllocation.iron || 0) * ironPerSmith;
  const actualSmiths = (smithAllocation.bronze || 0) + (smithAllocation.iron || 0);
  accumulateExperience(region, 'smithing', actualSmiths);
  report.smithing = {
    workers: Math.round(actualSmiths), bronze: bronzeMade, iron: ironMade,
    ironReadiness,
  };

  region.stockpile.copper = (region.stockpile.copper || 0) - bronzeMade * BRONZE_COPPER_PER_UNIT;
  region.stockpile.tin = (region.stockpile.tin || 0) - bronzeMade * BRONZE_TIN_PER_UNIT;
  region.stockpile.bronze = (region.stockpile.bronze || 0) + bronzeMade;
  region.stockpile.ironOre = (region.stockpile.ironOre || 0) - ironMade;
  region.stockpile.iron = (region.stockpile.iron || 0) + ironMade;

  // Pottery uses the same post-mining craft budget but its own learn-by-doing
  // stream. Kiln fuel makes storage compete modestly with boats and heating
  // for wood rather than being a free population modifier.
  const potterySkill = skillMultiplier(region, 'pottery');
  const potteryLaborAvailable = Math.max(0, remainingSurplus - minerCareerCount - desiredSmithsLabor);
  const potteryByLabor = potteryLaborAvailable * POTTERY_PER_POTTER * potterySkill * weekScale;
  const potteryByClay = (region.stockpile.clay || 0) / POTTERY_CLAY_COST;
  const potteryByWood = (region.stockpile.wood || 0) / POTTERY_WOOD_COST;
  const potteryMade = Math.max(0, Math.min(desiredPotteryOutput, potteryByLabor, potteryByClay, potteryByWood));
  const potters = potteryMade > 0 ? potteryMade / (POTTERY_PER_POTTER * potterySkill) : 0;
  region.stockpile.clay = (region.stockpile.clay || 0) - potteryMade * POTTERY_CLAY_COST;
  region.stockpile.wood = (region.stockpile.wood || 0) - potteryMade * POTTERY_WOOD_COST;
  region.stockpile.pottery = (region.stockpile.pottery || 0) + potteryMade;
  accumulateExperience(region, 'pottery', potters);
  report.pottery = { workers: Math.round(potters), pottery: potteryMade };

  // --- Spend it: baseline/military demand is consumed outright (prestige
  // goods, upkeep — not modeled as owned stock); whatever's left funds tool
  // purchases, split by each occupation's share of what it originally asked
  // for, so a big farmer economy doesn't starve a small mining one of tools.
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
      if (occupation === 'soldier') {
        materialAvailable = Math.min(
          materialAvailable,
          (region.militaryFinance?.procurementBudget || 0) / Math.max(0.001, unitCost)
        );
      }
      const materialSpent = investInTools(
        region,
        occupation,
        want,
        materialAvailable
      );
      region.stockpile[material] -= materialSpent;
      if (occupation === 'soldier' && materialSpent > 0) {
        spendMilitaryProcurement(region, materialSpent * unitCost);
      }
    }
  }

  const boatMakerCareerCount = persistentWorkforce(region, 'boatmaker', boatMakers,
    Math.max(boatMakers, remainingSurplus + boatMakers));
  const leftover = Math.round(Math.max(0, surplus - lumberjacks - pitchWorkers - textileWorkers - tailors -
    boatMakerCareerCount - minerCareerCount - smelters - desiredSmithsLabor - potteryLaborReserve));
  // Trade gets first claim on whatever's left before it's written off as
  // general population — trade.js reads this and reduces occupations.general
  // by however much it actually uses.
  region._availableForTrade = leftover;

  region.occupations = {
    farmer: Math.round(farmers),
    gatherer: Math.round(gatherers),
    shoreFisher: Math.round(shoreFishers),
    boatFisher: Math.round(boatFishers),
    lumberjack: Math.round(lumberjacks),
    boatmaker: Math.round(boatMakerCareerCount),
    pitchMaker: Math.round(pitchWorkers),
    textileWorker: Math.round(textileWorkers),
    tailor: Math.round(tailors),
    smelter: Math.round(smelters),
    potter: Math.round(potteryLaborReserve),
    miner: Math.round(minerCareerCount),
    smith: Math.round(desiredSmithsLabor),
    soldier: Math.round(region.army.personnel),
    sailor: Math.round(region.navy.personnel),
    horseBreeder: Math.round(horseReport.breeders),
    horseTrainer: Math.round(horseReport.trainers),
    builder: Math.round(constructionWorkers),
    siegeEngineer: Math.round(siegeWorkers),
    maintenanceWorker: Math.round(actualMaintenanceWorkers),
    trader: 0, // set by trade.js
    // "general" = unspecialized subsistence labor, not literally unemployed —
    // gathering, herding, household production. It's now the genuine
    // remainder after real capacity (mine-face size, forest size, and
    // actual bronze demand) is accounted for, not an arbitrary population
    // fraction — so it'll still be most people, same as any real Bronze
    // Age economy, but it's no longer an artificial ceiling.
    general: leftover,
  };

  // --- Gathering & storing (food, wood) ---
  // No more "+deficit" cancel-out trick — a shortfall now genuinely shows as
  // negative stock, which is exactly the signal applyFoodSecurity() and the
  // trade price system (scarcity -> high local price) need to see.
  let foodBalance = (region.stockpile.food || 0) + foodProduced - foodNeeded;
  if (foodBalance > 0) {
    const storage = potteryStorageProfile(region);
    // Vessels improve both capacity and protection from damp, pests and
    // contamination. Even full coverage buys seasons rather than immortality.
    const tickSpoilage = 1 - Math.pow(1 - storage.spoilage, weekScale);
    foodBalance = Math.min(foodBalance * (1 - tickSpoilage), (foodNeeded / weekScale) * storage.weeks);
    report.foodStorage = { potteryCoverage: storage.coverage, publicGranaries: storage.granaries, weeks: storage.weeks,
      spoilage: tickSpoilage };
  }
  region.stockpile.food = foodBalance;

  const lumberjackEfficiency = toolEfficiencyMultiplier(region, 'lumberjack', toolTypes.lumberjack, region.unlockedTechIds)
    * skillMultiplier(region, 'lumberjack');
  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK * weekScale * lumberjackEfficiency * resourceAccess, region.forest.currentStock);
  region.forest.currentStock -= woodGathered;
  region.stockpile.wood = (region.stockpile.wood || 0) + woodGathered;
  accumulateExperience(region, 'lumberjack', lumberjacks);
  report.lumberjack = { workers: Math.round(lumberjacks), wood: woodGathered };

  region.report = report;
}

function applyForestRegrowth(region, regionsById, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedWeeks(elapsedDays));
  const neighborStocks = region.neighbors.map((id) => regionsById.get(id).forest.currentStock);
  const neighborKs = region.neighbors.map((id) => regionsById.get(id).forest.K);
  const spreadRate = 1 - Math.pow(1 - FOREST_SPREAD_RATE, weekScale);
  const bonus = neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate });

  const growthRate = 1 - Math.pow(1 - WOOD_REGROWTH_RATE, weekScale);
  const grown = regrow({ currentStock: region.forest.currentStock, K: region.forest.K, rate: growthRate });
  region.forest.currentStock = Math.min(region.forest.K, grown + bonus * region.forest.K);
}
