import { withResourceFlowSuppressed } from './resourceFlow.js';

const finite = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

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

function activeProject(region) {
  return region?.construction?.projects?.find?.((project) => project?.status === 'active') || null;
}

function remainingRequirement(project, resourceId) {
  const required = finite(project?.materialsRequired?.[resourceId]);
  const used = finite(project?.materialsUsed?.[resourceId]);
  return Math.max(0, required - used);
}

function transferResource(donor, recipient, resourceId, amount) {
  const actual = Math.max(0, Math.min(finite(amount), finite(donor?.stockpile?.[resourceId])));
  if (!(actual > 0)) return 0;
  withResourceFlowSuppressed(() => {
    donor.stockpile[resourceId] = finite(donor.stockpile[resourceId]) - actual;
    recipient.stockpile[resourceId] = finite(recipient.stockpile[resourceId]) + actual;
  });
  return actual;
}

export function sourceModernConstructionSupplies(targetRegion, regions = [], options = {}) {
  const project = activeProject(targetRegion);
  if (!project || !isModernStateRegion(targetRegion)) return { supplied: {}, total: 0, projectId: project?.id ?? null };
  const key = countryKey(targetRegion);
  if (!key) return { supplied: {}, total: 0, projectId: project.id };

  const bufferFraction = Math.max(0.01, Math.min(0.25, Number(options.bufferFraction) || 0.05));
  const donorReserveFraction = Math.max(0, Math.min(0.5, Number(options.donorReserveFraction) || 0.10));
  const donors = regions
    .filter((region) => region && region !== targetRegion && countryKey(region) === key)
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

  const supplied = {};
  for (const resourceId of Object.keys(project.materialsRequired || {})) {
    const remaining = remainingRequirement(project, resourceId);
    if (!(remaining > 0)) continue;
    const totalRequired = finite(project.materialsRequired[resourceId]);
    const desiredLocalBuffer = Math.min(remaining, Math.max(1, totalRequired * bufferFraction));
    let deficit = Math.max(0, desiredLocalBuffer - finite(targetRegion.stockpile?.[resourceId]));
    if (!(deficit > 0)) continue;

    for (const donor of donors) {
      const donorStock = finite(donor.stockpile?.[resourceId]);
      const donorReserve = donorStock * donorReserveFraction;
      const available = Math.max(0, donorStock - donorReserve);
      if (!(available > 0)) continue;
      const moved = transferResource(donor, targetRegion, resourceId, Math.min(deficit, available));
      if (!(moved > 0)) continue;
      supplied[resourceId] = (supplied[resourceId] || 0) + moved;
      deficit -= moved;
      if (deficit <= 1e-9) break;
    }
  }

  const total = Object.values(supplied).reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    project.domesticSupply ||= { cumulative: {}, last: {} };
    project.domesticSupply.last = { ...supplied };
    for (const [resourceId, amount] of Object.entries(supplied)) {
      project.domesticSupply.cumulative[resourceId] = (project.domesticSupply.cumulative[resourceId] || 0) + amount;
    }
  }
  return { supplied, total, projectId: project.id };
}

export function sourceAllModernConstructionSupplies(regions = [], options = {}) {
  const results = [];
  for (const region of regions) {
    const result = sourceModernConstructionSupplies(region, regions, options);
    if (result.total > 0) results.push({ regionId: region.id, ...result });
  }
  return results;
}
