// Technologies can be locally rational while carrying delayed, poorly observed costs.
// Actual harm and social knowledge are deliberately separate so societies do not
// automatically receive modern knowledge the moment they adopt a useful material.

const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const HAZARDS = Object.freeze({
  lead: {
    id: 'lead', label: 'Lead exposure',
    latencyYears: 4, persistence: 0.985,
    childMortalityWeight: 0.00045, adultMortalityWeight: 0.00012,
    fertilityWeight: 0.0018, productivityWeight: 0.012,
    discoverability: 0.25,
  },
  asbestos: {
    id: 'asbestos', label: 'Asbestos exposure',
    latencyYears: 22, persistence: 0.998,
    childMortalityWeight: 0.00002, adultMortalityWeight: 0.0014,
    fertilityWeight: 0, productivityWeight: 0.005,
    discoverability: 0.08,
  },
  fossil_air: {
    id: 'fossil_air', label: 'Combustion air pollution',
    latencyYears: 3, persistence: 0.94,
    childMortalityWeight: 0.0009, adultMortalityWeight: 0.0008,
    fertilityWeight: 0.0003, productivityWeight: 0.018,
    discoverability: 0.35,
  },
  leaded_fuel: {
    id: 'leaded_fuel', label: 'Leaded fuel exposure',
    latencyYears: 2, persistence: 0.96,
    childMortalityWeight: 0.0008, adultMortalityWeight: 0.00025,
    fertilityWeight: 0.0012, productivityWeight: 0.02,
    discoverability: 0.22,
  },
  ozone_depletion: {
    id: 'ozone_depletion', label: 'Ozone depletion',
    latencyYears: 12, persistence: 0.999,
    childMortalityWeight: 0, adultMortalityWeight: 0.0002,
    fertilityWeight: 0, productivityWeight: 0,
    discoverability: 0.03,
    global: true,
  },
  climate_forcing: {
    id: 'climate_forcing', label: 'Greenhouse forcing',
    latencyYears: 25, persistence: 0.9998,
    childMortalityWeight: 0, adultMortalityWeight: 0,
    fertilityWeight: 0, productivityWeight: 0,
    discoverability: 0.015,
    global: true,
  },
});

export function ensureExternalities(region) {
  if (!region.externalities) region.externalities = {};
  const e = region.externalities;
  if (!e.hazards) e.hazards = {};
  if (!e.knowledge) e.knowledge = {};
  if (!e.regulation) e.regulation = {};
  if (!Number.isFinite(e.healthBurden)) e.healthBurden = 0;
  if (!Number.isFinite(e.productivityBurden)) e.productivityBurden = 0;
  return e;
}

function ensureHazardState(region, hazardId) {
  const e = ensureExternalities(region);
  if (!e.hazards[hazardId]) e.hazards[hazardId] = { exposure: 0, bodyBurden: 0, yearsExposed: 0, lastSource: null };
  if (!e.knowledge[hazardId]) e.knowledge[hazardId] = { evidence: 0, confidence: 0, recognised: false };
  if (!Number.isFinite(e.regulation[hazardId])) e.regulation[hazardId] = 0;
  return { state: e.hazards[hazardId], knowledge: e.knowledge[hazardId], regulation: e.regulation[hazardId] };
}

export function addHazardExposure(region, hazardId, amount, source = null) {
  if (!HAZARDS[hazardId] || amount <= 0) return;
  const { state, regulation } = ensureHazardState(region, hazardId);
  const mitigated = amount * (1 - clamp01(regulation));
  state.exposure += mitigated;
  if (source) state.lastSource = source;
}

function leadExposureFromCurrentEconomy(region) {
  const lead = Math.max(0, region.stockpile?.lead || 0);
  const mined = Math.max(0, region.report?.mining?.resources?.lead || region.report?.mining?.lead || 0);
  const hydraulic = region.unlockedTechIds?.has('hydraulic_engineering');
  const urbanShare = region.urbanisation?.urbanShare || 0;
  const plumbingUse = hydraulic && lead > 0 ? Math.min(1, lead / Math.max(10, (region.population || 1) / 1200)) : 0;
  // Mining/smelting is the high-risk source. Plumbing adds broad but usually
  // lower-intensity chronic exposure; hard-water/passivation is abstracted by
  // keeping this coefficient modest rather than treating every pipe as poison.
  return mined * 0.0008 + plumbingUse * urbanShare * 0.16;
}

function spontaneousEvidence(region, hazard, state, elapsedYears) {
  const literacy = clamp01((region.educationLevel || 0) * 0.7 + (region.occupations?.scribe || 0) / Math.max(100, region.population || 1) * 12);
  const burdenSignal = clamp01(state.bodyBurden / 2);
  const occupationalSignal = clamp01(state.exposure / 0.4);
  const yearsFactor = clamp01(state.yearsExposed / Math.max(1, hazard.latencyYears));
  return (0.001 + literacy * 0.012) * hazard.discoverability *
    (0.1 + burdenSignal * 0.5 + occupationalSignal * 0.25 + yearsFactor * 0.15) * elapsedYears;
}

export function tickExternalities(region, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const e = ensureExternalities(region);

  if (region.stockpile?.lead > 0 || region.unlockedTechIds?.has('hydraulic_engineering')) {
    addHazardExposure(region, 'lead', leadExposureFromCurrentEconomy(region), 'lead use and processing');
  }

  let health = 0;
  let productivity = 0;
  let fertilityPenalty = 0;
  let childMortality = 0;
  let adultMortality = 0;

  for (const [hazardId, hazard] of Object.entries(HAZARDS)) {
    const { state, knowledge } = ensureHazardState(region, hazardId);
    if (state.exposure > 0) state.yearsExposed += years;
    const latency = clamp01(state.yearsExposed / Math.max(0.1, hazard.latencyYears));
    state.bodyBurden = state.bodyBurden * Math.pow(hazard.persistence, years) + state.exposure * years;
    const effectiveBurden = Math.max(0, state.bodyBurden) * latency;
    childMortality += effectiveBurden * hazard.childMortalityWeight;
    adultMortality += effectiveBurden * hazard.adultMortalityWeight;
    fertilityPenalty += effectiveBurden * hazard.fertilityWeight;
    productivity += effectiveBurden * hazard.productivityWeight;
    health += effectiveBurden * (hazard.childMortalityWeight + hazard.adultMortalityWeight + hazard.fertilityWeight * 0.2);

    // Societies infer harm only from noisy repeated observations. Recognition
    // can lag actual harm by decades and is not guaranteed, especially where
    // effects are diffuse or delayed.
    knowledge.evidence += spontaneousEvidence(region, hazard, state, years);
    knowledge.confidence = clamp01(1 - Math.exp(-knowledge.evidence));
    if (knowledge.confidence > 0.72) knowledge.recognised = true;

    // Exposure is a flow; burden is the accumulated stock.
    state.exposure = 0;
  }

  e.healthBurden = health;
  e.productivityBurden = clamp01(productivity);
  e.demographicEffects = {
    fertilityMultiplier: Math.max(0.7, 1 - fertilityPenalty),
    childMortalityExtraAnnual: Math.min(0.03, childMortality),
    adultMortalityExtraAnnual: Math.min(0.02, adultMortality),
  };
  return e;
}

export function recognisedHazards(region) {
  const e = ensureExternalities(region);
  return Object.entries(e.knowledge)
    .filter(([, k]) => k.recognised)
    .map(([id, k]) => ({ id, ...k, label: HAZARDS[id]?.label || id }));
}

export function setHazardRegulation(region, hazardId, strength) {
  if (!HAZARDS[hazardId]) return false;
  const e = ensureExternalities(region);
  e.regulation[hazardId] = clamp01(strength);
  return true;
}
