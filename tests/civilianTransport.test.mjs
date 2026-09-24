import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ensureCivilianTransport,
  automobileOwnershipPer1000,
  seedAutomobileOwnership,
} from '../js/economy/civilianTransport.js';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';
import { restoreGameSnapshot } from '../js/core/saveGame.js';

{
  const region = { id: 'state-test', population: 2_000, civilianTransport: { automobiles: 1_000 } };
  assert.equal(automobileOwnershipPer1000(region), 500, 'ownership rate should derive from actual automobile stock');
  region.civilianTransport.automobiles = -12;
  ensureCivilianTransport(region);
  assert.equal(region.civilianTransport.automobiles, 0, 'negative automobile stocks must clamp to zero');
  region.civilianTransport.automobiles = Number.NaN;
  ensureCivilianTransport(region);
  assert.equal(region.civilianTransport.automobiles, 0, 'non-finite automobile stocks must normalise to zero');
}

{
  const region = { id: 'seed-test', population: 10_000 };
  const seeded = seedAutomobileOwnership(region, 350, { scenarioBaseline: true, source: 'test' });
  assert.equal(seeded.seeded, true);
  assert.equal(region.civilianTransport.automobiles, 3_500);
  assert.equal(region.civilianTransport.automobileOwnershipSource, 'test');
  assert.equal(region.scenarioAutomobileBaselineApplied, true);
  const second = seedAutomobileOwnership(region, 900, { scenarioBaseline: true });
  assert.equal(second.seeded, false, 'scenario baseline must not reset ownership if startup logic runs twice');
  assert.equal(region.civilianTransport.automobiles, 3_500);
}

{
  const profile = JSON.parse(readFileSync(new URL('../data/scenarios/fractured-2027/modern-start.json', import.meta.url), 'utf8'));
  const makeRegion = (id, country) => ({
    id,
    name: id,
    scenarioCountryId: country,
    governance: { sovereignPolityName: country },
    population: 100,
    unlockedTechIds: new Set(),
    electricity: {},
    structuralTransformation: { capability: {} },
    industrialSupply: { capability: {}, inventory: {} },
    industrialPlants: { componentCapability: {} },
    stockpile: {},
    army: { personnel: 0, away: 0 },
  });
  const australia = makeRegion('australia-state-test', 'australia');
  const madagascar = makeRegion('madagascar-state-test', 'madagascar');
  const world = { regions: [australia, madagascar], scenarioState: { id: 'fractured-2027' } };
  applyModernScenarioBaseline(world, profile);
  assert.equal(australia.population, 28_000_000);
  assert.equal(australia.civilianTransport.automobiles, 21_840_000, 'Australia should use its 780-per-1000 scenario calibration');
  assert.equal(madagascar.population, 32_000_000);
  assert.equal(madagascar.civilianTransport.automobiles, 800_000, 'Madagascar should use its lower scenario calibration');
  assert.equal(world.scenarioModernBaseline.automobileRegions, 2);
}

{
  const profile = {
    scenarioId: 'override-test',
    countryPopulationTargets: { testland: 1_000 },
    regionalDefaults: { automobilesPer1000: 100 },
    regionalAutomobilesPer1000: { capital: 700 },
  };
  const capital = {
    id: 'capital', name: 'Capital', scenarioCountryId: 'testland', population: 10,
    unlockedTechIds: new Set(), electricity: {}, structuralTransformation: { capability: {} },
    industrialSupply: { capability: {}, inventory: {} }, industrialPlants: { componentCapability: {} },
    stockpile: {}, army: { personnel: 0, away: 0 },
  };
  applyModernScenarioBaseline({ regions: [capital], scenarioState: { id: 'override-test' } }, profile);
  assert.equal(capital.civilianTransport.automobiles, 700, 'regional car-ownership overrides should take precedence over country/default settings');
  assert.equal(capital.civilianTransport.automobileOwnershipSource, 'regional_override');
}

{
  const region = {
    id: 'legacy-region', name: 'Legacy', feature: null, centroid: [0, 0], areaSqKm: 1, neighbors: [], terrain: {},
    knowledge: {
      ownerId: 'legacy-region', observations: [], knownSubjectIds: new Set(), directContactIds: new Set(),
      _observationByStream: new Map(),
    },
  };
  const legacySnapshot = {
    format: 'worldsim-save', version: 1, savedAt: '2026-01-01T00:00:00.000Z', worldRegionIds: ['legacy-region'],
    playerRegionId: 'legacy-region', playerPolityId: null,
    clock: { tickIndex: 0, elapsedDays: 0, resolution: 'month', speed: 0, resumeSpeed: 1, estimatedTickMs: null },
    fogOfWar: { devMode: false },
    regions: [{
      id: 'legacy-region',
      state: {
        knowledge: {
          ownerId: 'legacy-region', observations: [],
          knownSubjectIds: { __worldsimType: 'Set', values: [] },
          directContactIds: { __worldsimType: 'Set', values: [] },
          _observationByStream: { __worldsimType: 'Map', entries: [] },
        },
      },
    }],
    polities: [], seaRegions: [], agreements: [], activeRaids: [], activeCampaigns: [], activeWars: [], fleets: [], internationalOrganisations: [],
  };
  const clock = {
    stop() {}, setResolution(id) { this.resolution = { id }; },
    _applySpeed(speed) { this.speed = speed; },
  };
  const fogOfWar = { setPlayerRegion() {}, setDevMode() {} };
  restoreGameSnapshot(legacySnapshot, {
    regions: [region], seaRegions: [], polities: [], religiousWorld: null,
    agreements: [], activeRaids: [], activeCampaigns: [], activeWars: [], fleets: [], internationalOrganisations: [],
    clock, fogOfWar,
  });
  assert.deepEqual(region.civilianTransport, { automobiles: 0 }, 'pre-feature saves should migrate to a valid zero-automobile stock');
}

console.log('Civilian transport state regressions passed.');
