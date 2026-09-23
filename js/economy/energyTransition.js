import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260923-energy-transition1';
import { TRADE_GOODS } from './tradeGoods.js?v=20260923-energy-transition1';

export const OFFSHORE_WIND_TECH_ID = 'offshore_wind_generation';
export const GEOTHERMAL_TECH_ID = 'geothermal_generation';
export const WATER_ELECTROLYSIS_TECH_ID = 'water_electrolysis';
export const HYDROGEN_TRANSPORT_TECH_ID = 'hydrogen_transport_fuels';
export const HYDROGEN_POWER_TECH_ID = 'hydrogen_power_generation';
export const FUEL_ETHANOL_TECH_ID = 'fuel_ethanol_blending';

const DAYS_PER_YEAR = 365.2425;
const HYDROGEN_ENERGY_PER_UNIT = 4;
const ELECTROLYSIS_STORED_ENERGY_EFFICIENCY = 0.72;
const HYDROGEN_TO_POWER_EFFICIENCY = 0.48;
const ELECTROLYSIS_HYDROGEN_PER_ELECTRICITY = ELECTROLYSIS_STORED_ENERGY_EFFICIENCY / HYDROGEN_ENERGY_PER_UNIT;
const HYDROGEN_UNITS_PER_FOSSIL_EQUIVALENT = 1.7;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

// Register hydrogen with ordinary merchant trade. Dedicated hydrogen shipping
// and pipelines can be layered on later; for now it can move as expensive,
// low-density specialist cargo rather than behaving like a magic power line.
if (!TRADE_GOODS.hydrogen) {
  TRADE_GOODS.hydrogen = {
    label: 'Hydrogen', basePrice: 8.5, referenceStock: 650,
    category: 'gaseous_fuel', strategic: true, cargoKgPerUnit: 0.22,
  };
}

function stableFraction(text) {
  let hash = 2166136261;
  for (const ch of String(text)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

export function ensureEnergyTransition(region) {
  region.energyTransition ||= {};
  const s = region.energyTransition;
  s.assets ||= { offshoreWind: 0, geothermal: 0, electrolysers: 0, hydrogenPower: 0 };
  s.policy ||= { transportHydrogenShare: 0.15, electrolysisSurplusShare: 0.65 };
  s.hydrogen ||= { produced: 0, consumedForPower: 0, consumedForTransport: 0, electricityInput: 0, powerOutput: 0 };
  s.biofuels ||= { feedstockConsumed: 0, ethanolBlended: 0, petrolExtended: 0 };
  s.generation ||= { offshoreWind: 0, geothermal: 0 };
  for (const key of ['offshoreWind','geothermal','electrolysers','hydrogenPower']) if (!Number.isFinite(s.assets[key])) s.assets[key] = 0;
  return s;
}

export function geothermalPotential(region) {
  const explicit = region.geology?.geothermalPotential ?? region.climate?.geothermalPotential;
  if (Number.isFinite(explicit)) return clamp(explicit);
  // Deterministic proxy until world geology gains an explicit geothermal map.
  // Most regions have modest potential; a minority are unusually favourable.
  const signal = stableFraction(`${region.id || region.name}:geothermal`);
  return clamp(signal < 0.18 ? 0.72 + signal * 1.45 : 0.08 + signal * 0.32);
}

function transitionIndustry(region) {
  const c = region.industrialSupply?.capability || {};
  return clamp((c.precision_machining || 0) * 0.38 + (c.steelmaking || 0) * 0.22 +
    (region.structuralTransformation?.capability?.manufacture || 0) * 0.20 +
    (region.electricity?.industrialService || 0) * 0.20);
}

function spendBuildInputs(region, steel, copper, cash) {
  region.stockpile ||= {};
  if (nonNegative(region.stockpile.steel) < steel || nonNegative(region.stockpile.copper) < copper || nonNegative(region.treasury) < cash) return false;
  region.stockpile.steel -= steel;
  region.stockpile.copper -= copper;
  region.treasury -= cash;
  region.wallet = nonNegative(region.wallet) + cash;
  return true;
}

function growAsset(region, key, desired, annualRate, elapsedDays, costs) {
  const s = ensureEnergyTransition(region);
  const current = nonNegative(s.assets[key]);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (desired <= current || years <= 0) return 0;
  const increment = Math.min(desired - current, annualRate * years * Math.max(0.2, transitionIndustry(region)));
  if (increment <= 0) return 0;
  if (!spendBuildInputs(region, costs.steel * increment, costs.copper * increment, costs.cash * increment)) return 0;
  s.assets[key] = current + increment;
  return increment;
}

export function tickEnergyTransitionAssets(region, elapsedDays = 7) {
  const s = ensureEnergyTransition(region);
  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');
  if (grids <= 0 || !operationalInfrastructure(region, 'local_electric_grid')) return s.assets;
  const popScale = clamp(Math.log10(Math.max(1000, region.population || 0)) - 3, 0.25, 3.5);
  const wind = clamp(region.weather?.windAvailability ?? region.climate?.windPotential ?? 0.62);
  const geo = geothermalPotential(region);

  if (region.isCoastal && hasTech(region, OFFSHORE_WIND_TECH_ID)) {
    growAsset(region, 'offshoreWind', popScale * (0.5 + wind * 2.2), 0.45, elapsedDays,
      { steel: 130, copper: 42, cash: 95 });
  }
  if (hasTech(region, GEOTHERMAL_TECH_ID)) {
    growAsset(region, 'geothermal', popScale * Math.max(0, geo - 0.12) * 1.8, 0.28, elapsedDays,
      { steel: 105, copper: 30, cash: 110 });
  }
  if (hasTech(region, WATER_ELECTROLYSIS_TECH_ID)) {
    growAsset(region, 'electrolysers', popScale * 1.7, 0.38, elapsedDays,
      { steel: 75, copper: 50, cash: 120 });
  }
  if (hasTech(region, HYDROGEN_POWER_TECH_ID)) {
    growAsset(region, 'hydrogenPower', popScale * 0.9, 0.30, elapsedDays,
      { steel: 95, copper: 38, cash: 105 });
  }
  return s.assets;
}

export function transitionGeneration(region, elapsedDays = 7) {
  const s = ensureEnergyTransition(region);
  tickEnergyTransitionAssets(region, elapsedDays);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const wind = clamp(region.weather?.windAvailability ?? region.climate?.windPotential ?? 0.62);
  const geo = geothermalPotential(region);
  const offshoreWind = region.isCoastal && hasTech(region, OFFSHORE_WIND_TECH_ID)
    ? nonNegative(s.assets.offshoreWind) * 5600 * years * (0.45 + wind * 0.55) : 0;
  const geothermal = hasTech(region, GEOTHERMAL_TECH_ID)
    ? nonNegative(s.assets.geothermal) * 5000 * years * (0.55 + geo * 0.45) : 0;
  s.generation.offshoreWind = offshoreWind;
  s.generation.geothermal = geothermal;
  return { offshoreWind, geothermal, geothermalPotential: geo };
}

export function hydrogenPowerPotential(region, elapsedDays = 7, availableHydrogen = null) {
  const s = ensureEnergyTransition(region);
  s.hydrogen.consumedForPower = 0;
  s.hydrogen.powerOutput = 0;
  if (!hasTech(region, HYDROGEN_POWER_TECH_ID)) return { outputPotential: 0, hydrogenForFullOutput: 0 };
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const hydrogen = Math.min(nonNegative(region.stockpile?.hydrogen), availableHydrogen == null ? Infinity : nonNegative(availableHydrogen));
  const capacityOutput = nonNegative(s.assets.hydrogenPower) * 4400 * years;
  const fuelOutput = hydrogen * HYDROGEN_ENERGY_PER_UNIT * HYDROGEN_TO_POWER_EFFICIENCY;
  const outputPotential = Math.min(capacityOutput, fuelOutput);
  return { outputPotential, hydrogenForFullOutput: outputPotential / (HYDROGEN_ENERGY_PER_UNIT * HYDROGEN_TO_POWER_EFFICIENCY) };
}

export function consumeHydrogenForPower(region, output, potential) {
  const s = ensureEnergyTransition(region);
  const maxOutput = nonNegative(potential?.outputPotential);
  const fraction = maxOutput > 0 ? clamp(nonNegative(output) / maxOutput) : 0;
  const used = Math.min(nonNegative(region.stockpile?.hydrogen), nonNegative(potential?.hydrogenForFullOutput) * fraction);
  if (used > 0) region.stockpile.hydrogen = nonNegative(region.stockpile.hydrogen) - used;
  s.hydrogen.consumedForPower = used;
  s.hydrogen.powerOutput = nonNegative(output);
  return used;
}

export function produceHydrogenFromSurplus(region, surplusElectricity, elapsedDays = 7) {
  const s = ensureEnergyTransition(region);
  s.hydrogen.produced = 0;
  s.hydrogen.electricityInput = 0;
  if (!hasTech(region, WATER_ELECTROLYSIS_TECH_ID)) return { electricityInput: 0, hydrogenProduced: 0 };
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const capacity = nonNegative(s.assets.electrolysers) * 4200 * years;
  const policyShare = clamp(s.policy.electrolysisSurplusShare ?? 0.65);
  const waterService = clamp(region.waterResources?.industrialSatisfaction ?? region.waterResources?.allocationSatisfaction?.industry ?? 1);
  const input = Math.min(nonNegative(surplusElectricity) * policyShare, capacity) * waterService;
  const hydrogenProduced = input * ELECTROLYSIS_HYDROGEN_PER_ELECTRICITY;
  region.stockpile ||= {};
  region.stockpile.hydrogen = nonNegative(region.stockpile.hydrogen) + hydrogenProduced;
  s.hydrogen.electricityInput = input;
  s.hydrogen.produced = hydrogenProduced;
  s.hydrogen.waterDemand = input * 0.012;
  return { electricityInput: input, hydrogenProduced, storedEnergy: hydrogenProduced * HYDROGEN_ENERGY_PER_UNIT };
}

export function consumeTransportFuel(region, fossilFuel, requestedEquivalent, { targetHydrogenShare = null } = {}) {
  const s = ensureEnergyTransition(region);
  const requested = nonNegative(requestedEquivalent);
  if (requested <= 0) return { requested: 0, fulfilled: 0, fossilUsed: 0, hydrogenUsed: 0 };
  region.stockpile ||= {};
  const fossilAvailable = nonNegative(region.stockpile[fossilFuel]);
  const hydrogenAllowed = hasTech(region, HYDROGEN_TRANSPORT_TECH_ID);
  const policyShare = hydrogenAllowed ? clamp(targetHydrogenShare ?? s.policy.transportHydrogenShare ?? 0.15) : 0;
  const plannedHydrogenEquivalent = requested * policyShare;
  const hydrogenAvailableEquivalent = nonNegative(region.stockpile.hydrogen) / HYDROGEN_UNITS_PER_FOSSIL_EQUIVALENT;
  let hydrogenEquivalent = Math.min(plannedHydrogenEquivalent, hydrogenAvailableEquivalent);
  let fossilNeeded = requested - hydrogenEquivalent;
  let fossilUsed = Math.min(fossilAvailable, fossilNeeded);
  let remaining = requested - hydrogenEquivalent - fossilUsed;
  if (remaining > 0 && hydrogenAllowed) {
    const extraHydrogenEquivalent = Math.min(remaining, Math.max(0, hydrogenAvailableEquivalent - hydrogenEquivalent));
    hydrogenEquivalent += extraHydrogenEquivalent;
    remaining -= extraHydrogenEquivalent;
  }
  const hydrogenUsed = hydrogenEquivalent * HYDROGEN_UNITS_PER_FOSSIL_EQUIVALENT;
  region.stockpile[fossilFuel] = Math.max(0, fossilAvailable - fossilUsed);
  region.stockpile.hydrogen = Math.max(0, nonNegative(region.stockpile.hydrogen) - hydrogenUsed);
  s.hydrogen.consumedForTransport = nonNegative(s.hydrogen.consumedForTransport) + hydrogenUsed;
  return { requested, fulfilled: requested - remaining, fossilUsed, hydrogenUsed, hydrogenEquivalent, shortfall: remaining };
}

export function blendE10(region, newlyProducedPetrol = 0) {
  const s = ensureEnergyTransition(region);
  s.biofuels.feedstockConsumed = 0;
  s.biofuels.ethanolBlended = 0;
  s.biofuels.petrolExtended = 0;
  if (!hasTech(region, FUEL_ETHANOL_TECH_ID) || newlyProducedPetrol <= 0) return s.biofuels;
  region.stockpile ||= {};
  // E10 is at most 10% ethanol by final blend volume, hence ethanol <= petrol/9.
  const blendLimit = nonNegative(newlyProducedPetrol) / 9;
  let feedstockAvailable = nonNegative(region.stockpile.staple_grains);
  let feedstockKey = 'staple_grains';
  if (feedstockAvailable <= 0) { feedstockAvailable = nonNegative(region.stockpile.food); feedstockKey = 'food'; }
  const ethanolFromFeedstock = feedstockAvailable * 0.42;
  const ethanol = Math.min(blendLimit, ethanolFromFeedstock);
  if (ethanol <= 0) return s.biofuels;
  const feedstock = ethanol / 0.42;
  region.stockpile[feedstockKey] = Math.max(0, feedstockAvailable - feedstock);
  region.stockpile.petrol = nonNegative(region.stockpile.petrol) + ethanol;
  s.biofuels.feedstockConsumed = feedstock;
  s.biofuels.ethanolBlended = ethanol;
  s.biofuels.petrolExtended = ethanol;
  return s.biofuels;
}

export function energyTransitionSummary(region) {
  const s = ensureEnergyTransition(region);
  return {
    assets: { ...s.assets }, generation: { ...s.generation }, hydrogen: { ...s.hydrogen },
    biofuels: { ...s.biofuels }, geothermalPotential: geothermalPotential(region),
    hydrogenRoundTripEfficiency: ELECTROLYSIS_STORED_ENERGY_EFFICIENCY * HYDROGEN_TO_POWER_EFFICIENCY,
  };
}
