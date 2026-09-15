import assert from 'node:assert/strict';
import {
  availableResidentHousing,
  enforceHousingEmployment,
  ensureHousing,
  housingPopulationLimit,
  prepareHousingConstruction,
} from '../js/economy/housing.js';

function region(overrides = {}) {
  return {
    id: 'test',
    population: 1000,
    demographics: { workingAge: 600, children: 300, elderly: 100 },
    stockpile: { wood: 1000, stone: 1000, clay: 1000 },
    occupations: { farmer: 300, miner: 20, lumberjack: 10, smith: 20, general: 250 },
    ...overrides,
  };
}

const r = region();
const housing = ensureHousing(r);
assert.ok(housing.residentCapacity >= r.population, 'existing population must be housed on bootstrap');
assert.ok(housing.jobCapacity.mining >= 20, 'existing miners must be housed on bootstrap');
assert.ok(availableResidentHousing(r) > 0, 'bootstrap should retain a small save-compatible vacancy margin');

const previous = { ...r.occupations };
r.occupations.miner = 80;
const gate = enforceHousingEmployment(r, previous);
assert.ok(gate.blockedTotal > 0, 'mining expansion without mining-site housing must be blocked');
assert.ok(r.occupations.miner < 80, 'blocked miners must not remain assigned');
assert.ok(housing.pendingJobCapacity.mining > 0, 'blocked mining jobs must create mining-housing demand');

const oldMiningCapacity = housing.jobCapacity.mining;
const oldWood = r.stockpile.wood;
const oldStone = r.stockpile.stone;
const build = prepareHousingConstruction(r, 30);
assert.ok(build.workers > 0, 'housing shortage must create a housing-construction job');
assert.ok(build.capacityBuilt > 0, 'housing builders must add capacity');
assert.ok(housing.jobCapacity.mining > oldMiningCapacity, 'new mining housing must expand mining worker capacity');
assert.ok(r.stockpile.wood < oldWood, 'housing construction must consume wood');
assert.ok(r.stockpile.stone < oldStone, 'housing construction must consume stone or clay');

const farmCapacity = housing.jobCapacity.farm;
const miningCapacity = housing.jobCapacity.mining;
assert.ok(farmCapacity !== miningCapacity, 'resource-site housing must remain location-specific');
assert.equal(housingPopulationLimit(r), housing.residentCapacity, 'population ceiling must be the physical housing stock');

console.log(JSON.stringify({
  residentCapacity: housing.residentCapacity,
  miningCapacityBefore: oldMiningCapacity,
  miningCapacityAfter: housing.jobCapacity.mining,
  blockedWorkers: gate.blockedTotal,
  builders: build.workers,
  built: build.capacityBuilt,
}, null, 2));
