import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('../js/politics/popularWellbeing.js', import.meta.url), 'utf8');
const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const polity = { id: 'p1', administration: { legitimacy: 0.55 } };
const prosperous = { id: 'good', polityId: 'p1', population: 1000, wallet: 20, stability: 0.9, foodSecurity: 0.95, housing: { capacity: 1100 }, artsAccess: 0.7, labor: { unemploymentRate: 0.03 } };
const distressed = { id: 'bad', polityId: 'p1', population: 1000, wallet: 0, stability: 0.2, foodSecurity: 0.15, housing: { capacity: 500 }, artsAccess: 0.05, labor: { unemploymentRate: 0.45 }, conflictPressure: 0.8, banditryPressure: 0.5 };

const good = mod.assessPopularWellbeing(prosperous, polity);
const bad = mod.assessPopularWellbeing(distressed, polity);
assert(good.satisfaction > bad.satisfaction, 'prosperity and safety should improve satisfaction');
assert(bad.revolutionaryPressure > good.revolutionaryPressure, 'distress should raise revolutionary pressure');

const constrained = { ...polity, parliament: { power: 0.9 }, judiciary: { independence: 0.8 }, delegatedPowers: { legislation: true, budget: true, war: true } };
const badWithOutlets = mod.assessPopularWellbeing(distressed, constrained);
assert(badWithOutlets.politicalVoice > bad.politicalVoice, 'institutions should increase peaceful political voice');
assert(badWithOutlets.revolutionaryPressure < bad.revolutionaryPressure, 'peaceful outlets should reduce revolutionary conversion of grievances');

const regions = [structuredClone(distressed)];
mod.tickPopularWellbeing(regions, [polity], 365.2425, { playerPolityId: 'p1' });
assert(regions[0].popularWellbeing, 'tick should persist wellbeing state');
assert(Number.isFinite(regions[0].popularWellbeing.revolutionaryPressure), 'pressure should remain finite');
console.log('popular wellbeing regression checks passed');
