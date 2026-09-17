import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260917-electric1';

const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function ensureElectricityState(region) {
  region.electricity ||= {
    generated: 0, delivered: 0, householdService: 0, industrialService: 0,
    coalConsumed: 0, demand: 0, householdDemand: 0, industrialDemand: 0,
  };
  return region.electricity;
}

function industrialDemandSignal(region) {
  const c = region.industrialSupply?.capability || {};
  const capability = clamp01((c.steelmaking || 0) * 0.25 + (c.precision_machining || 0) * 0.45 + (c.railway_engineering || 0) * 0.15 + (c.locomotive_engineering || 0) * 0.15);
  const firms = (region.corporateCapital?.firms || []).filter((f) => f.status === 'active').length;
  return Math.pow(Math.max(0, region.population || 0) / 1000, 0.62) * (0.18 + capability * 0.82) + Math.log1p(firms) * 0.8;
}

export function electricityDemand(region, elapsedDays = 7) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const population = Math.max(0, Number(region.population) || 0);
  const urban = clamp01(region.medievalSociety?.urban?.urbanisation || region.settlements?.urbanShare || 0);
  const householdDemand = Math.pow(population / 1000, 0.68) * (0.4 + urban * 0.8) * Math.max(0.0001, years);
  const industrialDemand = industrialDemandSignal(region) * Math.max(0.0001, years);
  return { householdDemand, industrialDemand, total: householdDemand + industrialDemand };
}

export function tickElectricity(region, elapsedDays = 7) {
  const state = ensureElectricityState(region);
  region.stockpile ||= {};
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const coalStations = effectiveInfrastructureCount(region, 'coal_power_station');
  const hydroStations = effectiveInfrastructureCount(region, 'hydroelectric_station');
  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');

  const coalPotential = coalStations * 5200 * years;
  const coalNeed = coalStations * 900 * years;
  const coalAvailable = Math.max(0, Number(region.stockpile.coal) || 0);
  const coalFuelRatio = coalNeed > 0 ? clamp01(coalAvailable / coalNeed) : 0;
  const coalConsumed = Math.min(coalAvailable, coalNeed);
  region.stockpile.coal = Math.max(0, coalAvailable - coalConsumed);
  const coalOutput = coalPotential * coalFuelRatio;

  const hasDam = operationalInfrastructure(region, 'reservoir_dam') || (region.hydrology?.riverIds || []).length > 0;
  const hydroReliability = hasDam ? clamp01(region.hydrology?.waterAvailability ?? region.weather?.yieldMultiplier ?? 0.75) : 0;
  const hydroOutput = hydroStations * 4300 * years * hydroReliability;
  const generated = coalOutput + hydroOutput;

  const demand = electricityDemand(region, elapsedDays);
  const gridCapacity = grids * 6200 * years;
  const delivered = Math.min(generated, gridCapacity, demand.total);
  const householdShare = demand.total > 0 ? demand.householdDemand / demand.total : 0;
  const householdDelivered = delivered * householdShare;
  const industrialDelivered = Math.max(0, delivered - householdDelivered);
  const householdService = demand.householdDemand > 0 ? clamp01(householdDelivered / demand.householdDemand) : 0;
  const industrialService = demand.industrialDemand > 0 ? clamp01(industrialDelivered / demand.industrialDemand) : 0;
  const smoothing = clamp01(Math.max(0, Number(elapsedDays) || 0) / 28);
  state.householdService += (householdService - (state.householdService || 0)) * smoothing;
  state.industrialService += (industrialService - (state.industrialService || 0)) * smoothing;
  state.generated = generated;
  state.delivered = delivered;
  state.coalConsumed = coalConsumed;
  state.demand = demand.total;
  state.householdDemand = demand.householdDemand;
  state.industrialDemand = demand.industrialDemand;
  return { ...state, coalOutput, hydroOutput, gridCapacity };
}

export function electricityIndustrialMultiplier(region) {
  return 1 + clamp01(region.electricity?.industrialService || 0) * 0.20;
}

export function electricityWellbeing(region) {
  const service = clamp01(region.electricity?.householdService || 0);
  return {
    prosperity: service * 0.035,
    safety: service * 0.015,
    culturalAccess: service * 0.065,
  };
}
