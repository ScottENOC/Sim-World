export const HAZARD_TYPES = Object.freeze({
  lead: {
    id: 'lead',
    name: 'Lead exposure',
    chronic: true,
    description: 'Cumulative exposure from lead plumbing, metalwork, glazing, pigments and contaminated water.',
  },
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function ensureEnvironmentalHazards(region) {
  if (!region.environmentalHazards) region.environmentalHazards = {};
  for (const hazardId of Object.keys(HAZARD_TYPES)) {
    const existing = region.environmentalHazards[hazardId] || {};
    region.environmentalHazards[hazardId] = {
      exposure: clamp01(existing.exposure),
      burden: clamp01(existing.burden),
      recognised: Boolean(existing.recognised),
      mitigation: clamp01(existing.mitigation),
      lastSourceStrength: Math.max(0, Number(existing.lastSourceStrength) || 0),
    };
  }
  return region.environmentalHazards;
}

function operationalCount(region, typeId) {
  const assets = region.construction?.assets || [];
  return assets.reduce((sum, asset) => {
    if (asset.typeId !== typeId) return sum;
    const condition = clamp01(asset.condition ?? 1);
    return sum + condition * Math.max(0.25, Number(asset.scale) || 1);
  }, 0);
}

export function leadSourceStrength(region) {
  const stockpile = Math.max(0, Number(region.stockpile?.lead) || 0);
  const aqueducts = operationalCount(region, 'aqueduct');
  const waterworks = operationalCount(region, 'lead_waterworks');
  const urbanFraction = clamp01(region.urbanisation?.urbanPopulation /
    Math.max(1, region.population || 1));

  // Merely mining/storing lead creates some occupational exposure. Deliberately
  // distributing water through lead-bearing systems creates the larger diffuse
  // population exposure that matters for public health.
  return Math.min(1,
    Math.min(0.12, stockpile / 25_000) +
    aqueducts * 0.035 +
    waterworks * (0.16 + urbanFraction * 0.20));
}

export function tickEnvironmentalHazards(region, elapsedDays = 7) {
  const hazards = ensureEnvironmentalHazards(region);
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const lead = hazards.lead;
  const source = leadSourceStrength(region) * (1 - lead.mitigation * 0.9);
  lead.lastSourceStrength = source;

  // Exposure changes relatively quickly as infrastructure is added or removed;
  // accumulated health burden changes more slowly and therefore outlasts the
  // original source. This intentionally lets apparently useful technologies
  // create a delayed externality rather than an instant red penalty.
  const exposureBlend = 1 - Math.pow(0.985, weekScale);
  lead.exposure += (source - lead.exposure) * exposureBlend;

  const burdenTarget = lead.exposure;
  const burdenBlend = 1 - Math.pow(0.9985, weekScale);
  lead.burden += (burdenTarget - lead.burden) * burdenBlend;
  lead.exposure = clamp01(lead.exposure);
  lead.burden = clamp01(lead.burden);
  return hazards;
}

export function leadHealthEffects(region) {
  const lead = ensureEnvironmentalHazards(region).lead;
  // Kept deliberately material but not apocalyptic: widespread lead exposure
  // should make a city less healthy and productive, not single-handedly topple
  // an empire. Later mitigation/medical systems can reduce these multipliers.
  return {
    mortalityMultiplier: 1 + lead.burden * 0.12,
    fertilityMultiplier: 1 - lead.burden * 0.08,
    productivityMultiplier: 1 - lead.burden * 0.055,
    childDevelopmentMultiplier: 1 - lead.burden * 0.10,
  };
}

export function recogniseHazard(region, hazardId) {
  const hazards = ensureEnvironmentalHazards(region);
  if (!hazards[hazardId]) return false;
  hazards[hazardId].recognised = true;
  return true;
}
