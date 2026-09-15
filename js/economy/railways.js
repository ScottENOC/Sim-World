import { ensureIndustrialSupply, chooseInfrastructureSupplier, applyForeignSupplierExposure } from './industrialSupply.js?v=20260915-industrial1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const RAILWAY_REQUIREMENTS_PER_100KM = Object.freeze({ steel: 260, machine_components: 12, rail_stock: 18, steam_locomotive: 3 });

export function ensureRailwayState(polity) {
  polity.railways ||= { nextLineId: 1, lines: [] };
  if (!Array.isArray(polity.railways.lines)) polity.railways.lines = [];
  if (!Number.isFinite(polity.railways.nextLineId)) polity.railways.nextLineId = 1;
  return polity.railways;
}

export function planRailway({ polity, fromRegion, toRegion, lengthKm, domesticRegions = [], foreignOffers = [], concessionYears = 0 }) {
  const km = Math.max(1, Number(lengthKm) || 1);
  const scale = km / 100;
  const requirements = Object.fromEntries(Object.entries(RAILWAY_REQUIREMENTS_PER_100KM).map(([k, v]) => [k, v * scale]));
  const supplier = chooseInfrastructureSupplier({ polity, domesticRegions, foreignOffers, requirements });
  if (!supplier || supplier.capability <= 0.02) return { feasible: false, reason: 'no_capable_supplier', requirements };
  const state = ensureRailwayState(polity);
  const line = {
    id: `${polity.id || 'polity'}:rail:${state.nextLineId++}`,
    fromRegionId: fromRegion.id,
    toRegionId: toRegion.id,
    lengthKm: km,
    status: 'construction',
    progress: 0,
    condition: 1,
    requirements,
    supplierRegionId: supplier.region.id,
    supplierPolityId: supplier.polityId || null,
    foreignSupplier: !!supplier.foreign,
    concessionYears: supplier.foreign ? Math.max(0, concessionYears || supplier.concessionYears || 0) : 0,
    concessionYearsRemaining: supplier.foreign ? Math.max(0, concessionYears || supplier.concessionYears || 0) : 0,
    hostOwnershipShare: supplier.foreign && (concessionYears || supplier.concessionYears) ? 0 : 1,
    coalRequiredPerYear: km * 0.18,
    steelMaintenancePerYear: km * 0.045,
    capacity: 0,
    utilisation: 0,
  };
  state.lines.push(line);
  if (supplier.foreign) {
    applyForeignSupplierExposure(fromRegion, supplier.region, 0.6);
    applyForeignSupplierExposure(toRegion, supplier.region, 0.6);
  }
  return { feasible: true, line, supplier };
}

export function tickRailwayConstruction(line, hostRegions, supplierRegion, elapsedDays = 7) {
  if (line.status !== 'construction') return line;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const supplier = ensureIndustrialSupply(supplierRegion);
  const capability = clamp((supplier.capability.railway_engineering || 0) * 0.45 + (supplier.capability.steelmaking || 0) * 0.2 + (supplier.capability.locomotive_engineering || 0) * 0.2 + (supplier.capability.precision_machining || 0) * 0.15);
  const constructionYears = Math.max(2, 11 - capability * 8);
  line.progress = clamp(line.progress + years / constructionYears);
  if (line.foreignSupplier) for (const region of hostRegions) applyForeignSupplierExposure(region, supplierRegion, years * 2);
  if (line.progress >= 1) {
    line.status = 'operational';
    line.capacity = Math.max(0.2, capability);
  }
  return line;
}

export function tickRailwayOperations(line, hostRegions, elapsedDays = 7) {
  if (line.status !== 'operational') return line;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const coalNeeded = line.coalRequiredPerYear * years * Math.max(0.15, line.utilisation || 0.5);
  const steelNeeded = line.steelMaintenancePerYear * years * (0.6 + Math.max(0.15, line.utilisation || 0.5) * 0.8);
  let coal = hostRegions.reduce((sum, r) => sum + Math.max(0, r.stockpile?.coal || 0), 0);
  let steel = hostRegions.reduce((sum, r) => sum + Math.max(0, r.industrialSupply?.inventory?.steel || 0), 0);
  const fuelRatio = clamp(coal / Math.max(0.001, coalNeeded));
  const maintenanceRatio = clamp(steel / Math.max(0.001, steelNeeded));
  line.condition = clamp(line.condition + years * (maintenanceRatio * 0.025 - (1 - maintenanceRatio) * 0.16));
  line.effectiveCapacity = line.capacity * fuelRatio * (0.25 + line.condition * 0.75);
  line.concessionYearsRemaining = Math.max(0, (line.concessionYearsRemaining || 0) - years);
  if (line.foreignSupplier && line.concessionYears > 0 && line.concessionYearsRemaining <= 0) line.hostOwnershipShare = 1;
  return line;
}

export function railwayTransportMultiplier(polity, fromRegionId, toRegionId) {
  const line = ensureRailwayState(polity).lines.find(l => l.status === 'operational' && ((l.fromRegionId === fromRegionId && l.toRegionId === toRegionId) || (l.fromRegionId === toRegionId && l.toRegionId === fromRegionId)));
  if (!line) return 1;
  return 1 + Math.max(0, line.effectiveCapacity ?? line.capacity ?? 0) * 2.4;
}
