import { extractionRate, selectActiveTier } from '../world/resources/extraction.js';
import { regrow, neighborSpreadBonus } from '../world/resources/renewables.js';
import { toolEfficiencyMultiplier, desiredToolInvestment, investInTools } from './tools.js';

// --- Tunable constants -----------------------------------------------------
// All placeholders, calibrated so a "typical" region can just about feed
// itself with somewhere around half its population farming — deliberately
// not so generous that food is a non-issue, and not so tight that every
// region starves in week one. Some regions WILL come out under-fed given
// the population noise vs. land-quality noise below are independent random
// draws — that's the point (see the Bronze Age collapse conversation).
export const FOOD_PER_PERSON_PER_WEEK = 1; // 1 "ration" per person per tick, arbitrary unit
const FOOD_YIELD_PER_KM2 = 4.2;     // theoretical max rations/km²/week at saturating labor
const FARM_LABOR_SATURATION_PER_KM2 = 1.5; // people/km² before diminishing returns bite hard
const MAX_FARMER_FRACTION = 0.9; // always leave some working-age labor for gathering/other pursuits

// Gathering: a real profession, not a fallback hack — foraging/hunting that
// barely benefits from bronze tools but is genuinely productive when there
// aren't many mouths competing for the same wild resources. This is what
// lets a low-density region like Scotland reach subsistence without needing
// to out-farm its land quality — people really did live at Bronze Age tech
// levels in places far harsher than Scotland.
const BASE_GATHER_YIELD_PER_WORKER = 1.2; // rations/week per gatherer at near-zero density
const GATHER_DENSITY_CEILING = 6;         // people/km² — beyond this, wild resources are too thin to matter
const GATHER_MIN_FACTOR = 0.05;           // gathering never fully collapses to zero

const WOOD_PER_LUMBERJACK = 0.8;
const WOOD_REGROWTH_RATE = 0.015;
const FOREST_SPREAD_RATE = 0.002;

const ORE_YIELD_PER_MINER = 0.6;
const BRONZE_PER_SMITH = 0.5;

// Fixed priority, not proportional-to-remaining-stock — stone is orders of
// magnitude more abundant than copper/tin, so weighting by raw tonnage let
// it swallow almost the entire miner pool. Real economies allocate by what's
// wanted, not by what's numerically biggest. There's no full price/market
// system yet (that's the trade system), so this is a placeholder stand-in
// for background (non-tool-demand) mining priority.
const ORE_PRIORITY = { copper: 3, tin: 3, gold: 2, stone: 1 };

// A little bronze demand exists even with every tool bought — prestige
// goods, trade goods, everyday repairs — so smithing doesn't collapse to
// exactly zero the moment every farmer has a plough. Deliberately small:
// realistic weekly bronze output from a Bronze Age mine-face is itself
// small, and this must never be large enough to structurally starve tool
// investment the way an earlier, too-large value did.
const BASELINE_BRONZE_DEMAND = 0.5;

const LUMBER_CAPACITY_DIVISOR = 400; // physical cap on lumberjacks a forest can usefully employ

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

export function tickEconomy(regions, toolTypes, rng = Math.random) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));

  for (const region of regions) {
    allocateAndProduce(region, toolTypes, rng);
  }
  // Forest spread reads neighbours' post-harvest state, so it runs as a
  // second pass once every region's extraction this tick is resolved.
  for (const region of regions) {
    applyForestRegrowth(region, regionsById);
  }
}

function allocateAndProduce(region, toolTypes, rng) {
  const totalPop = region.population;       // everyone eats
  const laborPool = region.demographics.workingAge; // only working-age people work
  const noise = foodYieldNoise(region, rng);
  const maxFoodOutput = region.areaSqKm * region.landQuality * FOOD_YIELD_PER_KM2 * noise;
  const kLabor = region.areaSqKm * FARM_LABOR_SATURATION_PER_KM2;
  const foodNeeded = totalPop * FOOD_PER_PERSON_PER_WEEK;

  // Tool bonus is lagged one tick (last tick's headcount/equipment) so this
  // doesn't need to solve "how many farmers" and "how equipped are they"
  // simultaneously — see tools.js.
  const farmerEfficiency = toolEfficiencyMultiplier(region, 'farmer', toolTypes.farmer, region.unlockedTechIds);
  const farmersNeededRaw = farmersNeededFor(foodNeeded, maxFoodOutput, kLabor) / farmerEfficiency;
  // Always leave some working-age labor free for gathering and everything
  // else — otherwise a genuine crisis (farmersNeeded >= laborPool) claims
  // 100% of the workforce for farming and leaves nothing for the fallback
  // that's supposed to catch exactly that case.
  const farmers = Math.min(laborPool * MAX_FARMER_FRACTION, farmersNeededRaw);
  const foodFromFarming = foodOutput(farmers * farmerEfficiency, maxFoodOutput, kLabor);

  // --- Gathering: fills whatever farming didn't cover. Effective when
  // there aren't many people competing for the same wild resources, barely
  // effective in a crowded region — the opposite scaling from farming,
  // which is why the two together (not either alone) are what let even a
  // poor-land region reach subsistence.
  const density = region.areaSqKm > 0 ? totalPop / region.areaSqKm : 0;
  const gatherYieldPerWorker = BASE_GATHER_YIELD_PER_WORKER *
    Math.max(GATHER_MIN_FACTOR, 1 - density / GATHER_DENSITY_CEILING);
  const remainingFoodNeeded = Math.max(0, foodNeeded - foodFromFarming);
  const laborAfterFarming = Math.max(0, laborPool - farmers);
  const gatherersNeeded = gatherYieldPerWorker > 0 ? remainingFoodNeeded / gatherYieldPerWorker : 0;
  const gatherers = Math.min(laborAfterFarming, gatherersNeeded);
  const foodFromGathering = gatherers * gatherYieldPerWorker;

  const foodProduced = foodFromFarming + foodFromGathering;

  // Stability isn't decided here anymore — trade gets a chance to cover any
  // remaining shortfall first. See society/demographics.js, called after
  // tickTrade().
  region._foodNeeded = foodNeeded;

  const surplus = Math.max(0, laborAfterFarming - gatherers);

  // --- Lumberjacks: capped by physical forest capacity, not population share ---
  const forestFraction = region.forest.K > 0 ? region.forest.currentStock / region.forest.K : 0;
  const lumberCapacity = forestFraction > 0.05 ? Math.round(region.forest.K / LUMBER_CAPACITY_DIVISOR) : 0;
  const lumberjacks = Math.min(lumberCapacity, surplus);
  let remainingSurplus = surplus - lumberjacks;

  // --- Demand for bronze: what do farmers, lumberjacks, and (last tick's)
  // miners want to spend on new tools this tick, plus a small baseline and
  // whatever the military wants (0 until edicts exist)? This — not a stale
  // "is there copper sitting around" check — is what determines how many
  // smiths we actually want.
  const farmerWant = desiredToolInvestment(region, 'farmer', farmers, toolTypes.farmer, region.unlockedTechIds);
  const lumberjackWant = desiredToolInvestment(region, 'lumberjack', lumberjacks, toolTypes.lumberjack, region.unlockedTechIds);
  const prevMiners = region.occupations?.miner || 0; // lagged: this tick's miner count isn't decided yet
  const minerWant = desiredToolInvestment(region, 'miner', prevMiners, toolTypes.miner, region.unlockedTechIds);

  const desiredBronzeOutput =
    farmerWant.bronzeWanted + lumberjackWant.bronzeWanted + minerWant.bronzeWanted +
    BASELINE_BRONZE_DEMAND + region.militaryBronzeDemand;

  // Reserve labor for smiths against that demand, up front — this is what
  // stops smith count from depending on a boolean "is there stock" check.
  const desiredSmithsLabor = Math.min(remainingSurplus, desiredBronzeOutput / BRONZE_PER_SMITH);
  const minerBudget = remainingSurplus - desiredSmithsLabor;

  // --- Mining, co-optimized with smith demand: mine enough copper/tin to
  // actually cover what smithing wants to make this tick, before falling
  // back to background priority mining for whatever budget is left over. ---
  const activeTiers = {};
  for (const [key, deposit] of Object.entries(region.deposits)) {
    activeTiers[key] = selectActiveTier(deposit.tiers, region.unlockedTechIds);
  }
  const openResources = Object.keys(activeTiers).filter((k) => activeTiers[k] !== null);

  const copperNeeded = Math.max(0, desiredBronzeOutput * 2 - (region.stockpile.copper || 0));
  const tinNeeded = Math.max(0, desiredBronzeOutput * 1 - (region.stockpile.tin || 0));
  const targetLabor = {
    copper: activeTiers.copper ? Math.min(copperNeeded / ORE_YIELD_PER_MINER, activeTiers.copper.maxWorkers) : 0,
    tin: activeTiers.tin ? Math.min(tinNeeded / ORE_YIELD_PER_MINER, activeTiers.tin.maxWorkers) : 0,
  };
  const targetLaborTotal = targetLabor.copper + targetLabor.tin;

  const minerAllocation = {};
  for (const key of openResources) minerAllocation[key] = 0;

  // Phase 1: satisfy copper/tin's demand-driven targets first (split
  // proportionally if the budget can't cover both in full).
  let budgetLeft = minerBudget;
  if (targetLaborTotal > 0) {
    const scale = Math.min(1, budgetLeft / targetLaborTotal);
    for (const key of ['copper', 'tin']) {
      if (activeTiers[key]) {
        minerAllocation[key] = targetLabor[key] * scale;
        budgetLeft -= minerAllocation[key];
      }
    }
  }
  // Phase 2: whatever's left (including all of gold/stone, and any copper/
  // tin room beyond their targets) goes to background priority mining —
  // this is the "keep stockpiling in case it's useful" behavior from before.
  if (budgetLeft > 0.01) {
    const items = openResources.map((key) => ({
      key,
      cap: activeTiers[key].maxWorkers - minerAllocation[key],
    }));
    const { allocation } = allocateWithCaps(budgetLeft, items, (key) => ORE_PRIORITY[key] || 1);
    for (const key of openResources) minerAllocation[key] += allocation[key] || 0;
  }

  let minersUsed = 0;
  for (const key of openResources) {
    const tier = activeTiers[key];
    const gathered = extractionRate({
      initialStock: tier.initialStock,
      remainingStock: tier.remainingStock,
      workers: minerAllocation[key],
      baseYieldPerWorker: ORE_YIELD_PER_MINER,
      difficulty: tier.difficulty,
    });
    tier.remainingStock -= gathered;
    region.stockpile[key] = (region.stockpile[key] || 0) + gathered;
    minersUsed += minerAllocation[key];
  }

  // --- Smithing: bounded by labor AND by what mining actually delivered
  // this tick (existing stockpile + fresh output), not a boolean gate. ---
  const maxBronzeByLabor = desiredSmithsLabor * BRONZE_PER_SMITH;
  const maxBronzeByCopper = (region.stockpile.copper || 0) / 2; // recipe: 2 copper + 1 tin -> 1 bronze
  const maxBronzeByTin = (region.stockpile.tin || 0) / 1;
  const bronzeMade = Math.max(0, Math.min(maxBronzeByLabor, maxBronzeByCopper, maxBronzeByTin, desiredBronzeOutput));
  const actualSmiths = BRONZE_PER_SMITH > 0 ? bronzeMade / BRONZE_PER_SMITH : 0;

  region.stockpile.copper = (region.stockpile.copper || 0) - bronzeMade * 2;
  region.stockpile.tin = (region.stockpile.tin || 0) - bronzeMade * 1;
  region.stockpile.bronze = (region.stockpile.bronze || 0) + bronzeMade;

  // --- Spend it: baseline/military demand is consumed outright (prestige
  // goods, upkeep — not modeled as owned stock); whatever's left funds tool
  // purchases, split by each occupation's share of what it originally asked
  // for, so a big farmer economy doesn't starve a small mining one of tools.
  const consumedOffTop = Math.min(region.stockpile.bronze, BASELINE_BRONZE_DEMAND + region.militaryBronzeDemand);
  region.stockpile.bronze -= consumedOffTop;

  const totalToolWant = farmerWant.bronzeWanted + lumberjackWant.bronzeWanted + minerWant.bronzeWanted;
  if (totalToolWant > 0 && region.stockpile.bronze > 0) {
    const pool = region.stockpile.bronze;
    region.stockpile.bronze -= investInTools(region, 'farmer', farmerWant, pool * (farmerWant.bronzeWanted / totalToolWant));
    region.stockpile.bronze -= investInTools(region, 'lumberjack', lumberjackWant, pool * (lumberjackWant.bronzeWanted / totalToolWant));
    region.stockpile.bronze -= investInTools(region, 'miner', minerWant, pool * (minerWant.bronzeWanted / totalToolWant));
  }

  const leftover = Math.round(Math.max(0, surplus - lumberjacks - minersUsed - actualSmiths));
  // Trade gets first claim on whatever's left before it's written off as
  // general population — trade.js reads this and reduces occupations.general
  // by however much it actually uses.
  region._availableForTrade = leftover;

  region.occupations = {
    farmer: Math.round(farmers),
    gatherer: Math.round(gatherers),
    lumberjack: Math.round(lumberjacks),
    miner: Math.round(minersUsed),
    smith: Math.round(actualSmiths),
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
  region.stockpile.food = (region.stockpile.food || 0) + foodProduced - foodNeeded;

  const lumberjackEfficiency = toolEfficiencyMultiplier(region, 'lumberjack', toolTypes.lumberjack, region.unlockedTechIds);
  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK * lumberjackEfficiency, region.forest.currentStock);
  region.forest.currentStock -= woodGathered;
  region.stockpile.wood = (region.stockpile.wood || 0) + woodGathered;
}

function applyForestRegrowth(region, regionsById) {
  const neighborStocks = region.neighbors.map((id) => regionsById.get(id).forest.currentStock);
  const neighborKs = region.neighbors.map((id) => regionsById.get(id).forest.K);
  const bonus = neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate: FOREST_SPREAD_RATE });

  const grown = regrow({ currentStock: region.forest.currentStock, K: region.forest.K, rate: WOOD_REGROWTH_RATE });
  region.forest.currentStock = Math.min(region.forest.K, grown + bonus * region.forest.K);
}
