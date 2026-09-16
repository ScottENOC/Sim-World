import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialisePoliticalContinuity } from '../js/politics/continuityCore.js';
import { ensureInstitutionalCrisisState } from '../js/politics/institutionalCrises.js';
import { attemptRestorationUprising, ensureRestorationOperation, fundPoliticalDestabilisation, fundRestorationOperation } from '../js/politics/foreignPoliticalIntervention.js';

function region(id, polityId, neighbors = []) {
  return {
    id, name: id, polityId, neighbors, population: 10000, treasury: 200, stability: 0.35,
    army: { personnel: 300, away: 0 }, navy: { personnel: 0 },
    governance: { sovereignPolityId: polityId, localPolityId: polityId, localRulerId: id, relationship: 'core', autonomy: 0, administrativeControl: 0.5 },
    popularWellbeing: { grievance: 0.75, mobilisationPotential: 0.68 },
    counterIntelligence: { credentialSecurity: 0.25, codePractice: 0.15, verificationCaution: 0.35, compromisedCredentialActors: [], detectedForgeries: [] },
  };
}
function polity(id, capitalRegionId) {
  return { id, name: id, capitalRegionId, rulerRegionId: capitalRegionId,
    administration: { legitimacy: 0.3, officialdom: 0.25, experience: { recordKeeping: 0, accounting: 0, communications: 0, officialdom: 0, delegation: 0 }, breakthroughs: new Set() },
    report: { tributeReceived: 0, subjectCount: 0, administrativeLoad: 0, administrativeCapacity: 0 } };
}

const sponsor = polity('sponsor', 's');
const incumbent = polity('incumbent', 'a');
const exile = polity('exile', 'x');
const regions = [region('s', sponsor.id), region('a', incumbent.id, ['b']), region('b', incumbent.id, ['a'])];
const polities = [sponsor, incumbent, exile];
initialisePoliticalContinuity([sponsor, incumbent], regions, 0);
exile.continuity = { status: 'exile', seatRegionId: 's', hostPolityId: sponsor.id, legitimacy: 0.55, prestige: 0.3,
  exilePopulation: 70, claims: { a: 0.9, b: 0.7 }, historicalControl: {}, acceptedSettlementIds: [], rejectedSettlementIds: [], exileSupport: { [sponsor.id]: 0.8 } };

{
  const before = regions[0].treasury;
  const funded = fundRestorationOperation(sponsor, exile, incumbent, regions, 10, 20, () => 0.99);
  assert.equal(funded.funded, true);
  assert.equal(regions[0].treasury, before - 20);
  assert.ok(funded.operation.network > 0 && funded.operation.materialSupport > 0);
}

{
  const operation = ensureRestorationOperation(exile, incumbent.id);
  operation.network = 0.9; operation.materialSupport = 0.8; operation.propaganda = 0.7; operation.sponsorPolityId = sponsor.id;
  const uprising = attemptRestorationUprising(exile, incumbent, polities, regions, 20, () => 0);
  assert.equal(uprising.succeeded, true);
  assert.equal(regions.find(r => r.id === uprising.targetRegionId).governance.sovereignPolityId, exile.id);
  assert.equal(exile.continuity.status, 'claimant');
  assert.equal(incumbent.regimeConflict.status, 'active');
  assert.equal(exile.regimeConflict.type, 'restoration');
}

{
  const target = polity('target-rev', 't');
  const t = region('t', target.id);
  const worldRegions = [regions[0], t];
  const crisis = ensureInstitutionalCrisisState(target);
  const beforeRisk = crisis.revolutionRisk;
  const beforeTreasury = regions[0].treasury;
  const result = fundPoliticalDestabilisation(sponsor, target, worldRegions, 30, 'revolution', 12, () => 0.99);
  assert.equal(result.funded, true);
  assert.equal(regions[0].treasury, beforeTreasury - 12);
  assert.ok(crisis.revolutionRisk > beforeRisk);
  assert.ok(result.operation.network > 0 && result.operation.propaganda > 0);
}

{
  const target = polity('target-coup', 'u');
  const u = region('u', target.id);
  const crisis = ensureInstitutionalCrisisState(target);
  const beforeRisk = crisis.coupRisk;
  const result = fundPoliticalDestabilisation(sponsor, target, [regions[0], u], 40, 'coup', 12, () => 0.99);
  assert.equal(result.funded, true);
  assert.ok(crisis.coupRisk > beforeRisk);
  assert.ok(result.operation.eliteContacts > result.operation.propaganda);
}

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../js/ui/diplomaticServicePanel.js', import.meta.url), 'utf8');
assert.match(main, /tickForeignPoliticalIntervention\(/);
assert.match(main, /foreignInterventionEvents\.filter\(\(event\) => event\.playerRelevant\)/);
assert.match(main, /foreign_backed_restoration_uprising/);
assert.match(panel, /order_intelligence_operation/);
assert.match(panel, /fundRestorationOperation/);
assert.match(panel, /fundPoliticalDestabilisation/);
assert.match(panel, /Effectiveness and detection remain intelligence uncertainties/);
assert.doesNotMatch(panel, /result\.detected\s*\?/);
console.log('foreign political intervention regressions passed');
