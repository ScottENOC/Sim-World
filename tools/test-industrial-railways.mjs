import assert from 'node:assert/strict';
import { PROCUREMENT_POLICIES, ensureIndustrialSupply, setInfrastructureProcurementPolicy, chooseInfrastructureSupplier, applyForeignSupplierExposure } from '../js/economy/industrialSupply.js';
import { RAIL_ELECTRIFICATION, planRailway, railwaySupportsTraction, tickRailwayConstruction, tickRailwayOperations } from '../js/economy/railways.js';

function region(id, caps = {}) {
  const r = {
    id,
    population: 100000,
    stockpile: { coal: 10000, diesel: 10000 },
    electricity: { industrialService: 1 },
    industrialSupply: { capability: { steelmaking: 0, precision_machining: 0, locomotive_engineering: 0, rail_vehicle_manufacture: 0, railway_engineering: 0, ...caps }, outputCapacity: {}, inventory: { steel: 10000 }, exposure: {} },
  };
  ensureIndustrialSupply(r);
  r.industrialSupply.outputCapacity = {
    steel: 1000 * (caps.steelmaking || 0),
    machine_components: 100 * (caps.precision_machining || 0),
    steam_locomotive: 20 * (caps.locomotive_engineering || 0),
    rail_stock: 100 * (caps.rail_vehicle_manufacture || 0),
  };
  return r;
}

const polity = { id: 'host' };
const domestic = region('domestic', { steelmaking: .25, precision_machining: .2, locomotive_engineering: .1, rail_vehicle_manufacture: .2, railway_engineering: .2 });
const foreign = region('foreign', { steelmaking: 1, precision_machining: 1, locomotive_engineering: 1, rail_vehicle_manufacture: 1, railway_engineering: 1 });
const end = region('end');
const demanding = { steel: 500, steam_locomotive: 10 };

setInfrastructureProcurementPolicy(polity, PROCUREMENT_POLICIES.DOMESTIC_ONLY);
let supplier = chooseInfrastructureSupplier({ polity, domesticRegions: [domestic], foreignOffers: [{ region: foreign, polityId: 'foreign-state' }], requirements: demanding });
assert.equal(supplier.region.id, 'domestic');
setInfrastructureProcurementPolicy(polity, PROCUREMENT_POLICIES.BEST_AVAILABLE);
supplier = chooseInfrastructureSupplier({ polity, domesticRegions: [domestic], foreignOffers: [{ region: foreign, polityId: 'foreign-state', concessionYears: 40 }], requirements: demanding });
assert.equal(supplier.region.id, 'foreign', 'best-available should select the supplier that can actually cover a demanding order');
const before = domestic.industrialSupply.exposure.railway_engineering;
applyForeignSupplierExposure(domestic, foreign, 1);
assert.ok(domestic.industrialSupply.exposure.railway_engineering > before);
assert.ok(domestic.industrialSupply.capability.railway_engineering < foreign.industrialSupply.capability.railway_engineering);

const planned = planRailway({ polity, fromRegion: domestic, toRegion: end, lengthKm: 100, domesticRegions: [domestic], foreignOffers: [{ region: foreign, polityId: 'foreign-state', concessionYears: 40 }], concessionYears: 40 });
assert.equal(planned.feasible, true);
assert.equal(planned.line.foreignSupplier, true);
assert.equal(planned.line.hostOwnershipShare, 0);
assert.ok(planned.line.requirements.steel > 0 && planned.line.requirements.steam_locomotive > 0);
assert.equal(planned.line.electrification, RAIL_ELECTRIFICATION.NONE, 'legacy/new default railway should remain unelectrified');
assert.equal(railwaySupportsTraction(planned.line, 'electric'), false);
for (let i = 0; i < 600; i++) tickRailwayConstruction(planned.line, [domestic, end], foreign, 7);
assert.equal(planned.line.status, 'operational');
planned.line.utilisation = 1;
tickRailwayOperations(planned.line, [domestic, end], 365);
assert.ok(planned.line.effectiveCapacity > 0);
domestic.stockpile.coal = 0;
end.stockpile.coal = 0;
tickRailwayOperations(planned.line, [domestic, end], 365);
assert.equal(planned.line.effectiveCapacity, 0, 'steam railway should stop without coal');

const dieselLine = planRailway({
  polity,
  fromRegion: domestic,
  toRegion: end,
  lengthKm: 80,
  domesticRegions: [foreign],
  rollingStock: { diesel: 1 },
  maxSpeedKph: 140,
});
assert.equal(dieselLine.feasible, true);
dieselLine.line.status = 'operational';
dieselLine.line.capacity = 1;
dieselLine.line.utilisation = 1;
domestic.stockpile.diesel = 1000;
end.stockpile.diesel = 1000;
const coalBeforeDiesel = domestic.stockpile.coal + end.stockpile.coal;
tickRailwayOperations(dieselLine.line, [domestic, end], 365);
assert.ok(dieselLine.line.energy.dieselUsed > 0, 'diesel traction should consume diesel');
assert.equal(dieselLine.line.energy.coalUsed, 0, 'diesel traction should not consume coal');
assert.equal(domestic.stockpile.coal + end.stockpile.coal, coalBeforeDiesel);

const electricLine = planRailway({
  polity,
  fromRegion: domestic,
  toRegion: end,
  lengthKm: 110,
  domesticRegions: [foreign],
  electrification: RAIL_ELECTRIFICATION.OVERHEAD_25KV_AC,
  maxSpeedKph: 300,
  rollingStock: { highSpeedElectric: 1 },
});
assert.equal(electricLine.feasible, true);
electricLine.line.status = 'operational';
electricLine.line.capacity = 1;
electricLine.line.utilisation = 1;
assert.equal(railwaySupportsTraction(electricLine.line, 'electric'), true);
domestic.electricity.industrialService = 1;
end.electricity.industrialService = 1;
tickRailwayOperations(electricLine.line, [domestic, end], 365);
assert.ok(electricLine.line.energy.electricityDemand > 0, 'electric railway should report electricity demand');
assert.equal(electricLine.line.energy.coalUsed, 0);
assert.equal(electricLine.line.energy.dieselUsed, 0);
assert.ok(electricLine.line.passengerCapacity > electricLine.line.freightCapacity, 'high-speed electric line should favour passenger throughput');
domestic.electricity.industrialService = 0;
end.electricity.industrialService = 0;
tickRailwayOperations(electricLine.line, [domestic, end], 365);
assert.equal(electricLine.line.effectiveCapacity, 0, 'electric-only line should stop when grid service is unavailable');

console.log('Industrial supply, procurement, railway traction and electrification regressions passed.');
