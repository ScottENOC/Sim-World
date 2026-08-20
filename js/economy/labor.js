import { extractionRate, selectActiveTier } from '../world/resources/extraction.js';
import { regrow, neighborSpreadBonus } from '../world/resources/renewables.js';

// --- Tunable constants -----------------------------------------------------
// All placeholders, calibrated so a "typical" region can just about feed
// itself with somewhere around half its population farming — deliberately
// not so generous that food is a non-issue, and not so tight that every
// region starves in week one. Some regions WILL come out under-fed given
// the population noise vs. land-quality noise below are independent random
// draws — that's the point (see the Bronze Age collapse conversation).
const FOOD_PER_PERSON_PER_WEEK = 1; // 1 "ration" per person per tick, arbitrary unit
const FOOD_YIELD_PER_KM2 = 4.2;     // theoretical max rations/km²/week at saturating labor
const FARM_LABOR_SATURATION_PER_KM2 = 1.5; // people/km² before diminishing returns bite hard

const WOOD_PER_LUMBERJACK = 0.8;
const WOOD_REGROWTH_RATE = 0.015;
const FOREST_SPREAD_RATE = 0.002;

const ORE_YIELD_PER_MINER = 0.6;
const BRONZE_PER_SMITH = 0.5;

// Fixed priority, not proportional-to-remaining-stock — stone is orders of
// magnitude more abundant than copper/tin, so weighting by raw tonnage let
// it swallow almost the entire miner pool. Real economies allocate by what's
// wanted, not by what's numerically biggest. There's no demand/price system
// yet (that's the trade system), so this is a placeholder stand-in for it.
const ORE_PRIORITY = { copper: 3, tin: 3, gold: 2, stone: 1 };

// Bronze Age economies couldn't free up more than a small slice of the
// population for full-time non-farm specialism — everyone else is doing
// unspecialized subsistence work (gathering, herding, household production)
// that isn't modeled in detail yet. Without this cap, "surplus" after
// farming was coming out in the hundreds of thousands and strip-mining a
// region's entire deposit in a single week.
const MAX_SPECIALIST_FRACTION = 0.08;

const STARVATION_STABILITY_PENALTY = 0.15; // per fully-unmet week
const WELL_FED_STABILITY_RECOVERY = 0.01;

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

export function tickEconomy(regions, rng = Math.random) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));

  for (const region of regions) {
    allocateAndProduce(region, rng);
  }
  // Forest spread reads neighbours' post-harvest state, so it runs as a
  // second pass once every region's extraction this tick is resolved.
  for (const region of regions) {
    applyForestRegrowth(region, regionsById);
  }
}

function allocateAndProduce(region, rng) {
  const pop = region.population;
  const noise = foodYieldNoise(region, rng);
  const maxFoodOutput = region.areaSqKm * region.landQuality * FOOD_YIELD_PER_KM2 * noise;
  const kLabor = region.areaSqKm * FARM_LABOR_SATURATION_PER_KM2;
  const foodNeeded = pop * FOOD_PER_PERSON_PER_WEEK;

  const farmersNeeded = farmersNeededFor(foodNeeded, maxFoodOutput, kLabor);
  const farmers = Math.min(pop, farmersNeeded);
  const foodProduced = foodOutput(farmers, maxFoodOutput, kLabor);
  const deficit = Math.max(0, foodNeeded - foodProduced);
  const deficitRatio = foodNeeded > 0 ? deficit / foodNeeded : 0;

  // This is the hook the Bronze Age collapse/raider-pressure system reads
  // from later: sustained deficitRatio > 0 grinds stability down.
  region.stability = clamp01(
    region.stability - deficitRatio * STARVATION_STABILITY_PENALTY + (deficitRatio === 0 ? WELL_FED_STABILITY_RECOVERY : 0)
  );

  const surplus = Math.max(0, pop - farmers);
  const specialistPool = Math.min(surplus, pop * MAX_SPECIALIST_FRACTION);
  const generalPopulation = surplus - specialistPool;

  const deposits = region.deposits;
  const activeTiers = {}; // resource -> its currently-mineable tier, or null if walled off
  for (const [key, deposit] of Object.entries(deposits)) {
    activeTiers[key] = selectActiveTier(deposit.tiers, region.unlockedTechIds);
  }
  const anyOreAvailable = Object.values(activeTiers).some((t) => t !== null);
  const forestFraction = region.forest.K > 0 ? region.forest.currentStock / region.forest.K : 0;
  const canSmith = (region.stockpile.copper || 0) > 0 && (region.stockpile.tin || 0) > 0;

  // Not a real market yet (that's the trade system, next) — just "don't
  // put miners where there's nothing left to mine."
  const weights = {
    lumberjack: forestFraction > 0.05 ? 1 : 0,
    miner: anyOreAvailable ? 1.5 : 0,
    smith: canSmith ? 1 : 0,
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  const lumberjacks = Math.round(specialistPool * (weights.lumberjack / totalWeight));
  const minersRequested = specialistPool * (weights.miner / totalWeight);
  const smiths = Math.round(specialistPool * (weights.smith / totalWeight));

  // --- Mining: resolve now, capped by physical mine-face capacity, so we
  // know how many miners were actually put to work before finalizing
  // occupations below (unused mining labor falls back to general).
  let minersUsed = 0;
  if (minersRequested > 0 && anyOreAvailable) {
    const openResources = Object.keys(activeTiers).filter((k) => activeTiers[k] !== null);
    const items = openResources.map((key) => ({ key, cap: activeTiers[key].maxWorkers }));
    const { allocation, used } = allocateWithCaps(minersRequested, items, (key) => ORE_PRIORITY[key] || 1);
    minersUsed = used;

    for (const key of openResources) {
      const tier = activeTiers[key];
      const gathered = extractionRate({
        initialStock: tier.initialStock,
        remainingStock: tier.remainingStock,
        workers: allocation[key],
        baseYieldPerWorker: ORE_YIELD_PER_MINER,
        difficulty: tier.difficulty,
      });
      tier.remainingStock -= gathered;
      region.stockpile[key] = (region.stockpile[key] || 0) + gathered;
    }
  }

  const unusedSpecialistSlots = Math.max(0, specialistPool - lumberjacks - minersUsed - smiths);

  region.occupations = {
    farmer: Math.round(farmers),
    lumberjack: lumberjacks,
    miner: Math.round(minersUsed),
    smith: smiths,
    // "general" = unspecialized subsistence labor, not literally unemployed —
    // gathering, herding, household production, and (until the trade system
    // exists) mining capacity there simply wasn't room to use.
    general: Math.round(generalPopulation + unusedSpecialistSlots),
  };

  // --- Gathering & storing ---
  region.stockpile.food = (region.stockpile.food || 0) + foodProduced - foodNeeded + deficit;

  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK, region.forest.currentStock);
  region.forest.currentStock -= woodGathered;
  region.stockpile.wood = (region.stockpile.wood || 0) + woodGathered;

  if (smiths > 0) {
    const maxByLabor = smiths * BRONZE_PER_SMITH;
    const maxByCopper = (region.stockpile.copper || 0) / 2; // recipe: 2 copper + 1 tin -> 1 bronze
    const maxByTin = (region.stockpile.tin || 0) / 1;
    const bronzeMade = Math.max(0, Math.min(maxByLabor, maxByCopper, maxByTin));
    region.stockpile.copper -= bronzeMade * 2;
    region.stockpile.tin -= bronzeMade * 1;
    region.stockpile.bronze = (region.stockpile.bronze || 0) + bronzeMade;
  }
}

function applyForestRegrowth(region, regionsById) {
  const neighborStocks = region.neighbors.map((id) => regionsById.get(id).forest.currentStock);
  const neighborKs = region.neighbors.map((id) => regionsById.get(id).forest.K);
  const bonus = neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate: FOREST_SPREAD_RATE });

  const grown = regrow({ currentStock: region.forest.currentStock, K: region.forest.K, rate: WOOD_REGROWTH_RATE });
  region.forest.currentStock = Math.min(region.forest.K, grown + bonus * region.forest.K);
}
