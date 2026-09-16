import assert from 'node:assert/strict';
import { assessPopularWellbeing, tickPopularWellbeing } from '../js/politics/popularWellbeing.js';
import { establishParliament, establishJudiciary, delegateGovernmentPower, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';

const polity = { id: 'p1', administration: { legitimacy: 0.55 } };
const prosperous = { id: 'good', polityId: 'p1', population: 1000, wallet: 20, stability: 0.9, foodSecurity: 0.95, housing: { capacity: 1100 }, artsAccess: 0.7, labor: { unemploymentRate: 0.03 } };
const distressed = { id: 'bad', polityId: 'p1', population: 1000, wallet: 0, stability: 0.2, foodSecurity: 0.15, housing: { capacity: 500 }, artsAccess: 0.05, labor: { unemploymentRate: 0.45 }, conflictPressure: 0.8, banditryPressure: 0.5 };

const good = assessPopularWellbeing(prosperous, polity);
const bad = assessPopularWellbeing(distressed, polity);
assert(good.satisfaction > bad.satisfaction, 'prosperity and safety should improve satisfaction');
assert(bad.revolutionaryPressure > good.revolutionaryPressure, 'distress should raise revolutionary pressure');

const constrained = structuredClone(polity);
establishParliament(constrained, { strength: 0.9, independence: 0.85, representation: 0.8, appointment: 'elected' });
establishJudiciary(constrained, { strength: 0.7, independence: 0.8, appointment: 'parliament_confirmed' });
delegateGovernmentPower(constrained, 'legislation', 'parliament', { entrenched: 0.6 });
requireInstitutionalConsent(constrained, 'taxation', 'parliament');
requireInstitutionalConsent(constrained, 'offensiveWar', 'parliament');
const badWithOutlets = assessPopularWellbeing(distressed, constrained);
assert(badWithOutlets.politicalVoice > bad.politicalVoice, 'institutions should increase peaceful political voice');
assert(badWithOutlets.revolutionaryPressure < bad.revolutionaryPressure, 'peaceful outlets should reduce revolutionary conversion of grievances');

const regions = [structuredClone(distressed)];
tickPopularWellbeing(regions, [polity], 365.2425, { playerPolityId: 'p1' });
assert(regions[0].popularWellbeing, 'tick should persist wellbeing state');
assert(Number.isFinite(regions[0].popularWellbeing.revolutionaryPressure), 'pressure should remain finite');
console.log('popular wellbeing regression checks passed');
