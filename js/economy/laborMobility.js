import { automobileOwnershipPer1000 } from './civilianTransport.js';
import { sourceAllModernConstructionSupplies } from './modernDomesticConstructionSupply.js?v=20260925-domestic-construction1';
import { sourceAllModernNavalSupplies } from './modernDomesticNavalSupply.js?v=20260927-naval-logistics1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const nonNegative = (value) => Math.max(0, Number(value) || 0);

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.scenarioCountryId || region?.controllingActorId || null;
}

function samePolity(a, b) {
  const aId = polityId(a);
  const bId = polityId(b);
  return Boolean(aId && bId && aId === bId);
}

function roadOperational(region) {
  return (region?.construction?.assets || []).some((asset) =>
    asset?.typeId === 'road_network' && nonNegative(asset.condition ?? 1) > 0.5);
}

function greatCircleKm(a, b) {
  const [lon1, lat1] = a?.centroid || [];
  const [lon2, lat2] = b?.centroid || [];
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const p1 = lat1 * rad;
  const p2 = lat2 * rad;
  const dp = (lat2 - lat1) * rad;
  const dl = (lon2 - lon1) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function lineElectricShare(connection) {
  const lines = Object.values(connection?.lines || {});
  if (!lines.length) {
    const electrified = Array.isArray(connection?.electrification)
      ? connection.electrification.some((value) => value && value !== 'none')
      : connection?.electrification && connection.electrification !== 'none';
    return electrified ? 1 : 0;
  }
  let capacity = 0;
  let electricCapacity = 0;
  for (const line of lines) {
    const lineCapacity = nonNegative(line.passengerCapacity || line.effectiveCapacity);
    const stock = line.rollingStock || {};
    const totalStock = nonNegative(stock.steam) + nonNegative(stock.diesel) + nonNegative(stock.electric) + nonNegative(stock.highSpeedElectric);
    const electricStock = totalStock > 0 ? (nonNegative(stock.electric) + nonNegative(stock.highSpeedElectric)) / totalStock : 0;
    capacity += lineCapacity;
    electricCapacity += lineCapacity * electricStock;
  }
  return capacity > 0 ? clamp(electricCapacity / capacity) : 0;
}

export function railCommuteProfile(fromRegion, toRegion) {
  const connection = fromRegion?.railConnections?.[toRegion?.id];
  if (!connection || connection.status === 'destroyed' || connection.status === 'construction') return null;
  const nominalPassengerCapacity = nonNegative(connection.passengerCapacity);
  const electricShare = lineElectricShare(connection);
  const endpointElectricService = clamp((
    clamp(fromRegion?.electricity?.industrialService ?? fromRegion?.electricity?.service ?? 0) +
    clamp(toRegion?.electricity?.industrialService ?? toRegion?.electricity?.service ?? 0)
  ) / 2);
  const tractionFactor = 1 - electricShare * (1 - endpointElectricService);
  const passengerCapacity = nominalPassengerCapacity * tractionFactor;
  const speedKph = Math.max(25, nonNegative(connection.maxSpeedKph) || 80);
  const distanceKm = Math.max(1, nonNegative(connection.lengthKm) || greatCircleKm(fromRegion, toRegion));
  if (passengerCapacity <= 0.01) return null;
  const travelMinutes = distanceKm / speedKph * 60 * 1.35 + 20;
  if (travelMinutes > 150) return null;
  const timeFactor = clamp((150 - travelMinutes) / 105, 0.08, 1);
  const workerShare = clamp(passengerCapacity * 0.055 * timeFactor, 0, 0.12);
  return {
    mode: 'rail', travelMinutes, workerShare, passengerCapacity, nominalPassengerCapacity,
    speedKph, electricShare, electricityService: endpointElectricService,
    highSpeedCapable: Boolean(connection.highSpeedCapable),
  };
}

export function automobileCommuteProfile(fromRegion, toRegion) {
  if (!fromRegion?.neighbors?.includes?.(toRegion?.id)) return null;
  if (!roadOperational(fromRegion) || !roadOperational(toRegion)) return null;
  const carsPer1000 = automobileOwnershipPer1000(fromRegion);
  if (carsPer1000 < 25) return null;
  const distanceKm = greatCircleKm(fromRegion, toRegion);
  if (!Number.isFinite(distanceKm) || distanceKm > 110) return null;
  const travelMinutes = distanceKm / 65 * 60 + 15;
  if (travelMinutes > 120) return null;
  const ownershipFactor = clamp(carsPer1000 / 600);
  const timeFactor = clamp((120 - travelMinutes) / 80, 0.08, 1);
  return {
    mode: 'automobile', travelMinutes,
    workerShare: clamp(0.07 * ownershipFactor * timeFactor, 0, 0.07),
    carsPer1000, distanceKm,
  };
}

export function bestCommuteProfile(fromRegion, toRegion) {
  if (!samePolity(fromRegion, toRegion)) return null;
  const candidates = [railCommuteProfile(fromRegion, toRegion), automobileCommuteProfile(fromRegion, toRegion)].filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.workerShare - a.workerShare) || (a.travelMinutes - b.travelMinutes))[0];
}

function militaryWorkers(region) {
  return nonNegative(region?.army?.personnel) + nonNegative(region?.navy?.personnel) + nonNegative(region?.emergencyMilitiaPersonnel);
}

function resetMobility(region) {
  region.laborMobility = {
    incomingConstructionWorkers: 0,
    outgoingConstructionWorkers: 0,
    incomingByMode: {},
    outgoingByMode: {},
    constructionSources: [],
  };
  const state = region.construction;
  if (state) {
    state.localWorkersReserved = nonNegative(state.workersReserved);
    state.importedWorkersReserved = 0;
  }
}

function connectedCandidateIds(region) {
  return new Set([
    ...Object.keys(region?.railConnections || {}),
    ...(Array.isArray(region?.neighbors) ? region.neighbors : []),
  ]);
}

/** Expand already-prepared local construction labour with real commuters. */
export function applyConstructionLaborMobility(regions = []) {
  // Modern state procurement uses the same domestic logistics pass for both
  // infrastructure and naval construction. These functions only stage a small
  // local buffer; the authoritative construction/shipbuilding loops still decide
  // what is actually consumed and how much progress is made.
  sourceAllModernConstructionSupplies(regions);
  sourceAllModernNavalSupplies(regions);

  const byId = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) resetMobility(region);

  for (const destination of regions) {
    const state = destination?.construction;
    const project = state?.projects?.find?.((item) => item.status === 'active');
    if (!project || !state) continue;
    let unmet = Math.max(0, nonNegative(project.targetWorkers) - nonNegative(state.localWorkersReserved));
    if (unmet < 1) continue;

    const candidates = [];
    // Only transport-connected regions can commute. This keeps runtime scaling
    // with the transport graph instead of scanning the whole world per project.
    for (const donorId of connectedCandidateIds(destination)) {
      const donor = byId.get(donorId);
      if (!donor || donor === destination || !samePolity(donor, destination)) continue;
      const profile = bestCommuteProfile(donor, destination);
      if (!profile) continue;
      const workingAge = nonNegative(donor.demographics?.workingAge);
      const donorState = donor.construction || {};
      const alreadyOutgoing = nonNegative(donor.laborMobility?.outgoingConstructionWorkers);
      const localConstruction = nonNegative(donorState.localWorkersReserved ?? donorState.workersReserved);
      const maintenance = nonNegative(donorState.maintenanceWorkersReserved);
      const grossAvailable = Math.max(0, workingAge - militaryWorkers(donor) - maintenance - localConstruction - alreadyOutgoing);
      const mobilityCap = Math.floor(workingAge * profile.workerShare);
      const policyCap = Math.floor(workingAge * 0.10);
      const available = Math.max(0, Math.min(grossAvailable, mobilityCap, policyCap - alreadyOutgoing));
      if (available > 0) candidates.push({ donor, profile, available });
    }

    candidates.sort((a, b) => a.profile.travelMinutes - b.profile.travelMinutes || b.available - a.available);
    for (const candidate of candidates) {
      if (unmet < 1) break;
      const workers = Math.min(unmet, candidate.available);
      if (workers <= 0) continue;
      const donorMobility = candidate.donor.laborMobility;
      donorMobility.outgoingConstructionWorkers += workers;
      donorMobility.outgoingByMode[candidate.profile.mode] = nonNegative(donorMobility.outgoingByMode[candidate.profile.mode]) + workers;
      destination.laborMobility.incomingConstructionWorkers += workers;
      destination.laborMobility.incomingByMode[candidate.profile.mode] = nonNegative(destination.laborMobility.incomingByMode[candidate.profile.mode]) + workers;
      destination.laborMobility.constructionSources.push({
        regionId: candidate.donor.id,
        regionName: candidate.donor.name,
        workers,
        mode: candidate.profile.mode,
        travelMinutes: candidate.profile.travelMinutes,
      });
      state.importedWorkersReserved += workers;
      unmet -= workers;
    }
    state.workersReserved = nonNegative(state.localWorkersReserved) + nonNegative(state.importedWorkersReserved);
  }

  return regions;
}
