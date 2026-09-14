import assert from 'node:assert/strict';
import { buildExplorationSeaGraph, ensureOceanicExplorationState, tickOceanicExploration } from '../js/economy/oceanicExploration.js';

function sea(id, lon, adjacentLand = []) {
  return { id, name: id, centroid: [lon, 0], areaSqKm: 180000, adjacentLand };
}

function coastalRegion(id, seaId, overrides = {}) {
  return {
    id,
    name: id,
    population: 90000,
    wallet: 800,
    treasury: 500,
    adjacentSeaIds: [seaId],
    neighbors: [],
    tradePartnerIds: new Set(),
    recentTradePartners: new Map(),
    navy: { boats: 5, advancedBoats: 5 },
    governance: { sovereignPolityId: `p-${id}` },
    experience: { maritimeScouting: 80000, maritimeTrade: 50000 },
    maritimeProvisioning: { antiScurvyPractice: 0.2, longVoyageExperience: 90, outbreaksObserved: 1 },
    corporateCapital: {
      financialDepth: 0.35, creditorTrust: 0.7, investibleWealth: 120,
      nonPerformingShare: 0, corporateLaw: 0.25, partnershipPractice: 0.4,
      charterPractice: 0.15, jointStockPractice: 0, limitedLiabilityPractice: 0,
      creditorConcentration: 0, failedFirmPressure: 0, nextFirmId: 1, firms: [],
    },
    renaissance: {
      printing: { informationVelocity: 0, mechanicalPress: false, publicationFlow: 0, vernacularShare: 0.1, censorship: 0, importedPrint: 0, religiousChallengePressure: 0 },
      patronage: { court: 0, merchant: 0, religious: 0, civic: 0, scholarly: 0, artsPrestige: 0, knowledgeProduction: 0, talentAttraction: 0 },
      university: { prestige: 0, selectivity: 0, internationalShare: 0, foreignStudents: 0, brainGain: 0, brainDrainPressure: 0, eliteClosure: 0, socialMobilityPenalty: 0, espionageExposure: 0, alumniInfluence: 0, notableAlumni: [], foreignAffinity: {}, annualStudentFlows: {}, lastNotableTick: null },
      talent: { pool: 0, retainedForeignTalent: 0, returningScholars: 0 },
    },
    ...overrides,
  };
}

const seas = [
  sea('sea_home', 0, ['home', 'bridge']),
  sea('sea_frontier', 6, ['bridge', 'foreign']),
  sea('sea_beyond', 13, ['foreign', 'far']),
];
const graph = buildExplorationSeaGraph(seas);
assert.ok(graph.get('sea_home').some((edge) => edge.seaId === 'sea_frontier'), 'shared coastal geography should create a sparse sea connection');

// A capable pre-print society should be able to explore: there is no 1492/date gate.
const home = coastalRegion('home', 'sea_home');
const foreign = coastalRegion('foreign', 'sea_frontier', { navy: { boats: 0, advancedBoats: 0 }, wallet: 20 });
const bridge = { id: 'bridge', name: 'bridge', adjacentSeaIds: ['sea_home', 'sea_frontier'], neighbors: [], tradePartnerIds: new Set(), recentTradePartners: new Map(), navy: { boats: 0, advancedBoats: 0 }, governance: { sovereignPolityId: 'p-bridge' } };
const far = { id: 'far', name: 'far', adjacentSeaIds: ['sea_beyond'], neighbors: [], tradePartnerIds: new Set(), recentTradePartners: new Map(), navy: { boats: 0, advancedBoats: 0 }, governance: { sovereignPolityId: 'p-far' } };
const regions = [home, bridge, foreign, far];

tickOceanicExploration(regions, seas, [], 0, 30, () => 0);
const events = tickOceanicExploration(regions, seas, [], 53, 365.2425, () => 0);
const success = events.find((event) => event.regionId === 'home' && event.type === 'exploration_voyage_success');
assert.ok(success, 'maritime capability should produce an emergent exploration voyage');
assert.equal(success.targetSeaId, 'sea_frontier');
assert.ok(success.discoveredRegionIds.includes('foreign'), 'successful voyage should discover coastal regions adjoining the new sea');
assert.ok(ensureOceanicExplorationState(home).seaKnowledge.sea_frontier >= 0.7, 'successful voyage should create persistent sea knowledge');
assert.ok(ensureOceanicExplorationState(home).routeKnowledge.sea_frontier.reliability > 0, 'successful voyage should create persistent route reliability');
assert.ok(home.wallet < 800, 'voyage should consume real merchant/state resources');
assert.equal(home.renaissance.printing.mechanicalPress, false, 'printing is useful for diffusion, not a prerequisite for exploration');

// Failure should create partial knowledge rather than omniscience.
const failureHome = coastalRegion('failure-home', 'sea_home');
const failureRegions = [failureHome, bridge, foreign, far];
tickOceanicExploration(failureRegions, seas, [], 0, 30, () => 0.99);
let rolls = [0, 0.99];
const failedEvents = tickOceanicExploration(failureRegions, seas, [], 53, 365.2425, () => rolls.shift() ?? 0.99);
const failure = failedEvents.find((event) => event.regionId === 'failure-home' && event.type === 'exploration_voyage_failed');
assert.ok(failure, 'a launched voyage can fail');
const failedState = ensureOceanicExplorationState(failureHome);
assert.ok(failedState.seaKnowledge.sea_frontier > 0 && failedState.seaKnowledge.sea_frontier < 0.42, 'failed voyage should return only weak route knowledge');
assert.equal(Boolean(failedState.knownCoastalRegions.foreign), false, 'failed voyage must not reveal the destination coast');

// Navigation knowledge should diffuse through existing sparse social/trade links.
const learnerTemplate = coastalRegion('tmp', 'sea_home');
const learner = coastalRegion('learner', 'sea_home', {
  navy: { boats: 0, advancedBoats: 0 },
  neighbors: ['home'],
  renaissance: {
    ...learnerTemplate.renaissance,
    printing: { ...learnerTemplate.renaissance.printing, mechanicalPress: true, informationVelocity: 0.8 },
  },
});
const diffusionRegions = [home, learner, bridge, foreign, far];
tickOceanicExploration(diffusionRegions, seas, [], 0, 30, () => 0.99);
tickOceanicExploration(diffusionRegions, seas, [], 53, 365.2425, () => 0.99);
assert.ok((ensureOceanicExplorationState(learner).seaKnowledge.sea_frontier || 0) > 0, 'route knowledge should diffuse through local networks');
assert.ok((ensureOceanicExplorationState(learner).seaKnowledge.sea_frontier || 0) < ensureOceanicExplorationState(home).seaKnowledge.sea_frontier, 'diffused information should be less certain than first-hand knowledge');

// No ships means no expedition, even with money and knowledge.
const noShips = coastalRegion('no-ships', 'sea_home', { navy: { boats: 0, advancedBoats: 0 } });
tickOceanicExploration([noShips, foreign], seas, [], 0, 30, () => 0);
const noShipEvents = tickOceanicExploration([noShips, foreign], seas, [], 53, 365.2425, () => 0);
assert.equal(noShipEvents.length, 0, 'actors require real maritime capacity');

console.log(JSON.stringify({
  success: { targetSeaId: success.targetSeaId, discovered: success.discoveredRegionIds, reliability: success.routeReliability },
  failure: { targetSeaId: failure.targetSeaId, knowledge: failedState.seaKnowledge.sea_frontier },
  diffusion: ensureOceanicExplorationState(learner).seaKnowledge.sea_frontier,
}, null, 2));
