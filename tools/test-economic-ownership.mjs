import assert from 'node:assert/strict';
import {
  ECONOMIC_SECTORS,
  SECTOR_ACCESS,
  createStateEnterprise,
  economicOwnershipIndicators,
  ensureEconomicOwnershipPolicy,
  fundStateEnterprise,
  investmentAccess,
  setSectorOwnershipPolicy,
} from '../js/economy/economicOwnership.js';

const polity = { id: 'p1' };
const state = ensureEconomicOwnershipPolicy(polity);
assert.equal(Object.keys(state.sectors).length, ECONOMIC_SECTORS.length);
assert.equal(investmentAccess(polity, 'mining', { foreign: true }).allowed, true);

let result = setSectorOwnershipPolicy(polity, 'mining', { access: SECTOR_ACCESS.DOMESTIC_ONLY });
assert.equal(result.changed, true);
assert.equal(investmentAccess(polity, 'mining', { foreign: true }).allowed, false);
assert.equal(investmentAccess(polity, 'mining', { foreign: false }).allowed, true);

setSectorOwnershipPolicy(polity, 'rail', { access: SECTOR_ACCESS.STATE_MAJORITY });
assert.equal(investmentAccess(polity, 'rail', { foreign: false, proposedStateShare: 0.4 }).allowed, false);
assert.equal(investmentAccess(polity, 'rail', { foreign: false, proposedStateShare: 0.6 }).allowed, true);

setSectorOwnershipPolicy(polity, 'power_grid', { access: SECTOR_ACCESS.STATE_MONOPOLY });
assert.equal(investmentAccess(polity, 'power_grid', { proposedStateShare: 0.99 }).allowed, false);
assert.equal(investmentAccess(polity, 'power_grid', { proposedStateShare: 1 }).allowed, true);

const created = createStateEnterprise(polity, {
  name: 'National Infrastructure Corporation',
  sectors: ['rail', 'power_grid'],
  governmentCapital: 100,
  stateOwnership: 1,
  profitTarget: 0,
  serviceObligation: 0.85,
  commercialIndependence: 0.35,
});
assert.equal(created.created, true);
assert.deepEqual(created.enterprise.sectors, ['rail', 'power_grid']);
assert.equal(created.enterprise.profitTarget, 0);
assert.equal(created.enterprise.serviceObligation, 0.85);

const funded = fundStateEnterprise(polity, created.enterprise.id, 25);
assert.equal(funded.funded, true);
assert.equal(created.enterprise.governmentCapital, 125);

const indicators = economicOwnershipIndicators(polity);
assert(indicators.stateControl > 0);
assert(indicators.foreignOpenness < 1);
assert(indicators.publicEnterpriseWeight > 0);

console.log('economic ownership regressions passed');
