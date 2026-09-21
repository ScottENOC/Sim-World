import { nuclearWinterEffects } from './nuclearWinter.js?v=20260922-nuclear-winter1';

// Weekly agricultural weather with both spatial and temporal memory. Broad
// systems affect the whole simulated world, four-degree cells share regional
// conditions, and direct neighbours smooth cell-boundary discontinuities.

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function centredNoise(rng) {
  return (rng() + rng() + rng()) - 1.5;
}

function cellId(region) {
  const [lon = 0, lat = 0] = region.centroid || [];
  return `${Math.floor((lon + 180) / 4)}:${Math.floor((lat + 90) / 4)}`;
}

export function seasonalFarmMultiplier(region, currentDay) {
  if (currentDay === null || currentDay === undefined) return 1;
  const latitude = region.centroid?.[1] || 0;
  const amplitude = Math.min(0.35, 0.03 + Math.abs(latitude) * 0.004);
  const dayOfYear = ((currentDay % 365.2425) + 365.2425) % 365.2425;
  const peakDay = latitude < 0 ? 56 : 238;
  return 1 + amplitude * Math.cos(2 * Math.PI * (dayOfYear - peakDay) / 365.2425);
}

export function tickWeather(regions, currentDay, rng = Math.random, elapsedDays = 7) {
  if (currentDay === null || currentDay === undefined) {
    for (const region of regions) {
      const winter=nuclearWinterEffects(region);
      region.weather = { index: 0, yieldMultiplier: winter.outdoorYieldMultiplier,
        seasonalMultiplier: 1, condition: winter.soot>0.02?'nuclear winter':'normal', nuclearWinter:winter };
    }
    return;
  }

  if (!regions._weatherWorld) regions._weatherWorld = { global: 0, cells: new Map() };
  const world = regions._weatherWorld;
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const globalMemory = Math.pow(0.96, weekScale);
  world.global = clamp(world.global * globalMemory + centredNoise(rng) * 0.16 * Math.sqrt(weekScale), -1.5, 1.5);

  const cellsThisWeek = new Map();
  for (const region of regions) {
    const id = cellId(region);
    if (cellsThisWeek.has(id)) continue;
    const previous = world.cells.get(id) || 0;
    const cellMemory = Math.pow(0.90, weekScale);
    const next = clamp(previous * cellMemory + centredNoise(rng) * 0.24 * Math.sqrt(weekScale) + world.global * 0.04, -1.8, 1.8);
    cellsThisWeek.set(id, next);
  }
  world.cells = cellsThisWeek;

  const rawById = new Map();
  for (const region of regions) {
    const regional = cellsThisWeek.get(cellId(region)) || 0;
    const climateExtreme = clamp(region.climate?.extremeWeatherMultiplier ?? 1, 1, 2.4);
    const rainfall = clamp(region.climate?.rainfallMultiplier ?? 1, 0.55, 1.25);
    const evaporation = clamp(region.climate?.evaporationMultiplier ?? 1, 0.8, 1.8);
    const climateShift = clamp((rainfall - 1) * 2.0 - (evaporation - 1) * 0.7, -0.9, 0.45);
    rawById.set(region.id, clamp(world.global * 0.35 + regional * 0.65 +
      centredNoise(rng) * 0.08 * climateExtreme + climateShift, -2.4, 2.2));
  }
  for (const region of regions) {
    const neighbours = (region.neighbors || []).map((id) => rawById.get(id)).filter(Number.isFinite);
    const neighbourMean = neighbours.length
      ? neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length
      : rawById.get(region.id);
    const index = clamp(rawById.get(region.id) * 0.65 + neighbourMean * 0.35, -2.4, 2.2);
    const winter=nuclearWinterEffects(region);
    const effectiveTemperature=(region.climate?.temperatureAnomalyC||0)+winter.coolingC;
    const heatPenalty = Math.max(0, effectiveTemperature - 1.5) * 0.025;
    const coldPenalty = Math.max(0, -effectiveTemperature - 1.0) * 0.035;
    const normalWeatherYield=clamp(1 + index * 0.20 - heatPenalty - coldPenalty, 0.52, 1.35);
    const yieldMultiplier = clamp(normalWeatherYield*winter.outdoorYieldMultiplier,0.18,1.35);
    const condition = winter.soot>0.12?'severe nuclear winter':winter.soot>0.02?'nuclear winter':index <= -0.75 ? 'drought' : index <= -0.3 ? 'dry'
      : index >= 0.75 ? 'exceptionally wet' : index >= 0.3 ? 'wet' : 'normal';
    region.weather = { index, yieldMultiplier,
      seasonalMultiplier: seasonalFarmMultiplier(region, currentDay), condition, nuclearWinter:winter };
  }
}
