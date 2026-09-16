import assert from 'node:assert/strict';
import { establishParliament, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';
import { chooseNpcInstitutionalApprovals } from '../js/politics/institutionalActions.js';
import { executeGovernmentCampaign } from '../js/politics/governmentActionExecution.js';

const polity = { id: 'realm', administration: { legitimacy: 0.6 } };
establishParliament(polity, { strength: 0.85, independence: 0.8, representation: 0.9, appointment: 'elected' });
requireInstitutionalConsent(polity, 'offensiveWar', 'parliament');
const attacker = { id: 'a', polityId: 'realm', governance: { sovereignPolityId: 'realm' }, population: 10000, army: { personnel: 1000, away: 0 } };
const defender = { id: 'b', polityId: 'other', governance: { sovereignPolityId: 'other' }, population: 5000, army: { personnel: 100, away: 0 } };
const options = { polities: [polity], regions: [attacker, defender], campaigns: [] };

const refused = chooseNpcInstitutionalApprovals(polity, 'launch_offensive_war', { publicSupport: 0.1, threat: 0, hostility: 0, fiscalStress: 0.9 }, () => 0.99);
assert.equal(refused.approved, false, 'parliament can refuse a discretionary offensive war');
const blocked = executeGovernmentCampaign(attacker, defender, 'punitive', 300, 1, { ...options, approvals: refused.approvals, registerRefusal: true });
assert.equal(blocked.campaign, null, 'campaign cannot bypass missing parliamentary consent');

const approved = chooseNpcInstitutionalApprovals(polity, 'launch_offensive_war', { publicSupport: 0.95, threat: 1, hostility: 1, fiscalStress: 0 }, () => 0.01);
assert.equal(approved.approved, true, 'parliament can approve an offensive when support and security context are strong');
const launched = executeGovernmentCampaign(attacker, defender, 'punitive', 300, 2, { ...options, approvals: approved.approvals });
assert.ok(launched.campaign, 'approved campaign should launch through governed execution');

console.log('institutional player war regression passed');
