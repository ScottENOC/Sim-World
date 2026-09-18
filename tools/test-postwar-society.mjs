import assert from 'node:assert/strict';
import {
  ensurePostWarSociety,
  postWarSocietySummary,
  setVeteranSupportPolicy,
  tickPostWarSociety,
} from '../js/society/postWarSociety.js';

function polity() {
  return { id: 'p1', capitalRegionId: 'r1' };
}

function region(id, personnel = 10000, overrides = {}) {
  return {
    id,
    polityId: 'p1',
    population: 100000,
    treasury: 5000,
    demographics: { workingAge: 55000 },
    governance: { sovereignPolityId: 'p1' },
    army: { personnel },
    navy: { personnel: 0 },
    report: { conflict: { pressure: 0.8 } },
    employment: { unemploymentRate: 0.06, hardship: 0.12, povertyPressure: 0.10 },
    urbanHousing: { slumPressure: 0.08 },
    ...overrides,
  };
}

const p = polity();
const regions = [region('r1'), region('r2')];
// First tick records the wartime military baseline.
tickPostWarSociety([p], regions, 0, 30);
assert.equal(postWarSocietySummary(p).veteranPopulation, 0);

// Battlefield losses while conflict is active must not be counted as returning veterans.
regions[0].army.personnel = 8000;
tickPostWarSociety([p], regions, 4, 30);
assert.equal(postWarSocietySummary(p).veteranPopulation, 0, 'active-war personnel losses are not demobilised veterans');

// After conflict subsides, an actual reduction in armed strength creates veterans.
regions[0].report.conflict.pressure = 0.05;
regions[1].report.conflict.pressure = 0.05;
regions[0].army.personnel = 3000;
regions[1].army.personnel = 4000;
const events = tickPostWarSociety([p], regions, 8, 30, { playerPolityId: 'p1' });
const afterDemob = postWarSocietySummary(p);
assert.ok(afterDemob.veteranPopulation >= 9000, 'post-conflict force reductions should create a veteran population');
assert.ok(afterDemob.reintegrationQueue > 0, 'returning veterans should enter a reintegration queue');
assert.ok(events.some((e) => e.type === 'mass_demobilisation' && e.playerRelevant));

// A hard labour/housing landing should make reintegration materially harder.
const hard = polity();
const hardRegions = [region('r1', 12000, { employment: { unemploymentRate: 0.28, hardship: 0.55, povertyPressure: 0.5 }, urbanHousing: { slumPressure: 0.7 } })];
tickPostWarSociety([hard], hardRegions, 0, 30);
hardRegions[0].report.conflict.pressure = 0.02;
hardRegions[0].army.personnel = 2000;
for (let i = 1; i <= 6; i++) tickPostWarSociety([hard], hardRegions, i * 4, 30);
const hardSummary = postWarSocietySummary(hard);
assert.ok(hardSummary.reintegrationStress > 0.10, 'unemployment and housing stress should create post-war reintegration stress');
assert.ok(hardSummary.politicalPressure > 0.05, 'poor reintegration should create political pressure');

// Support must cost real treasury money and reduce stress relative to an otherwise identical case.
const supported = polity();
const supportedRegions = [region('r1', 12000, { employment: { unemploymentRate: 0.28, hardship: 0.55, povertyPressure: 0.5 }, urbanHousing: { slumPressure: 0.7 } })];
setVeteranSupportPolicy(supported, 'pension', { playerIssued: true });
tickPostWarSociety([supported], supportedRegions, 0, 30);
supportedRegions[0].report.conflict.pressure = 0.02;
supportedRegions[0].army.personnel = 2000;
const treasuryBefore = supportedRegions[0].treasury;
for (let i = 1; i <= 6; i++) tickPostWarSociety([supported], supportedRegions, i * 4, 30);
const supportedSummary = postWarSocietySummary(supported);
assert.ok(supportedRegions[0].treasury < treasuryBefore, 'veteran support must spend actual treasury money');
assert.ok(supportedSummary.reintegrationQueue < hardSummary.reintegrationQueue, 'support should accelerate reintegration');
assert.ok(supportedSummary.reintegrationStress < hardSummary.reintegrationStress, 'support should reduce reintegration stress');

// NPC adoption is endogenous to a material problem, not date.
const npc = polity();
const npcState = ensurePostWarSociety(npc);
npcState.veteranPopulation = 5000;
npcState.reintegrationQueue = 4000;
npcState.reintegrationStress = 0.7;
const npcRegions = [region('r1', 1000, { report: { conflict: { pressure: 0.02 } } })];
tickPostWarSociety([npc], npcRegions, 100, 30);
assert.notEqual(postWarSocietySummary(npc).veteranSupport, 'none');

console.log('Post-war society regression passed', {
  veterans: afterDemob.veteranPopulation,
  hardStress: hardSummary.reintegrationStress.toFixed(3),
  supportedStress: supportedSummary.reintegrationStress.toFixed(3),
  supportedCost: supportedSummary.cumulativeSupportCost.toFixed(2),
});
