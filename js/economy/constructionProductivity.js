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

function mechanisationSignal(region) {
  const manufacture = clamp(region?.structuralTransformation?.capability?.manufacture || 0);
  const industrial = industrialCapability(region);
  const combustion = hasTech(region, 'internal_combustion_tractors') || hasTech(region, 'internal_combustion_engine');
  const steam = hasTech(region, 'stationary_steam_engine') || hasTech(region, 'high_pressure_steam');
  if (combustion) return clamp(0.45 + industrial * 0.35 + manufacture * 0.20);
  if (steam) return clamp(0.18 + industrial * 0.32);
  return clamp(industrial * 0.12);
}

function projectMechanisationWeight(typeId) {
  if (['road_network', 'railway_station', 'harbour', 'advanced_shipyard', 'naval_base', 'strategic_naval_base', 'dry_dock', 'container_port',
    'reservoir_dam', 'irrigation', 'irrigation_canal', 'canal', 'urban_drainage', 'aqueduct', 'coal_power_station', 'hydroelectric_station',
    'nuclear_power_station', 'petroleum_refinery', 'factory'].includes(typeId)) return 1;
  if (['public_granary', 'storage_pits', 'workshop', 'smithy', 'telephone_exchange', 'telegraph_network', 'local_electric_grid'].includes(typeId)) return 0.62;
  return 0.45;
}

/**
 * Effective work delivered by one real construction worker-week.
 *
 * Bronze/Iron Age projects remain close to 1x. Modern productivity emerges from
 * powered tools/electric service, mechanised earthmoving/lifting proxies,
 * industrial engineering capability and road logistics. It deliberately uses
 * existing simulation state rather than granting a year-based magic bonus.
 */
export function constructionProductivity(region, typeId = null) {
  const electricityService = clamp(region?.electricity?.industrialService ?? region?.electricity?.service ?? 0);
  const electricTools = hasTech(region, 'industrial_electrification') ? electricityService * 0.72 : 0;
  const mechanisation = mechanisationSignal(region) * projectMechanisationWeight(typeId) * 1.18;
  const engineering = industrialCapability(region) * 0.82;
  const logistics = operationalAsset(region, 'road_network') ? 0.22 : 0;
  const modernCommunications = operationalAsset(region, 'telephone_exchange') ? 0.08 : operationalAsset(region, 'telegraph_network') ? 0.035 : 0;
  const poweredIndustry = hasTech(region, 'industrial_electrification') && electricityService > 0.4 ? 0.18 : 0;
  return Math.max(0.5, Math.min(4.5, 1 + electricTools + mechanisation + engineering + logistics + modernCommunications + poweredIndustry));
}

export function constructionProductivityBreakdown(region, typeId = null) {
  const total = constructionProductivity(region, typeId);
  const electricityService = clamp(region?.electricity?.industrialService ?? region?.electricity?.service ?? 0);
  return {
    total,
    electricityService,
    industrialCapability: industrialCapability(region),
    mechanisation: mechanisationSignal(region),
    roadLogistics: operationalAsset(region, 'road_network'),
    communications: operationalAsset(region, 'telephone_exchange') ? 'telephone' : operationalAsset(region, 'telegraph_network') ? 'telegraph' : 'none',
  };
}
