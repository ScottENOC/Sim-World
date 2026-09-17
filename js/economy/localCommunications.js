import { effectiveInfrastructureCount } from './construction.js?v=20260918-telephone1';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const TELEPHONE_TECH_ID = 'telephone_networks';

export function ensureLocalCommunications(region) {
  region.localCommunications ||= {
    telephoneCoverage: 0,
    industrialCoordination: 0,
    administrativeCoordination: 0,
    militaryCoordination: 0,
  };
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

export function tickLocalCommunications(region, elapsedDays = 7) {
  const state = ensureLocalCommunications(region);
  const target = telephonePotentialCoverage(region);
  const smoothing = clamp01(Math.max(0, Number(elapsedDays) || 0) / 56);
  state.telephoneCoverage += (target - state.telephoneCoverage) * smoothing;
  const coverage = clamp01(state.telephoneCoverage);
  const adminBase = clamp01((region.stateAdministration?.officialdom || 0) * 0.45 + (region.stateAdministration?.records || 0) * 0.35 + (region.communicationState?.writingAvailable ? 0.2 : 0));
  state.industrialCoordination = coverage;
  state.administrativeCoordination = coverage * (0.35 + adminBase * 0.65);
  state.militaryCoordination = coverage * clamp01(0.3 + (region.army?.personnel || 0) / Math.max(1, (region.population || 1) * 0.02) * 0.7);
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
