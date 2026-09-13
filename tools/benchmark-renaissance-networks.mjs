import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { tickRenaissanceNetworks } from '../js/society/renaissanceNetworks.js';

function makeRegion(i, n) {
  const university = i % 9 === 0;
  const polityId = `p${i % 140}`;
  const next = `r${(i + 1) % n}`;
  const prev = `r${(i + n - 1) % n}`;
  return {
    id: `r${i}`, name: `Region ${i}`, population: 40000 + (i % 11) * 7000,
    wallet: 900 + (i % 17) * 110, treasury: 300 + (i % 7) * 80, educationLevel: 0.28 + (i % 6) * 0.07,
    neighbors: [next, prev], tradePartnerIds: new Set([`r${(i + 7) % n}`, `r${(i + 23) % n}`]), recentTradePartners: new Map(),
    governance: { sovereignPolityId: polityId, administrativeControl: 0.5, autonomy: 0.2 },
    urbanisation: { urbanPopulation: i % 4 === 0 ? 18000 : 6500 },
    tradeEconomy: { weeklyImports: 35 + (i % 10) * 5, weeklyExports: 42 + (i % 8) * 6 },
    medievalCommerce: { finance: { merchantCredit: 0.45, stateCredit: 0.4 }, trade: { commercialLaw: 0.48 }, labour: { labourScarcity: 0.08, bargainingPower: 0.15 } },
    medievalSociety: { urban: { industrialSpecialisation: 0.48, guilds: 0.45, communeAutonomy: 0.24 }, education: { technicalSchools: 0.42, knowledgeCapacity: 0.5, urbanAcademies: 0.4 }, estates: { hereditaryPower: 0.52, eliteLandShare: 0.43 } },
    medievalCompletion: {
      city: { guildPower: 0.45, communeAutonomy: 0.24 }, church: { wealth: 200, bishopric: 0.4 }, actors: [],
      university: university ? { founded: true, foundedTick: 0, students: 850, law: 0.55, medicine: 0.45, theology: 0.5, naturalPhilosophy: 0.58, institutionalMemory: 0.54 } : { founded: false, students: 0, institutionalMemory: 0 },
    },
    religion: { stateReligionId: 'faith', shares: { faith: 0.8 } },
    counterIntelligence: { credentialSecurity: 0.4, codePractice: 0.15, verificationCaution: 0.45, compromisedCredentialActors: [], detectedForgeries: [] },
    unlockedTechIds: new Set(['writing']),
  };
}

const count = 2300;
const regions = Array.from({ length: count }, (_, i) => makeRegion(i, count));
const polities = Array.from({ length: 140 }, (_, i) => ({ id: `p${i}`, stateAdministration: { court: { centralisationDrive: 0.5 } } }));
const worldState = { elapsedDays: 0 };
for (let i = 0; i < 3; i++) tickRenaissanceNetworks(regions, polities, i * 52, 365.2425, () => 0.5, { worldState });
const timings = [];
for (let year = 3; year < 13; year++) {
  const t0 = performance.now();
  tickRenaissanceNetworks(regions, polities, year * 52, 365.2425, () => 0.5, { worldState });
  timings.push(performance.now() - t0);
}
const averageMs = timings.reduce((a, b) => a + b, 0) / timings.length;
const maxMs = Math.max(...timings);
const universities = regions.filter(r => r.medievalCompletion.university.founded).length;
const presses = regions.filter(r => r.renaissance?.printing?.mechanicalPress).length;
assert.ok(averageMs < 150, `Renaissance annual network tick averaged ${averageMs.toFixed(1)} ms, above the 150 ms weekly budget by itself`);
assert.ok(universities > 200);
console.log(JSON.stringify({ regions: count, universities, presses, averageMs: Number(averageMs.toFixed(2)), maxMs: Number(maxMs.toFixed(2)) }, null, 2));
