// Pure presentation helpers for the zoomed-in map. Nothing here changes the
// simulation: the economy remains authoritative and this module only turns
// existing state into stable visual cues.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function constructionAssets(region) {
  const assets = Array.isArray(region.construction?.assets) ? region.construction.assets : [];
  if (assets.length) return assets;
  const completed = region.construction?.completed || {};
  return Object.entries(completed).flatMap(([typeId, count]) =>
    Array.from({ length: Math.max(0, Math.round(Number(count) || 0)) }, (_, i) => ({
      id: `visual-${typeId}-${i}`, typeId, condition: 1, scale: 1,
    })));
}

export function visualAssetCount(region, typeId, minCondition = 0.15) {
  return constructionAssets(region).filter((asset) =>
    asset.typeId === typeId && (asset.condition ?? 1) >= minCondition).length;
}

function occupations(region) {
  return region.occupations || {};
}

function occ(region, ...keys) {
  const o = occupations(region);
  return keys.reduce((sum, key) => sum + Math.max(0, Number(o[key]) || 0), 0);
}

export function deriveRegionVisualProfile(region) {
  const population = Math.max(0, Number(region.population) || 0);
  const working = Math.max(1, Number(region.demographics?.workingAge) || population * 0.55 || 1);

  const agricultural = occ(region, 'farmer', 'gatherer', 'shoreFisher', 'boatFisher', 'horseBreeder');
  const extractive = occ(region, 'miner', 'lumberjack');
  const craft = occ(region, 'smith', 'potter', 'textileWorker', 'boatmaker', 'pitchMaker');
  const commercial = occ(region, 'trader');
  const maritime = occ(region, 'sailor', 'boatFisher');
  const military = Math.max(0, Number(region.army?.personnel) || 0) + Math.max(0, Number(region.navy?.personnel) || 0);

  const agricultureShare = clamp01(agricultural / working);
  const extractiveShare = clamp01(extractive / working);
  const craftShare = clamp01(craft / working);
  const commercialShare = clamp01(commercial / working);
  const maritimeShare = clamp01(maritime / working);
  const nonAgriculturalShare = clamp01((extractive + craft + commercial + maritime + military * 0.35) / working);

  const market = visualAssetCount(region, 'market_customs');
  const admin = visualAssetCount(region, 'administrative_centre');
  const walls = visualAssetCount(region, 'settlement_walls');
  const harbour = visualAssetCount(region, 'harbour');
  const road = visualAssetCount(region, 'road_network');
  const granary = visualAssetCount(region, 'public_granary');
  const wells = visualAssetCount(region, 'wells_cisterns');
  const irrigation = visualAssetCount(region, 'irrigation');
  const canal = visualAssetCount(region, 'canal');
  // Aqueducts are planned gameplay infrastructure. Recognising the id here is
  // harmless before they exist and means the visual capacity model will react
  // immediately once construction starts creating aqueduct assets.
  const aqueduct = visualAssetCount(region, 'aqueduct');

  const institutionalPull = clamp01(
    market * 0.12 + admin * 0.15 + walls * 0.08 + harbour * 0.12 +
    granary * 0.05 + road * 0.04
  );
  const urbanDemand = clamp01(
    0.025 + nonAgriculturalShare * 0.72 + craftShare * 0.16 + commercialShare * 0.28 +
    institutionalPull + Math.log10(Math.max(10, population)) * 0.012
  );

  // This is intentionally presentation-only for now. Gameplay can later own
  // the same idea: dense settlement needs reliable water, and aqueducts can
  // loosen a cap rather than simply hand out a generic production bonus.
  const waterCapacity = clamp01(
    0.30 + wells * 0.10 + irrigation * 0.08 + canal * 0.10 + aqueduct * 0.32 +
    (region.isCoastal ? 0.025 : 0)
  );
  const urbanFraction = Math.min(urbanDemand, waterCapacity);

  const forestFraction = region.forest?.K > 0
    ? clamp01(region.forest.currentStock / region.forest.K)
    : 0;

  const productiveDeposits = Object.entries(region.deposits || {})
    .filter(([key]) => key !== 'clay')
    .filter(([, deposit]) => Array.isArray(deposit?.tiers) && deposit.tiers.some((tier) => (tier.remainingStock || 0) > 0));

  const monumentAssets = constructionAssets(region).filter((asset) =>
    ['monumental_tomb', 'great_temple', 'ceremonial_complex', 'monumental_statue'].includes(asset.typeId));

  let settlementPattern = 'mixed';
  if (agricultureShare > 0.62 && urbanFraction < 0.32) settlementPattern = 'dispersed-rural';
  else if (extractiveShare > 0.20 && extractiveShare > agricultureShare * 0.65) settlementPattern = 'extractive';
  else if ((commercialShare + craftShare) > 0.20 || urbanFraction > 0.48) settlementPattern = 'urban-commercial';
  else if (maritimeShare > 0.12 && region.isCoastal) settlementPattern = 'maritime';

  const irrigationFocus = clamp01(irrigation * 0.45 + canal * 0.75 + agricultureShare * 0.22);

  return {
    population,
    working,
    agricultureShare,
    extractiveShare,
    craftShare,
    commercialShare,
    maritimeShare,
    nonAgriculturalShare,
    urbanDemand,
    waterCapacity,
    urbanFraction,
    forestFraction,
    productiveDeposits,
    monumentAssets,
    settlementPattern,
    irrigationFocus,
    infrastructure: { market, admin, walls, harbour, road, granary, wells, irrigation, canal, aqueduct },
  };
}

export function stableRandom(seedText) {
  let state = 2166136261;
  for (const char of String(seedText)) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function representativeCount(actual, { min = 0, max = 24, scale = 1 } = {}) {
  if (!(actual > 0)) return 0;
  return Math.max(min, Math.min(max, Math.round(Math.sqrt(actual) * scale)));
}
