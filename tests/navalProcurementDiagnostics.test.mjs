import assert from 'node:assert/strict';
import {
  effectiveWarshipBuildCost,
  navalProcurementDiagnostic,
  shipbuildingInputAvailable,
} from '../js/ui/navalProcurementDiagnostics.js';

function region(id, actor, stockpile = {}, machines = 0) {
  return {
    id,
    name: id,
    governance: { sovereignPolityId: actor },
    stockpile: { ...stockpile },
    industrialSupply: { inventory: { machine_components: machines } },
    navalProcurement: { targets: {}, built: {} },
    navalDesignCatalogue: {},
    report: { boatmaking: { workers: 0 } },
  };
}

{
  const kent = region('kent', 'uk', { steel: 100, coal: 100 }, 20);
  assert.equal(shipbuildingInputAvailable(kent, 'steel'), 100);
  assert.equal(shipbuildingInputAvailable(kent, 'machine'), 20);
  assert.deepEqual(effectiveWarshipBuildCost(kent, 'destroyer'), {
    steel: 150, coal: 42, machine: 46, gunpowder: 4,
  });
}

{
  const kent = region('kent', 'uk', { steel: 0, coal: 60, gunpowder: 8 }, 60);
  const london = region('london', 'uk', { steel: 900, coal: 500, gunpowder: 50 }, 400);
  const calais = region('calais', 'france', { steel: 5000 }, 5000);
  kent.navalProcurement.targets.destroyer = 1;
  kent.navalProcurement.built.destroyer = 0;
  const diagnostic = navalProcurementDiagnostic({ regions: [kent, london, calais] }, kent, 'destroyer');
  assert.match(diagnostic.blocker, /No local steel/);
  const steel = diagnostic.materials.find((item) => item.key === 'steel');
  assert.equal(steel.local, 0);
  assert.equal(steel.elsewhere, 900, 'same-polity stock should be visible as elsewhere in country');
  assert.equal(steel.polity, 900, 'foreign stock must not be counted as domestic supply');
}

{
  const kent = region('kent', 'uk', { steel: 300, coal: 100, gunpowder: 20 }, 100);
  kent.navalProcurement.targets.destroyer = 2;
  kent.navalProcurement.built.destroyer = 0.35;
  const diagnostic = navalProcurementDiagnostic({ regions: [kent] }, kent, 'destroyer');
  assert.equal(diagnostic.currentHullProgress, 0.35);
  assert.match(diagnostic.blocker, /No shipwright labour/);
  kent.report.boatmaking.workers = 25;
  assert.equal(navalProcurementDiagnostic({ regions: [kent] }, kent, 'destroyer').blocker, null);
}

{
  const kent = region('kent', 'uk', { steel: 1000, aluminium: 200, titanium: 100 }, 200);
  kent.navalDesignCatalogue.destroyer = [{ toolingReady: true, stats: {
    steelConstructionMultiplier: 0.91,
    systemInputs: { aluminium: 12, titanium: 3 },
  } }];
  const cost = effectiveWarshipBuildCost(kent, 'destroyer');
  assert.equal(cost.steel, 136.5);
  assert.equal(cost.aluminium, 12);
  assert.equal(cost.titanium, 3);
}

console.log('naval procurement diagnostics regression passed');
