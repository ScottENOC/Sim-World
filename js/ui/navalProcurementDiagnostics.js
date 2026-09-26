import { NAVAL_BUILD_INPUTS, navalBuildInputs } from '../economy/modernDomesticNavalSupply.js?v=20260927-naval-logistics1';

// Read-only diagnostics for the naval construction loop. The logistics module
// owns the shared per-hull input table used for modern domestic staging; the
// actual shipbuilding loop remains authoritative about consumption/progress.
export const WARSHIP_BUILD_COST_DIAGNOSTIC = NAVAL_BUILD_INPUTS;

function countryKey(region) {
  return region?.scenarioCountryId ||
    region?.governance?.scenarioCountryId ||
    region?.governance?.sovereignPolityId ||
    region?.polityId ||
    region?.controllingActorId ||
    region?.id ||
    null;
}

export function shipbuildingInputAvailable(region, key) {
  if (key === 'metal') return ['bronze', 'iron', 'steel'].reduce((sum, metal) => sum + Math.max(0, Number(region?.stockpile?.[metal]) || 0), 0);
  if (key === 'machine') return Math.max(0, Number(region?.industrialSupply?.inventory?.machine_components) || 0);
  return Math.max(0, Number(region?.stockpile?.[key]) || 0);
}

export function effectiveWarshipBuildCost(region, designId) {
  const cost = navalBuildInputs(region, designId);
  return Object.keys(cost).length ? cost : null;
}

function polityInputAvailable(world, region, key) {
  const owner = countryKey(region);
  return (world?.regions || [])
    .filter((candidate) => countryKey(candidate) === owner)
    .reduce((sum, candidate) => sum + shipbuildingInputAvailable(candidate, key), 0);
}

export function navalProcurementDiagnostic(world, region, designId) {
  const procurement = region?.navalProcurement || {};
  const target = Math.max(0, Math.round(Number(procurement.targets?.[designId]) || 0));
  const built = Math.max(0, Number(procurement.built?.[designId]) || 0);
  const outstanding = Math.max(0, target - built);
  const cost = effectiveWarshipBuildCost(region, designId);
  const materials = Object.entries(cost || {}).map(([key, required]) => {
    const local = shipbuildingInputAvailable(region, key);
    const polity = polityInputAvailable(world, region, key);
    const elsewhere = Math.max(0, polity - local);
    return {
      key,
      required,
      local,
      polity,
      elsewhere,
      localHullEquivalents: required > 0 ? local / required : Infinity,
      domesticHullEquivalents: required > 0 ? polity / required : Infinity,
      localMissing: required > 0 && local <= 1e-9,
      nationallyBlocked: required > 0 && polity <= 1e-9,
      domesticSourcingAvailable: required > 0 && local <= 1e-9 && elsewhere > 1e-9,
    };
  });
  const shipwrightWorkers = Math.max(0, Number(region?.report?.boatmaking?.workers) || 0);
  const nationalShortages = materials.filter((item) => item.nationallyBlocked);
  const currentHullProgress = outstanding > 0 ? Math.max(0, built - Math.floor(built)) : 0;
  const latestTransfers = (procurement.domesticSupply?.lastTransfers || []).map((entry) => ({ ...entry }));
  let blocker = null;
  if (!cost) blocker = 'No construction profile exists for this ship class.';
  else if (nationalShortages.length) blocker = `No ${nationalShortages.map((item) => item.key.replaceAll('_', ' ')).join(', ')} exists elsewhere in the country to source.`;
  else if (outstanding > 0 && shipwrightWorkers <= 0) blocker = 'No shipwright labour was assigned last tick.';
  return {
    designId,
    target,
    built,
    outstanding,
    currentHullProgress,
    shipwrightWorkers,
    materials,
    blocker,
    localOnly: false,
    latestTransfers,
    domesticSupplyLast: { ...(procurement.domesticSupply?.last || {}) },
  };
}
