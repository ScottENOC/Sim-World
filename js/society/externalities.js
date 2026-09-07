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
  if (!e.adoption) e.adoption = {};
  if (!e.adoption.leadPlumbing) e.adoption.leadPlumbing = { coverage: 0, installedLead: 0 };
  if (!Number.isFinite(e.adoption.leadPlumbing.coverage)) e.adoption.leadPlumbing.coverage = 0;
  if (!Number.isFinite(e.adoption.leadPlumbing.installedLead)) e.adoption.leadPlumbing.installedLead = 0;
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

function tickLeadPlumbingAdoption(region, elapsedYears) {
  const e = ensureExternalities(region);
  const plumbing = e.adoption.leadPlumbing;
  const hasHydraulics = region.unlockedTechIds?.has('hydraulic_engineering');
  const availableLead = Math.max(0, region.stockpile?.lead || 0);
  const urbanShare = clamp01(region.urbanisation?.urbanShare || 0);
  const urbanPressure = clamp01((region.urbanisation?.urbanPopulation || 0) /
    Math.max(1, region.urbanisation?.urbanCapacity || 1));
  const leadKnowledge = e.knowledge?.lead;
  const recognised = Boolean(leadKnowledge?.recognised);
  const regulation = clamp01(e.regulation?.lead || 0);

  if (!hasHydraulics) return plumbing;

  // This is intentionally locally rational. Lead is cheap, workable and useful
  // in difficult hydraulic joints and pressure sections, so a growing city that
  // has the material tends to adopt it before anyone understands the chronic
  // population-health externality. Once the harm is recognised, regulation can
  // push new systems toward safer substitutes.
  const visibleDemand = clamp01(0.2 + urbanShare * 0.65 + urbanPressure * 0.55);
  const knowledgeBrake = recognised ? (1 - regulation * 0.95) : 1;
  const desiredCoverage = visibleDemand * knowledgeBrake;

  if (desiredCoverage > plumbing.coverage && availableLead > 0) {
    const unconstrainedGrowth = (desiredCoverage - plumbing.coverage) *
      (1 - Math.exp(-Math.max(0, elapsedYears) / 8));
    const leadNeededAtFullCoverage = Math.max(8, (region.population || 0) / 900);
    const affordableGrowth = availableLead / Math.max(1, leadNeededAtFullCoverage);
    const growth = Math.max(0, Math.min(unconstrainedGrowth, affordableGrowth));
    if (growth > 0) {
      const leadUsed = growth * leadNeededAtFullCoverage;
      plumbing.coverage = clamp01(plumbing.coverage + growth);
      plumbing.installedLead += leadUsed;
      region.stockpile.lead = Math.max(0, availableLead - leadUsed);
    }
  } else if (recognised && plumbing.coverage > desiredCoverage) {
    // Replacement is slow: knowing something is harmful does not make an
    // installed urban network vanish. Strong regulation gradually retires it.
    const retirement = (plumbing.coverage - desiredCoverage) *
      (1 - Math.exp(-Math.max(0, elapsedYears) / 18));
    plumbing.coverage = Math.max(desiredCoverage, plumbing.coverage - retirement);
  }
  return plumbing;
}

export function leadPlumbingStatus(region) {
  const e = ensureExternalities(region);
  const plumbing = e.adoption.leadPlumbing;
  return {
    coverage: clamp01(plumbing.coverage),
    installedLead: Math.max(0, plumbing.installedLead || 0),
    // This is a visible engineering benefit and is safe to show before toxicity
    // is recognised. The causal health cost is intentionally omitted here.
    waterCapacityBonus: clamp01(plumbing.coverage) * 9000,
  };
}

function leadExposureFromCurrentEconomy(region) {
  const mined = Math.max(0, region.report?.mining?.resources?.lead || region.report?.mining?.lead || 0);
  const urbanShare = region.urbanisation?.urbanShare || 0;
  const plumbingCoverage = leadPlumbingStatus(region).coverage;
  // Mining/smelting is the high-risk source. Plumbing adds broad but usually
  // lower-intensity chronic exposure; hard-water/passivation and continuous
  // flow are abstracted by keeping this coefficient modest rather than treating
  // every lead pipe as an acute poisoning event.
  return mined * 0.0008 + plumbingCoverage * urbanShare * 0.12;
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

  tickLeadPlumbingAdoption(region, years);
  const leadExposure = leadExposureFromCurrentEconomy(region);
  if (leadExposure > 0) addHazardExposure(region, 'lead', leadExposure, 'lead use and processing');

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
