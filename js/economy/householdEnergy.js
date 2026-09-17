const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function latitude(region) {
  const c = region.centroid;
  if (Array.isArray(c) && Number.isFinite(c[1])) return Number(c[1]);
  return Number(region.latitude || 0);
}

function coldNeed(region) {
  const temp = region.weather?.temperatureC ?? region.weather?.temperature ?? region.weather?.meanTemperatureC;
  if (Number.isFinite(temp)) return clamp01((18 - temp) / 22);
  return clamp01((Math.abs(latitude(region)) - 18) / 42);
}

export function civilianOilDemand(region, elapsedDays = 7) {
  const years = Math.max(0, Number(elapsedDays) || 0) / 365.2425;
  const population = Math.max(0, Number(region.population) || 0);
  const urban = clamp01(region.medievalSociety?.urban?.urbanisation || region.settlements?.urbanShare || 0);
  // Game oil units are abstract. Demand grows sub-linearly with population so
  // world-scale commodity stocks remain tractable while still rewarding supply.
  const householdScale = Math.pow(population / 1000, 0.72) * Math.max(0.0001, years);
  const lightingNeed = householdScale * (0.55 + urban * 0.55);
  const heatingNeed = householdScale * coldNeed(region) * (0.65 + urban * 0.2);
  return { lightingNeed, heatingNeed, total: lightingNeed + heatingNeed, coldNeed: coldNeed(region) };
}

export function tickHouseholdEnergy(region, elapsedDays = 7) {
  region.stockpile ||= {};
  region.marketDemand ||= {};
  region.householdEnergy ||= { lightingService: 0, heatingService: 0, oilConsumed: 0, oilDemand: 0 };
  const demand = civilianOilDemand(region, elapsedDays);
  const available = Math.max(0, Number(region.stockpile.oil) || 0);
  const consumed = Math.min(available, demand.total);
  const ratio = demand.total > 0 ? consumed / demand.total : 0;
  const lightingConsumed = demand.lightingNeed * ratio;
  const heatingConsumed = demand.heatingNeed * ratio;
  region.stockpile.oil = Math.max(0, available - consumed);

  // Services are satisfaction ratios, not bonuses per barrel. Large stockpiles
  // cannot stack infinite wellbeing; only meeting household demand matters.
  const lightingService = demand.lightingNeed > 0 ? clamp01(lightingConsumed / demand.lightingNeed) : 0;
  const heatingService = demand.heatingNeed > 0 ? clamp01(heatingConsumed / demand.heatingNeed) : 0;
  const smoothing = clamp01(Math.max(0, Number(elapsedDays) || 0) / 28);
  const state = region.householdEnergy;
  state.lightingService += (lightingService - (state.lightingService || 0)) * smoothing;
  state.heatingService += (heatingService - (state.heatingService || 0)) * smoothing;
  state.oilConsumed = consumed;
  state.oilDemand = demand.total;
  state.coldNeed = demand.coldNeed;

  const unmet = Math.max(0, demand.total - consumed);
  // Merchant demand is physical unmet household demand plus a modest buffer.
  region.marketDemand.oil = Math.max(0, unmet + demand.total * 0.2);
  return { ...state, unmetOilDemand: unmet };
}

export function householdEnergyWellbeing(region) {
  const e = region.householdEnergy || {};
  const lighting = clamp01(e.lightingService || 0);
  const heating = clamp01(e.heatingService || 0);
  const cold = clamp01(e.coldNeed || 0);
  return {
    prosperity: clamp01(lighting * 0.035 + heating * cold * 0.045),
    safety: clamp01(heating * cold * 0.055),
    culturalAccess: clamp01(lighting * 0.055),
  };
}
