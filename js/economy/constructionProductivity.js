import { constructionEquipmentFactor, constructionEquipmentBottlenecks } from './constructionEquipment.js?v=20260925-construction-equipment1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const nonNegative = (value) => Math.max(0, Number(value) || 0);

function hasTech(region, id) {
  return Boolean(region?.unlockedTechIds?.has?.(id));
}

function operationalAsset(region, typeId) {
  return (region?.construction?.assets || []).some((asset) =>
    asset?.typeId === typeId && nonNegative(asset?.condition ?? 1) > 0.5);
}

function industrialCapability(region) {
  const supply = region?.industrialSupply?.capability || {};
  const manufacture = clamp(region?.structuralTransformation?.capability?.manufacture || 0);
  const precision = clamp(supply.precision_machining || 0);
  const railway = clamp(supply.railway_engineering || 0);
  return clamp(manufacture * 0.42 + precision * 0.38 + railway * 0.20);
}

function baseConstructionProductivity(region) {
  const electricityService = clamp(region?.electricity?.industrialService ?? region?.electricity?.service ?? 0);
  const industrial = industrialCapability(region);
  const electricTools = hasTech(region, 'industrial_electrification') ? electricityService * 1.8 : 0;
  const engineering = industrial * 1.75;
  const logistics = operationalAsset(region, 'road_network') ? 0.55 : 0;
  const modernCommunications = operationalAsset(region, 'telephone_exchange') ? 0.22 : operationalAsset(region, 'telegraph_network') ? 0.08 : 0;
  const poweredIndustry = hasTech(region, 'industrial_electrification') && electricityService > 0.4 ? 0.65 : 0;
  const steamOrganisation = (hasTech(region, 'stationary_steam_engine') || hasTech(region, 'high_pressure_steam')) ? 0.35 : 0;
  return Math.max(0.7, Math.min(7, 1 + electricTools + engineering + logistics + modernCommunications + poweredIndustry + steamOrganisation));
}

/**
 * Effective work delivered by one real construction worker-week.
 *
 * Human organisation, power tools and engineering raise the base productivity.
 * Actual plant then changes specific task throughput: earthmoving, haulage,
 * heavy lift, concrete placement and tunnelling. The harmonic task model means
 * a crane/TBM shortage remains a bottleneck instead of being averaged away by
 * plentiful general labour.
 */
export function constructionProductivity(region, typeId = null, workers = 100) {
  const base = baseConstructionProductivity(region);
  const equipment = constructionEquipmentFactor(region, typeId, workers);
  return Math.max(0.5, Math.min(24, base * equipment.factor));
}

export function constructionProductivityBreakdown(region, typeId = null, workers = 100) {
  const base = baseConstructionProductivity(region);
  const equipment = constructionEquipmentFactor(region, typeId, workers);
  const total = Math.max(0.5, Math.min(24, base * equipment.factor));
  const electricityService = clamp(region?.electricity?.industrialService ?? region?.electricity?.service ?? 0);
  return {
    total,
    base,
    equipmentFactor: equipment.factor,
    equipmentTasks: equipment.tasks,
    bottlenecks: constructionEquipmentBottlenecks(region, typeId, workers),
    electricityService,
    industrialCapability: industrialCapability(region),
    roadLogistics: operationalAsset(region, 'road_network'),
    communications: operationalAsset(region, 'telephone_exchange') ? 'telephone' : operationalAsset(region, 'telegraph_network') ? 'telegraph' : 'none',
  };
}
