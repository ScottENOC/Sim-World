import assert from 'node:assert/strict';
import { establishJudiciary, establishParliament, delegateGovernmentPower, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';
import { chooseNpcInstitutionalApprovals, governmentActionAuthority, institutionalActionPrompt, requestExecutiveAction } from '../js/politics/institutionalActions.js';
import { executeGovernmentAction, executeGovernmentDetention, executeGovernmentMilitaryPolicy, executeGovernmentProsecution, executeGovernmentTreaty } from '../js/politics/governmentActionExecution.js';

const absolute = { id: 'absolute' };
assert.equal(requestExecutiveAction(absolute, 'launch_offensive_war').allowed, true);
assert.equal(institutionalActionPrompt(absolute, 'launch_offensive_war').executiveCanActAlone, true);

const constitutional = { id: 'constitutional' };
establishParliament(constitutional, { strength: 0.8, independence: 0.85, representation: 0.85, appointment: 'elected' });
establishJudiciary(constitutional, { strength: 0.75, independence: 0.9, appointment: 'parliament_confirmed' });
requireInstitutionalConsent(constitutional, 'offensiveWar', 'parliament');
requireInstitutionalConsent(constitutional, 'taxation', 'parliament');
requireInstitutionalConsent(constitutional, 'spending', 'parliament');
requireInstitutionalConsent(constitutional, 'legislation', 'parliament');
requireInstitutionalConsent(constitutional, 'economicRegulation', 'parliament');
requireInstitutionalConsent(constitutional, 'intelligenceOperations', 'parliament');
requireInstitutionalConsent(constitutional, 'treaties', 'parliament');
delegateGovernmentPower(constitutional, 'adjudication', 'judiciary', { entrenched: 0.8 });

const warAuthority = governmentActionAuthority(constitutional, 'launch_offensive_war');
assert.deepEqual(warAuthority.consentRequiredFrom, ['parliament']);
assert.equal(requestExecutiveAction(constitutional, 'launch_offensive_war').allowed, false);
assert.equal(requestExecutiveAction(constitutional, 'launch_offensive_war', ['parliament']).allowed, true);

for (const action of ['change_taxation', 'change_spending', 'change_economic_policy', 'change_military_policy', 'order_intelligence_operation', 'sign_treaty']) {
  const prompt = institutionalActionPrompt(constitutional, action);
  assert.equal(prompt.executiveCanActAlone, false, `${action} should expose its institutional consent requirement`);
  assert.deepEqual(prompt.requiredInstitutions, ['parliament']);
}

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
delegateGovernmentPower(detention, 'prosecution', 'judiciary', { entrenched: 0.8 });
const weakCase = chooseNpcInstitutionalApprovals(detention, 'detain_political_actor', { evidence: 0.1, legalBasis: 0.1 }, () => 0.4);
assert.equal(weakCase.approved, false, 'independent legal institutions should be able to reject arbitrary detention');
const strongCase = chooseNpcInstitutionalApprovals(detention, 'detain_political_actor', { evidence: 1, legalBasis: 1 }, () => 0.4);
assert.equal(strongCase.approved, true, 'legal constraint is not a blanket ban when evidence and legal authority are strong');

const governedRegion = { id: 'capital', polityId: 'constitutional', governance: { sovereignPolityId: 'constitutional' } };
const blockedPolicy = executeGovernmentMilitaryPolicy(governedRegion, 'navalPriority', 'war', [constitutional]);
assert.equal(blockedPolicy.changed, false, 'player policy mutation must not bypass parliament');
assert.equal(governedRegion.militaryPolicy, undefined, 'blocked policy should not mutate state');
const approvedPolicy = executeGovernmentMilitaryPolicy(governedRegion, 'navalPriority', 'war', [constitutional], { approvals: ['parliament'] });
assert.equal(approvedPolicy.changed, true);
assert.equal(governedRegion.militaryPolicy.navalPriority, 'war');

let taxMutation = 0;
const blockedTax = executeGovernmentAction(governedRegion, 'change_taxation', () => { taxMutation += 1; }, [constitutional]);
assert.equal(blockedTax.changed, false);
assert.equal(taxMutation, 0, 'blocked generic government actions must not run their mutation callback');
const approvedTax = executeGovernmentAction(governedRegion, 'change_taxation', () => { taxMutation += 1; return true; }, [constitutional], { approvals: ['parliament'] });
assert.equal(approvedTax.changed, true);
assert.equal(taxMutation, 1, 'approved generic government actions should execute exactly once');

let treatyMutation = 0;
const blockedTreaty = executeGovernmentTreaty(governedRegion, () => { treatyMutation += 1; return true; }, [constitutional]);
assert.equal(blockedTreaty.changed, false, 'treaty mutation must not bypass required institutional consent');
assert.equal(treatyMutation, 0);
const approvedTreaty = executeGovernmentTreaty(governedRegion, () => { treatyMutation += 1; return true; }, [constitutional], { approvals: ['parliament'] });
assert.equal(approvedTreaty.changed, true);
assert.equal(treatyMutation, 1, 'approved treaty mutation should execute exactly once');

const legalRegion = { id: 'legal-capital', polityId: 'legal-state', governance: { sovereignPolityId: 'legal-state' } };
let detentionMutation = 0;
const blockedDetention = executeGovernmentDetention(legalRegion, () => { detentionMutation += 1; return true; }, [detention]);
assert.equal(blockedDetention.changed, false, 'detention mutation must respect judicial authority');
assert.equal(detentionMutation, 0);
const approvedDetention = executeGovernmentDetention(legalRegion, () => { detentionMutation += 1; return true; }, [detention], { approvals: ['judiciary'] });
assert.equal(approvedDetention.changed, true);
assert.equal(detentionMutation, 1);

let prosecutionMutation = 0;
const blockedProsecution = executeGovernmentProsecution(legalRegion, () => { prosecutionMutation += 1; return true; }, [detention]);
assert.equal(blockedProsecution.changed, false, 'prosecution mutation must respect judicial authority');
assert.equal(prosecutionMutation, 0);
const approvedProsecution = executeGovernmentProsecution(legalRegion, () => { prosecutionMutation += 1; return true; }, [detention], { approvals: ['judiciary'] });
assert.equal(approvedProsecution.changed, true);
assert.equal(prosecutionMutation, 1);

const npcPolicy = { id: 'npc-policy' };
establishParliament(npcPolicy, { strength: 0.8, independence: 0.8, representation: 0.8 });
requireInstitutionalConsent(npcPolicy, 'legislation', 'parliament');
const npcRegion = { id: 'npc-capital', polityId: 'npc-policy', governance: { sovereignPolityId: 'npc-policy' } };
const refusedNpcPolicy = executeGovernmentMilitaryPolicy(npcRegion, 'navalPriority', 'war', [npcPolicy], { npc: true, rng: () => 0.99, context: { publicSupport: 0.1 }, currentTick: 50 });
assert.equal(refusedNpcPolicy.changed, false);
assert.ok(npcPolicy.institutionalCrisis.pressure > 0, 'NPC refusal should feed institutional crisis pressure');

console.log('institutional action regressions passed');
