import assert from 'node:assert/strict';
import { establishParliament, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';
import { attemptCoercivePowerReclamation, ensureInstitutionalCrisisState, makeInstitutionalDemand, registerInstitutionalRefusal, resolveInstitutionalDemand, tickInstitutionalCrisis } from '../js/politics/institutionalCrises.js';

const polity = { id: 'test-realm' };
establishParliament(polity, { strength: 0.85, independence: 0.9, representation: 0.8, appointment: 'elected' });
requireInstitutionalConsent(polity, 'offensiveWar', 'parliament');
const initial = ensureInstitutionalCrisisState(polity);
assert.equal(initial.pressure, 0);
registerInstitutionalRefusal(polity, 'launch_offensive_war', { power: 'offensiveWar', publicSupport: 0.7, executivePressure: 0.8, tick: 10 });
assert.ok(polity.institutionalCrisis.pressure > 0);

const demand = makeInstitutionalDemand(polity, { type: 'expand_parliamentary_control', power: 'taxation', institution: 'parliament', support: 0.8 }, { tick: 11 });
assert.equal(demand.status, 'active');
const pressureBeforeAcceptance = polity.institutionalCrisis.pressure;
resolveInstitutionalDemand(polity, demand.id, true, { tick: 12 });
assert.equal(demand.status, 'accepted');
assert.ok(polity.institutionalCrisis.pressure < pressureBeforeAcceptance);

const entrenched = { id: 'entrenched' };
establishParliament(entrenched, { strength: 0.95, independence: 0.95, representation: 0.9, appointment: 'elected' });
requireInstitutionalConsent(entrenched, 'offensiveWar', 'parliament');
const failed = attemptCoercivePowerReclamation(entrenched, 'offensiveWar', { coerciveCapacity: 0.1, eliteSupport: 0.1, publicSupport: 0.9 }, () => 0.99);
assert.equal(failed.success, false);
assert.ok(failed.state.legitimacyShock > 0);
assert.ok(failed.state.revolutionRisk > 0);

const crisis = tickInstitutionalCrisis(entrenched, { grievance: 1, politicalVoice: 0.1, repression: 0.8, economicStress: 0.9 });
assert.ok(crisis.pressure > 0);
assert.ok(crisis.coupRisk >= 0);
assert.ok(crisis.revolutionRisk >= 0);

console.log('institutional crisis regressions passed');
