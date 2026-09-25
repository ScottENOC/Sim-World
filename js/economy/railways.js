import { ensureIndustrialSupply, chooseInfrastructureSupplier, applyForeignSupplierExposure, applyDomesticSupplierExperience, ensureProcurementPolicy } from './industrialSupply.js?v=20260915-industrial2';
import { createInfrastructureAsset } from './infrastructureInvestment.js';
import { infrastructureCapacity } from '../military/infrastructureDamage.js';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const RAIL_ELECTRIFICATION = Object.freeze({
  NONE: 'none',
  THIRD_RAIL_750V_DC: 'third_rail_750v_dc',
  OVERHEAD_25KV_AC: 'overhead_25kv_ac',
});

export const RAIL_TRACTION = Object.freeze({
  STEAM: 'steam',
  DIESEL: 'diesel',
  ELECTRIC: 'electric',
});

export const RAILWAY_REQUIREMENTS_PER_100KM = Object.freeze({
  steel: 260,
  machine_components: 12,
  rail_stock: 18,
  steam_locomotive: 3,
});

export function ensureRailwayState(polity) {
  polity.railways ||= { nextLineId: 1, lines: [] };
  if (!Array.isArray(polity.railways.lines)) polity.railways.lines = [];
  if (!Number.isFinite(polity.railways.nextLineId)) polity.railways.nextLineId = 1;
  return polity.railways;
}

function ensureRegionRailConnections(region) {
  region.railConnections ||= {};
  return region.railConnections;
}

function normaliseRollingStock(rollingStock = null) {
  const raw = rollingStock && typeof rollingStock === 'object'
    ? {
        steam: nonNegative(rollingStock.steam),
        diesel: nonNegative(rollingStock.diesel),
        electric: nonNegative(rollingStock.electric),
        highSpeedElectric: nonNegative(rollingStock.highSpeedElectric),
      }
    : { steam: 1, diesel: 0, electric: 0, highSpeedElectric: 0 };
  const total = raw.steam + raw.diesel + raw.electric + raw.highSpeedElectric;
  if (total <= 0) return { steam: 1, diesel: 0, electric: 0, highSpeedElectric: 0 };
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value / total]));
}

export function ensureRailwayLineProfile(line) {
  if (!line || typeof line !== 'object') return line;
  line.electrification ||= RAIL_ELECTRIFICATION.NONE;
  if (!Object.values(RAIL_ELECTRIFICATION).includes(line.electrification)) line.electrification = RAIL_ELECTRIFICATION.NONE;
  line.maxSpeedKph = Math.max(25, Number(line.maxSpeedKph) || 80);
  line.highSpeedCapable = Boolean(line.highSpeedCapable || line.maxSpeedKph >= 200);
  line.rollingStock = normaliseRollingStock(line.rollingStock);
  line.coalRequiredPerYear = nonNegative(line.coalRequiredPerYear || (Number(line.lengthKm) || 0) * 0.18);
  line.dieselRequiredPerYear = nonNegative(line.dieselRequiredPerYear || (Number(line.lengthKm) || 0) * 0.075);
  line.electricityRequiredPerYear = nonNegative(line.electricityRequiredPerYear || (Number(line.lengthKm) || 0) * 0.11);
  line.passengerCapacity = nonNegative(line.passengerCapacity);
  line.freightCapacity = nonNegative(line.freightCapacity);
  line.energy ||= { coalUsed: 0, dieselUsed: 0, electricityDemand: 0, electricitySatisfaction: 1 };
  return line;
}

export function railwaySupportsTraction(line, traction) {
  ensureRailwayLineProfile(line);
  if (traction === RAIL_TRACTION.STEAM || traction === RAIL_TRACTION.DIESEL) return true;
  if (traction === RAIL_TRACTION.ELECTRIC) return line.electrification !== RAIL_ELECTRIFICATION.NONE;
  return false;
}

function aggregateEndpointEntry(existing, perLine) {
  const lines = { ...(existing?.lines || {}) };
  lines[perLine.lineId] = perLine;
  const usable = Object.values(lines).filter((entry) => !['construction', 'destroyed'].includes(entry.status) && nonNegative(entry.effectiveCapacity) > 0.01);
  const effectiveCapacity = usable.reduce((sum, entry) => sum + nonNegative(entry.effectiveCapacity), 0);
  const passengerCapacity = usable.reduce((sum, entry) => sum + nonNegative(entry.passengerCapacity), 0);
  const freightCapacity = usable.reduce((sum, entry) => sum + nonNegative(entry.freightCapacity), 0);
  const fastest = usable.reduce((best, entry) => nonNegative(entry.maxSpeedKph) > nonNegative(best?.maxSpeedKph) ? entry : best, usable[0] || perLine);
  const electrification = [...new Set(usable.map((entry) => entry.electrification).filter(Boolean))];
  return {
    lineId: fastest?.lineId || perLine.lineId,
    lineIds: Object.keys(lines),
    lines,
    status: usable.length ? 'operational' : perLine.status,
    effectiveCapacity,
    passengerCapacity,
    freightCapacity,
    lengthKm: Math.min(...Object.values(lines).map((entry) => Math.max(1, Number(entry.lengthKm) || 1))),
    maxSpeedKph: Math.max(...Object.values(lines).map((entry) => Math.max(25, Number(entry.maxSpeedKph) || 80))),
    highSpeedCapable: Object.values(lines).some((entry) => entry.highSpeedCapable),
    electrification,
    operatorPolityId: fastest?.operatorPolityId || perLine.operatorPolityId || null,
  };
}

export function syncRailwayConnectionEntry(regionA, regionB, entry) {
  if (!regionA || !regionB || !entry?.lineId) return null;
  const aConnections = ensureRegionRailConnections(regionA);
  const bConnections = ensureRegionRailConnections(regionB);
  const aggregateA = aggregateEndpointEntry(aConnections[regionB.id], entry);
  const aggregateB = aggregateEndpointEntry(bConnections[regionA.id], entry);
  aConnections[regionB.id] = aggregateA;
  bConnections[regionA.id] = aggregateB;
  return aggregateA;
}

function syncLineEndpoints(line, hostRegions = []) {
  ensureRailwayLineProfile(line);
  const byId = new Map(hostRegions.map((r) => [r.id, r]));
  const a = byId.get(line.fromRegionId);
  const b = byId.get(line.toRegionId);
  if (!a || !b) return;
  const effective = Math.max(0, Number(line.effectiveCapacity ?? (line.capacity || 0) * infrastructureCapacity(line)) || 0);
  const usable = !['construction', 'destroyed'].includes(line.status) && effective > 0.01;
  const entry = {
    lineId: line.id,
    status: line.status,
    effectiveCapacity: usable ? effective : 0,
    passengerCapacity: usable ? nonNegative(line.passengerCapacity) : 0,
    freightCapacity: usable ? nonNegative(line.freightCapacity) : 0,
    lengthKm: Math.max(1, Number(line.lengthKm) || 1),
    maxSpeedKph: line.maxSpeedKph,
    highSpeedCapable: line.highSpeedCapable,
    electrification: line.electrification,
    rollingStock: { ...line.rollingStock },
    operatorPolityId: line.operatorPolityId || line.hostPolityId || null,
  };
  syncRailwayConnectionEntry(a, b, entry);
}

export function railwayConnection(regionA, regionB) {
  const entry = regionA?.railConnections?.[regionB?.id];
  if (!entry || ['construction', 'destroyed'].includes(entry.status) || Math.max(0, entry.effectiveCapacity || 0) <= 0.01) return null;
  return entry;
}

export function planRailway({
  polity,
  fromRegion,
  toRegion,
  lengthKm,
  domesticRegions = [],
  foreignOffers = [],
  concessionYears = 0,
  electrification = RAIL_ELECTRIFICATION.NONE,
  maxSpeedKph = 80,
  rollingStock = null,
}) {
  const km = Math.max(1, Number(lengthKm) || 1);
  const scale = km / 100;
  const requirements = Object.fromEntries(Object.entries(RAILWAY_REQUIREMENTS_PER_100KM).map(([k, v]) => [k, v * scale]));
  const supplier = chooseInfrastructureSupplier({ polity, domesticRegions, foreignOffers, requirements, strategic: true });
  if (!supplier || supplier.capability <= .02) return { feasible: false, reason: 'no_capable_supplier', requirements };
  const state = ensureRailwayState(polity);
  const foreign = !!supplier.foreign;
  const concession = foreign ? Math.max(0, concessionYears || supplier.concessionYears || 0) : 0;
  const procurementPolicy = ensureProcurementPolicy(polity).infrastructure;
  const line = {
    ...createInfrastructureAsset({ id: `${polity.id || 'polity'}:rail:${state.nextLineId++}`, type: 'railway', regionId: fromRegion.id, hostPolityId: polity.id, ownerPolityId: foreign ? (supplier.polityId || polity.id) : polity.id, operatorPolityId: foreign ? (supplier.polityId || polity.id) : polity.id, foreignOwner: foreign, strategic: true, value: km, condition: 1, concessionYears: concession }),
    fromRegionId: fromRegion.id,
    toRegionId: toRegion.id,
    lengthKm: km,
    status: 'construction',
    progress: 0,
    requirements,
    supplierRegionId: supplier.region.id,
    supplierPolityId: supplier.polityId || null,
    foreignSupplier: foreign,
    procurementPolicy,
    supplierCapabilityAtAward: supplier.capability,
    concessionYears: concession,
    hostOwnershipShare: foreign && concession ? 0 : 1,
    coalRequiredPerYear: km * .18,
    dieselRequiredPerYear: km * .075,
    electricityRequiredPerYear: km * .11,
    steelMaintenancePerYear: km * .045,
    capacity: 0,
    utilisation: 0,
    electrification,
    maxSpeedKph,
    rollingStock,
  };
  ensureRailwayLineProfile(line);
  state.lines.push(line);
  if (foreign) {
    applyForeignSupplierExposure(fromRegion, supplier.region, .6);
    applyForeignSupplierExposure(toRegion, supplier.region, .6);
  } else {
    applyDomesticSupplierExperience(fromRegion, supplier.region, .5);
    applyDomesticSupplierExperience(toRegion, supplier.region, .5);
  }
  return { feasible: true, line, supplier };
}

export function tickRailwayConstruction(line, hostRegions, supplierRegion, elapsedDays = 7) {
  ensureRailwayLineProfile(line);
  if (line.status !== 'construction') {
    syncLineEndpoints(line, hostRegions);
    return line;
  }
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const s = ensureIndustrialSupply(supplierRegion);
  const cap = clamp((s.capability.railway_engineering || 0) * .45 + (s.capability.steelmaking || 0) * .2 + (s.capability.locomotive_engineering || 0) * .2 + (s.capability.precision_machining || 0) * .15);
  const constructionYears = Math.max(2, 11 - cap * 8);
  line.progress = clamp(line.progress + years / constructionYears);
  if (line.foreignSupplier) for (const r of hostRegions) applyForeignSupplierExposure(r, supplierRegion, years * 2);
  else for (const r of hostRegions) applyDomesticSupplierExperience(r, supplierRegion, years * 1.2);
  if (line.progress >= 1) {
    line.status = 'operational';
    line.capacity = Math.max(.2, cap);
  }
  syncLineEndpoints(line, hostRegions);
  return line;
}

function consumeAcrossRegions(hostRegions, resourceId, amount) {
  let remaining = Math.max(0, amount);
  let used = 0;
  for (const region of hostRegions) {
    region.stockpile ||= {};
    const available = nonNegative(region.stockpile[resourceId]);
    const take = Math.min(available, remaining);
    region.stockpile[resourceId] = Math.max(0, available - take);
    used += take;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }
  return { used, satisfaction: amount > 0 ? clamp(used / amount) : 1 };
}

function electricService(hostRegions) {
  if (!hostRegions.length) return 0;
  return clamp(hostRegions.reduce((sum, region) => sum + clamp(region.electricity?.industrialService || region.electricity?.service || 0), 0) / hostRegions.length);
}

function tractionProfile(line, hostRegions, years, utilisation) {
  ensureRailwayLineProfile(line);
  const stock = normaliseRollingStock(line.rollingStock);
  const steamNeed = line.coalRequiredPerYear * years * utilisation * stock.steam;
  const dieselNeed = line.dieselRequiredPerYear * years * utilisation * stock.diesel;
  const electricShare = railwaySupportsTraction(line, RAIL_TRACTION.ELECTRIC) ? stock.electric + stock.highSpeedElectric : 0;
  const electricNeed = line.electricityRequiredPerYear * years * utilisation * electricShare;
  const steam = consumeAcrossRegions(hostRegions, 'coal', steamNeed);
  const diesel = consumeAcrossRegions(hostRegions, 'diesel', dieselNeed);
  const electricitySatisfaction = electricNeed > 0 ? electricService(hostRegions) : 1;
  const eligibleShare = stock.steam + stock.diesel + electricShare;
  const tractionSatisfaction = eligibleShare > 0
    ? clamp((stock.steam * steam.satisfaction + stock.diesel * diesel.satisfaction + electricShare * electricitySatisfaction) / eligibleShare)
    : 0;
  line.energy = {
    coalUsed: steam.used,
    dieselUsed: diesel.used,
    electricityDemand: electricNeed,
    electricitySatisfaction,
  };
  return { stock, electricShare, tractionSatisfaction };
}

export function tickRailwayOperations(line, hostRegions, elapsedDays = 7) {
  ensureRailwayLineProfile(line);
  if (line.status !== 'operational' && line.status !== 'damaged' && line.status !== 'crippled') {
    syncLineEndpoints(line, hostRegions);
    return line;
  }
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const utilisation = Math.max(.15, line.utilisation || .5);
  const traction = tractionProfile(line, hostRegions, years, utilisation);
  const steelNeeded = line.steelMaintenancePerYear * years * (.6 + utilisation * .8);
  const steel = hostRegions.reduce((s, r) => s + Math.max(0, r.industrialSupply?.inventory?.steel || 0), 0);
  const maint = clamp(steel / Math.max(.001, steelNeeded));
  line.condition = clamp(line.condition + years * (maint * .025 - (1 - maint) * .16));
  const physicalCapacity = line.capacity * traction.tractionSatisfaction * infrastructureCapacity(line);
  line.effectiveCapacity = physicalCapacity;
  const speedFactor = clamp(line.maxSpeedKph / 160, .35, 1.9);
  const highSpeedStock = railwaySupportsTraction(line, RAIL_TRACTION.ELECTRIC) ? traction.stock.highSpeedElectric : 0;
  line.passengerCapacity = physicalCapacity * (.65 + speedFactor * .35) * (1 + highSpeedStock * .35);
  line.freightCapacity = physicalCapacity * (.8 + (traction.stock.diesel + traction.stock.steam) * .2);
  line.concessionYearsRemaining = Math.max(0, (line.concessionYearsRemaining || 0) - years);
  if (line.foreignSupplier && line.concessionYears > 0 && line.concessionYearsRemaining <= 0) {
    line.hostOwnershipShare = 1;
    line.ownerPolityId = line.hostPolityId;
    line.operatorPolityId = line.hostPolityId;
    line.foreignOwner = false;
  }
  syncLineEndpoints(line, hostRegions);
  return line;
}

export function railwayTransportMultiplier(polity, fromRegionId, toRegionId) {
  const lines = ensureRailwayState(polity).lines.filter((line) => line.status !== 'destroyed' && line.status !== 'construction' && ((line.fromRegionId === fromRegionId && line.toRegionId === toRegionId) || (line.fromRegionId === toRegionId && line.toRegionId === fromRegionId)));
  if (!lines.length) return 1;
  const best = lines.reduce((value, line) => {
    ensureRailwayLineProfile(line);
    const capacity = nonNegative(line.effectiveCapacity ?? line.capacity * infrastructureCapacity(line));
    const speedFactor = clamp(line.maxSpeedKph / 120, .5, 2);
    return Math.max(value, capacity * speedFactor);
  }, 0);
  return 1 + best * 2.4;
}
