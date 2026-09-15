import assert from 'node:assert/strict';
import { installForeignInvestmentUi } from '../js/ui/foreignInvestmentUi.js';
import { CORPORATE_INFRASTRUCTURE_TYPES } from '../js/economy/corporateInfrastructure.js';
import { FOREIGN_INVESTMENT_POLICIES } from '../js/economy/infrastructureInvestment.js';

assert.equal(typeof installForeignInvestmentUi, 'function');
assert.equal(CORPORATE_INFRASTRUCTURE_TYPES.railway, undefined, 'railways remain in their existing railway system rather than being silently duplicated here');
assert.deepEqual(Object.values(FOREIGN_INVESTMENT_POLICIES).sort(), ['open','screened','partners_only','domestic_preference','domestic_only'].sort());
console.log('Foreign investment UI module loads and policy vocabulary is stable.');
