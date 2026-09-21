import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260920-nuclear1';
import { tickNuclearFuelCycle, nuclearGeneration } from './nuclearPower.js?v=20260920-nuclear1';
import { tickStrategicNuclearFuelCycle, strategicNuclearElectricityDemand } from './strategicNuclear.js?v=20260920-strategic-nuclear1';
import { modernEnergyElectricityDemand, gasPowerPotential, consumeGasForGeneration, solarGenerationMultiplier } from './lngSolarEnergy.js?v=20260920-modern-energy1';
import { batteryCapability, dispatchBatteryStorage, ensureBatteryStorage } from './batteryStorage.js?v=20260920-battery1';

const DAYS_PER_YEAR = 365.2425;
const INDUSTRIAL_ELECTRIFICATION_TECH_ID = 'industrial_electrification';
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export function ensureElectricityState(region) {
  region.electricity ||= {
    generated: 0, delivered: 0, householdService: 0, industrialService: 0,
    coalConsumed: 0, copperConsumed: 0, demand: 0, householdDemand: 0, industrialDemand: 0,
    curtailed: 0, coalCyclingLoss: 0, nuclearCyclingLoss: 0, balancingShortfall: 0, dispatchEfficiency: 1,
    reactorFuelConsumed: 0, spentFuelGenerated: 0,
    storageCharge: 0, storageDischarge: 0, storageEnergy: 0, storageCapacity: 0,
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
  const baseIndustrialDemand = industrialDemandSignal(region) * Math.max(0.0001, years);
  const lightMetalsDemand = nonNegative(region.lightMetals?.electricityLoad);
  const strategicNuclearDemand = nonNegative(region.strategicNuclear?.electricityLoad);
  const modernEnergyDemand = modernEnergyElectricityDemand(region);
  const fertiliserDemand = nonNegative(region.agriculturalFertiliser?.electricityLoad);
  const controlledAgricultureDemand = nonNegative(region.controlledEnvironmentAgriculture?.electricityLoad);
  const waterPumpingDemand = nonNegative(region.waterResources?.pumpingElectricityLoad);
  const industrialDemand = baseIndustrialDemand + lightMetalsDemand + strategicNuclearDemand + modernEnergyDemand + fertiliserDemand + controlledAgricultureDemand + waterPumpingDemand;
  return { householdDemand, industrialDemand, total: householdDemand + industrialDemand, lightMetalsDemand, strategicNuclearDemand, modernEnergyDemand, fertiliserDemand, controlledAgricultureDemand, waterPumpingDemand };
}

export function dispatchElectricityPortfolio(outputs = {}, demand = Infinity) {
  const coal = nonNegative(outputs.coal);
  const hydro = nonNegative(outputs.hydro);
  const solar = nonNegative(outputs.solar);
  const wind = nonNegative(outputs.wind);
  const peaking = nonNegative(outputs.peaking);
  const nuclear = nonNegative(outputs.nuclear);
  const grossPotential = coal + hydro + solar + wind + peaking + nuclear;
  if (grossPotential <= 0) return {
    grossPotential: 0, usableGeneration: 0, curtailed: 0, coalCyclingLoss: 0, nuclearCyclingLoss: 0,
    balancingNeed: 0, balancingAvailable: 0, balancingShortfall: 0,
    balancingCoverage: 1, dispatchEfficiency: 1, variableComplementarity: 0,
  };

  const rawBalancingNeed = solar * 0.30 + wind * 0.24;
  const variableComplementarity = Math.min(solar * 0.30, wind * 0.24) * 0.30;
  const balancingNeed = Math.max(0, rawBalancingNeed - variableComplementarity);
  const balancingAvailable = hydro * 0.58 + peaking * 0.78 + coal * 0.06;
  const balancingShortfall = Math.max(0, balancingNeed - balancingAvailable);
  const balancingCoverage = balancingNeed > 0 ? clamp01(balancingAvailable / balancingNeed) : 1;
  const variableOutput = solar + wind;
  const curtailed = Math.min(variableOutput, balancingShortfall * 0.55);
  const coalCyclingLoss = Math.min(coal * 0.18, balancingShortfall * 0.45);
  const nuclearCyclingLoss = Math.min(nuclear * 0.08, balancingShortfall * 0.18);
  const usableGeneration = Math.max(0, grossPotential - curtailed - coalCyclingLoss - nuclearCyclingLoss);
  const dispatchEfficiency = grossPotential > 0 ? clamp01(usableGeneration / grossPotential) : 1;
  const demandLimitedGeneration = Math.min(usableGeneration, Math.max(0, Number(demand) || 0));

  return {
    grossPotential, usableGeneration, demandLimitedGeneration, curtailed, coalCyclingLoss, nuclearCyclingLoss,
    balancingNeed, balancingAvailable, balancingShortfall, balancingCoverage,
    dispatchEfficiency, variableComplementarity,
  };
}

function syncDistributedGridStorage(region, grids) {
  const capability = batteryCapability(region);
  const storage = ensureBatteryStorage(region);
  if (!capability || grids <= 0) return storage;
  const retrofitCapacityPerGrid = 260 * (0.35 + capability.energyDensity * 0.65);
  const floorCapacity = grids * retrofitCapacityPerGrid;
  if (storage.installedCapacity < floorCapacity) {
    storage.installedCapacity = floorCapacity;
    storage.maxChargeRate = storage.installedCapacity * (0.25 + capability.powerDensity * 0.22);
    storage.maxDischargeRate = storage.installedCapacity * (0.30 + capability.powerDensity * 0.28);
    storage.storedEnergy = Math.min(storage.storedEnergy, storage.installedCapacity);
  }
  return storage;
}

export function tickElectricity(region, elapsedDays = 7) {
  const state = ensureElectricityState(region);
  region.stockpile ||= {};
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const coalStations = effectiveInfrastructureCount(region, 'coal_power_station');
  const hydroStations = effectiveInfrastructureCount(region, 'hydroelectric_station');
  const solarStations = effectiveInfrastructureCount(region, 'solar_power_station');
  const windStations = effectiveInfrastructureCount(region, 'wind_power_station');
  const grids = effectiveInfrastructureCount(region, 'local_electric_grid');
  tickNuclearFuelCycle(region, elapsedDays);
  tickStrategicNuclearFuelCycle(region, elapsedDays);
  strategicNuclearElectricityDemand(region, elapsedDays);
  const nuclear = nuclearGeneration(region, elapsedDays);

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
  const solarAvailability = clamp01(region.weather?.solarAvailability ?? region.climate?.solarPotential ?? 0.72);
  const windAvailability = clamp01(region.weather?.windAvailability ?? region.climate?.windPotential ?? 0.62);
  const solarOutput = solarStations * 3900 * years * solarAvailability * solarGenerationMultiplier(region, elapsedDays);
  const windOutput = windStations * 4500 * years * windAvailability;

  const demand = electricityDemand(region, elapsedDays);
  const preliminary = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput, nuclear: nuclear.output }, demand.total);
  const gasPotential = gasPowerPotential(region, elapsedDays);
  const gasWanted = Math.max(0, demand.total - preliminary.usableGeneration) + preliminary.balancingShortfall;
  const gasOutput = Math.min(gasPotential.outputPotential, gasWanted);
  const gasConsumed = consumeGasForGeneration(region, gasOutput, gasPotential);
  const dispatch = dispatchElectricityPortfolio({ coal: coalOutput, hydro: hydroOutput, solar: solarOutput, wind: windOutput, peaking: gasOutput, nuclear: nuclear.output }, demand.total);
  const generated = dispatch.usableGeneration;

  const nuclearStations = effectiveInfrastructureCount(region, 'nuclear_power_station');
  const copperNeed = (grids * 18 + (coalStations + hydroStations) * 5 + solarStations * 3 + windStations * 4 + nuclearStations * 8) * years;
  const copperAvailable = Math.max(0, Number(region.stockpile.copper) || 0);
  const copperConsumed = Math.min(copperAvailable, copperNeed);
  if (copperNeed > 0) region.stockpile.copper = Math.max(0, copperAvailable - copperConsumed);
  const copperUpkeepRatio = copperNeed > 0 ? clamp01(copperConsumed / copperNeed) : 1;
  const networkReliability = 0.80 + copperUpkeepRatio * 0.20;

  const gridCapacity = grids * 6200 * years * networkReliability;
  syncDistributedGridStorage(region, grids);
  const directAvailable = Math.min(generated, gridCapacity);
  const storageDispatch = dispatchBatteryStorage(region, {
    surplus: Math.max(0, directAvailable - demand.total),
    shortfall: Math.max(0, demand.total - directAvailable),
    elapsedDays,
  });
  const delivered = Math.min(demand.total, directAvailable + storageDispatch.discharged);
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
  state.copperConsumed = copperConsumed;
  state.curtailed = dispatch.curtailed;
  state.coalCyclingLoss = dispatch.coalCyclingLoss;
  state.nuclearCyclingLoss = dispatch.nuclearCyclingLoss;
  state.reactorFuelConsumed = nuclear.reactorFuelConsumed || 0;
  state.spentFuelGenerated = nuclear.spentFuelGenerated || 0;
  state.balancingShortfall = dispatch.balancingShortfall;
  state.dispatchEfficiency = dispatch.dispatchEfficiency;
  state.demand = demand.total;
  state.householdDemand = demand.householdDemand;
  state.industrialDemand = demand.industrialDemand;
  state.lightMetalsDemand = demand.lightMetalsDemand || 0;
  state.strategicNuclearDemand = demand.strategicNuclearDemand || 0;
  state.modernEnergyDemand = demand.modernEnergyDemand || 0;
  state.fertiliserDemand = demand.fertiliserDemand || 0;
  state.controlledAgricultureDemand = demand.controlledAgricultureDemand || 0;
  state.waterPumpingDemand = demand.waterPumpingDemand || 0;
  state.gasConsumed = gasConsumed;
  state.storageCharge = storageDispatch.chargeInput;
  state.storageDischarge = storageDispatch.discharged;
  state.storageEnergy = region.batteryStorage?.storedEnergy || 0;
  state.storageCapacity = region.batteryStorage?.installedCapacity || 0;
  state.storageChemistry = storageDispatch.chemistry;
  return {
    ...state, coalOutput, hydroOutput, solarOutput, windOutput, gasOutput, nuclearOutput: nuclear.output || 0, nuclear, gridCapacity, networkReliability,
    copperNeed, balancingNeed: dispatch.balancingNeed, balancingAvailable: dispatch.balancingAvailable,
    balancingCoverage: dispatch.balancingCoverage, variableComplementarity: dispatch.variableComplementarity,
    grossGenerationPotential: dispatch.grossPotential, storageDispatch,
  };
}

export function electricityIndustrialMultiplier(region) {
  if (!region.unlockedTechIds?.has(INDUSTRIAL_ELECTRIFICATION_TECH_ID)) return 1;
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
