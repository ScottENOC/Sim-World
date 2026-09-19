import { effectiveInfrastructureCount } from './construction.js?v=20260920-nuclear1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const NUCLEAR_PHYSICS_TECH_ID = 'nuclear_physics';
export const URANIUM_FUEL_CYCLE_TECH_ID = 'uranium_fuel_cycle';
export const REACTOR_ENGINEERING_TECH_ID = 'reactor_engineering';
export const NUCLEAR_POWER_TECH_ID = 'nuclear_power_generation';
export const SPENT_FUEL_MANAGEMENT_TECH_ID = 'spent_fuel_management';

function hasTech(region, id) { return Boolean(region?.unlockedTechIds?.has?.(id)); }
function stable01(text, salt = '') {
  let h = 2166136261;
  const value = `${salt}:${text || 'region'}`;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
function consume(stockpile, key, requested) {
  const available = nonNegative(stockpile[key]);
  const amount = Math.min(available, Math.max(0, requested));
  stockpile[key] = available - amount;
  return amount;
}

export function ensureUraniumGeology(region) {
  region.resourceDeposits ||= {};
  if (!region.resourceDeposits.uranium) {
    const draw = stable01(region.id || region.name, 'uranium');
    const present = draw > 0.78;
    region.resourceDeposits.uranium = {
      depth: present ? clamp(0.18 + stable01(region.id || region.name, 'uranium-grade') * 0.76) : 0,
      remainingFraction: present ? 1 : 0,
      inferred: true,
    };
  }
  return region.resourceDeposits.uranium;
}

export function ensureNuclearPowerState(region) {
  region.stockpile ||= {};
  for (const key of ['uranium_ore', 'uranium_concentrate', 'reactor_fuel', 'spent_nuclear_fuel']) {
    if (!Number.isFinite(region.stockpile[key])) region.stockpile[key] = 0;
  }
  ensureUraniumGeology(region);
  region.nuclearPower ||= {};
  const s = region.nuclearPower;
  s.lastFuelCycle ||= {};
  s.lastGeneration ||= {};
  if (!Number.isFinite(s.operationsExperience)) s.operationsExperience = 0;
  if (!Number.isFinite(s.fuelCycleExperience)) s.fuelCycleExperience = 0;
  if (!Number.isFinite(s.totalReactorFuelConsumed)) s.totalReactorFuelConsumed = 0;
  if (!Number.isFinite(s.totalSpentFuelGenerated)) s.totalSpentFuelGenerated = 0;
  return s;
}

function miningReadiness(region) {
  const miners = nonNegative(region.occupations?.miner);
  const population = Math.max(1, nonNegative(region.population));
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const deepMining = hasTech(region, 'shaft_mining') ? 1 : 0;
  return clamp(0.16 + clamp(miners / population * 18) * 0.34 + machining * 0.30 + deepMining * 0.20);
}

export function nuclearIndustrialReadiness(region) {
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const manufacture = clamp(region.structuralTransformation?.capability?.manufacture || 0);
  const literacy = clamp(region.massEducation?.literacy || region.education?.literacy || 0);
  const admin = region.governance?.administration || region.administration || {};
  const records = clamp(admin.recordKeeping || region.governance?.administrativeControl || 0);
  const factory = hasTech(region, 'advanced_factories') ? 1 : 0;
  return clamp(machining * 0.29 + manufacture * 0.23 + literacy * 0.22 + records * 0.14 + factory * 0.12);
}

export function tickNuclearFuelCycle(region, elapsedDays = 7) {
  const s = ensureNuclearPowerState(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (years <= 0) return s.lastFuelCycle;

  let uraniumOreMined = 0;
  const deposit = region.resourceDeposits?.uranium;
  if (hasTech(region, URANIUM_FUEL_CYCLE_TECH_ID) && (deposit?.depth || 0) > 0 && (deposit?.remainingFraction || 0) > 0) {
    const depth = clamp(deposit.depth);
    const remaining = clamp(deposit.remainingFraction);
    uraniumOreMined = 72 * depth * remaining * miningReadiness(region) * years;
    region.stockpile.uranium_ore += uraniumOreMined;
    deposit.remainingFraction = clamp(remaining - uraniumOreMined / Math.max(12000, 72 * 160));
  }

  const plants = effectiveInfrastructureCount(region, 'nuclear_fuel_plant');
  const readiness = nuclearIndustrialReadiness(region);
  let oreProcessed = 0, concentrateProduced = 0, concentrateUsed = 0, reactorFuelProduced = 0;
  if (plants > 0 && hasTech(region, URANIUM_FUEL_CYCLE_TECH_ID)) {
    const concentrationCapacity = plants * 180 * years * (0.55 + readiness * 0.45);
    oreProcessed = consume(region.stockpile, 'uranium_ore', concentrationCapacity);
    concentrateProduced = oreProcessed * (0.17 + readiness * 0.035);
    region.stockpile.uranium_concentrate += concentrateProduced;

    const fabricationCapacity = plants * 28 * years * (0.50 + readiness * 0.50);
    concentrateUsed = consume(region.stockpile, 'uranium_concentrate', fabricationCapacity * 0.82);
    reactorFuelProduced = concentrateUsed * (0.62 + readiness * 0.16);
    region.stockpile.reactor_fuel += reactorFuelProduced;
    s.fuelCycleExperience = clamp(s.fuelCycleExperience + years * (0.025 + readiness * 0.075) * (1 - s.fuelCycleExperience));
  }

  s.lastFuelCycle = { uraniumOreMined, oreProcessed, concentrateProduced, concentrateUsed, reactorFuelProduced, plants, readiness };
  return s.lastFuelCycle;
}

export function nuclearSpentFuelStorageCapacity(region) {
  const stations = effectiveInfrastructureCount(region, 'nuclear_power_station');
  const stores = effectiveInfrastructureCount(region, 'spent_fuel_storage');
  // Early stations have limited on-site pools. Purpose-built storage gives much more headroom.
  return stations * 32 + stores * 260;
}

export function nuclearGeneration(region, elapsedDays = 7) {
  const s = ensureNuclearPowerState(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const stations = effectiveInfrastructureCount(region, 'nuclear_power_station');
  if (stations <= 0 || !hasTech(region, NUCLEAR_POWER_TECH_ID) || years <= 0) {
    s.lastGeneration = { output: 0, stations, reactorFuelConsumed: 0, spentFuelGenerated: 0, fuelAvailability: stations > 0 ? 0 : 1, capacityFactor: 0, storagePressure: 0, storageCapacity: nuclearSpentFuelStorageCapacity(region) };
    return s.lastGeneration;
  }

  const readiness = nuclearIndustrialReadiness(region);
  const storageCapacity = Math.max(1, nuclearSpentFuelStorageCapacity(region));
  const existingSpent = nonNegative(region.stockpile.spent_nuclear_fuel);
  const storagePressure = existingSpent / storageCapacity;
  const wasteConstraint = clamp(1 - Math.max(0, storagePressure - 0.85) * 0.42, 0.42, 1);
  const operationsFactor = clamp(0.58 + readiness * 0.30 + s.operationsExperience * 0.10, 0.5, 0.96);
  const capacityFactor = operationsFactor * wasteConstraint;

  const fuelNeed = stations * 7.5 * years * capacityFactor;
  const reactorFuelConsumed = consume(region.stockpile, 'reactor_fuel', fuelNeed);
  const fuelAvailability = fuelNeed > 0 ? clamp(reactorFuelConsumed / fuelNeed) : 1;
  const output = stations * 11200 * years * capacityFactor * fuelAvailability;
  const spentFuelGenerated = reactorFuelConsumed * 0.94;
  region.stockpile.spent_nuclear_fuel += spentFuelGenerated;

  if (reactorFuelConsumed > 0) {
    s.operationsExperience = clamp(s.operationsExperience + years * (0.018 + readiness * 0.055) * fuelAvailability * (1 - s.operationsExperience));
    s.totalReactorFuelConsumed += reactorFuelConsumed;
    s.totalSpentFuelGenerated += spentFuelGenerated;
  }

  s.lastGeneration = {
    output, stations, reactorFuelConsumed, spentFuelGenerated, fuelAvailability, capacityFactor,
    storagePressure: nonNegative(region.stockpile.spent_nuclear_fuel) / storageCapacity,
    storageCapacity, readiness, wasteConstraint,
  };
  return s.lastGeneration;
}

export function nuclearPowerSummary(region) {
  const s = ensureNuclearPowerState(region);
  return {
    uraniumDeposit: { ...(region.resourceDeposits?.uranium || {}) },
    fuelCycle: { ...(s.lastFuelCycle || {}) },
    generation: { ...(s.lastGeneration || {}) },
    stockpile: {
      uraniumOre: nonNegative(region.stockpile.uranium_ore),
      uraniumConcentrate: nonNegative(region.stockpile.uranium_concentrate),
      reactorFuel: nonNegative(region.stockpile.reactor_fuel),
      spentNuclearFuel: nonNegative(region.stockpile.spent_nuclear_fuel),
    },
    operationsExperience: s.operationsExperience || 0,
    fuelCycleExperience: s.fuelCycleExperience || 0,
  };
}
