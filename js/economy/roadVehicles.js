const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

const LITHIUM_CELL_GOOD = 'lithium_ion_cells';
const CELLS_PER_EV = 0.62;
const STEEL_PER_ICE = 0.22;
const STEEL_PER_EV = 0.18;
const COPPER_PER_ICE = 0.012;
const COPPER_PER_EV = 0.045;
const ELECTRONICS_PER_EV = 0.018;
const PETROL_PER_ICE_YEAR = 0.42;
const ELECTRICITY_PER_EV_YEAR = 1.05;
const ANNUAL_RETIREMENT = 0.075;

function manufacturingCapability(region) {
  const industrial = region.industrialSupply?.capability || {};
  return clamp(
    (industrial.precision_machining || 0) * 0.38 +
    (region.structuralTransformation?.capability?.manufacture || 0) * 0.37 +
    (region.electricity?.industrialService || 0) * 0.25
  );
}

function motorisationTarget(region) {
  const population = nonNegative(region.population);
  const manufacturing = manufacturingCapability(region);
  const prosperity = clamp(region.popularWellbeing?.prosperity ?? region.employmentAndHardship?.prosperity ?? 0.45);
  if (manufacturing < 0.16 || population < 1000) return 0;
  // Fleet units are deliberately abstract rather than individual cars. A mature,
  // prosperous industrial society approaches roughly one unit per 6-8 people.
  const vehiclesPerPerson = clamp(0.015 + manufacturing * 0.075 + prosperity * 0.055, 0, 0.16);
  return population * vehiclesPerPerson;
}

function evCapability(region) {
  if (!hasTech(region, 'lithium_ion_batteries') || !hasTech(region, 'industrial_electrification')) return 0;
  const manufacturing = manufacturingCapability(region);
  const grid = clamp(region.electricity?.householdService || 0);
  const cells = nonNegative(region.stockpile?.[LITHIUM_CELL_GOOD]);
  const cellSignal = clamp(cells / Math.max(1, nonNegative(region.population) * 0.00002));
  return clamp(manufacturing * 0.45 + grid * 0.35 + cellSignal * 0.20);
}

export function ensureRoadVehicles(region) {
  region.roadVehicles ||= {};
  const s = region.roadVehicles;
  for (const [key, value] of Object.entries({
    ice: 0, electric: 0, targetFleet: 0, evShare: 0, operationalEvShare: 0,
    lastIceBuilt: 0, lastEvBuilt: 0, lastRetired: 0, petrolDemand: 0,
    petrolUsed: 0, electricityLoad: 0, chargingService: 0, transportService: 0,
    batteryCellsConsumed: 0,
  })) if (!Number.isFinite(s[key])) s[key] = value;
  return s;
}

function take(stockpile, key, requested) {
  const available = nonNegative(stockpile[key]);
  const amount = Math.min(available, nonNegative(requested));
  stockpile[key] = available - amount;
  return amount;
}

function buildIce(region, requested) {
  const s = ensureRoadVehicles(region), stock = region.stockpile ||= {};
  const capability = manufacturingCapability(region);
  if (capability < 0.16 || requested <= 0) return 0;
  const bySteel = nonNegative(stock.steel) / STEEL_PER_ICE;
  const byCopper = nonNegative(stock.copper) / COPPER_PER_ICE;
  const built = Math.min(requested, bySteel, byCopper);
  if (built <= 0) return 0;
  take(stock, 'steel', built * STEEL_PER_ICE);
  take(stock, 'copper', built * COPPER_PER_ICE);
  s.ice += built;
  return built;
}

function buildEv(region, requested) {
  const s = ensureRoadVehicles(region), stock = region.stockpile ||= {};
  const capability = evCapability(region);
  if (capability < 0.24 || requested <= 0) return 0;
  const byCells = nonNegative(stock[LITHIUM_CELL_GOOD]) / CELLS_PER_EV;
  const bySteel = nonNegative(stock.steel) / STEEL_PER_EV;
  const byCopper = nonNegative(stock.copper) / COPPER_PER_EV;
  const byElectronics = nonNegative(stock.electronic_components) / ELECTRONICS_PER_EV;
  const built = Math.min(requested, byCells, bySteel, byCopper, byElectronics);
  if (built <= 0) return 0;
  const cells = take(stock, LITHIUM_CELL_GOOD, built * CELLS_PER_EV);
  take(stock, 'steel', built * STEEL_PER_EV);
  take(stock, 'copper', built * COPPER_PER_EV);
  take(stock, 'electronic_components', built * ELECTRONICS_PER_EV);
  s.electric += built;
  s.batteryCellsConsumed += cells;
  return built;
}

export function roadVehicleElectricityDemand(region) {
  return nonNegative(region.roadVehicles?.electricityLoad);
}

export function tickRoadVehicles(region, elapsedDays = 7) {
  const s = ensureRoadVehicles(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  region.stockpile ||= {};
  if (years <= 0) return s;

  const fleetBefore = s.ice + s.electric;
  const retirementFraction = 1 - Math.pow(1 - ANNUAL_RETIREMENT, years);
  const retiredIce = s.ice * retirementFraction;
  const retiredEv = s.electric * retirementFraction;
  s.ice = Math.max(0, s.ice - retiredIce);
  s.electric = Math.max(0, s.electric - retiredEv);
  s.lastRetired = retiredIce + retiredEv;

  s.targetFleet = motorisationTarget(region);
  const shortfall = Math.max(0, s.targetFleet - s.ice - s.electric);
  const annualBuildLimit = Math.max(0, s.targetFleet * (0.035 + manufacturingCapability(region) * 0.085));
  const buildTarget = Math.min(shortfall, annualBuildLimit * years);

  const evCap = evCapability(region);
  const desiredEvShare = evCap > 0 ? clamp((evCap - 0.18) / 0.72, 0, 0.96) : 0;
  const evNeeded = Math.max(0, (s.ice + s.electric + buildTarget) * desiredEvShare - s.electric);
  s.batteryCellsConsumed = 0;
  s.lastEvBuilt = buildEv(region, Math.min(buildTarget, evNeeded));
  s.lastIceBuilt = buildIce(region, Math.max(0, buildTarget - s.lastEvBuilt));

  const grid = clamp(region.electricity?.householdService || 0);
  // Home/work charging becomes highly usable with a decent grid, but a weak grid
  // makes part of the BEV fleet unavailable rather than silently creating power.
  s.chargingService = clamp((grid - 0.10) / 0.75);
  const operationalEv = s.electric * s.chargingService;
  const operatingIce = s.ice;
  s.electricityLoad = operationalEv * ELECTRICITY_PER_EV_YEAR * years;
  s.petrolDemand = operatingIce * PETROL_PER_ICE_YEAR * years;
  s.petrolUsed = take(region.stockpile, 'petrol', s.petrolDemand);
  const iceService = s.petrolDemand > 0 ? clamp(s.petrolUsed / s.petrolDemand) : 1;
  const totalFleet = s.ice + s.electric;
  s.evShare = totalFleet > 0 ? clamp(s.electric / totalFleet) : 0;
  s.operationalEvShare = totalFleet > 0 ? clamp(operationalEv / totalFleet) : 0;
  s.transportService = totalFleet > 0 ? clamp((operatingIce * iceService + operationalEv) / totalFleet) : (fleetBefore > 0 ? 0 : 1);

  region.report ||= {};
  region.report.roadVehicles = {
    workers: 0, ice: s.ice, electric: s.electric, evShare: s.evShare,
    operationalEvShare: s.operationalEvShare, chargingService: s.chargingService,
    petrolDemand: s.petrolDemand, petrolUsed: s.petrolUsed, electricityLoad: s.electricityLoad,
    lastIceBuilt: s.lastIceBuilt, lastEvBuilt: s.lastEvBuilt,
    batteryCellsConsumed: s.batteryCellsConsumed, transportService: s.transportService,
  };
  return s;
}

export function roadVehicleSummary(region) {
  const s = ensureRoadVehicles(region);
  return { ...s };
}
