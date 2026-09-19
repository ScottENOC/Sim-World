import { effectiveInfrastructureCount } from './construction.js?v=20260920-strategic-nuclear1';
import { ensureNuclearPowerState, nuclearIndustrialReadiness, NUCLEAR_PHYSICS_TECH_ID, URANIUM_FUEL_CYCLE_TECH_ID, SPENT_FUEL_MANAGEMENT_TECH_ID } from './nuclearPower.js?v=20260920-nuclear1';
import { knowledgeLevel } from '../core/knowledge.js?v=20260906-scouting1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const ISOTOPE_SEPARATION_TECH_ID = 'isotope_separation';
export const SPENT_FUEL_REPROCESSING_TECH_ID = 'spent_fuel_reprocessing';

export const NUCLEAR_PROGRAMME_POSTURES = Object.freeze({
  CIVILIAN: 'civilian',
  HEDGE: 'hedge',
  STRATEGIC: 'strategic',
});

function hasTech(region, id) { return Boolean(region?.unlockedTechIds?.has?.(id)); }
function consume(stockpile, key, requested) {
  const available = nonNegative(stockpile[key]);
  const amount = Math.min(available, Math.max(0, requested));
  stockpile[key] = available - amount;
  return amount;
}

export function ensureStrategicNuclearState(region) {
  ensureNuclearPowerState(region);
  region.stockpile ||= {};
  for (const key of ['enriched_uranium_feed', 'strategic_uranium_material', 'separated_plutonium']) {
    if (!Number.isFinite(region.stockpile[key])) region.stockpile[key] = 0;
  }
  region.strategicNuclear ||= {};
  const s = region.strategicNuclear;
  s.policy ||= { posture: NUCLEAR_PROGRAMME_POSTURES.CIVILIAN, safeguards: 1, secrecy: 0.15, declared: true };
  if (!Object.values(NUCLEAR_PROGRAMME_POSTURES).includes(s.policy.posture)) s.policy.posture = NUCLEAR_PROGRAMME_POSTURES.CIVILIAN;
  s.policy.safeguards = clamp(s.policy.safeguards ?? 1);
  s.policy.secrecy = clamp(s.policy.secrecy ?? 0.15);
  s.policy.declared = s.policy.declared !== false;
  if (!Number.isFinite(s.enrichmentExperience)) s.enrichmentExperience = 0;
  if (!Number.isFinite(s.reprocessingExperience)) s.reprocessingExperience = 0;
  if (!Number.isFinite(s.electricityLoad)) s.electricityLoad = 0;
  s.lastCycle ||= {};
  s.observableSignals ||= {};
  return s;
}

export function setNuclearProgrammePolicy(region, patch = {}) {
  const s = ensureStrategicNuclearState(region);
  if (patch.posture && Object.values(NUCLEAR_PROGRAMME_POSTURES).includes(patch.posture)) s.policy.posture = patch.posture;
  if (Number.isFinite(patch.safeguards)) s.policy.safeguards = clamp(patch.safeguards);
  if (Number.isFinite(patch.secrecy)) s.policy.secrecy = clamp(patch.secrecy);
  if (typeof patch.declared === 'boolean') s.policy.declared = patch.declared;
  return { ...s.policy };
}

function programmeIntensity(s) {
  if (s.policy.posture === NUCLEAR_PROGRAMME_POSTURES.STRATEGIC) return 1;
  if (s.policy.posture === NUCLEAR_PROGRAMME_POSTURES.HEDGE) return 0.38;
  return 0;
}

function electricityAvailability(region) {
  return clamp(region.electricity?.industrialService ?? region.electricity?.industrialCoverage ?? 0);
}

export function strategicNuclearElectricityDemand(region, elapsedDays = 7) {
  const s = ensureStrategicNuclearState(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const enrichment = effectiveInfrastructureCount(region, 'uranium_enrichment_complex');
  const reprocessing = effectiveInfrastructureCount(region, 'nuclear_reprocessing_plant');
  const intensity = programmeIntensity(s);
  // Deliberately abstract energy demand: enough to make enrichment a major grid decision
  // without encoding real-world plant performance or separative-work parameters.
  const civilianLoad = enrichment * 1500 * years;
  const strategicLoad = enrichment * 2100 * years * intensity;
  const reprocessingLoad = reprocessing * 620 * years;
  return civilianLoad + strategicLoad + reprocessingLoad;
}

export function tickStrategicNuclearFuelCycle(region, elapsedDays = 7) {
  const s = ensureStrategicNuclearState(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (years <= 0) return s.lastCycle;
  const readiness = nuclearIndustrialReadiness(region);
  const power = electricityAvailability(region);
  const intensity = programmeIntensity(s);
  const enrichment = effectiveInfrastructureCount(region, 'uranium_enrichment_complex');
  const reprocessing = effectiveInfrastructureCount(region, 'nuclear_reprocessing_plant');
  s.electricityLoad = strategicNuclearElectricityDemand(region, elapsedDays);

  let concentrateUsed = 0, enrichedFeedProduced = 0, strategicUraniumProduced = 0;
  if (enrichment > 0 && hasTech(region, ISOTOPE_SEPARATION_TECH_ID)) {
    const throughput = enrichment * 20 * years * (0.30 + readiness * 0.42 + power * 0.28);
    concentrateUsed = consume(region.stockpile, 'uranium_concentrate', throughput);
    enrichedFeedProduced = concentrateUsed * (0.34 + readiness * 0.10);
    region.stockpile.enriched_uranium_feed += enrichedFeedProduced;

    // Civilian isotope separation improves reactor-fuel fabrication. A state that deliberately
    // chooses a hedge/strategic posture can instead accumulate an abstract strategic material
    // stock. No enrichment percentages or weapon construction parameters are modelled here.
    const strategicShare = clamp(intensity * (0.10 + s.enrichmentExperience * 0.16), 0, 0.28);
    strategicUraniumProduced = consume(region.stockpile, 'enriched_uranium_feed', enrichedFeedProduced * strategicShare);
    region.stockpile.strategic_uranium_material += strategicUraniumProduced;
    const civilianFeed = consume(region.stockpile, 'enriched_uranium_feed', enrichedFeedProduced * (1 - strategicShare) * 0.55);
    region.stockpile.reactor_fuel += civilianFeed * (0.68 + readiness * 0.12);
    if (concentrateUsed > 0) s.enrichmentExperience = clamp(s.enrichmentExperience + years * (0.015 + readiness * 0.05) * (1 - s.enrichmentExperience));
  }

  let spentFuelUsed = 0, separatedPlutoniumProduced = 0;
  if (reprocessing > 0 && hasTech(region, SPENT_FUEL_REPROCESSING_TECH_ID)) {
    const capacity = reprocessing * 7.5 * years * (0.36 + readiness * 0.40 + power * 0.24);
    spentFuelUsed = consume(region.stockpile, 'spent_nuclear_fuel', capacity);
    const recoveredFuel = spentFuelUsed * (0.32 + readiness * 0.08);
    region.stockpile.reactor_fuel += recoveredFuel;
    const strategicShare = clamp(intensity * (0.06 + s.reprocessingExperience * 0.12), 0, 0.18);
    separatedPlutoniumProduced = spentFuelUsed * strategicShare;
    region.stockpile.separated_plutonium += separatedPlutoniumProduced;
    if (spentFuelUsed > 0) s.reprocessingExperience = clamp(s.reprocessingExperience + years * (0.012 + readiness * 0.045) * (1 - s.reprocessingExperience));
  }

  const footprint = clamp((enrichment * 0.55 + reprocessing * 0.45) / 3);
  const electricalAnomaly = clamp(s.electricityLoad / Math.max(1, nonNegative(region.electricity?.demand) + s.electricityLoad));
  const materialHandling = clamp((concentrateUsed + spentFuelUsed) / Math.max(1, 8 * years));
  const safeguardsVisibility = clamp(s.policy.safeguards * 0.72 + (s.policy.declared ? 0.28 : 0));
  const concealment = clamp(s.policy.secrecy * (0.45 + (1 - s.policy.safeguards) * 0.35));
  s.observableSignals = { footprint, electricalAnomaly, materialHandling, safeguardsVisibility, concealment };
  s.lastCycle = {
    enrichmentComplexes: enrichment, reprocessingPlants: reprocessing, readiness, power, electricityLoad: s.electricityLoad,
    concentrateUsed, enrichedFeedProduced, strategicUraniumProduced, spentFuelUsed, separatedPlutoniumProduced,
    posture: s.policy.posture,
  };
  return s.lastCycle;
}

export function strategicNuclearMaterialSummary(region) {
  const s = ensureStrategicNuclearState(region);
  return {
    policy: { ...s.policy },
    technology: {
      isotopeSeparation: hasTech(region, ISOTOPE_SEPARATION_TECH_ID),
      reprocessing: hasTech(region, SPENT_FUEL_REPROCESSING_TECH_ID),
    },
    facilities: {
      enrichmentComplexes: effectiveInfrastructureCount(region, 'uranium_enrichment_complex'),
      reprocessingPlants: effectiveInfrastructureCount(region, 'nuclear_reprocessing_plant'),
    },
    stockpile: {
      enrichedUraniumFeed: nonNegative(region.stockpile.enriched_uranium_feed),
      strategicUraniumMaterial: nonNegative(region.stockpile.strategic_uranium_material),
      separatedPlutonium: nonNegative(region.stockpile.separated_plutonium),
    },
    electricityLoad: s.electricityLoad || 0,
    signals: { ...(s.observableSignals || {}) },
    enrichmentExperience: s.enrichmentExperience || 0,
    reprocessingExperience: s.reprocessingExperience || 0,
  };
}

export function estimateForeignNuclearCapability(observer, target) {
  const s = ensureStrategicNuclearState(target);
  const familiarity = observer?.id === target?.id ? 1 : clamp(knowledgeLevel(observer, target?.id));
  const signals = s.observableSignals || {};
  const diplomatOrTradeContact = observer?.recentTradePartners instanceof Map && observer.recentTradePartners.has(target?.id) ? 0.08 :
    (observer?.tradePartnerIds || []).includes(target?.id) ? 0.05 : 0;
  const rawVisibility = clamp((signals.footprint || 0) * 0.30 + (signals.electricalAnomaly || 0) * 0.22 +
    (signals.materialHandling || 0) * 0.20 + (signals.safeguardsVisibility || 0) * 0.28);
  const confidence = clamp(0.05 + familiarity * 0.55 + rawVisibility * 0.32 + diplomatOrTradeContact - (signals.concealment || 0) * 0.22);
  const enrichmentVisible = effectiveInfrastructureCount(target, 'uranium_enrichment_complex') > 0;
  const reprocessingVisible = effectiveInfrastructureCount(target, 'nuclear_reprocessing_plant') > 0;
  const strategicMaterial = nonNegative(target.stockpile?.strategic_uranium_material) + nonNegative(target.stockpile?.separated_plutonium);
  let assessment = 'no_indication';
  if (confidence >= 0.72 && strategicMaterial > 0.1) assessment = 'strategic_material_probable';
  else if (confidence >= 0.45 && (enrichmentVisible || reprocessingVisible)) assessment = 'advanced_fuel_cycle_probable';
  else if (confidence >= 0.22 && rawVisibility > 0.18) assessment = 'suspicious_nuclear_activity';
  else if (hasTech(target, NUCLEAR_PHYSICS_TECH_ID) && familiarity > 0.5) assessment = 'civilian_nuclear_capability';
  return {
    targetRegionId: target.id,
    assessment,
    confidence,
    evidence: {
      industrialFootprint: clamp((signals.footprint || 0) * familiarity),
      electricalSignature: clamp((signals.electricalAnomaly || 0) * (0.35 + familiarity * 0.65)),
      materialHandling: clamp((signals.materialHandling || 0) * familiarity),
      safeguardsVisibility: clamp(signals.safeguardsVisibility || 0),
    },
    exactStockpileKnown: observer?.id === target?.id,
  };
}

export function strategicNuclearPrerequisites(region) {
  const tech = region.unlockedTechIds || new Set();
  return {
    isotopeSeparationReady: tech.has(NUCLEAR_PHYSICS_TECH_ID) && tech.has(URANIUM_FUEL_CYCLE_TECH_ID) && tech.has('industrial_electrification'),
    reprocessingReady: tech.has(SPENT_FUEL_MANAGEMENT_TECH_ID) && tech.has(URANIUM_FUEL_CYCLE_TECH_ID),
  };
}
