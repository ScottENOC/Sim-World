import { TRADE_GOODS } from '../economy/tradeGoods.js';
import { WATER_ELECTROLYSIS_TECH_ID } from '../economy/energyTransition.js?v=20260924-rocket-propellant1';

export const ROCKET_PROPELLANT_GOOD_ID = 'rocket_propellant';
export const CRYOGENIC_ROCKET_PROPELLANT_TECH_ID = 'cryogenic_rocket_propellant';
export const MARS_PROPELLANT_ISRU_TECH_ID = 'mars_propellant_isru';

const nonNegative = v => Math.max(0, Number(v) || 0);
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

if (!TRADE_GOODS[ROCKET_PROPELLANT_GOOD_ID]) {
  TRADE_GOODS[ROCKET_PROPELLANT_GOOD_ID] = {
    label: 'Rocket propellant',
    basePrice: 13.5,
    referenceStock: 180,
    category: 'specialist_fuel',
    strategic: true,
    cargoKgPerUnit: 0.9,
  };
}

function productionCapability(region) {
  const industrial = region?.industrialSupply?.capability || {};
  const plants = region?.industrialPlants?.componentCapability || {};
  return clamp(
    (industrial.precision_machining || 0) * 0.30 +
    (region?.structuralTransformation?.capability?.manufacture || 0) * 0.25 +
    (plants.engine || 0) * 0.20 +
    (region?.electricity?.industrialService || 0) * 0.25,
  );
}

export function ensureRocketPropellantState(region) {
  region.stockpile ||= {};
  region.rocketPropellant ||= {
    conventionalProduced: 0,
    cryogenicProduced: 0,
    petrolConsumed: 0,
    hydrogenConsumed: 0,
    electricityConsumed: 0,
  };
  return region.rocketPropellant;
}

export function produceRocketPropellant(region, requested = Infinity, elapsedDays = 7) {
  const state = ensureRocketPropellantState(region);
  const request = Math.max(0, Number(requested));
  if (!(request > 0)) return { produced: 0, conventional: 0, cryogenic: 0, petrolUsed: 0, hydrogenUsed: 0, electricityUsed: 0 };

  const weeks = Math.max(0, Number(elapsedDays) || 0) / 7;
  const capability = productionCapability(region);
  const weeklyCapacity = 8 + capability * 72;
  let remaining = Math.min(request, weeklyCapacity * Math.max(0.05, weeks));
  let conventional = 0;
  let cryogenic = 0;
  let petrolUsed = 0;
  let hydrogenUsed = 0;
  let electricityUsed = 0;

  // Early chemical rockets use specialised refined petroleum/oxidiser blends.
  // Petrol is feedstock, not launch fuel itself: it must first be converted into
  // the separately stocked and tradable propellant good.
  if (hasTech(region, 'strategic_missile_systems') || hasTech(region, 'spaceflight_rocketry')) {
    const petrolPerUnit = 1.18;
    const possible = nonNegative(region.stockpile.petrol) / petrolPerUnit;
    conventional = Math.min(remaining, possible);
    petrolUsed = conventional * petrolPerUnit;
    region.stockpile.petrol = nonNegative(region.stockpile.petrol) - petrolUsed;
    remaining -= conventional;
  }

  // Later cryogenic propellant requires hydrogen already produced through the
  // physical electrolysis chain plus otherwise-exportable grid electricity for
  // oxygen separation, liquefaction and conditioning. This deliberately does
  // not treat grid service as matter.
  const cryogenicReady = hasTech(region, WATER_ELECTROLYSIS_TECH_ID) &&
    hasTech(region, CRYOGENIC_ROCKET_PROPELLANT_TECH_ID);
  if (remaining > 0 && cryogenicReady) {
    const hydrogenPerUnit = 1.35;
    const electricityPerUnit = 0.42;
    const hydrogenPossible = nonNegative(region.stockpile.hydrogen) / hydrogenPerUnit;
    const spareElectricity = nonNegative(region.electricity?.exportableSurplus);
    const electricityPossible = spareElectricity / electricityPerUnit;
    cryogenic = Math.min(remaining, hydrogenPossible, electricityPossible);
    hydrogenUsed = cryogenic * hydrogenPerUnit;
    electricityUsed = cryogenic * electricityPerUnit;
    region.stockpile.hydrogen = nonNegative(region.stockpile.hydrogen) - hydrogenUsed;
    if (region.electricity) region.electricity.exportableSurplus = Math.max(0, spareElectricity - electricityUsed);
    remaining -= cryogenic;
  }

  const produced = conventional + cryogenic;
  region.stockpile[ROCKET_PROPELLANT_GOOD_ID] = nonNegative(region.stockpile[ROCKET_PROPELLANT_GOOD_ID]) + produced;
  state.conventionalProduced = nonNegative(state.conventionalProduced) + conventional;
  state.cryogenicProduced = nonNegative(state.cryogenicProduced) + cryogenic;
  state.petrolConsumed = nonNegative(state.petrolConsumed) + petrolUsed;
  state.hydrogenConsumed = nonNegative(state.hydrogenConsumed) + hydrogenUsed;
  state.electricityConsumed = nonNegative(state.electricityConsumed) + electricityUsed;
  return { produced, conventional, cryogenic, petrolUsed, hydrogenUsed, electricityUsed, shortfall: Math.max(0, request - produced) };
}

export function ensureMarsPropellantIsru(habitat) {
  habitat.isru ||= {};
  const isru = habitat.isru;
  if (!Number.isFinite(isru.waterIceDeposit)) isru.waterIceDeposit = habitat.id === 'mars' ? 420 : 0;
  if (!Number.isFinite(isru.rocketPropellantReserve)) isru.rocketPropellantReserve = 0;
  if (!Number.isFinite(isru.cumulativePropellantProduced)) isru.cumulativePropellantProduced = 0;
  if (!Number.isFinite(isru.cumulativeWaterIceUsed)) isru.cumulativeWaterIceUsed = 0;
  if (!Number.isFinite(isru.lastPowerUseKwh)) isru.lastPowerUseKwh = 0;
  return isru;
}

export function operateMarsPropellantIsru(habitat, { enabled = false, elapsedDays = 7 } = {}) {
  const isru = ensureMarsPropellantIsru(habitat);
  isru.lastPowerUseKwh = 0;
  if (habitat.id !== 'mars' || !enabled) return { produced: 0, waterIceUsed: 0, electricityUsed: 0 };

  const days = Math.max(0, Number(elapsedDays) || 0);
  const sparePowerKw = Math.max(0, nonNegative(habitat.powerCapacityKw) - nonNegative(habitat.powerDemandKw));
  const waterIceAvailable = nonNegative(isru.waterIceDeposit);
  if (days <= 0 || sparePowerKw <= 0 || waterIceAvailable <= 0) return { produced: 0, waterIceUsed: 0, electricityUsed: 0 };

  const waterIcePerUnit = 1.4;
  const electricityKwhPerUnit = 48;
  const electricityAvailableKwh = sparePowerKw * 24 * days;
  const productionByPower = electricityAvailableKwh / electricityKwhPerUnit;
  const productionByFeedstock = waterIceAvailable / waterIcePerUnit;
  const productionByPlant = Math.max(0.25, nonNegative(habitat.crew) * 0.12) * days;
  const produced = Math.min(productionByPower, productionByFeedstock, productionByPlant);
  const waterIceUsed = produced * waterIcePerUnit;
  const electricityUsed = produced * electricityKwhPerUnit;

  isru.waterIceDeposit = Math.max(0, waterIceAvailable - waterIceUsed);
  isru.rocketPropellantReserve = nonNegative(isru.rocketPropellantReserve) + produced;
  isru.cumulativePropellantProduced += produced;
  isru.cumulativeWaterIceUsed += waterIceUsed;
  isru.lastPowerUseKwh = electricityUsed;
  return { produced, waterIceUsed, electricityUsed };
}

export function drawMarsPropellantReserve(habitat, requested) {
  const isru = ensureMarsPropellantIsru(habitat);
  const used = Math.min(nonNegative(requested), nonNegative(isru.rocketPropellantReserve));
  isru.rocketPropellantReserve -= used;
  return used;
}
