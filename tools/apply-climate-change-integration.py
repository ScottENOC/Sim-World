#!/usr/bin/env python3
from pathlib import Path


def replace_once_if_present(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        return False
    p.write_text(text.replace(old, new, 1))
    return True


def ensure_once(path, marker, anchor, insertion):
    p = Path(path)
    text = p.read_text()
    if marker in text:
        return False
    if anchor not in text:
        raise RuntimeError(f'missing patch anchor in {path}: {anchor[:100]!r}')
    p.write_text(text.replace(anchor, insertion, 1))
    return True

# Climate physics runs before hydrology and economy so this tick's rainfall /
# evaporation state affects rivers and agricultural weather immediately. Fossil
# emissions come from the previous completed industrial operating tick.
ensure_once(
    'js/main.js',
    "tickClimateChange",
    "import { initialiseHydrology, tickActiveHydrology } from './world/hydrology.js?v=20260914-water2';\n",
    "import { initialiseHydrology, tickActiveHydrology } from './world/hydrology.js?v=20260914-water2';\n"
    "import { tickClimateChange } from './world/climateChange.js?v=20260914-climate1';\n",
)
ensure_once(
    'js/main.js',
    "profiler.measure('Climate change'",
    "    const waterEvents = profiler.measure('Hydrology', () => tickActiveHydrology(regions, time.endDay, time.elapsedDays));",
    "    const climateEvents = profiler.measure('Climate change', () => tickClimateChange(regions, calendarWeek, time.elapsedDays, Math.random));\n"
    "    const waterEvents = profiler.measure('Hydrology', () => tickActiveHydrology(regions, time.endDay, time.elapsedDays));",
)
# Climate-science breakthroughs should use the normal player event queue, but the
# underlying carbon/temperature state remains invisible unless knowledge warrants it.
ensure_once(
    'js/main.js',
    "...climateEvents.filter((event) => event.regionId === playerRegionId)",
    "      ...protoIndustryEvents.filter((event) => event.regionId === playerRegionId),\n",
    "      ...protoIndustryEvents.filter((event) => event.regionId === playerRegionId),\n"
    "      ...climateEvents.filter((event) => event.regionId === playerRegionId),\n",
)

# Weather variability and drought baseline respond to the slowly moving climate
# state, while the existing short-term weather memory/noise remains intact.
weather_path = Path('js/world/weather.js')
weather = weather_path.read_text()
if 'climateExtreme' not in weather:
    old = """  const rawById = new Map();
  for (const region of regions) {
    const regional = cellsThisWeek.get(cellId(region)) || 0;
    rawById.set(region.id, clamp(world.global * 0.35 + regional * 0.65 + centredNoise(rng) * 0.08, -1.8, 1.8));
  }
"""
    new = """  const rawById = new Map();
  for (const region of regions) {
    const regional = cellsThisWeek.get(cellId(region)) || 0;
    const climateExtreme = clamp(region.climate?.extremeWeatherMultiplier ?? 1, 1, 2.4);
    const rainfall = clamp(region.climate?.rainfallMultiplier ?? 1, 0.55, 1.25);
    const evaporation = clamp(region.climate?.evaporationMultiplier ?? 1, 0.8, 1.8);
    const climateShift = clamp((rainfall - 1) * 2.0 - (evaporation - 1) * 0.7, -0.9, 0.45);
    rawById.set(region.id, clamp(world.global * 0.35 + regional * 0.65 +
      centredNoise(rng) * 0.08 * climateExtreme + climateShift, -2.4, 2.2));
  }
"""
    if old not in weather:
        raise RuntimeError('missing climate weather raw-index anchor')
    weather = weather.replace(old, new, 1)

if 'heatPenalty' not in weather:
    old = """    const index = clamp(rawById.get(region.id) * 0.65 + neighbourMean * 0.35, -1.8, 1.8);
    const yieldMultiplier = clamp(1 + index * 0.20, 0.65, 1.35);
"""
    new = """    const index = clamp(rawById.get(region.id) * 0.65 + neighbourMean * 0.35, -2.4, 2.2);
    const heatPenalty = Math.max(0, (region.climate?.temperatureAnomalyC || 0) - 1.5) * 0.025;
    const yieldMultiplier = clamp(1 + index * 0.20 - heatPenalty, 0.52, 1.35);
"""
    if old not in weather:
        raise RuntimeError('missing climate weather yield anchor')
    weather = weather.replace(old, new, 1)
weather_path.write_text(weather)

# Coastal inundation creates an ordinary migration pressure, using the same
# bounded destination knowledge and culture/religion migration machinery as famine.
demo_path = Path('js/society/demographics.js')
demo = demo_path.read_text()
if 'applyClimateDisplacement' not in demo:
    old = """  measureDetail('Demographics: famine and migration', () => { for (const region of regions) { if ((region.stockpile?.food||0)<-0.5) famineRegions++; applyFamineResponse(region, regionsById, religiousWorld, elapsedDays); } });
  measureDetail('Demographics: culture', () => tickCulture(regions, elapsedDays));
"""
    new = """  measureDetail('Demographics: famine and migration', () => { for (const region of regions) { if ((region.stockpile?.food||0)<-0.5) famineRegions++; applyFamineResponse(region, regionsById, religiousWorld, elapsedDays); } });
  measureDetail('Demographics: climate displacement', () => { for (const region of regions) applyClimateDisplacement(region, regionsById, religiousWorld, elapsedDays); });
  measureDetail('Demographics: culture', () => tickCulture(regions, elapsedDays));
"""
    if old not in demo:
        raise RuntimeError('missing demographics climate-displacement tick anchor')
    demo = demo.replace(old, new, 1)

    anchor = """export function removeFromBands(region, count) {
"""
    helper = """function applyClimateDisplacement(region, regionsById, religiousWorld, elapsedDays) {
  const pressure = clamp01(region.climate?.coastalDisplacementPressure || 0);
  if (pressure <= 0.001 || region.population <= 0) return;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const desiredEmigrants = Math.min(region.population * 0.08 * years,
    region.population * pressure * 0.025 * years);
  if (desiredEmigrants < 5) return;
  const destinations = chooseEmigrationDestinations(region, regionsById, desiredEmigrants);
  const moved = destinations.reduce((sum, route) => sum + route.count, 0);
  if (moved <= 0) return;
  removeFromBands(region, moved);
  for (const { dest, count } of destinations) {
    migrateReligion(region, dest, count, religiousWorld);
    addToBands(dest, count);
    migrateCulture(region, dest, count);
  }
  region.climate.coastalMigrants = (region.climate.coastalMigrants || 0) + moved;
  syncPopulation(region);
}

export function removeFromBands(region, count) {
"""
    if anchor not in demo:
        raise RuntimeError('missing demographics helper anchor')
    demo = demo.replace(anchor, helper, 1)
demo_path.write_text(demo)

print('climate change integration applied')
