import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONSTRUCTION_TYPES } from '../js/economy/construction.js';
import {
  TELEPHONE_TECH_ID,
  telephonePotentialCoverage,
  tickLocalCommunications,
  telephoneIndustrialMultiplier,
  telephoneAdministrativeMultiplier,
  telephoneMilitaryCommandMultiplier,
} from '../js/economy/localCommunications.js';
import { telephoneBreakthroughChance, tickTelephoneBreakthroughs } from '../js/technology/telephone.js';

function region(id, { telephone = false, telegraph = false, exchanges = 0, exchangeCondition = 1, population = 80000, urban = 0.65, precision = 0.7 } = {}) {
  const techs = new Set();
  if (telegraph) techs.add('electrical_telegraphy');
  if (telephone) techs.add(TELEPHONE_TECH_ID);
  return {
    id,
    name: id,
    neighbors: [],
    population,
    unlockedTechIds: techs,
    medievalSociety: { urban: { urbanisation: urban } },
    industrialSupply: { capability: { precision_machining: precision } },
    communicationState: { writingAvailable: true },
    stateAdministration: { officialdom: 0.8, records: 0.75 },
    army: { personnel: 900 },
    construction: {
      projects: [],
      completed: {},
      assets: Array.from({ length: exchanges }, (_, i) => ({ id: `${id}-exchange-${i}`, typeId: 'telephone_exchange', condition: exchangeCondition, scale: 1 })),
    },
  };
}

assert.equal(CONSTRUCTION_TYPES.telephone_exchange.requiredTechId, TELEPHONE_TECH_ID);
assert.equal(CONSTRUCTION_TYPES.telephone_exchange.requiresInfrastructure, 'telegraph_network');

const noTech = region('no-tech', { exchanges: 1 });
assert.equal(telephonePotentialCoverage(noTech), 0, 'telephone infrastructure cannot work before the breakthrough');

const noExchange = region('no-exchange', { telephone: true });
assert.equal(telephonePotentialCoverage(noExchange), 0, 'technology alone must not create telephone service');

const working = region('working', { telephone: true, telegraph: true, exchanges: 1 });
const oneExchangeCoverage = telephonePotentialCoverage(working);
assert.ok(oneExchangeCoverage > 0 && oneExchangeCoverage < 1, 'one exchange should create partial local coverage');

tickLocalCommunications(working, 56);
assert.ok(Math.abs(working.localCommunications.telephoneCoverage - oneExchangeCoverage) < 1e-9, '56-day update should reach the current coverage target');
assert.ok(working.localCommunications.administrativeCoordination > 0);
assert.ok(working.localCommunications.militaryCoordination > 0);
assert.ok(telephoneIndustrialMultiplier(working) > 1 && telephoneIndustrialMultiplier(working) <= 1.06 + 1e-9);
assert.ok(telephoneAdministrativeMultiplier(working) > 1 && telephoneAdministrativeMultiplier(working) <= 1.10 + 1e-9);
assert.ok(telephoneMilitaryCommandMultiplier(working) > 1 && telephoneMilitaryCommandMultiplier(working) <= 1.08 + 1e-9);

const denserNetwork = region('denser', { telephone: true, telegraph: true, exchanges: 2 });
assert.ok(telephonePotentialCoverage(denserNetwork) > oneExchangeCoverage, 'additional exchanges should expand useful coverage with diminishing returns');

const damaged = region('damaged', { telephone: true, telegraph: true, exchanges: 1, exchangeCondition: 0.1 });
assert.equal(telephonePotentialCoverage(damaged), 0, 'severely damaged exchanges should provide no service');

const preTelephone = region('pre-telephone', { telegraph: false, precision: 1, urban: 1 });
assert.equal(telephoneBreakthroughChance(preTelephone, new Map([[preTelephone.id, preTelephone]])), 0, 'telephone breakthrough requires telegraph experience');

const inventor = region('inventor', { telegraph: true, precision: 0.9, urban: 0.8 });
let byId = new Map([[inventor.id, inventor]]);
assert.ok(telephoneBreakthroughChance(inventor, byId) > 0, 'telegraphy plus precision industry should allow an independent telephone breakthrough');
const events = tickTelephoneBreakthroughs([inventor], 123, () => 0, 7);
assert.equal(events.length, 1);
assert.equal(events[0].technologyId, TELEPHONE_TECH_ID);
assert.ok(inventor.unlockedTechIds.has(TELEPHONE_TECH_ID));

const learner = region('learner', { telegraph: true, precision: 0.45, urban: 0.5 });
const neighbour = region('neighbour', { telegraph: true, telephone: true, precision: 0.45, urban: 0.5 });
learner.neighbors = ['neighbour']; neighbour.neighbors = ['learner'];
byId = new Map([[learner.id, learner], [neighbour.id, neighbour]]);
const withNeighbour = telephoneBreakthroughChance(learner, byId);
learner.neighbors = [];
const withoutNeighbour = telephoneBreakthroughChance(learner, byId);
assert.ok(withNeighbour > withoutNeighbour, 'knowledgeable neighbours should raise telephone diffusion probability');

const essex = region('essex', { telegraph: true, precision: 0.92, urban: 0.82 });
const nottingham = region('nottingham', { telegraph: true, precision: 0.55, urban: 0.65 });
essex.polityId = 'united-kingdom';
nottingham.polityId = 'united-kingdom';
const polityEvents = tickTelephoneBreakthroughs([essex, nottingham], 456, () => 0, 7);
assert.equal(polityEvents.length, 1, 'one polity should roll one telephone breakthrough rather than one roll per region');
assert.equal(polityEvents[0].polityId, 'united-kingdom');
assert.equal(polityEvents[0].regionId, 'essex', 'the strongest innovation centre should be recorded as the breakthrough origin');
assert.ok(essex.unlockedTechIds.has(TELEPHONE_TECH_ID));
assert.ok(nottingham.unlockedTechIds.has(TELEPHONE_TECH_ID), 'national knowledge should be available for local adoption in every polity region');

const mainSource = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const industrialSource = fs.readFileSync(new URL('../js/economy/industrialSupply.js', import.meta.url), 'utf8');
const breakthroughSource = fs.readFileSync(new URL('../js/technology/breakthroughs.js', import.meta.url), 'utf8');
assert.match(mainSource, /tickLocalCommunications\(region, time\.elapsedDays\)/, 'regional telephone service must run in the live simulation');
assert.match(industrialSource, /telephoneIndustrialMultiplier\(region\)/, 'industrial output must consume the local communications signal');
assert.match(breakthroughSource, /tickTelephoneBreakthroughs\(regions, currentTick, rng, [A-Za-z_$][\w$]*\)/, 'telephone breakthroughs must be integrated into the technology tick with an elapsed-time argument');

console.log('Telephone and local communications regressions passed.');
