import { withResourceFlowSuppressed } from './resourceFlow.js';
import { ensureNavalProcurement, navalConstructionProfile } from '../military/fleets.js?v=20260919-naval-light-metals1';

const finite = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

// Keep this aligned with the authoritative shipbuilding costs in laborCore.js.
// This module never constructs ships; it only stages a small domestic logistics
// buffer so the existing shipbuilding loop can consume the real inputs.
export const NAVAL_BUILD_INPUTS = Object.freeze({
  basic_war_boat: { wood: 200 },
  galley: { wood: 300, pitch: 20, textiles: 15, metal: 5 },
  ocean_sailing_warship: { wood: 420, pitch: 28, textiles: 30, metal: 8 },
  gunpowder_sailing_warship: { wood: 520, pitch: 32, textiles: 38, metal: 14, gunpowder: 2 },
  frigate: { wood: 700, pitch: 42, textiles: 52, metal: 25, gunpowder: 5 },
  ship_of_line: { wood: 1100, pitch: 65, textiles: 80, metal: 45, gunpowder: 10 },
  paddle_steam_warship: { wood: 650, iron: 45, coal: 25, machine: 10 },
  steam_frigate: { wood: 600, iron: 70, coal: 35, machine: 16 },
  ironclad: { wood: 350, iron: 150, coal: 45, machine: 24 },
  steel_warship: { wood: 180, steel: 220, coal: 55, machine: 34 },
  fleet_tug: { steel: 90, coal: 24, machine: 26 },
  destroyer: { steel: 150, coal: 42, machine: 46, gunpowder: 4 },
  submarine: { steel: 120, machine: 62, petrol: 30 },
  dreadnought: { steel: 700, coal: 120, machine: 105, gunpowder: 20 },
});

function countryKey(region) {
  return region?.scenarioCountryId ||
    region?.governance?.scenarioCountryId ||
    region?.governance?.sovereignPolityId ||
    region?.polityId ||
    region?.controllingActorId ||
    null;
}

function isModernStateRegion(region) {
  return Boolean(region?.scenarioModernBaselineApplied || region?.scenarioAutomobileBaselineApplied);
}

function inputStock(region, resourceId) {
  if (resourceId === 'machine') return finite(region?.industrialSupply?.inventory?.machine_components);
  if (resourceId === 'metal') {
    return finite(region?.stockpile?.bronze) + finite(region?.stockpile?.iron) + finite(region?.stockpile?.steel);
  }
  return finite(region?.stockpile?.[resourceId]);
}

function ensureInventory(region) {
  region.industrialSupply ||= {};
  region.industrialSupply.inventory ||= {};
  region.stockpile ||= {};
}

function transferInput(donor, recipient, resourceId, amount) {
  let remaining = finite(amount);
  if (!(remaining > 0)) return 0;
  ensureInventory(donor);
  ensureInventory(recipient);
  let moved = 0;
  withResourceFlowSuppressed(() => {
    if (resourceId === 'machine') {
      const actual = Math.min(remaining, finite(donor.industrialSupply.inventory.machine_components));
      donor.industrialSupply.inventory.machine_components = finite(donor.industrialSupply.inventory.machine_components) - actual;
      recipient.industrialSupply.inventory.machine_components = finite(recipient.industrialSupply.inventory.machine_components) + actual;
      moved += actual;
      return;
    }
    if (resourceId === 'metal') {
      for (const key of ['steel', 'iron', 'bronze']) {
        if (remaining <= 1e-9) break;
        const actual = Math.min(remaining, finite(donor.stockpile[key]));
        donor.stockpile[key] = finite(donor.stockpile[key]) - actual;
        recipient.stockpile[key] = finite(recipient.stockpile[key]) + actual;
        remaining -= actual;
        moved += actual;
      }
      return;
    }
    const actual = Math.min(remaining, finite(donor.stockpile[resourceId]));
    donor.stockpile[resourceId] = finite(donor.stockpile[resourceId]) - actual;
    recipient.stockpile[resourceId] = finite(recipient.stockpile[resourceId]) + actual;
    moved += actual;
  });
  return moved;
}

export function navalBuildInputs(region, designId) {
  const base = NAVAL_BUILD_INPUTS[designId];
  if (!base) return {};
  const cost = { ...base };
  const profile = navalConstructionProfile(region, designId);
  if (cost.steel != null) cost.steel *= profile?.steelMultiplier ?? 1;
  for (const [key, amount] of Object.entries(profile?.systemInputs || {})) {
    cost[key] = (cost[key] || 0) + finite(amount);
  }
  return cost;
}

function outstandingClasses(region) {
  const procurement = ensureNavalProcurement(region);
  return Object.entries(procurement.targets || {})
    .map(([designId, target]) => ({
      designId,
      target: finite(target),
      built: finite(procurement.built?.[designId]),
      gap: Math.max(0, finite(target) - finite(procurement.built?.[designId])),
    }))
    .filter((entry) => entry.gap > 1e-9 && NAVAL_BUILD_INPUTS[entry.designId]);
}

function domesticAvailability(targetRegion, donors, resourceId) {
  return inputStock(targetRegion, resourceId) + donors.reduce((sum, donor) => sum + inputStock(donor, resourceId), 0);
}

export function sourceModernNavalSupplies(targetRegion, regions = [], options = {}) {
  const procurement = ensureNavalProcurement(targetRegion);
  const classes = outstandingClasses(targetRegion);
  if (!classes.length || !isModernStateRegion(targetRegion)) {
    procurement.logistics = { lastTransfers: [], supplied: {}, diagnostics: [], total: 0 };
    return procurement.logistics;
  }
  const key = countryKey(targetRegion);
  if (!key) return { lastTransfers: [], supplied: {}, diagnostics: [], total: 0 };

  const bufferFraction = Math.max(0.01, Math.min(0.25, Number(options.bufferFraction) || 0.05));
  const donorReserveFraction = Math.max(0, Math.min(0.5, Number(options.donorReserveFraction) || 0.10));
  const donors = regions
    .filter((region) => region && region !== targetRegion && countryKey(region) === key)
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

  const desiredByInput = {};
  for (const entry of classes) {
    const costs = navalBuildInputs(targetRegion, entry.designId);
    const hullsToBuffer = Math.min(2, Math.max(1, entry.gap));
    for (const [resourceId, amount] of Object.entries(costs)) {
      desiredByInput[resourceId] = (desiredByInput[resourceId] || 0) + finite(amount) * bufferFraction * hullsToBuffer;
    }
  }

  const supplied = {};
  const lastTransfers = [];
  for (const [resourceId, desiredBuffer] of Object.entries(desiredByInput)) {
    let deficit = Math.max(0, desiredBuffer - inputStock(targetRegion, resourceId));
    if (!(deficit > 0)) continue;
    for (const donor of donors) {
      const donorStock = inputStock(donor, resourceId);
      const available = Math.max(0, donorStock * (1 - donorReserveFraction));
      if (!(available > 0)) continue;
      const moved = transferInput(donor, targetRegion, resourceId, Math.min(deficit, available));
      if (!(moved > 0)) continue;
      supplied[resourceId] = (supplied[resourceId] || 0) + moved;
      lastTransfers.push({ donorRegionId: donor.id, donorRegionName: donor.name, resourceId, amount: moved });
      deficit -= moved;
      if (deficit <= 1e-9) break;
    }
  }

  const diagnostics = classes.map((entry) => {
    const costs = navalBuildInputs(targetRegion, entry.designId);
    const inputs = Object.entries(costs).map(([resourceId, perHull]) => ({
      resourceId,
      perHull: finite(perHull),
      local: inputStock(targetRegion, resourceId),
      domestic: domesticAvailability(targetRegion, donors, resourceId),
    }));
    return { ...entry, inputs };
  });

  const total = Object.values(supplied).reduce((sum, value) => sum + value, 0);
  procurement.domesticSupply ||= { cumulative: {} };
  procurement.domesticSupply.last = { ...supplied };
  procurement.domesticSupply.lastTransfers = lastTransfers;
  for (const [resourceId, amount] of Object.entries(supplied)) {
    procurement.domesticSupply.cumulative[resourceId] = (procurement.domesticSupply.cumulative[resourceId] || 0) + amount;
  }
  procurement.logistics = { lastTransfers, supplied, diagnostics, total };
  return procurement.logistics;
}

export function sourceAllModernNavalSupplies(regions = [], options = {}) {
  const results = [];
  for (const region of regions) {
    const result = sourceModernNavalSupplies(region, regions, options);
    if (result.total > 0 || result.diagnostics?.length) results.push({ regionId: region.id, ...result });
  }
  return results;
}
