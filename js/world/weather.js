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

export function seasonalFarmMultiplier(region, currentTick) {
  if (currentTick === null || currentTick === undefined) return 1;
  const latitude = region.centroid?.[1] || 0;
  const amplitude = Math.min(0.35, 0.03 + Math.abs(latitude) * 0.004);
  const week = ((currentTick % 52) + 52) % 52;
  const peakWeek = latitude < 0 ? 8 : 34;
  return 1 + amplitude * Math.cos(2 * Math.PI * (week - peakWeek) / 52);
}

export function tickWeather(regions, currentTick, rng = Math.random) {
  if (currentTick === null || currentTick === undefined) {
    for (const region of regions) {
      region.weather = { index: 0, yieldMultiplier: 1,
        seasonalMultiplier: 1, condition: 'normal' };
    }
    return;
  }

  if (!regions._weatherWorld) regions._weatherWorld = { global: 0, cells: new Map() };
  const world = regions._weatherWorld;
  world.global = clamp(world.global * 0.96 + centredNoise(rng) * 0.16, -1.5, 1.5);

  const cellsThisWeek = new Map();
  for (const region of regions) {
    const id = cellId(region);
    if (cellsThisWeek.has(id)) continue;
    const previous = world.cells.get(id) || 0;
    const next = clamp(previous * 0.90 + centredNoise(rng) * 0.24 + world.global * 0.04, -1.8, 1.8);
    cellsThisWeek.set(id, next);
  }
  world.cells = cellsThisWeek;

  const rawById = new Map();
  for (const region of regions) {
    const regional = cellsThisWeek.get(cellId(region)) || 0;
    rawById.set(region.id, clamp(world.global * 0.35 + regional * 0.65 + centredNoise(rng) * 0.08, -1.8, 1.8));
  }
  for (const region of regions) {
    const neighbours = (region.neighbors || []).map((id) => rawById.get(id)).filter(Number.isFinite);
    const neighbourMean = neighbours.length
      ? neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length
      : rawById.get(region.id);
    const index = clamp(rawById.get(region.id) * 0.65 + neighbourMean * 0.35, -1.8, 1.8);
    const yieldMultiplier = clamp(1 + index * 0.20, 0.65, 1.35);
    const condition = index <= -0.75 ? 'drought' : index <= -0.3 ? 'dry'
      : index >= 0.75 ? 'exceptionally wet' : index >= 0.3 ? 'wet' : 'normal';
    region.weather = { index, yieldMultiplier,
      seasonalMultiplier: seasonalFarmMultiplier(region, currentTick), condition };
  }
}
