import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLIMATE_CHANGE_SCIENCE_TECH_ID, climateKnowledgeView, ensureClimateWorld, tickClimateChange } from '../js/world/climateChange.js';

function region(id, lat = 30, coastal = false) {
  return {
    id,
    centroid: [0, lat],
    areaSqKm: 1000,
    neighbors: [],
    population: 100000,
    isCoastal: coastal,
    terrain: { plains: 0.7, hills: 0.15, mountains: 0.05, forest: 0.08, wetland: coastal ? 0.02 : 0 },
    forest: { currentStock: 500, K: 800 },
    protoIndustry: { coalHeatUse: 0 },
    unlockedTechIds: new Set(),
    educationLevel: 0.05,
    treasury: 10,
    wallet: 20,
    militaryFinance: { stateCapacity: 0.5 },
    tradePartnerIds: new Set(),
    recentTradePartners: new Map(),
  };
}

{
  const a = region('a', 28, true);
  const b = region('b', 55, false);
  const regions = [a, b];
  const world = ensureClimateWorld(regions);
  assert.equal(world.carbonBurdenIndex, 0);

  // Fossil combustion and forest loss both contribute to the same global burden.
  a.protoIndustry.coalHeatUse = 120000;
  a.forest.currentStock = 350;
  tickClimateChange(regions, 1, 365.2425, () => 1);
  assert.ok(world.fossilCarbonIndex > 0, 'coal burning must add global fossil forcing');
  assert.ok(world.landUseCarbonIndex > 0, 'net forest loss must add land-use forcing');
  assert.ok(world.carbonBurdenIndex > 0, 'global carbon burden must accumulate');
  assert.ok(world.temperatureAnomalyC > 0, 'forcing must create warming with thermal lag');
  assert.ok(a.climate.rainfallMultiplier < 1, 'subtropical regions should tend to dry as warming rises');
  assert.ok(a.climate.evaporationMultiplier > 1, 'warming must increase evaporation demand');
  assert.ok(a.climate.extremeWeatherMultiplier > 1, 'warming must increase weather extremes');

  // Sea level should respond much more slowly than temperature.
  const firstTemp = world.temperatureAnomalyC;
  const firstSea = world.seaLevelM;
  for (let y = 0; y < 80; y++) tickClimateChange(regions, 2 + y, 365.2425, () => 1);
  assert.ok(world.temperatureAnomalyC >= firstTemp);
  assert.ok(world.seaLevelM > firstSea, 'ocean/sea-level response must lag but accumulate');
  assert.ok(a.climate.coastalInundationPressure > 0, 'coastal low-lying proxies must face inundation pressure');
  assert.ok(a.climate.coastalDisplacementPressure >= 0, 'coastal pressure must resolve into pay-or-flee pressure');

  // Ancient rulers get observations, not an anachronistic atmospheric dashboard.
  const ancientView = climateKnowledgeView(a, world);
  assert.equal(ancientView.understood, false);
  assert.ok(ancientView.observations);
  assert.equal('carbonBurdenIndex' in ancientView, false);
  assert.equal('ppm' in ancientView, false);
}

{
  const isolated = region('isolated', 35, false);
  isolated.protoIndustry.coalHeatUse = 500000;
  const regions = [isolated];
  for (let y = 0; y < 20; y++) tickClimateChange(regions, y, 365.2425, () => 0);
  assert.equal(isolated.unlockedTechIds.has(CLIMATE_CHANGE_SCIENCE_TECH_ID), false,
    'strong climate change must not teach climate science to a society without scientific comprehension');
}

{
  const scientist = region('scientist', 35, true);
  scientist.educationLevel = 0.95;
  scientist.unlockedTechIds.add('weather_balloons'); // future observational technology hook
  scientist.unlockedTechIds.add('meteorological_networks');
  scientist.protoIndustry.coalHeatUse = 800000;
  const regions = [scientist];
  for (let y = 0; y < 12 && !scientist.unlockedTechIds.has(CLIMATE_CHANGE_SCIENCE_TECH_ID); y++) {
    tickClimateChange(regions, y, 365.2425, () => 0);
  }
  assert.equal(scientist.unlockedTechIds.has(CLIMATE_CHANGE_SCIENCE_TECH_ID), true,
    'adequate science plus a strong observable signal should permit the climate-change breakthrough');
  const scientificView = climateKnowledgeView(scientist, ensureClimateWorld(regions));
  assert.equal(scientificView.understood, true);
  assert.match(scientificView.attribution, /fossil-fuel combustion/);
}

const weather = fs.readFileSync('js/world/weather.js', 'utf8');
const hydrology = fs.readFileSync('js/world/hydrology.js', 'utf8');
const demographics = fs.readFileSync('js/society/demographics.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
assert.match(weather, /climateExtreme/, 'weather variability must consume the climate extreme multiplier');
assert.match(weather, /rainfallMultiplier/, 'weather drought baseline must consume climate rainfall change');
assert.match(hydrology, /climate\?\.rainfallMultiplier/, 'river runoff must consume climate rainfall change');
assert.match(hydrology, /climate\?\.evaporationMultiplier/, 'river runoff must consume climate evaporation change');
assert.match(demographics, /applyClimateDisplacement/, 'unprotected coastal inundation must feed migration');
assert.match(main, /Climate change/, 'climate must run in the main simulation tick');

console.log('climate change regressions passed');
