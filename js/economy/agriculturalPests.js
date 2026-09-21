import { DIET_FOOD_IDS, regionalFoodProductionMix } from './foodDiversity.js?v=20260921-food-diversity1';
import { pesticideControlForCategory } from './agriculturalPesticides.js?v=20260921-pesticides1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const PLANT_FOODS = Object.freeze(['staple_grains', 'pulses', 'fruit_vegetables']);
const BASELINE = Object.freeze({ staple_grains: 0.16, pulses: 0.14, fruit_vegetables: 0.18, animal_foods: 0.08 });
const MAX_EXTRA_LOSS = Object.freeze({ staple_grains: 0.42, pulses: 0.36, fruit_vegetables: 0.46, animal_foods: 0.12 });

function ensureCategoryMap(target, defaults) {
  for (const id of DIET_FOOD_IDS) if (!Number.isFinite(target[id])) target[id] = defaults[id] || 0;
}

export function ensureAgriculturalPests(region) {
  region.agriculturalPests ||= {};
  const s = region.agriculturalPests;
  s.baselinePressure ||= {};
  s.pressure ||= {};
  s.outbreakSeverity ||= {};
  s.extraYieldLoss ||= {};
  s.introductionRisk ||= {};
  s.pesticideControl ||= {};
  ensureCategoryMap(s.baselinePressure, BASELINE);
  ensureCategoryMap(s.pressure, BASELINE);
  ensureCategoryMap(s.outbreakSeverity, {});
  ensureCategoryMap(s.extraYieldLoss, {});
  ensureCategoryMap(s.introductionRisk, {});
  ensureCategoryMap(s.pesticideControl, {});
  if (!Number.isFinite(s.monocultureRisk)) s.monocultureRisk = 0;
  if (!Number.isFinite(s.aggregateExtraLoss)) s.aggregateExtraLoss = 0;
  if (!Number.isFinite(s.yieldMultiplier)) s.yieldMultiplier = 1;
  if (!Number.isFinite(s.outbreakCount)) s.outbreakCount = 0;
  return s;
}

function tradeContactIds(region) {
  const ids = new Set(region.neighbors || []);
  for (const id of region.tradePartnerIds || []) ids.add(id);
  if (region.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  else if (region.recentTradePartners instanceof Set) for (const id of region.recentTradePartners) ids.add(id);
  return ids;
}

function weatherRisk(region, category) {
  const index = Number(region.weather?.index) || 0;
  const temperature = Math.max(0, Number(region.climate?.temperatureAnomalyC) || 0);
  const latitude = Math.abs(Number(region.centroid?.[1]) || 0);
  const warmth = clamp(1 - latitude / 70 + temperature * 0.08);
  const wet = clamp(Math.max(0, index) / 1.8);
  const dry = clamp(Math.max(0, -index) / 1.8);
  if (category === 'fruit_vegetables') return clamp(0.22 + wet * 0.52 + warmth * 0.26);
  if (category === 'staple_grains') return clamp(0.20 + wet * 0.34 + warmth * 0.24 + dry * 0.12);
  if (category === 'pulses') return clamp(0.18 + wet * 0.30 + warmth * 0.22 + dry * 0.16);
  return clamp(0.12 + warmth * 0.08);
}

function cropConcentration(region) {
  const mix = region.foodDiversity?.productionMix || regionalFoodProductionMix(region);
  const plantTotal = PLANT_FOODS.reduce((sum, id) => sum + Math.max(0, Number(mix[id]) || 0), 0) || 1;
  const shares = PLANT_FOODS.map((id) => Math.max(0, Number(mix[id]) || 0) / plantTotal);
  const hhi = shares.reduce((sum, share) => sum + share * share, 0);
  return clamp((hhi - 1 / 3) / (1 - 1 / 3));
}

function annualOutbreakChance(region, category, sourceRisk) {
  const mix = region.foodDiversity?.productionMix || regionalFoodProductionMix(region);
  const exposure = clamp((Number(mix[category]) || 0) * 2.2);
  const monoculture = cropConcentration(region);
  const weather = weatherRisk(region, category);
  const cultivated = Math.max(0, Number(region.agriculturalLand?.cultivatedHa) || 0);
  const scale = clamp(Math.log1p(cultivated) / 12);
  return clamp(0.008 + exposure * 0.016 + monoculture * exposure * 0.055 + weather * 0.020 + sourceRisk * 0.085 + scale * 0.008, 0, 0.22);
}

function weeklyEquivalentChance(annualChance, elapsedDays) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  return 1 - Math.pow(1 - clamp(annualChance), years);
}

export function tickAgriculturalPests(regions, elapsedDays = 7, rng = Math.random) {
  const byId = new Map((regions || []).map((region) => [region.id, region]));
  const priorPressure = new Map();
  for (const region of regions || []) priorPressure.set(region.id, { ...ensureAgriculturalPests(region).pressure });

  for (const region of regions || []) {
    const s = ensureAgriculturalPests(region);
    const mix = region.foodDiversity?.productionMix || regionalFoodProductionMix(region);
    region.foodDiversity ||= {};
    region.foodDiversity.productionMix ||= { ...mix };
    s.monocultureRisk = cropConcentration(region);
    let weightedLoss = 0;
    let cropWeight = 0;

    for (const category of DIET_FOOD_IDS) {
      let sourceRisk = 0;
      let contactCount = 0;
      for (const id of tradeContactIds(region)) {
        const source = byId.get(id);
        if (!source) continue;
        const sourceState = priorPressure.get(id);
        const excess = Math.max(0, (sourceState?.[category] || 0) - BASELINE[category]);
        if (excess <= 0) continue;
        sourceRisk += excess;
        contactCount += 1;
      }
      sourceRisk = contactCount ? clamp(sourceRisk / contactCount * (0.65 + Math.min(0.7, contactCount * 0.08))) : 0;
      s.introductionRisk[category] = sourceRisk;

      const baseline = s.baselinePressure[category];
      const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
      const recovery = 1 - Math.exp(-1.35 * years);
      let pressure = s.pressure[category] + (baseline - s.pressure[category]) * recovery;
      pressure += sourceRisk * 0.10 * Math.min(1, years * 4);

      const chance = weeklyEquivalentChance(annualOutbreakChance(region, category, sourceRisk), elapsedDays);
      if (rng() < chance) {
        const weather = weatherRisk(region, category);
        const exposure = clamp((Number(mix[category]) || 0) * 2.2);
        const severity = clamp(0.18 + rng() * 0.42 + weather * 0.20 + s.monocultureRisk * exposure * 0.20, 0.12, 0.92);
        pressure = Math.max(pressure, baseline + severity * (0.55 + 0.25 * exposure));
        s.outbreakCount += 1;
      }

      // Crop protection suppresses abnormal pressure only. Endemic baseline
      // losses remain embedded in historical yields and cannot be erased by
      // spraying, so pesticides prevent bad outbreaks rather than creating a
      // permanent productivity bonus in normal years.
      const control = PLANT_FOODS.includes(category) ? pesticideControlForCategory(region, category) : 0;
      s.pesticideControl[category] = control;
      pressure = baseline + Math.max(0, pressure - baseline) * (1 - control);

      pressure = clamp(pressure, baseline * 0.75, 1);
      const abnormal = clamp((pressure - baseline) / Math.max(0.01, 1 - baseline));
      const extraLoss = clamp(abnormal * MAX_EXTRA_LOSS[category], 0, MAX_EXTRA_LOSS[category]);
      s.pressure[category] = pressure;
      s.outbreakSeverity[category] = abnormal;
      s.extraYieldLoss[category] = extraLoss;

      if (PLANT_FOODS.includes(category)) {
        const weight = Math.max(0, Number(mix[category]) || 0);
        weightedLoss += extraLoss * weight;
        cropWeight += weight;
      }
    }

    s.aggregateExtraLoss = cropWeight > 0 ? clamp(weightedLoss / cropWeight, 0, 0.42) : 0;
    s.yieldMultiplier = 1 - s.aggregateExtraLoss;
    region.report ||= {};
    region.report.agriculturalPests = {
      workers: 0,
      monocultureRisk: s.monocultureRisk,
      pressure: { ...s.pressure },
      outbreakSeverity: { ...s.outbreakSeverity },
      extraYieldLoss: { ...s.extraYieldLoss },
      introductionRisk: { ...s.introductionRisk },
      pesticideControl: { ...s.pesticideControl },
      aggregateExtraLoss: s.aggregateExtraLoss,
      yieldMultiplier: s.yieldMultiplier,
      outbreakCount: s.outbreakCount,
    };
  }
}

export function pestYieldMultiplier(region) {
  return clamp(ensureAgriculturalPests(region).yieldMultiplier, 0.58, 1);
}

export function pestCategoryYieldMultiplier(region, category) {
  const loss = clamp(ensureAgriculturalPests(region).extraYieldLoss?.[category] || 0, 0, 0.5);
  return 1 - loss;
}
