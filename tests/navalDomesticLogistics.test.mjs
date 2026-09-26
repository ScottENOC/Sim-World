import assert from 'node:assert/strict';
import { sourceModernNavalSupplies } from '../js/economy/modernDomesticNavalSupply.js';

function region(id, country, { modern = true, stockpile = {}, machine = 0 } = {}) {
  return {
    id,
    name: id,
    scenarioCountryId: country,
    scenarioModernBaselineApplied: modern,
    stockpile: { ...stockpile },
    industrialSupply: {
      inventory: { machine_components: machine },
      capability: {},
    },
    industrialPlants: { componentCapability: {} },
    unlockedTechIds: new Set(),
    earlyModernMilitary: { naval: { readiness: 0.8 } },
    navalProcurement: { targets: {}, built: {} },
  };
}

const kent = region('kent', 'uk', { stockpile: { steel: 0, wood: 0, coal: 0 }, machine: 0 });
kent.navalProcurement.targets.steel_warship = 1;

const yorkshire = region('yorkshire', 'uk', {
  stockpile: { steel: 1000, wood: 1000, coal: 500 },
  machine: 100,
});
const france = region('normandy', 'fr', {
  stockpile: { steel: 5000, wood: 5000, coal: 5000 },
  machine: 5000,
});

const result = sourceModernNavalSupplies(kent, [kent, yorkshire, france]);

assert.ok(result.total > 0, 'a modern naval order should source domestic inputs');
assert.ok(kent.stockpile.steel > 0, 'steel should move from another UK region to Kent');
assert.ok(kent.stockpile.wood > 0, 'wood should move from another UK region to Kent');
assert.ok(kent.stockpile.coal > 0, 'fuel should move from another UK region to Kent');
assert.ok(kent.industrialSupply.inventory.machine_components > 0, 'machine components should move into Kent');
assert.ok(yorkshire.stockpile.steel < 1000, 'the UK donor stock should actually be consumed by the transfer');
assert.equal(france.stockpile.steel, 5000, 'foreign resources must not be requisitioned by domestic naval logistics');
assert.equal(france.industrialSupply.inventory.machine_components, 5000, 'foreign machine components must remain untouched');
assert.ok(yorkshire.stockpile.steel >= 100, 'the donor should retain at least the configured ten-percent reserve');
assert.ok(result.lastTransfers.some((entry) => entry.donorRegionId === 'yorkshire' && entry.resourceId === 'steel'), 'transfer provenance should be recorded for the UI');
assert.ok(result.diagnostics[0].inputs.some((entry) => entry.resourceId === 'steel' && entry.domestic >= entry.local), 'diagnostics should expose local and domestic availability');

const steelAfterFirstPass = kent.stockpile.steel;
sourceModernNavalSupplies(kent, [kent, yorkshire, france]);
assert.equal(kent.stockpile.steel, steelAfterFirstPass, 'a filled logistics buffer should not repeatedly drain donors');

const ancient = region('ancient-port', 'ancient', { modern: false, stockpile: { wood: 0 } });
ancient.navalProcurement.targets.basic_war_boat = 1;
const ancientDonor = region('ancient-donor', 'ancient', { modern: false, stockpile: { wood: 1000 } });
sourceModernNavalSupplies(ancient, [ancient, ancientDonor]);
assert.equal(ancient.stockpile.wood, 0, 'pre-modern states should not gain automatic national naval logistics');

console.log('naval domestic logistics regression passed');
