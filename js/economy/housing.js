import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';

// Ordinary housing belongs to the background economy rather than the state-project
// construction screen. Capacity is measured in residents, while jobCapacity is
// the number of workers who can live at a particular economic site. A vacated
// logging village therefore remains useful to future loggers, but cannot house a
// new mining workforce on the other side of the region.
const INITIAL_SPARE_FRACTION = 0.04;
const TARGET_SPARE_FRACTION = 0.025;
const HOUSING_OUTPUT_PER_BUILDER_WEEK = 0.10;
const MAX_HOUSING_BUILDER_SHARE = 0.05;
const WOOD_PER_RESIDENT_CAPACITY = 0.05;
const MINERAL_PER_RESIDENT_CAPACITY = 0.03; // stone or clay; earth/thatch are abstracted
const DEMAND_HORIZON_WEEKS = 26;

export const HOUSING_SITES = Object.freeze(['urban', 'farm', 'logging', 'mining', 'fishing']);

const OCCUPATION_SITE = Object.freeze({
  farmer: 'farm',
  gatherer: 'farm',
  horseBreeder: 'farm',
  horseTrainer: 'farm',
  lumberjack: 'logging',
  miner: 'mining',
  shoreFisher: 'fishing',
  boatFisher: 'fishing',
  boatmaker: 'urban',
  pitchMaker: 'urban',
  textileWorker: 'urban',
  tailor: 'urban',
  smelter: 'urban',
  potter: 'urban',
  smith: 'urban',
  trader: 'urban',
  artist: 'urban',
  artStudent: 'urban',
  industrialSupport: 'urban',
  services: 'urban',
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function siteWorkers(occupations = {}, site) {
  let total = 0;
  for (const [occupation, count] of Object.entries(occupations || {})) {
    if (OCCUPATION_SITE[occupation] === site) total += Math.max(0, finite(count));
  }
  return total;
}

export function housingSiteForOccupation(occupation) {
  return OCCUPATION_SITE[occupation] || null;
}

export function ensureHousing(region) {
  if (region.housing?.version === 1) return region.housing;
  const population = Math.max(0, finite(region.population));
  const occupations = region.occupations || {};
  const jobCapacity = {};
  for (const site of HOUSING_SITES) {
    const current = siteWorkers(occupations, site);
    jobCapacity[site] = Math.ceil(current * (1 + INITIAL_SPARE_FRACTION));
  }
  region.housing = {
    version: 1,
    residentCapacity: Math.ceil(population * (1 + INITIAL_SPARE_FRACTION)),
    jobCapacity,
    pendingJobCapacity: Object.fromEntries(HOUSING_SITES.map((site) => [site, 0])),
    ownerShares: { households: 1, domesticCorporations: 0, foreignCorporations: 0, state: 0 },
    rentPaidLastTick: 0,
    foreignRentPaidLastTick: 0,
    builtLastTick: 0,
  };
  return region.housing;
}

export function availableResidentHousing(region) {
  const housing = ensureHousing(region);
  return Math.max(0, finite(housing.residentCapacity) - Math.max(0, finite(region.population)));
}

export function housingPopulationLimit(region) {
  return Math.max(0, finite(ensureHousing(region).residentCapacity));
}

function materialCapacity(region) {
  const stock = region.stockpile || {};
  const byWood = WOOD_PER_RESIDENT_CAPACITY > 0
    ? Math.max(0, finite(stock.wood)) / WOOD_PER_RESIDENT_CAPACITY
    : Infinity;
  const mineral = Math.max(0, finite(stock.stone)) + Math.max(0, finite(stock.clay));
  const byMineral = MINERAL_PER_RESIDENT_CAPACITY > 0 ? mineral / MINERAL_PER_RESIDENT_CAPACITY : Infinity;
  return Math.max(0, Math.min(byWood, byMineral));
}

function consumeMaterials(region, capacityBuilt) {
  if (capacityBuilt <= 0) return { wood: 0, stone: 0, clay: 0 };
  const stock = region.stockpile ||= {};
  const wood = capacityBuilt * WOOD_PER_RESIDENT_CAPACITY;
  let mineral = capacityBuilt * MINERAL_PER_RESIDENT_CAPACITY;
  const stone = Math.min(Math.max(0, finite(stock.stone)), mineral);
  mineral -= stone;
  const clay = Math.min(Math.max(0, finite(stock.clay)), mineral);
  stock.wood = Math.max(0, finite(stock.wood) - wood);
  stock.stone = Math.max(0, finite(stock.stone) - stone);
  stock.clay = Math.max(0, finite(stock.clay) - clay);
  return { wood, stone, clay };
}

function allocateBuiltCapacity(housing, amount) {
  let remaining = amount;
  const builtBySite = Object.fromEntries(HOUSING_SITES.map((site) => [site, 0]));
  const pendingTotal = HOUSING_SITES.reduce((sum, site) => sum + Math.max(0, finite(housing.pendingJobCapacity?.[site])), 0);
  if (pendingTotal > 0 && remaining > 0) {
    for (const site of HOUSING_SITES) {
      const pending = Math.max(0, finite(housing.pendingJobCapacity[site]));
      if (pending <= 0) continue;
      const share = Math.min(pending, amount * pending / pendingTotal, remaining);
      housing.jobCapacity[site] = Math.max(0, finite(housing.jobCapacity[site])) + share;
      housing.pendingJobCapacity[site] = Math.max(0, pending - share);
      builtBySite[site] += share;
      remaining -= share;
    }
  }
  return { builtBySite, unassigned: Math.max(0, remaining) };
}

// Called before the main labour allocator. Housing builders are ordinary private
// workers: they consume local materials and labour, and are reserved from the
// workforce for this tick just like other committed occupations.
export function prepareHousingConstruction(region, elapsedDays = 7) {
  const housing = ensureHousing(region);
  const weeks = Math.max(0.01, elapsedWeeks(elapsedDays));
  const population = Math.max(0, finite(region.population));
  const workingAge = Math.max(0, finite(region.demographics?.workingAge));
  const desiredResidentCapacity = population * (1 + TARGET_SPARE_FRACTION);
  const residentShortage = Math.max(0, desiredResidentCapacity - finite(housing.residentCapacity));
  const pendingJobs = HOUSING_SITES.reduce((sum, site) => sum + Math.max(0, finite(housing.pendingJobCapacity?.[site])), 0);
  const desiredBuild = Math.max(residentShortage, pendingJobs);
  if (desiredBuild <= 0.01 || workingAge <= 0) {
    housing.builtLastTick = 0;
    return { workers: 0, capacityBuilt: 0, materials: { wood: 0, stone: 0, clay: 0 }, builtBySite: {} };
  }

  const desiredWorkers = desiredBuild / (HOUSING_OUTPUT_PER_BUILDER_WEEK * DEMAND_HORIZON_WEEKS);
  const workers = Math.min(workingAge * MAX_HOUSING_BUILDER_SHARE, Math.max(1, desiredWorkers));
  const laborCapacity = workers * HOUSING_OUTPUT_PER_BUILDER_WEEK * weeks;
  const capacityBuilt = Math.max(0, Math.min(desiredBuild, laborCapacity, materialCapacity(region)));
  const materials = consumeMaterials(region, capacityBuilt);
  housing.residentCapacity += capacityBuilt;
  const allocation = allocateBuiltCapacity(housing, capacityBuilt);
  housing.builtLastTick = capacityBuilt;
  return { workers: capacityBuilt > 0 ? workers : 0, capacityBuilt, materials, builtBySite: allocation.builtBySite };
}

// Enforce location-specific housing after the labour market has proposed its
// normal gradual occupation changes. Existing workers may remain where they
// are; only entrants are blocked. The blocked demand becomes a construction
// signal for subsequent ticks. This keeps the existing occupation-inertia
// model intact rather than replacing it with a second labour allocator.
export function enforceHousingEmployment(region, previousOccupations = {}) {
  const housing = ensureHousing(region);
  const occupations = region.occupations ||= {};
  let blockedTotal = 0;
  const blockedBySite = {};

  for (const site of HOUSING_SITES) {
    const keys = Object.keys(OCCUPATION_SITE).filter((key) => OCCUPATION_SITE[key] === site);
    const previous = keys.reduce((sum, key) => sum + Math.max(0, finite(previousOccupations[key])), 0);
    const current = keys.reduce((sum, key) => sum + Math.max(0, finite(occupations[key])), 0);
    const capacity = Math.max(previous, Math.max(0, finite(housing.jobCapacity[site])));
    const increases = keys.map((key) => ({ key, amount: Math.max(0, finite(occupations[key]) - Math.max(0, finite(previousOccupations[key]))) }));
    const totalIncrease = increases.reduce((sum, item) => sum + item.amount, 0);
    const baseAfterExits = current - totalIncrease;
    const allowedIncrease = Math.max(0, capacity - baseAfterExits);
    if (totalIncrease <= allowedIncrease + 0.001) continue;
    const scale = totalIncrease > 0 ? allowedIncrease / totalIncrease : 0;
    let blocked = 0;
    for (const { key, amount } of increases) {
      if (amount <= 0) continue;
      const previousCount = Math.max(0, finite(previousOccupations[key]));
      const allowed = amount * scale;
      const denied = amount - allowed;
      occupations[key] = Math.max(0, Math.round(previousCount + allowed));
      blocked += denied;
    }
    if (blocked > 0) {
      housing.pendingJobCapacity[site] = Math.max(0, finite(housing.pendingJobCapacity[site])) + blocked;
      blockedBySite[site] = blocked;
      blockedTotal += blocked;
    }
  }

  if (blockedTotal > 0) occupations.general = Math.max(0, finite(occupations.general) + blockedTotal);
  return { blockedTotal, blockedBySite };
}

export function housingSummary(region) {
  const housing = ensureHousing(region);
  return {
    residentCapacity: housing.residentCapacity,
    vacancy: availableResidentHousing(region),
    jobCapacity: { ...housing.jobCapacity },
    pendingJobCapacity: { ...housing.pendingJobCapacity },
    ownerShares: { ...housing.ownerShares },
    builtLastTick: housing.builtLastTick,
  };
}
