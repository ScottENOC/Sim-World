import { CORPORATE_INFRASTRUCTURE_TYPES } from './corporateInfrastructure.js';
import { nationaliseAsset } from './infrastructureInvestment.js';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(value) || 0));

function hasKnowledge(region, id) {
  for (const source of [region?.breakthroughs, region?.technologies, region?.tech?.breakthroughs, region?.tech?.known]) {
    if (source instanceof Set && source.has(id)) return true;
    if (Array.isArray(source) && source.includes(id)) return true;
    if (source && typeof source === 'object' && source[id]) return true;
  }
  const cap = region?.industrialSupply?.capability || {};
  if (id === 'steelmaking' && (cap.steelmaking || 0) > .35) return true;
  if (['factory_system','industrial_mining','modern_port_engineering','canal_engineering','industrial_waterworks'].includes(id) &&
      (cap.precision_machining || 0) > .45 && (cap.steelmaking || 0) > .35) return true;
  return false;
}

function ownerFirmFor(asset, regions) {
  if (!asset?.ownerFirmId) return null;
  for (const region of regions || []) {
    const firm = region.corporateCapital?.firms?.find((entry) => entry.id === asset.ownerFirmId);
    if (firm) return firm;
  }
  return null;
}

function recordOwnership(asset, entry) {
  asset.ownershipHistory ||= [];
  asset.ownershipHistory.push(entry);
  if (asset.ownershipHistory.length > 12) asset.ownershipHistory.splice(0, asset.ownershipHistory.length - 12);
}

function applyLocalManagement(asset, hostRegion, plannedHandover = false) {
  const def = CORPORATE_INFRASTRUCTURE_TYPES[asset.type];
  const capable = !def?.breakthrough || hasKnowledge(hostRegion, def.breakthrough);
  const floor = capable ? 1 : plannedHandover ? .8 : .55;
  asset.managementCapability = Math.max(Number(asset.managementCapability) || 0, floor);
  asset.managementCapability = clamp(asset.managementCapability);
  asset.managementDisruption = capable ? 0 : 1 - asset.managementCapability;
  return capable;
}

export function tickInfrastructureOwnership(asset, hostRegion, elapsedDays = 30) {
  if (!asset || !hostRegion) return asset;
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (asset.status === 'operational' && asset.foreignOwner && Number(asset.concessionYearsRemaining) > 0) {
    asset.concessionYearsRemaining = Math.max(0, asset.concessionYearsRemaining - years);
    if (asset.concessionYearsRemaining <= 0) {
      const previousOwnerPolityId = asset.ownerPolityId;
      const previousOwnerFirmId = asset.ownerFirmId || null;
      asset.ownerPolityId = asset.hostPolityId;
      asset.operatorPolityId = asset.hostPolityId;
      asset.foreignOwner = false;
      asset.ownerFirmId = null;
      asset.concessionYearsRemaining = 0;
      asset.concessionExpired = true;
      applyLocalManagement(asset, hostRegion, true);
      recordOwnership(asset, { type: 'concession_expiry', previousOwnerPolityId, previousOwnerFirmId });
    }
  }
  if (!asset.foreignOwner && asset.status === 'operational') {
    const def = CORPORATE_INFRASTRUCTURE_TYPES[asset.type];
    const capable = !def?.breakthrough || hasKnowledge(hostRegion, def.breakthrough);
    const recoveryPerYear = capable ? .18 : .035;
    asset.managementCapability = clamp((asset.managementCapability ?? 1) + recoveryPerYear * years);
    asset.managementDisruption = 1 - asset.managementCapability;
  }
  if (asset.status === 'operational' && Number.isFinite(asset.effectiveCapacity)) {
    asset.effectiveCapacity *= clamp(asset.managementCapability ?? 1);
  }
  return asset;
}

export function nationaliseCorporateInfrastructure({ asset, hostRegion, hostPolity, ownerPolity, payerRegion = hostRegion, regions = [], compensationShare = 0, currentTick = 0 }) {
  if (!asset || !hostRegion || !hostPolity || !asset.foreignOwner) return { nationalised: false, reason: 'not_foreign_owned' };
  const share = clamp(compensationShare);
  const compensationDue = Math.max(0, Number(asset.value) || 0) * share;
  const availableTreasury = Math.max(0, Number(payerRegion?.treasury) || 0);
  if (availableTreasury + 1e-9 < compensationDue) return { nationalised: false, reason: 'insufficient_treasury', compensationDue, availableTreasury };

  const previousOwnerFirmId = asset.ownerFirmId || null;
  const firm = ownerFirmFor(asset, regions);
  if (payerRegion) payerRegion.treasury = availableTreasury - compensationDue;
  const result = nationaliseAsset({ asset, hostPolity, ownerPolity, compensationShare: share });
  const uncompensated = Math.max(0, (Number(asset.value) || 0) - compensationDue);
  if (firm) {
    const scale = .0015;
    firm.capitalIndex = Math.max(.01, (firm.capitalIndex || 0) + compensationDue * scale - uncompensated * scale);
    if (Array.isArray(firm.infrastructureAssets)) firm.infrastructureAssets = firm.infrastructureAssets.filter((id) => id !== asset.id);
  }
  asset.previousOwnerFirmId = previousOwnerFirmId;
  asset.ownerFirmId = null;
  asset.nationalisedTick = currentTick;
  asset.nationalisationCompensationShare = share;
  applyLocalManagement(asset, hostRegion, false);
  recordOwnership(asset, { type: 'nationalisation', tick: currentTick, previousOwnerPolityId: result.previousOwner, previousOwnerFirmId, compensationShare: share, compensationDue, uncompensatedClaim: result.uncompensatedClaim || 0 });
  return { nationalised: true, ...result, compensationDue, managementCapability: asset.managementCapability };
}
