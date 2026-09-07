const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function operationalScale(region, typeId) {
  return (region.construction?.assets || []).reduce((sum, asset) => {
    if (asset.typeId !== typeId) return sum;
    const condition = clamp01(asset.condition ?? 1);
    return sum + condition * Math.max(0.25, Number(asset.scale) || 1);
  }, 0);
}

export function ensureUrbanisation(region) {
  if (!region.urbanisation) region.urbanisation = {};
  if (!Number.isFinite(region.urbanisation.urbanPopulation)) {
    region.urbanisation.urbanPopulation = Math.max(0, (region.population || 0) * 0.08);
  }
  if (!Number.isFinite(region.urbanisation.urbanCapacity)) region.urbanisation.urbanCapacity = 0;
  if (!region.urbanisation.limitingFactor) region.urbanisation.limitingFactor = 'settlement scale';
  return region.urbanisation;
}

export function urbanCapacity(region) {
  const population = Math.max(0, region.population || 0);
  const wells = operationalScale(region, 'wells_cisterns');
  const irrigation = operationalScale(region, 'irrigation');
  const aqueduct = operationalScale(region, 'aqueduct');
  const leadWaterworks = operationalScale(region, 'lead_waterworks');
  const granary = operationalScale(region, 'public_granary');
  const market = operationalScale(region, 'market_customs');
  const admin = operationalScale(region, 'administrative_centre');
  const harbour = operationalScale(region, 'harbour');

  const waterCapacity = 1800 + wells * 5500 + aqueduct * 18000 + leadWaterworks * 8500;
  const foodCapacity = 2200 + granary * 8000 + irrigation * 3500 + Math.max(0, region.stockpile?.food || 0) * 0.025;
  const economicCapacity = 1500 + market * 8500 + admin * 7000 + harbour * 6000 +
    Math.max(0, region.occupations?.trader || 0) * 16 +
    Math.max(0, region.occupations?.smith || 0) * 12 +
    Math.max(0, region.occupations?.potter || 0) * 10;
  const settlementCapacity = Math.max(2500, population * 0.65);
  const values = [
    ['water', waterCapacity],
    ['food and storage', foodCapacity],
    ['urban employment', economicCapacity],
    ['settlement scale', settlementCapacity],
  ];
  values.sort((a, b) => a[1] - b[1]);
  return { capacity: Math.max(0, values[0][1]), limitingFactor: values[0][0], components: Object.fromEntries(values) };
}

export function tickUrbanisation(region, elapsedDays = 7) {
  const state = ensureUrbanisation(region);
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const { capacity, limitingFactor, components } = urbanCapacity(region);
  state.urbanCapacity = capacity;
  state.limitingFactor = limitingFactor;
  state.components = components;
  const population = Math.max(0, region.population || 0);
  const target = Math.min(population * 0.72, capacity);
  const adjustment = 1 - Math.pow(0.998, weekScale);
  state.urbanPopulation += (target - state.urbanPopulation) * adjustment;
  state.urbanPopulation = Math.max(0, Math.min(population, state.urbanPopulation));
  return state;
}

export function urbanFraction(region) {
  const state = ensureUrbanisation(region);
  return clamp01(state.urbanPopulation / Math.max(1, region.population || 1));
}
