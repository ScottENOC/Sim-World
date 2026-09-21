import { effectiveInfrastructureCount } from './construction.js?v=20260918-telephone1';
import { communicationsCableConnectivity, flushElectricityInterconnectors } from './electricityInterconnectors.js?v=20260921-grid-links1';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const TELEPHONE_TECH_ID = 'telephone_networks';

export function ensureLocalCommunications(region) {
  region.localCommunications ||= {
    telephoneCoverage: 0,
    industrialCoordination: 0,
    administrativeCoordination: 0,
    militaryCoordination: 0,
    orbitalCivilianLink: 0,
    orbitalMilitaryLink: 0,
    internationalCableLink: 0,
  };
  if (!Number.isFinite(region.localCommunications.internationalCableLink)) region.localCommunications.internationalCableLink = 0;
  return region.localCommunications;
}

function urbanSignal(region) {
  const urbanShare = clamp01(region.medievalSociety?.urban?.urbanisation ?? region.settlements?.urbanShare ?? 0);
  const population = Math.max(0, Number(region.population) || 0);
  return clamp01((Math.log10(Math.max(1000, population)) - 3) / 2.2) * (0.45 + urbanShare * 0.55);
}

export function telephonePotentialCoverage(region) {
  if (!region.unlockedTechIds?.has?.(TELEPHONE_TECH_ID)) return 0;
  const exchanges = effectiveInfrastructureCount(region, 'telephone_exchange');
  if (exchanges <= 0) return 0;
  const density = urbanSignal(region);
  // Early exchanges serve government, commerce and dense urban districts first.
  // Coverage grows sub-linearly: one exchange cannot wire an entire large region.
  return clamp01((1 - Math.exp(-exchanges * 0.72)) * (0.35 + density * 0.65));
}

function reconcileImportedElectricityService(region) {
  const electricity = region.electricity;
  if (!electricity || (Number(electricity.imports) || 0) <= 0) return;
  const demand = Math.max(0, Number(electricity.demand) || 0);
  if (demand <= 0) return;
  const overallService = clamp01((Number(electricity.delivered) || 0) / demand);
  electricity.service = overallService;
  if ((Number(electricity.householdDemand) || 0) > 0) {
    electricity.householdService = Math.max(clamp01(electricity.householdService || 0), overallService);
  }
  if ((Number(electricity.industrialDemand) || 0) > 0) {
    electricity.industrialService = Math.max(clamp01(electricity.industrialService || 0), overallService);
  }
}

export function tickLocalCommunications(region, elapsedDays = 7) {
  // main.js computes electricity for every region before it enters the communications
  // loop. The first communications call therefore acts as the safe world-level flush:
  // power can move through completed interconnectors before downstream systems read it.
  flushElectricityInterconnectors(elapsedDays);
  reconcileImportedElectricityService(region);
  const state = ensureLocalCommunications(region);
  const target = telephonePotentialCoverage(region);
  const smoothing = clamp01(Math.max(0, Number(elapsedDays) || 0) / 56);
  state.telephoneCoverage += (target - state.telephoneCoverage) * smoothing;
  const coverage = clamp01(state.telephoneCoverage);
  const orbitalCivilian = clamp01(region.orbitalSupport?.civilianCommunications || 0);
  const orbitalMilitary = clamp01(region.orbitalSupport?.militaryCommand || 0);
  const internationalCable = communicationsCableConnectivity(region);
  const adminBase = clamp01((region.stateAdministration?.officialdom || 0) * 0.45 + (region.stateAdministration?.records || 0) * 0.35 + (region.communicationState?.writingAvailable ? 0.2 : 0));
  state.orbitalCivilianLink = orbitalCivilian;
  state.orbitalMilitaryLink = orbitalMilitary;
  state.internationalCableLink = internationalCable;
  // Satellites and long-distance cables do not replace local wires. They add long-
  // distance coordination on top of a functioning local network, with diminishing returns.
  const longDistanceCivilian = clamp01(orbitalCivilian * 0.7 + internationalCable * 0.55);
  state.industrialCoordination = clamp01(coverage + longDistanceCivilian * 0.24 * (1 - coverage));
  state.administrativeCoordination = clamp01(coverage * (0.35 + adminBase * 0.65) + longDistanceCivilian * 0.30 * (1 - coverage));
  state.militaryCoordination = clamp01(coverage * clamp01(0.3 + (region.army?.personnel || 0) / Math.max(1, (region.population || 1) * 0.02) * 0.7) + clamp01(orbitalMilitary * 0.75 + internationalCable * 0.25) * 0.36 * (1 - coverage));
  return { ...state };
}

export function telephoneIndustrialMultiplier(region) {
  return 1 + clamp01(region.localCommunications?.industrialCoordination || 0) * 0.06;
}

export function telephoneAdministrativeMultiplier(region) {
  return 1 + clamp01(region.localCommunications?.administrativeCoordination || 0) * 0.10;
}

export function telephoneMilitaryCommandMultiplier(region) {
  return 1 + clamp01(region.localCommunications?.militaryCoordination || 0) * 0.08;
}

export function telephoneMobilisationMultiplier(region) {
  return 1 + clamp01(region.localCommunications?.militaryCoordination || 0) * 0.30;
}
