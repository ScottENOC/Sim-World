import assert from 'node:assert/strict';
import { PROCUREMENT_POLICIES, ensureIndustrialSupply, setInfrastructureProcurementPolicy, chooseInfrastructureSupplier, applyForeignSupplierExposure } from '../js/economy/industrialSupply.js';
import { planRailway, tickRailwayConstruction, tickRailwayOperations } from '../js/economy/railways.js';

function region(id, caps = {}) {
  const r = { id, population: 100000, stockpile: { coal: 10000 }, industrialSupply: { capability: { steelmaking: 0, precision_machining: 0, locomotive_engineering: 0, rail_vehicle_manufacture: 0, railway_engineering: 0, ...caps }, outputCapacity: { steel: 0, machine_components: 0, steam_locomotive: 0, rail_stock: 0 }, inventory: { steel: 10000 }, exposure: {} } };
  ensureIndustrialSupply(r);
  r.industrialSupply.outputCapacity = { steel: 1000 * (caps.steelmaking || 0), machine_components: 100 * (caps.precision_machining || 0), steam_locomotive: 20 * (caps.locomotive_engineering || 0), rail_stock: 100 * (caps.rail_vehicle_manufacture || 0) };
  return r;
}

const polity = { id: 'host' };
const domestic = region('domestic', { steelmaking: 0.25, precision_machining: 0.2, locomotive_engineering: 0.1, rail_vehicle_manufacture: 0.2, railway_engineering: 0.2 });
const foreign = region('foreign', { steelmaking: 1, precision_machining: 1, locomotive_engineering: 1, rail_vehicle_manufacture: 1, railway_engineering: 1 });
const end = region('end');

setInfrastructureProcurementPolicy(polity, PROCUREMENT_POLICIES.DOMESTIC_ONLY);
let supplier = chooseInfrastructureSupplier({ polity, domesticRegions: [domestic], foreignOffers: [{ region: foreign, polityId: 'foreign-state' }], requirements: { steel: 100, steam_locomotive: 2 } });
assert.equal(supplier.region.id, 'domestic', 'domestic-only policy must reject a superior foreign supplier');

setInfrastructureProcurementPolicy(polity, PROCUREMENT_POLICIES.BEST_AVAILABLE);
supplier = chooseInfrastructureSupplier({ polity, domesticRegions: [domestic], foreignOffers: [{ region: foreign, polityId: 'foreign-state', concessionYears: 40 }], requirements: { steel: 100, steam_locomotive: 2 } });
assert.equal(supplier.region.id, 'foreign', 'best-available policy should select materially superior foreign capability');

const before = domestic.industrialSupply.exposure.railway_engineering;
applyForeignSupplierExposure(domestic, foreign, 1);
assert.ok(domestic.industrialSupply.exposure.railway_engineering > before, 'foreign procurement should create learning exposure without copying capability instantly');
assert.ok(domestic.industrialSupply.capability.railway_engineering < foreign.industrialSupply.capability.railway_engineering);

const planned = planRailway({ polity, fromRegion: domestic, toRegion: end, lengthKm: 100, domesticRegions: [domestic], foreignOffers: [{ region: foreign, polityId: 'foreign-state', concessionYears: 40 }], concessionYears: 40 });
assert.equal(planned.feasible, true);
assert.equal(planned.line.foreignSupplier, true);
assert.equal(planned.line.hostOwnershipShare, 0);
assert.ok(planned.line.requirements.steel > 0 && planned.line.requirements.steam_locomotive > 0);

for (let i = 0; i < 600; i++) tickRailwayConstruction(planned.line, [domestic, end], foreign, 7);
assert.equal(planned.line.status, 'operational', 'capable supplier should eventually complete railway');
planned.line.utilisation = 1;
tickRailwayOperations(planned.line, [domestic, end], 365);
assert.ok(planned.line.effectiveCapacity > 0, 'coal and maintenance steel should allow railway operation');

domestic.stockpile.coal = 0; end.stockpile.coal = 0;
tickRailwayOperations(planned.line, [domestic, end], 365);
assert.equal(planned.line.effectiveCapacity, 0, 'steam railway should not operate without coal');

console.log('Industrial supply, procurement and railway regressions passed.');
