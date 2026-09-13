// Geography-first food preservation and luxury commodity model.
//
// Commodity origins are ecological source zones, not modern political borders.
// Familiarity is cultural: local producers know their own goods, neighbouring
// regions learn slowly, and successful trade accelerates adoption. Coffee is
// deliberately absent from v1; it will enter through a later emergence system.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const LUXURY_COMMODITIES = Object.freeze({
  pepper: {
    label: 'Pepper', rate: 0.22, demandPerPersonWeek: 0.00018,
    zones: [{ lon: [72, 82], lat: [7, 20], highland: false }],
  },
  cinnamon: {
    label: 'Cinnamon', rate: 0.12, demandPerPersonWeek: 0.00008,
    zones: [{ lon: [78, 82.5], lat: [5, 11], highland: false }],
  },
  tea: {
    label: 'Tea', rate: 0.28, demandPerPersonWeek: 0.00035,
    zones: [{ lon: [96, 122], lat: [20, 34], highland: true }],
  },
  cloves: {
    label: 'Cloves', rate: 0.08, demandPerPersonWeek: 0.000035,
    zones: [{ lon: [124, 130], lat: [-3, 3], highland: false }],
  },
  nutmeg: {
    label: 'Nutmeg and mace', rate: 0.07, demandPerPersonWeek: 0.00003,
    zones: [{ lon: [127, 132], lat: [-5, 2], highland: false }],
  },
});

export const LUXURY_RESOURCE_IDS = Object.freeze(Object.keys(LUXURY_COMMODITIES));

function centroid(region) {
  const c = region?.centroid || [0, 0];
  return { lon: Number(c[0]) || 0, lat: Number(c[1]) || 0 };
}

function zoneSignal(value, [min, max], feather = 2) {
  if (value >= min && value <= max) return 1;
  const d = value < min ? min - value : value - max;
  return clamp(1 - d / Math.max(0.01, feather));
}

export function commoditySuitability(region, resource) {
  const spec = LUXURY_COMMODITIES[resource];
  if (!spec) return 0;
  const { lon, lat } = centroid(region);
  let best = 0;
  for (const zone of spec.zones) {
    const lonSignal = zoneSignal(lon, zone.lon, 3.5);
    const latSignal = zoneSignal(lat, zone.lat, 2.5);
    let physical = lonSignal * latSignal;
    if (zone.highland) {
      const roughness = clamp((region?.terrain?.mountain || region?.terrain?.mountains || 0) * 0.8 +
        (region?.terrain?.hills || region?.terrain?.hill || 0) * 0.45 + 0.45, 0.25, 1);
      physical *= roughness;
    }
    const land = clamp(0.45 + (region?.landQuality ?? 0.5) * 0.55, 0.35, 1);
    best = Math.max(best, physical * land);
  }
  return best < 0.08 ? 0 : clamp(best);
}

function ensureState(region) {
  if (!region.foodLuxuries || typeof region.foodLuxuries !== 'object') {
    region.foodLuxuries = { version: 1, familiarity: {}, production: {}, consumption: {} };
  }
  if (!region.foodLuxuries.familiarity) region.foodLuxuries.familiarity = {};
  if (!region.foodLuxuries.production) region.foodLuxuries.production = {};
  if (!region.foodLuxuries.consumption) region.foodLuxuries.consumption = {};
  if (!region.marketDemand) region.marketDemand = {};
  if (!region.stockpile) region.stockpile = {};
  return region.foodLuxuries;
}

export function commodityFamiliarity(region, resource) {
  const state = ensureState(region);
  const local = commoditySuitability(region, resource);
  if (local > 0 && !Number.isFinite(state.familiarity[resource])) state.familiarity[resource] = 0.85;
  return clamp(state.familiarity[resource] || 0);
}

export function recordCommodityTrade(origin, dest, resource, quantity = 0) {
  if (!LUXURY_COMMODITIES[resource] || !(quantity > 0)) return false;
  const sourceState = ensureState(origin);
  const destState = ensureState(dest);
  const exposure = clamp(Math.log1p(quantity) / 8, 0.015, 0.18);
  destState.familiarity[resource] = clamp((destState.familiarity[resource] || 0) + exposure);
  sourceState.familiarity[resource] = clamp(Math.max(sourceState.familiarity[resource] || 0, 0.35));
  return true;
}

function diffuseFamiliarity(regions, weekScale) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const updates = [];
  for (const region of regions) {
    const state = ensureState(region);
    for (const resource of LUXURY_RESOURCE_IDS) {
      const local = commoditySuitability(region, resource);
      if (local > 0) state.familiarity[resource] = Math.max(state.familiarity[resource] || 0, 0.85);
      let neighbourBest = 0;
      for (const id of region.neighbors || []) {
        const neighbour = byId.get(id);
        if (!neighbour) continue;
        neighbourBest = Math.max(neighbourBest, commodityFamiliarity(neighbour, resource));
      }
      const current = clamp(state.familiarity[resource] || 0);
      if (neighbourBest > current + 0.05) {
        updates.push([region, resource, current + (neighbourBest - current) * 0.0025 * weekScale]);
      }
    }
  }
  for (const [region, resource, next] of updates) ensureState(region).familiarity[resource] = clamp(next);
}

export function tickFoodLuxuries(regions, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  diffuseFamiliarity(regions, weekScale);

  for (const region of regions) {
    const state = ensureState(region);
    let general = Math.max(0, Number(region.occupations?.general) || 0);
    const maxSpecialists = general * 0.008;
    let specialistsUsed = 0;

    for (const resource of LUXURY_RESOURCE_IDS) {
      const spec = LUXURY_COMMODITIES[resource];
      const suitability = commoditySuitability(region, resource);
      const familiarity = commodityFamiliarity(region, resource);
      let produced = 0;
      let workers = 0;
      if (suitability > 0 && specialistsUsed < maxSpecialists) {
        workers = Math.min(maxSpecialists - specialistsUsed,
          Math.max(1, region.population * 0.00035) * suitability);
        produced = workers * spec.rate * suitability * weekScale;
        region.stockpile[resource] = (region.stockpile[resource] || 0) + produced;
        specialistsUsed += workers;
      }

      const wealthPerCapita = Math.max(0, Number(region.wallet) || 0) / Math.max(1, region.population || 1);
      const wealthSignal = clamp(0.35 + Math.log1p(wealthPerCapita * 50) * 0.22, 0.25, 1.5);
      const weeklyDemand = Math.max(0, region.population || 0) * spec.demandPerPersonWeek * familiarity * wealthSignal;
      region.marketDemand[resource] = weeklyDemand;
      const consumed = Math.min(Math.max(0, region.stockpile[resource] || 0), weeklyDemand * weekScale);
      region.stockpile[resource] = Math.max(0, (region.stockpile[resource] || 0) - consumed);
      state.production[resource] = produced;
      state.consumption[resource] = consumed;
    }

    if (region.occupations) {
      region.occupations.general = Math.max(0, Math.round(general - specialistsUsed));
      region.occupations.luxuryProducer = Math.round(specialistsUsed);
    }
    state.workers = specialistsUsed;
  }
}

// Generic food remains generic: preservation changes how much of it survives,
// not what crop or animal every ration came from. Drying, smoking, fermentation
// and pickling exist without a special resource; salt makes them materially
// more effective and is consumed in the process.
export function applyFoodPreservation(region, weeklyFoodNeed, elapsedDays = 7) {
  ensureState(region);
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const targetSalt = Math.max(0, weeklyFoodNeed) * 0.0025 * weekScale;
  const available = Math.max(0, region.stockpile?.salt || 0);
  const saltUsed = Math.min(available, targetSalt);
  if (region.stockpile) region.stockpile.salt = Math.max(0, available - saltUsed);
  const saltCoverage = targetSalt > 0 ? clamp(saltUsed / targetSalt) : 0;

  if (!region.marketDemand) region.marketDemand = {};
  region.marketDemand.salt = Math.max(region.marketDemand.salt || 0, Math.max(0, weeklyFoodNeed) * 0.0025);

  return {
    methods: ['drying', 'smoking', 'fermentation', ...(saltCoverage > 0.05 ? ['salting'] : [])],
    saltCoverage,
    saltUsed,
    spoilageMultiplier: clamp(0.92 - saltCoverage * 0.24, 0.68, 0.92),
    capacityWeeksBonus: saltCoverage * 5,
  };
}
