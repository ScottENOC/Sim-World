import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  availableResourceIds,
  finalizeResourceFlowTick,
  installResourceFlowTracking,
  resourceMetricValue,
  resourceQuantity,
  withResourceFlowSuppressed,
} from '../js/economy/resourceFlow.js';
import { sourceModernConstructionSupplies } from '../js/economy/modernDomesticConstructionSupply.js';

{
  const region = {
    id: 'flow-test',
    stockpile: { wood: 10 },
    industrialSupply: { inventory: { machine_components: 3 } },
  };
  installResourceFlowTracking([region]);
  region.stockpile.wood += 15;
  region.stockpile.wood -= 4;
  region.industrialSupply.inventory.machine_components += 2;
  finalizeResourceFlowTick([region], 1, 7);

  assert.equal(resourceQuantity(region, 'wood'), 21);
  assert.equal(resourceQuantity(region, 'machine_components'), 5);
  assert.equal(resourceMetricValue(region, 'wood', 'production'), 15);
  assert.equal(resourceMetricValue(region, 'wood', 'consumption'), 4);
  assert.equal(resourceMetricValue(region, 'wood', 'net'), 11);
  assert.equal(resourceMetricValue(region, 'wood', 'stockpiled'), 21);
  assert.ok(availableResourceIds([region]).includes('machine_components'), 'manufactured industrial inventory should appear in the resource catalogue');
}

{
  const region = { id: 'suppression-test', stockpile: { stone: 20 }, industrialSupply: { inventory: {} } };
  installResourceFlowTracking([region]);
  withResourceFlowSuppressed(() => { region.stockpile.stone += 10; });
  finalizeResourceFlowTick([region], 1, 1);
  assert.equal(resourceMetricValue(region, 'stone', 'production'), 0, 'internal domestic transfers should be suppressible from production accounting');
}

{
  const kent = {
    id: 'kent', scenarioCountryId: 'united-kingdom', scenarioModernBaselineApplied: true,
    stockpile: { stone: 0, wood: 0 },
    construction: { projects: [{
      id: 7, status: 'active', typeId: 'harbour',
      materialsRequired: { stone: 800, wood: 600 },
      materialsUsed: { stone: 0, wood: 0 },
    }] },
  };
  const yorkshire = {
    id: 'yorkshire', scenarioCountryId: 'united-kingdom', scenarioModernBaselineApplied: true,
    stockpile: { stone: 1000, wood: 1000 }, construction: { projects: [] },
  };
  const france = {
    id: 'france-test', scenarioCountryId: 'france', scenarioModernBaselineApplied: true,
    stockpile: { stone: 5000, wood: 5000 }, construction: { projects: [] },
  };
  const result = sourceModernConstructionSupplies(kent, [kent, yorkshire, france]);
  assert.equal(result.projectId, 7);
  assert.equal(result.supplied.stone, 40, 'modern domestic procurement should buffer 5% of the harbour stone requirement');
  assert.equal(result.supplied.wood, 30, 'modern domestic procurement should buffer 5% of the harbour wood requirement');
  assert.equal(kent.stockpile.stone, 40);
  assert.equal(kent.stockpile.wood, 30);
  assert.equal(yorkshire.stockpile.stone, 960);
  assert.equal(yorkshire.stockpile.wood, 970);
  assert.equal(france.stockpile.stone, 5000, 'foreign stockpiles must not be requisitioned');
  assert.equal(france.stockpile.wood, 5000);
  assert.equal(kent.construction.projects[0].domesticSupply.cumulative.stone, 40);
}

{
  const ancient = {
    id: 'ancient-target', scenarioCountryId: 'ancient-kingdom', stockpile: { stone: 0 },
    construction: { projects: [{ id: 1, status: 'active', materialsRequired: { stone: 100 }, materialsUsed: { stone: 0 } }] },
  };
  const donor = { id: 'ancient-donor', scenarioCountryId: 'ancient-kingdom', stockpile: { stone: 1000 }, construction: { projects: [] } };
  const result = sourceModernConstructionSupplies(ancient, [ancient, donor]);
  assert.equal(result.total, 0, 'Bronze Age and other non-modern states must not gain free national logistics');
  assert.equal(ancient.stockpile.stone, 0);
}

{
  const source = readFileSync(new URL('../js/ui/resourceOverlayUi.js', import.meta.url), 'utf8');
  const flowSource = readFileSync(new URL('../js/economy/resourceFlow.js', import.meta.url), 'utf8');
  for (const label of ['Stockpiled', 'Production', 'Consumption', 'Net production']) {
    assert.match(source, new RegExp(label), `resource overlay should expose ${label}`);
  }
  assert.match(source, /id="resource-overlay-resource"/, 'resource overlay should expose a resource dropdown');
  assert.match(flowSource, /industrialSupply\?\.inventory/, 'resource catalogue should include manufactured industrial inventory');
  assert.match(source, /visualOverlay: 'resource'/, 'resource overlay should use the shared map layer renderer');
}

console.log('Resource overlay and modern domestic construction supply regressions passed.');
