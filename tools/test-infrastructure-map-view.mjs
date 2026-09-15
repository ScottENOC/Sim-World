import assert from 'node:assert/strict';
import {
  buildInfrastructureIndex,
  infrastructureConditionClass,
  infrastructureDetail,
  infrastructureOwnershipClass,
  infrastructureSummary,
} from '../js/ui/infrastructureMapView.js';

const host = { id: 'host', name: 'Hostland' };
const foreign = { id: 'foreign', name: 'Foreignia' };
const regionA = { id: 'a', name: 'Alpha', corporateInfrastructure: { assets: [] } };
const regionB = { id: 'b', name: 'Beta', corporateInfrastructure: { assets: [] } };

const stateAsset = {
  id: 'state-port', type: 'port', hostPolityId: 'host', ownerPolityId: 'host', operatorPolityId: 'host',
  status: 'operational', condition: 0.92, effectiveCapacity: 0.84,
};
const privateAsset = {
  id: 'private-factory', type: 'factory', hostPolityId: 'host', ownerPolityId: 'host', operatorPolityId: 'host',
  ownerFirmId: 'firm-local', status: 'construction', progress: 0.4, condition: 1,
};
const concessionAsset = {
  id: 'foreign-grid', type: 'power_grid', hostPolityId: 'host', ownerPolityId: 'foreign', operatorPolityId: 'foreign',
  foreignOwner: true, concessionYears: 30, concessionYearsRemaining: 12.5, status: 'damaged', condition: 0.55,
  financedByPolityId: 'foreign', builtByPolityId: 'foreign', lastMaintenanceRatio: 0.7, lastOperatingRatio: 0.8,
};
regionA.corporateInfrastructure.assets.push(stateAsset, privateAsset, concessionAsset);
regionA.corporateCapital = { firms: [{ id: 'firm-local', name: 'Alpha Works' }] };

const railway = {
  id: 'host:rail:1', type: 'railway', hostPolityId: 'host', ownerPolityId: 'foreign', operatorPolityId: 'foreign',
  foreignOwner: true, concessionYears: 25, concessionYearsRemaining: 25, fromRegionId: 'a', toRegionId: 'b',
  status: 'crippled', condition: 0.22, capacity: 0.75, effectiveCapacity: 0.2,
};
host.railways = { lines: [railway] };
const sim = { regions: [regionA, regionB], polities: [host, foreign] };

assert.equal(infrastructureOwnershipClass(stateAsset), 'domestic_state');
assert.equal(infrastructureOwnershipClass(privateAsset), 'domestic_private');
assert.equal(infrastructureOwnershipClass(concessionAsset), 'foreign_concession');
assert.equal(infrastructureOwnershipClass({ ...concessionAsset, concessionYears: 0, concessionYearsRemaining: 0 }), 'foreign_owned');
assert.equal(infrastructureConditionClass(privateAsset), 'construction');
assert.equal(infrastructureConditionClass(concessionAsset), 'damaged');
assert.equal(infrastructureConditionClass(railway), 'crippled');

const index = buildInfrastructureIndex(sim);
assert.equal(index.get('a').length, 4, 'Alpha should include three facilities and the railway');
assert.equal(index.get('b').length, 1, 'Beta should include the shared railway endpoint');
assert.equal(index.get('b')[0].asset, railway);

const summary = infrastructureSummary(index.get('a'));
assert.equal(summary.total, 4);
assert.equal(summary.foreign, 2);
assert.equal(summary.construction, 1);
assert.equal(summary.degraded, 2);
assert.equal(summary.worstCondition, 0.22);

const detail = infrastructureDetail(index.get('a').find((entry) => entry.asset === concessionAsset), sim);
assert.equal(detail.name, 'Electricity grid');
assert.equal(detail.regionName, 'Alpha');
assert.equal(detail.owner, 'Foreignia');
assert.equal(detail.operator, 'Foreignia');
assert.equal(detail.ownershipLabel, 'Foreign concession');
assert.equal(detail.concessionYearsRemaining, 12.5);
assert.equal(detail.maintenanceRatio, 0.7);
assert.equal(detail.operatingRatio, 0.8);

const privateDetail = infrastructureDetail(index.get('a').find((entry) => entry.asset === privateAsset), sim);
assert.equal(privateDetail.owner, 'Alpha Works');
assert.equal(privateDetail.progress, 0.4);

console.log('Infrastructure map view tests passed');
