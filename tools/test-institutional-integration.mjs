import assert from 'node:assert/strict';
import { establishParliament, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';
import { executeGovernmentCampaign } from '../js/politics/governmentActionExecution.js';
import { institutionalStatusForRegion, resolvePlayerInstitutionalDemand, maybeCreateInstitutionalDemand, tickInstitutionalPolitics } from '../js/politics/institutionalIntegration.js';

const polity = { id: 'realm', administration: { legitimacy: 0.55, officialdom: 0.4 } };
establishParliament(polity, { strength: 0.8, independence: 0.8, representation: 0.85, appointment: 'elected' });
requireInstitutionalConsent(polity, 'offensiveWar', 'parliament');
const attacker = { id: 'a', polityId: 'realm', governance: { sovereignPolityId: 'realm' }, population: 10000, army: { personnel: 1000, away: 0 }, popularWellbeing: { satisfaction: 0.45, grievance: 0.55, politicalVoice: 0.7, revolutionaryPressure: 0.1 } };
const defender = { id: 'b', polityId: 'other', governance: { sovereignPolityId: 'other' }, population: 5000, army: { personnel: 100, away: 0 }, popularWellbeing: { satisfaction: 0.5, grievance: 0.4, politicalVoice: 0.2, revolutionaryPressure: 0.1 } };

const blocked = executeGovernmentCampaign(attacker, defender, 'punitive', 400, 20, { polities: [polity], regions: [attacker, defender], campaigns: [], npc: true, rng: () => 0.99, context: { publicSupport: 0.1, threat: 0, hostility: 0.1, fiscalStress: 0.8 } });
assert.equal(blocked.campaign, null);
assert.ok(polity.institutionalCrisis.pressure > 0, 'NPC institutional refusal should create political pressure');

const status = institutionalStatusForRegion(attacker, [polity], [attacker, defender]);
assert.equal(status.polity.id, 'realm');
assert.ok(status.context.grievance > 0);

const demand = maybeCreateInstitutionalDemand(polity, 'parliament', 'taxation', 0.75, 21);
assert.equal(demand.status, 'active');
resolvePlayerInstitutionalDemand(polity, demand.id, true, 22);
assert.equal(demand.status, 'accepted');
assert.ok(polity.governmentPowers.taxation.consentRequiredFrom.includes('parliament'), 'accepted demand should become a real constitutional constraint');

const pressured = { id: 'pressured', administration: { legitimacy: 0.35, officialdom: 0.25 }, institutionalCrisis: { pressure: 0.62, legitimacyShock: 0, obstruction: 0.3, protests: 0.2, coupRisk: 0, revolutionRisk: 0, demands: [], history: [] } };
establishParliament(pressured, { strength: 0.8, independence: 0.8, representation: 0.9, appointment: 'elected' });
const pressuredRegion = { id: 'p', polityId: 'pressured', governance: { sovereignPolityId: 'pressured' }, population: 10000, popularWellbeing: { satisfaction: 0.3, grievance: 0.75, politicalVoice: 0.65, revolutionaryPressure: 0.4 } };
const events = tickInstitutionalPolitics([pressured], [pressuredRegion], 30, 30, { playerPolityId: 'pressured' });
assert.ok(events.some((event) => event.type === 'institutional_demand'), 'sustained pressure should let an established parliament demand a share of power');

console.log('institutional integration regressions passed');
