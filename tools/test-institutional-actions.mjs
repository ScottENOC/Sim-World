import assert from 'node:assert/strict';
import { establishJudiciary, establishParliament, delegateGovernmentPower, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';
import { chooseNpcInstitutionalApprovals, governmentActionAuthority, institutionalActionPrompt, requestExecutiveAction } from '../js/politics/institutionalActions.js';

const absolute = { id: 'absolute' };
assert.equal(requestExecutiveAction(absolute, 'launch_offensive_war').allowed, true);
assert.equal(institutionalActionPrompt(absolute, 'launch_offensive_war').executiveCanActAlone, true);

const constitutional = { id: 'constitutional' };
establishParliament(constitutional, { strength: 0.8, independence: 0.85, representation: 0.85, appointment: 'elected' });
establishJudiciary(constitutional, { strength: 0.75, independence: 0.9, appointment: 'parliament_confirmed' });
requireInstitutionalConsent(constitutional, 'offensiveWar', 'parliament');
requireInstitutionalConsent(constitutional, 'taxation', 'parliament');
delegateGovernmentPower(constitutional, 'adjudication', 'judiciary', { entrenched: 0.8 });

const warAuthority = governmentActionAuthority(constitutional, 'launch_offensive_war');
assert.deepEqual(warAuthority.consentRequiredFrom, ['parliament']);
assert.equal(requestExecutiveAction(constitutional, 'launch_offensive_war').allowed, false);
assert.equal(requestExecutiveAction(constitutional, 'launch_offensive_war', ['parliament']).allowed, true);

const hostileWar = chooseNpcInstitutionalApprovals(constitutional, 'launch_offensive_war', {
  publicSupport: 0.15, threat: 0.05, hostility: 0.1, fiscalStress: 0.8, defensive: false,
}, () => 0.5);
assert.equal(hostileWar.approved, false, 'representative parliament should be able to reject an unpopular discretionary war');

const defensiveWar = chooseNpcInstitutionalApprovals(constitutional, 'launch_offensive_war', {
  publicSupport: 0.9, threat: 1, hostility: 0.9, fiscalStress: 0.1, defensive: true,
}, () => 0.5);
assert.equal(defensiveWar.approved, true, 'parliamentary constraints should not make governments unable to respond to severe threats');

const detention = { id: 'legal-state' };
establishJudiciary(detention, { strength: 0.9, independence: 0.95 });
delegateGovernmentPower(detention, 'detention', 'judiciary', { entrenched: 0.8 });
const weakCase = chooseNpcInstitutionalApprovals(detention, 'detain_political_actor', { evidence: 0.1, legalBasis: 0.1 }, () => 0.4);
assert.equal(weakCase.approved, false, 'independent legal institutions should be able to reject arbitrary detention');
const strongCase = chooseNpcInstitutionalApprovals(detention, 'detain_political_actor', { evidence: 1, legalBasis: 1 }, () => 0.4);
assert.equal(strongCase.approved, true, 'legal constraint is not a blanket ban when evidence and legal authority are strong');

console.log('institutional action regressions passed');
