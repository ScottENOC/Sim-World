import assert from 'node:assert/strict';
import { KnowledgeLedger, KNOWLEDGE_SOURCES, KNOWLEDGE_TOPICS } from '../js/core/knowledge.js';
import { MILITARY_POSTURES, ensureMilitaryStrategy, reviewMilitaryStrategy, setMilitaryStrategy } from '../js/military/strategicPlanning.js';
import { sendWarInvitation, tickDiplomaticCouriers } from '../js/diplomacy/couriers.js';

function region(id, actor, neighbors = [], seas = []) {
  const r = {
    id, name: id, neighbors, adjacentSeaIds: seas, isCoastal: seas.length > 0,
    population: 10000, demographics: { workingAge: 5500 },
    army: { personnel: 90, away: 0 }, navy: { boats: 0, advancedBoats: 0, personnel: 0 },
    safetyRating: 1, conflictPressure: 0, banditPopulation: 0,
    governance: { sovereignPolityId: actor, autonomy: 0.5, levyHistory: { sent: 0, returned: 0 } },
    controllingActorId: actor,
    construction: { assets: [] }, relations: new Map(), diplomaticMessages: [],
    militaryStrategy: { posture: 'peace', garrisonFloor: 1, spendingPriority: 0.45, desiredPreparationWeeks: 26, secrecy: 0.35, vassalAssumption: 'none', allyAssumption: 'none', planReport: {} },
    knowledge: new KnowledgeLedger(id),
  };
  return r;
}

function know(a, b, confidence = 1) {
  a.knowledge.addObservation({ subjectId: b.id, topic: KNOWLEDGE_TOPICS.MILITARY, source: KNOWLEDGE_SOURCES.SCOUT, confidence, specificity: confidence, receivedAt: 1, observedAt: 1 });
  a.knowledge.addObservation({ subjectId: b.id, topic: KNOWLEDGE_TOPICS.POPULATION, source: KNOWLEDGE_SOURCES.SCOUT, confidence, specificity: confidence, receivedAt: 1, observedAt: 1 });
}

const essex = region('essex', 'polity_essex', ['mid']);
const mid = region('mid', 'polity_mid', ['essex','kent','ally']);
const kent = region('kent', 'polity_kent', ['mid']);
kent.army.personnel = 180;
know(essex, kent, 1); know(kent, essex, 1);

let report = reviewMilitaryStrategy(essex, { regions: [essex, mid, kent], polities: [], agreements: [], activeCampaigns: [], currentTick: 10 });
assert.ok(report.establishment >= report.normalGarrison, 'peace establishment must at least cover local defence');
assert.equal(ensureMilitaryStrategy(essex).posture, MILITARY_POSTURES.PEACE);

setMilitaryStrategy(essex, { posture: MILITARY_POSTURES.PREPARE_WAR, targetRegionId: 'kent', garrisonFloor: 0.3, spendingPriority: 0.8, desiredPreparationWeeks: 20 });
report = reviewMilitaryStrategy(essex, { regions: [essex, mid, kent], polities: [], agreements: [], activeCampaigns: [], currentTick: 11 });
assert.ok(report.retainedGarrison <= report.normalGarrison * 0.31, 'wartime garrison floor should release home troops');
assert.ok(report.establishment > report.retainedGarrison, 'war plan should create a field establishment');
assert.ok(report.recruitPerWeekNeeded > 0, 'understrength war plan should generate a recruitment rate');
assert.ok(report.enemyUncertainty < 0.3, 'good scouting should narrow the enemy estimate');

const ally = region('ally', 'polity_ally', ['mid']);
know(ally, kent, 1); know(ally, essex, 1);
const invitation = sendWarInvitation(essex, ally, kent, [essex, mid, kent, ally], 20, { requestedPersonnel: 40, secrecy: 0.5 });
assert.equal(invitation.sent, true);
assert.ok(invitation.message.arrivalTick > 20, 'diplomatic message should take time');
assert.equal(invitation.message.route.mode, 'land');

// Safe route + genuinely favourable deterministic roll: message arrives and creates a commitment.
const agreements = [];
let events = tickDiplomaticCouriers([essex, mid, kent, ally], agreements, [], invitation.message.arrivalTick, 7, () => 0.1);
const response = events.find((e) => e.type === 'join_war_response');
assert.ok(response, 'arrival should produce a response');
assert.equal(response.accepted, true, 'friendly safe ally should accept with a favourable roll');
assert.ok(agreements.some((a) => a.type === 'war_commitment' && a.enemyActorId === 'polity_kent'));
assert.equal(ally.militaryStrategy.posture, 'prepare_war');
assert.equal(ally.militaryStrategy.targetRegionId, 'kent');

// A dangerous intermediate region can compromise or destroy a courier.
const sender2 = region('sender2', 'polity_sender2', ['danger']);
const danger = region('danger', 'polity_danger', ['sender2','target2']);
danger.safetyRating = 0; danger.conflictPressure = 1;
const target2 = region('target2', 'polity_target2', ['danger']);
sender2.relations.set('danger', { attitude: -1 });
const msg2 = sendWarInvitation(sender2, target2, kent, [sender2, danger, target2, kent], 30, { requestedPersonnel: 20, secrecy: 0 });
assert.equal(msg2.sent, true);
events = tickDiplomaticCouriers([sender2, danger, target2, kent], [], [], 31, 7, () => 0);
assert.ok(events.some((e) => e.type === 'diplomatic_message_intercepted'), 'contested route should be interceptable');

console.log('strategic military planning regressions passed');
