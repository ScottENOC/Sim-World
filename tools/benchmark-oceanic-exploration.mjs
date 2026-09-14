import { performance } from 'node:perf_hooks';
import { tickOceanicExploration } from '../js/economy/oceanicExploration.js';

const SEA_COUNT = 103;
const REGION_COUNT = 2300;
const seas = Array.from({ length: SEA_COUNT }, (_, i) => ({
  id: `sea-${i}`,
  name: `Sea ${i}`,
  centroid: [((i * 3.4) % 320) - 160, ((i * 1.7) % 120) - 60],
  areaSqKm: 120000 + (i % 9) * 60000,
  adjacentLand: [`r-${i}`, `r-${(i + 1) % SEA_COUNT}`],
}));

function region(i) {
  const coastal = i < SEA_COUNT * 2;
  const seaId = coastal ? `sea-${i % SEA_COUNT}` : null;
  return {
    id: `r-${i}`,
    name: `Region ${i}`,
    population: 30000 + (i % 11) * 12000,
    wallet: 300,
    treasury: 200,
    adjacentSeaIds: seaId ? [seaId] : [],
    neighbors: i > 0 ? [`r-${i - 1}`] : [],
    tradePartnerIds: new Set(i > 2 ? [`r-${i - 2}`] : []),
    recentTradePartners: new Map(),
    navy: coastal && i % 3 === 0 ? { boats: 3, advancedBoats: i % 9 === 0 ? 2 : 0 } : { boats: 0, advancedBoats: 0 },
    governance: { sovereignPolityId: `p-${i}` },
    experience: { maritimeScouting: coastal ? (i % 7) * 12000 : 0, maritimeTrade: coastal ? (i % 5) * 9000 : 0 },
    maritimeProvisioning: { antiScurvyPractice: (i % 6) / 20, longVoyageExperience: i % 30, outbreaksObserved: 0 },
    corporateCapital: {
      financialDepth: (i % 5) / 10, creditorTrust: 0.55, investibleWealth: 50,
      nonPerformingShare: 0, corporateLaw: 0.1, partnershipPractice: 0.2,
      charterPractice: 0.05, jointStockPractice: 0, limitedLiabilityPractice: 0,
      creditorConcentration: 0, failedFirmPressure: 0, nextFirmId: 1, firms: [],
    },
    renaissance: {
      printing: { informationVelocity: (i % 4) / 10, mechanicalPress: false, publicationFlow: 0, vernacularShare: 0.2, censorship: 0, importedPrint: 0, religiousChallengePressure: 0 },
      patronage: { court: 0, merchant: 0, religious: 0, civic: 0, scholarly: 0, artsPrestige: 0, knowledgeProduction: 0, talentAttraction: 0 },
      university: { prestige: 0, selectivity: 0, internationalShare: 0, foreignStudents: 0, brainGain: 0, brainDrainPressure: 0, eliteClosure: 0, socialMobilityPenalty: 0, espionageExposure: 0, alumniInfluence: 0, notableAlumni: [], foreignAffinity: {}, annualStudentFlows: {}, lastNotableTick: null },
      talent: { pool: 0, retainedForeignTalent: 0, returningScholars: 0 },
    },
  };
}

const regions = Array.from({ length: REGION_COUNT }, (_, i) => region(i));

// Prime the annual cadence and graph cache outside the measurement.
tickOceanicExploration(regions, seas, [], 0, 30, () => 0.5);
const samples = [];
for (let run = 0; run < 8; run++) {
  const start = performance.now();
  tickOceanicExploration(regions, seas, [], 53 * (run + 1), 365.2425, () => 0.5);
  samples.push(performance.now() - start);
}
const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const maxMs = Math.max(...samples);
console.log(JSON.stringify({ regions: REGION_COUNT, seas: SEA_COUNT, averageMs, maxMs, samples }, null, 2));
if (averageMs > 150) throw new Error(`Oceanic exploration average ${averageMs.toFixed(2)} ms exceeds 150 ms guardrail`);
