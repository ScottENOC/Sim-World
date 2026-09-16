import assert from 'node:assert/strict';
import {
  ensureInstitutionalGovernment, establishParliament, establishJudiciary,
  delegateGovernmentPower, requireInstitutionalConsent, canExecutiveAct,
  attemptReclaimGovernmentPower, institutionalPoliticalVoice,
} from '../js/politics/institutionalPowers.js';
import { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';

function polity() { return { id: 'p', administration: { legitimacy: 0.45 } }; }
function distressedRegion() {
  return { id: 'r', polityId: 'p', population: 10000, wallet: 0, famine: true, stability: 0.2, conflictPressure: 0.8, housing: { capacity: 3000 } };
}

const absolute = polity();
ensureInstitutionalGovernment(absolute);
assert.equal(canExecutiveAct(absolute, 'offensiveWar').allowed, true);
assert.equal(institutionalPoliticalVoice(absolute), 0);

const constitutional = polity();
establishParliament(constitutional, { strength: 0.75, independence: 0.8, representation: 0.7, appointment: 'elected' });
establishJudiciary(constitutional, { strength: 0.7, independence: 0.85, appointment: 'parliament_confirmed' });
delegateGovernmentPower(constitutional, 'legislation', 'parliament', { entrenched: 0.7 });
delegateGovernmentPower(constitutional, 'adjudication', 'judiciary', { entrenched: 0.8 });
requireInstitutionalConsent(constitutional, 'offensiveWar', 'parliament');
requireInstitutionalConsent(constitutional, 'taxation', 'parliament');

assert.equal(canExecutiveAct(constitutional, 'offensiveWar').allowed, false);
assert.equal(canExecutiveAct(constitutional, 'offensiveWar', ['parliament']).allowed, true);
assert.equal(canExecutiveAct(constitutional, 'legislation').required, 'parliament');
assert.ok(institutionalPoliticalVoice(constitutional) > 0.45);

const failedGrab = attemptReclaimGovernmentPower(constitutional, 'adjudication', { politicalCapital: 0.1 });
assert.equal(failedGrab.changed, false);
assert.equal(failedGrab.reason, 'institutional_resistance');
const forcedGrab = attemptReclaimGovernmentPower(constitutional, 'adjudication', { force: true });
assert.equal(forcedGrab.changed, true);
assert.equal(forcedGrab.coercive, true);

const autocraticAssessment = assessPopularWellbeing(distressedRegion(), absolute);
const constitutionalAssessment = assessPopularWellbeing(distressedRegion(), constitutional);
assert.ok(constitutionalAssessment.politicalVoice > autocraticAssessment.politicalVoice);
assert.ok(constitutionalAssessment.revolutionaryPressure < autocraticAssessment.revolutionaryPressure);
assert.ok(Math.abs(constitutionalAssessment.satisfaction - autocraticAssessment.satisfaction) < 0.001,
  'institutions should provide peaceful outlets, not a flat happiness bonus');

console.log('institutional powers regressions passed');
