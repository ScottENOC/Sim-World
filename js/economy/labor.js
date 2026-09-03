import { extractionRate, selectActiveTier } from '../world/resources/extraction.js?v=20260903-adaptive-clock2';
import { regrow, neighborSpreadBonus } from '../world/resources/renewables.js?v=20260903-adaptive-clock2';
import { toolEfficiencyMultiplier, desiredToolInvestment, investInTools } from './tools.js?v=20260903-adaptive-clock2';
import { adjustArmySize, adjustNavyCrew } from '../military/army.js?v=20260903-adaptive-clock2';
import { accumulateExperience, skillMultiplier } from '../technology/learningByDoing.js?v=20260903-adaptive-clock2';

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
const MAX_GATHERER_FRACTION = 0.85;       // leave some of the post-farming labor pool free for fishing too

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

// Boats: needs a sea border (region.isCoastal), lots of wood, and a
// dedicated profession. Fleet size ramps toward the player's target
// gradually, same shape as army mobilization.
const BOAT_MOBILIZATION_RATE = 0.05;
const BOATMAKER_BUILD_RATE = 0.02; // boats/week per worker — roughly a year per boat for a small crew
const BOAT_WOOD_COST = 200;

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

export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const seaRegionsById = new Map(seaRegions.map((s) => [s.id, s]));

  for (const region of regions) {
    allocateAndProduce(region, seaRegionsById, toolTypes, rng);
  }
  // Forest spread reads neighbours' post-harvest state, so it runs as a
  // second pass once every region's extraction this tick is resolved.
  for (const region of regions) {
    applyForestRegrowth(region, regionsById);
  }
  // Same idea for fish: every region sharing a sea has already taken this
  // week's catch by the time regrowth runs.
  for (const sea of seaRegions) {
    sea.fish.currentStock = regrow({ currentStock: sea.fish.currentStock, K: sea.fish.K, rate: FISH_REGROWTH_RATE });
  }
}

function allocateAndProduce(region, seaRegionsById, toolTypes, rng) {
  const report = {}; // this tick's production, by activity — see region.report, read by the UI

  const totalPop = region.population;       // everyone eats
  const workingAge = region.demographics.workingAge;

  // Military recruitment happens first and is sticky — personnel stay
  // committed tick to tick (ramping toward the player's target) rather
  // than being freely reallocated like every other occupation below.
  adjustArmySize(region, Math.max(0, workingAge - region.army.personnel - region.navy.personnel));
  adjustNavyCrew(region, Math.max(0, workingAge - region.army.personnel - region.navy.personnel));
  const laborPool = Math.max(0, workingAge - region.army.personnel - region.navy.personnel);

  const noise = foodYieldNoise(region, rng);
  const maxFoodOutput = region.areaSqKm * region.landQuality * FOOD_YIELD_PER_KM2 * noise;
  const kLabor = region.areaSqKm * FARM_LABOR_SATURATION_PER_KM2;
  const foodNeeded = totalPop * FOOD_PER_PERSON_PER_WEEK;

  // Tool bonus is lagged one tick (last tick's headcount/equipment) so this
  // doesn't need to solve "how many farmers" and "how equipped are they"
  // simultaneously — see tools.js. Skill (learningByDoing.js) stacks on
  // top: well-practiced AND well-equipped beats either alone.
  const farmerEfficiency = toolEfficiencyMultiplier(region, 'farmer', toolTypes.farmer, region.unlockedTechIds)
    * skillMultiplier(region, 'farming');
  const farmersNeededRaw = farmersNeededFor(foodNeeded, maxFoodOutput, kLabor) / farmerEfficiency;
  // Always leave some working-age labor free for gathering and everything
  // else — otherwise a genuine crisis (farmersNeeded >= laborPool) claims
  // 100% of the workforce for farming and leaves nothing for the fallback
  // that's supposed to catch exactly that case.
  const farmers = Math.min(laborPool * MAX_FARMER_FRACTION, farmersNeededRaw);
  const foodFromFarming = foodOutput(farmers * farmerEfficiency, maxFoodOutput, kLabor);
  accumulateExperience(region, 'farming', farmers);
  report.farming = { workers: Math.round(farmers), food: foodFromFarming };

  // --- Gathering: fills whatever farming didn't cover. Effective when
  // there aren't many people competing for the same wild resources, barely
  // effective in a crowded region — the opposite scaling from farming,
  // which is why the two together (not either alone) are what let even a
  // poor-land region reach subsistence.
  const density = region.areaSqKm > 0 ? totalPop / region.areaSqKm : 0;
  const gatherYieldPerWorker = BASE_GATHER_YIELD_PER_WORKER *
    Math.max(GATHER_MIN_FACTOR, 1 - density / GATHER_DENSITY_CEILING) *
    skillMultiplier(region, 'gathering');
  const remainingFoodNeeded = Math.max(0, foodNeeded - foodFromFarming);
  const laborAfterFarming = Math.max(0, laborPool - farmers);
  const gatherersNeeded = gatherYieldPerWorker > 0 ? remainingFoodNeeded / gatherYieldPerWorker : 0;
  const gatherers = Math.min(laborAfterFarming * MAX_GATHERER_FRACTION, gatherersNeeded);
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
  const remainingAfterGather = Math.max(0, foodNeeded - foodFromFarming - foodFromGathering);

  if (region.adjacentSeaIds.length > 0 && remainingAfterGather > 0 && laborAfterGathering > 0) {
    const sea = seaRegionsById.get(region.adjacentSeaIds[0]); // multi-sea prioritization: future refinement
    if (sea) {
      const fishingSkill = skillMultiplier(region, 'fishing');
      const stockFraction = sea.fish.K > 0 ? sea.fish.currentStock / sea.fish.K : 0;

      // Shore capacity is shared fairly across however many land regions
      // border this sea — a rough fairness heuristic, not a real market.
      const shoreCapacityTotal = Math.round(sea.fish.K / SHORE_FISH_CAPACITY_DIVISOR);
      const shoreCapacity = Math.round(shoreCapacityTotal / Math.max(1, sea.adjacentLand.length));
      const shoreYieldPerWorker = SHORE_FISH_YIELD_PER_WORKER_BASE * stockFraction * fishingSkill;
      const shoreFishersWanted = shoreYieldPerWorker > 0 ? remainingAfterGather / shoreYieldPerWorker : 0;
      shoreFishers = Math.min(shoreCapacity, laborAfterGathering, shoreFishersWanted);
      const foodFromShore = shoreFishers * shoreYieldPerWorker;

      // Boat fishing: capped by how many fishing boats this region owns
      // AND by the sea's own physical capacity to support boat fishing at
      // all, fair-shared among however many regions border it — otherwise
      // fleet size alone could grow without bound and strip a shared sea
      // to nothing (which is exactly what happened before this cap existed:
      // a population-scale fleet fished both seas to 0% in under 50 years).
      const stillNeeded = Math.max(0, remainingAfterGather - foodFromShore);
      const boatYieldPerWorker = BOAT_FISH_YIELD_PER_WORKER_BASE * stockFraction * fishingSkill;
      const boatCapacityTotal = Math.round(sea.fish.K / BOAT_FISH_CAPACITY_DIVISOR);
      const boatCapacityShare = Math.round(boatCapacityTotal / Math.max(1, sea.adjacentLand.length));
      const boatFishCapacity = Math.min(region.fishingBoats * FISHERS_PER_FISHING_BOAT, boatCapacityShare);
      const boatFishersWanted = boatYieldPerWorker > 0 ? stillNeeded / boatYieldPerWorker : 0;
      boatFishers = Math.min(boatFishCapacity, Math.max(0, laborAfterGathering - shoreFishers), boatFishersWanted);
      const foodFromBoat = boatFishers * boatYieldPerWorker;

      const totalWanted = foodFromShore + foodFromBoat;
      foodFromFishing = Math.min(totalWanted, sea.fish.currentStock);
      sea.fish.currentStock -= foodFromFishing;
      // If stock capped the total catch, both methods lose proportionally —
      // reflect that in the report rather than showing an uncapped figure.
      const catchScale = totalWanted > 0 ? foodFromFishing / totalWanted : 0;
      report.shoreFishing = { workers: Math.round(shoreFishers), food: foodFromShore * catchScale, seaName: sea.name };
      report.boatFishing = { workers: Math.round(boatFishers), food: foodFromBoat * catchScale, seaName: sea.name };

      // Grow fishing-boat demand when boat fishing is capacity-bound and
      // there's still unmet need — but only up to the sea's own physical
      // limit; past that, more boats genuinely wouldn't help, no matter how
      // hungry the region is.
      if (stillNeeded > foodFromBoat + 0.5 && region.fishingBoats * FISHERS_PER_FISHING_BOAT < boatCapacityShare) {
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

  // Stability isn't decided here anymore — trade gets a chance to cover any
  // remaining shortfall first. See society/demographics.js, called after
  // tickTrade().
  region._foodNeeded = foodNeeded;

  const surplus = Math.max(0, laborAfterGathering - shoreFishers - boatFishers);

  // --- Lumberjacks: capped by physical forest capacity, not population share ---
  const forestFraction = region.forest.K > 0 ? region.forest.currentStock / region.forest.K : 0;
  const lumberCapacity = forestFraction > 0.05 ? Math.round(region.forest.K / LUMBER_CAPACITY_DIVISOR) : 0;
  const lumberjacks = Math.min(lumberCapacity, surplus);
  let remainingSurplus = surplus - lumberjacks;

  // --- Boat-making: needs a sea border, wood, and labor. Crew for navy
  // boats was already recruited above once boats existed to justify it;
  // this grows both fleets — navy toward the player's target, fishing
  // toward whatever unmet fishing demand generated above. Navy gets first
  // claim on the shared labor/wood budget since it's player-directed
  // intent; fishing gets whatever's left.
  let boatMakers = 0;
  if (region.isCoastal) {
    const navyGap = Math.max(0, region.targetNavySize - region.navy.boats);
    const navyBoatsWanted = navyGap * BOAT_MOBILIZATION_RATE;
    const navyMakersWanted = BOATMAKER_BUILD_RATE > 0 ? navyBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const navyMakersAvailable = Math.min(navyMakersWanted, remainingSurplus);
    const navyBoatsByLabor = navyMakersAvailable * BOATMAKER_BUILD_RATE;
    const navyBoatsByWood = (region.stockpile.wood || 0) / BOAT_WOOD_COST;
    const navyBoatsBuilt = Math.max(0, Math.min(navyBoatsByLabor, navyBoatsByWood, navyGap));
    region.stockpile.wood = (region.stockpile.wood || 0) - navyBoatsBuilt * BOAT_WOOD_COST;
    region.navy.boats += navyBoatsBuilt;
    const navyMakersUsed = BOATMAKER_BUILD_RATE > 0 ? navyBoatsBuilt / BOATMAKER_BUILD_RATE : 0;

    const fishGap = Math.max(0, region.targetFishingBoats - region.fishingBoats);
    const fishBoatsWanted = fishGap * BOAT_MOBILIZATION_RATE;
    const fishMakersWanted = BOATMAKER_BUILD_RATE > 0 ? fishBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const fishMakersAvailable = Math.min(fishMakersWanted, Math.max(0, remainingSurplus - navyMakersUsed));
    const fishBoatsByLabor = fishMakersAvailable * BOATMAKER_BUILD_RATE;
    const fishBoatsByWood = (region.stockpile.wood || 0) / BOAT_WOOD_COST;
    const fishBoatsBuilt = Math.max(0, Math.min(fishBoatsByLabor, fishBoatsByWood, fishGap));
    region.stockpile.wood = (region.stockpile.wood || 0) - fishBoatsBuilt * BOAT_WOOD_COST;
    region.fishingBoats += fishBoatsBuilt;
    const fishMakersUsed = BOATMAKER_BUILD_RATE > 0 ? fishBoatsBuilt / BOATMAKER_BUILD_RATE : 0;

    boatMakers = navyMakersUsed + fishMakersUsed;
    report.boatmaking = { workers: Math.round(boatMakers), navyBoats: navyBoatsBuilt, fishingBoats: fishBoatsBuilt };
  }
  remainingSurplus -= boatMakers;

  // --- Demand for bronze: what do farmers, lumberjacks, and (last tick's)
  // miners want to spend on new tools this tick, plus a small baseline and
  // whatever the military wants (0 until edicts exist)? This — not a stale
  // "is there copper sitting around" check — is what determines how many
  // smiths we actually want.
  const farmerWant = desiredToolInvestment(region, 'farmer', farmers, toolTypes.farmer, region.unlockedTechIds);
  const lumberjackWant = desiredToolInvestment(region, 'lumberjack', lumberjacks, toolTypes.lumberjack, region.unlockedTechIds);
  const prevMiners = region.occupations?.miner || 0; // lagged: this tick's miner count isn't decided yet
  const minerWant = desiredToolInvestment(region, 'miner', prevMiners, toolTypes.miner, region.unlockedTechIds);
  const soldierWant = desiredToolInvestment(region, 'soldier', Math.round(region.army.personnel), toolTypes.soldier, region.unlockedTechIds);

  const desiredBronzeOutput =
    farmerWant.bronzeWanted + lumberjackWant.bronzeWanted + minerWant.bronzeWanted + soldierWant.bronzeWanted +
    BASELINE_BRONZE_DEMAND + region.militaryBronzeDemand;

  // Skill computed once, upfront, so the labor reservation below and the
  // actual production later use the same figure — otherwise a region that's
  // gotten good at smithing would over-reserve labor for a bronze target it
  // no longer needs that many hands to hit.
  const bronzePerSmith = BRONZE_PER_SMITH * skillMultiplier(region, 'smithing');

  // Reserve labor for smiths against that demand, up front — this is what
  // stops smith count from depending on a boolean "is there stock" check.
  const desiredSmithsLabor = Math.min(remainingSurplus, bronzePerSmith > 0 ? desiredBronzeOutput / bronzePerSmith : 0);
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
  const miningSkill = skillMultiplier(region, 'mining');
  const oreYieldPerMiner = ORE_YIELD_PER_MINER * miningSkill;
  const targetLabor = {
    copper: activeTiers.copper ? Math.min(copperNeeded / oreYieldPerMiner, activeTiers.copper.maxWorkers) : 0,
    tin: activeTiers.tin ? Math.min(tinNeeded / oreYieldPerMiner, activeTiers.tin.maxWorkers) : 0,
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
  const minedThisTick = {};
  for (const key of openResources) {
    const tier = activeTiers[key];
    const gathered = extractionRate({
      initialStock: tier.initialStock,
      remainingStock: tier.remainingStock,
      workers: minerAllocation[key],
      baseYieldPerWorker: oreYieldPerMiner,
      difficulty: tier.difficulty,
    });
    tier.remainingStock -= gathered;
    region.stockpile[key] = (region.stockpile[key] || 0) + gathered;
    minersUsed += minerAllocation[key];
    minedThisTick[key] = gathered;
  }
  accumulateExperience(region, 'mining', minersUsed);
  report.mining = { workers: Math.round(minersUsed), ...minedThisTick };

  // --- Smithing: bounded by labor AND by what mining actually delivered
  // this tick (existing stockpile + fresh output), not a boolean gate. ---
  const maxBronzeByLabor = desiredSmithsLabor * bronzePerSmith;
  const maxBronzeByCopper = (region.stockpile.copper || 0) / 2; // recipe: 2 copper + 1 tin -> 1 bronze
  const maxBronzeByTin = (region.stockpile.tin || 0) / 1;
  const bronzeMade = Math.max(0, Math.min(maxBronzeByLabor, maxBronzeByCopper, maxBronzeByTin, desiredBronzeOutput));
  const actualSmiths = bronzePerSmith > 0 ? bronzeMade / bronzePerSmith : 0;
  accumulateExperience(region, 'smithing', actualSmiths);
  report.smithing = { workers: Math.round(actualSmiths), bronze: bronzeMade };

  region.stockpile.copper = (region.stockpile.copper || 0) - bronzeMade * 2;
  region.stockpile.tin = (region.stockpile.tin || 0) - bronzeMade * 1;
  region.stockpile.bronze = (region.stockpile.bronze || 0) + bronzeMade;

  // --- Spend it: baseline/military demand is consumed outright (prestige
  // goods, upkeep — not modeled as owned stock); whatever's left funds tool
  // purchases, split by each occupation's share of what it originally asked
  // for, so a big farmer economy doesn't starve a small mining one of tools.
  const consumedOffTop = Math.min(region.stockpile.bronze, BASELINE_BRONZE_DEMAND + region.militaryBronzeDemand);
  region.stockpile.bronze -= consumedOffTop;

  const totalToolWant = farmerWant.bronzeWanted + lumberjackWant.bronzeWanted + minerWant.bronzeWanted + soldierWant.bronzeWanted;
  if (totalToolWant > 0 && region.stockpile.bronze > 0) {
    const pool = region.stockpile.bronze;
    region.stockpile.bronze -= investInTools(region, 'farmer', farmerWant, pool * (farmerWant.bronzeWanted / totalToolWant));
    region.stockpile.bronze -= investInTools(region, 'lumberjack', lumberjackWant, pool * (lumberjackWant.bronzeWanted / totalToolWant));
    region.stockpile.bronze -= investInTools(region, 'miner', minerWant, pool * (minerWant.bronzeWanted / totalToolWant));
    region.stockpile.bronze -= investInTools(region, 'soldier', soldierWant, pool * (soldierWant.bronzeWanted / totalToolWant));
  }

  const leftover = Math.round(Math.max(0, surplus - lumberjacks - boatMakers - minersUsed - actualSmiths));
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
    boatmaker: Math.round(boatMakers),
    miner: Math.round(minersUsed),
    smith: Math.round(actualSmiths),
    soldier: Math.round(region.army.personnel),
    sailor: Math.round(region.navy.personnel),
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

  const lumberjackEfficiency = toolEfficiencyMultiplier(region, 'lumberjack', toolTypes.lumberjack, region.unlockedTechIds)
    * skillMultiplier(region, 'lumberjack');
  const woodGathered = Math.min(lumberjacks * WOOD_PER_LUMBERJACK * lumberjackEfficiency, region.forest.currentStock);
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
