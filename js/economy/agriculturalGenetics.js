const DAYS_PER_YEAR = 365.2425;
const PLANT_FOODS = Object.freeze(['staple_grains', 'pulses', 'fruit_vegetables']);
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function activeAssets(region, typeId) {
  return (region?.construction?.assets || []).filter((asset) => asset?.typeId === typeId && (asset.condition ?? 1) > 0.2).length;
}

function tradeContactIds(region) {
  const ids = new Set(region?.neighbors || []);
  for (const id of region?.tradePartnerIds || []) ids.add(id);
  if (region?.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  else if (region?.recentTradePartners instanceof Set) for (const id of region.recentTradePartners) ids.add(id);
  return ids;
}

function initialDiversity(region, category) {
  const latitude = Math.abs(Number(region?.centroid?.[1]) || 0);
  const terrainVariety = clamp((region?.terrain?.plains || 0) * 0.25 + (region?.terrain?.hills || 0) * 0.22 +
    (region?.terrain?.forest || 0) * 0.12 + (region?.terrain?.wetland || 0) * 0.12);
  const latitudeBonus = category === 'fruit_vegetables' ? clamp(1 - latitude / 70) * 0.10 : clamp(latitude / 75) * 0.04;
  return clamp(0.56 + terrainVariety + latitudeBonus, 0.48, 0.88);
}

export function ensureAgriculturalGenetics(region) {
  region.agriculturalGenetics ||= {};
  const s = region.agriculturalGenetics;
  s.liveDiversity ||= {};
  s.preservedDiversity ||= {};
  s.seedReserve ||= {};
  s.geneticErosion ||= {};
  s.reintroduction ||= {};
  for (const category of PLANT_FOODS) {
    if (!Number.isFinite(s.liveDiversity[category])) s.liveDiversity[category] = initialDiversity(region, category);
    if (!Number.isFinite(s.preservedDiversity[category])) s.preservedDiversity[category] = s.liveDiversity[category] * 0.55;
    if (!Number.isFinite(s.seedReserve[category])) s.seedReserve[category] = 0.45;
    if (!Number.isFinite(s.geneticErosion[category])) s.geneticErosion[category] = 0;
    if (!Number.isFinite(s.reintroduction[category])) s.reintroduction[category] = 0;
  }
  if (!Number.isFinite(s.collectionEffort)) s.collectionEffort = 0.18;
  if (!Number.isFinite(s.distributionEffort)) s.distributionEffort = 0.15;
  if (!Number.isFinite(s.seedBankCapability)) s.seedBankCapability = 0;
  if (!Number.isFinite(s.aggregateDiversity)) s.aggregateDiversity = 0.65;
  if (!Number.isFinite(s.aggregateReserve)) s.aggregateReserve = 0.45;
  return s;
}

export function setSeedBankPolicy(region, patch = {}) {
  const s = ensureAgriculturalGenetics(region);
  if (patch.collectionEffort !== undefined) s.collectionEffort = clamp(patch.collectionEffort);
  if (patch.distributionEffort !== undefined) s.distributionEffort = clamp(patch.distributionEffort);
  return { collectionEffort: s.collectionEffort, distributionEffort: s.distributionEffort };
}

export function seedBankCapability(region) {
  const s = ensureAgriculturalGenetics(region);
  const granaries = activeAssets(region, 'public_granary');
  const coldStores = activeAssets(region, 'cold_storage') + activeAssets(region, 'refrigerated_storage');
  const electricity = clamp(region?.electricity?.householdService ?? region?.electricity?.industrialService ?? 0);
  const education = clamp(region?.education?.literacyRate ?? region?.massEducation?.literacyRate ?? 0);
  // Farmers have always retained seed. Purpose-built communal storage improves
  // that baseline, while cold/refrigerated storage and modern record keeping
  // make long-duration ex-situ preservation much more reliable.
  s.seedBankCapability = clamp(0.12 + Math.min(0.30, granaries * 0.12) + Math.min(0.24, coldStores * 0.18) + electricity * 0.16 + education * 0.12);
  return s.seedBankCapability;
}

function climateStress(region) {
  const weather = Math.abs(Number(region?.weather?.index) || 0);
  const heat = Math.max(0, Number(region?.climate?.temperatureAnomalyC) || 0);
  const rainfall = Number(region?.climate?.rainfallMultiplier ?? 1);
  const evaporation = Number(region?.climate?.evaporationMultiplier ?? 1);
  return clamp(weather / 2.4 * 0.55 + Math.max(0, 1 - rainfall) * 0.35 + Math.max(0, evaporation - 1) * 0.22 + heat * 0.05);
}

function monoculturePressure(region, category) {
  const mix = region?.foodDiversity?.productionMix || {};
  const share = clamp(mix[category] || 0);
  const general = clamp(region?.agriculturalPests?.monocultureRisk || 0);
  return clamp(general * 0.55 + Math.max(0, share - 0.34) * 1.25);
}

function networkDiversity(region, category, byId) {
  if (!byId) return 0;
  let best = 0;
  for (const id of tradeContactIds(region)) {
    const source = byId.get(id);
    if (!source) continue;
    best = Math.max(best, ensureAgriculturalGenetics(source).liveDiversity[category] || 0);
  }
  return best;
}

export function tickAgriculturalGenetics(regions, elapsedDays = 7) {
  const list = Array.isArray(regions) ? regions : [regions];
  const byId = new Map(list.filter(Boolean).map((region) => [region.id, region]));
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;

  for (const region of list) {
    if (!region) continue;
    const s = ensureAgriculturalGenetics(region);
    const bank = seedBankCapability(region);
    const stress = climateStress(region);
    const cultivated = clamp(region?.agriculturalLand?.cultivationShare || 0);

    for (const category of PLANT_FOODS) {
      const pestLoss = clamp(region?.agriculturalPests?.extraYieldLoss?.[category] || 0, 0, 0.55);
      const mono = monoculturePressure(region, category);
      const live = s.liveDiversity[category];
      const preserved = s.preservedDiversity[category];
      const reserve = s.seedReserve[category];

      const erosionRate = (0.010 + mono * 0.055 + stress * 0.030 + pestLoss * 0.045) * (0.35 + cultivated * 0.65);
      const preservationShield = clamp(bank * (0.35 + s.collectionEffort * 0.65));
      const liveLoss = live * erosionRate * (1 - preservationShield * 0.42) * years;

      const collectionTarget = Math.max(preserved, live * (0.62 + bank * 0.34));
      const collection = Math.max(0, collectionTarget - preserved) * clamp(years * (0.18 + bank * 0.95) * s.collectionEffort);
      const preservationDecay = preserved * (0.020 * (1 - bank * 0.88)) * years;
      s.preservedDiversity[category] = clamp(preserved + collection - preservationDecay);

      const external = networkDiversity(region, category, byId);
      const recoverable = Math.max(s.preservedDiversity[category], external * 0.82);
      const recoveryGap = Math.max(0, recoverable - Math.max(0, live - liveLoss));
      const reintro = recoveryGap * clamp(years * (0.06 + bank * 0.42) * (0.30 + s.distributionEffort * 0.70));
      s.liveDiversity[category] = clamp(live - liveLoss + reintro, 0.08, 1);
      s.reintroduction[category] = reintro;
      s.geneticErosion[category] = clamp(1 - s.liveDiversity[category]);

      const seedProduction = clamp(0.10 + cultivated * 0.30 + s.liveDiversity[category] * 0.22);
      const shockUse = clamp(stress * 0.20 + pestLoss * 0.35) * years;
      const reserveRecovery = (1 - reserve) * seedProduction * years * (0.35 + bank * 0.65);
      s.seedReserve[category] = clamp(reserve + reserveRecovery - shockUse * (1 - bank * 0.55));
    }

    s.aggregateDiversity = PLANT_FOODS.reduce((sum, id) => sum + s.liveDiversity[id], 0) / PLANT_FOODS.length;
    s.aggregateReserve = PLANT_FOODS.reduce((sum, id) => sum + s.seedReserve[id], 0) / PLANT_FOODS.length;
    region.report ||= {};
    region.report.agriculturalGenetics = {
      workers: 0,
      liveDiversity: { ...s.liveDiversity },
      preservedDiversity: { ...s.preservedDiversity },
      seedReserve: { ...s.seedReserve },
      geneticErosion: { ...s.geneticErosion },
      reintroduction: { ...s.reintroduction },
      seedBankCapability: s.seedBankCapability,
      collectionEffort: s.collectionEffort,
      distributionEffort: s.distributionEffort,
      aggregateDiversity: s.aggregateDiversity,
      aggregateReserve: s.aggregateReserve,
    };
  }
}

export function geneticPestProtection(region, category) {
  const s = ensureAgriculturalGenetics(region);
  const diversity = clamp(s.liveDiversity[category] || 0);
  const reserve = clamp(s.seedReserve[category] || 0);
  const bank = seedBankCapability(region);
  return clamp(diversity * 0.24 + reserve * bank * 0.10, 0, 0.32);
}

export function geneticClimateMultiplier(region, category) {
  if (!PLANT_FOODS.includes(category)) return 1;
  const s = ensureAgriculturalGenetics(region);
  const stress = climateStress(region);
  if (stress <= 0.08) return 1;
  const diversity = clamp(s.liveDiversity[category] || 0);
  const reserve = clamp(s.seedReserve[category] || 0);
  const resilience = clamp(diversity * 0.68 + reserve * 0.20 + seedBankCapability(region) * 0.12);
  return clamp(1 - stress * (1 - resilience) * 0.34, 0.68, 1);
}

export function agriculturalGeneticsSummary(region) {
  const s = ensureAgriculturalGenetics(region);
  return {
    liveDiversity: { ...s.liveDiversity }, preservedDiversity: { ...s.preservedDiversity }, seedReserve: { ...s.seedReserve },
    geneticErosion: { ...s.geneticErosion }, seedBankCapability: seedBankCapability(region), collectionEffort: s.collectionEffort,
    distributionEffort: s.distributionEffort, aggregateDiversity: s.aggregateDiversity, aggregateReserve: s.aggregateReserve,
  };
}
