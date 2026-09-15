import { CORPORATE_INFRASTRUCTURE_TYPES } from '../economy/corporateInfrastructure.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const INFRASTRUCTURE_OWNERSHIP = Object.freeze({
  domestic_state: { label: 'Domestic state', colour: '#d7bc68' },
  domestic_private: { label: 'Domestic private', colour: '#7fbe86' },
  foreign_concession: { label: 'Foreign concession', colour: '#68a9d7' },
  foreign_owned: { label: 'Foreign-owned', colour: '#b980d7' },
});

export function infrastructureOwnershipClass(asset) {
  const foreign = Boolean(asset?.foreignOwner) || (asset?.ownerPolityId && asset?.hostPolityId && asset.ownerPolityId !== asset.hostPolityId);
  if (foreign && Number(asset?.concessionYearsRemaining ?? asset?.concessionYears ?? 0) > 0) return 'foreign_concession';
  if (foreign) return 'foreign_owned';
  if (asset?.ownerFirmId) return 'domestic_private';
  return 'domestic_state';
}

export function infrastructureConditionClass(asset) {
  if (asset?.status === 'construction') return 'construction';
  if (asset?.status === 'destroyed' || Number(asset?.condition) <= 0) return 'destroyed';
  if (asset?.status === 'crippled' || Number(asset?.condition) < 0.35) return 'crippled';
  if (asset?.status === 'damaged' || Number(asset?.condition) < 0.7) return 'damaged';
  return 'operational';
}

export function infrastructureDisplayName(asset) {
  if (asset?.type === 'railway') return 'Railway';
  return CORPORATE_INFRASTRUCTURE_TYPES[asset?.type]?.name || String(asset?.type || 'Infrastructure');
}

export function buildInfrastructureIndex(sim) {
  const byRegion = new Map();
  const add = (regionId, entry) => {
    if (!regionId) return;
    const rows = byRegion.get(regionId) || [];
    if (!rows.some((row) => row.asset === entry.asset)) rows.push(entry);
    byRegion.set(regionId, rows);
  };

  for (const region of sim?.regions || []) {
    for (const asset of region?.corporateInfrastructure?.assets || []) {
      add(region.id, { asset, region, kind: 'facility' });
    }
  }

  const regionsById = new Map((sim?.regions || []).map((region) => [region.id, region]));
  for (const polity of sim?.polities || []) {
    for (const asset of polity?.railways?.lines || []) {
      const fromRegion = regionsById.get(asset.fromRegionId);
      const toRegion = regionsById.get(asset.toRegionId);
      if (fromRegion) add(fromRegion.id, { asset, region: fromRegion, polity, kind: 'railway', otherRegion: toRegion || null });
      if (toRegion) add(toRegion.id, { asset, region: toRegion, polity, kind: 'railway', otherRegion: fromRegion || null });
    }
  }
  return byRegion;
}

export function infrastructureSummary(entries = []) {
  const summary = { total: 0, foreign: 0, construction: 0, degraded: 0, worstCondition: 1 };
  const seen = new Set();
  for (const entry of entries) {
    const asset = entry?.asset;
    if (!asset || seen.has(asset)) continue;
    seen.add(asset);
    summary.total += 1;
    const ownership = infrastructureOwnershipClass(asset);
    if (ownership === 'foreign_concession' || ownership === 'foreign_owned') summary.foreign += 1;
    const condition = infrastructureConditionClass(asset);
    if (condition === 'construction') summary.construction += 1;
    if (condition === 'damaged' || condition === 'crippled' || condition === 'destroyed') summary.degraded += 1;
    summary.worstCondition = Math.min(summary.worstCondition, clamp01(asset.condition ?? 1));
  }
  return summary;
}

function polityName(polities, id) {
  const polity = (polities || []).find((candidate) => candidate.id === id);
  return polity?.name || polity?.displayName || id || 'Unknown';
}

function firmName(sim, id) {
  if (!id) return null;
  for (const region of sim?.regions || []) {
    const firm = region?.corporateCapital?.firms?.find((candidate) => candidate.id === id);
    if (firm) return firm.name || firm.id;
  }
  return id;
}

export function infrastructureDetail(entry, sim) {
  const asset = entry?.asset || {};
  const ownershipClass = infrastructureOwnershipClass(asset);
  const conditionClass = infrastructureConditionClass(asset);
  const owner = firmName(sim, asset.ownerFirmId) || polityName(sim?.polities, asset.ownerPolityId);
  const operator = polityName(sim?.polities, asset.operatorPolityId);
  const financier = polityName(sim?.polities, asset.financedByPolityId);
  const builder = firmName(sim, asset.builderFirmId) || polityName(sim?.polities, asset.builtByPolityId || asset.supplierPolityId);
  const remaining = Number(asset.concessionYearsRemaining ?? asset.concessionYears ?? 0);
  return {
    id: asset.id,
    name: infrastructureDisplayName(asset),
    regionName: entry?.region?.name || 'Unknown region',
    ownershipClass,
    ownershipLabel: INFRASTRUCTURE_OWNERSHIP[ownershipClass].label,
    owner,
    operator,
    financier,
    builder,
    conditionClass,
    condition: clamp01(asset.condition ?? 1),
    effectiveCapacity: clamp01(asset.effectiveCapacity ?? asset.capacity ?? asset.baseCapacity ?? (asset.status === 'construction' ? asset.progress : 1)),
    progress: clamp01(asset.progress ?? (asset.status === 'construction' ? 0 : 1)),
    concessionYearsRemaining: remaining > 0 ? remaining : 0,
    maintenanceRatio: Number.isFinite(asset.lastMaintenanceRatio) ? clamp01(asset.lastMaintenanceRatio) : null,
    operatingRatio: Number.isFinite(asset.lastOperatingRatio) ? clamp01(asset.lastOperatingRatio) : null,
    recentDamage: asset.lastDamageReason || asset.damageCause || asset.lastDamageType || null,
    fromRegionId: asset.fromRegionId || null,
    toRegionId: asset.toRegionId || null,
  };
}
