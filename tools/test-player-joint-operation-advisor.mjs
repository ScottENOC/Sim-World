import assert from 'node:assert/strict';
import { tickPlayerJointOperationAdvisor, resolvePlayerJointOperationAdvice, jointOperationCouncilAssessment } from '../js/military/playerJointOperationAdvisor.js';

function region(id, actor, neighbors = []) {
  return {
    id, name: id, governance: { sovereignPolityId: actor }, controllingActorId: actor,
    neighbors, adjacentSeaIds: [], isCoastal: false, population: 12000, safetyRating: 0.9,
    demographics: { workingAge: 6500 }, army: { personnel: 1200, away: 0 },
    militaryStrategy: { posture: 'peace', desiredPreparationWeeks: 8, spendingPriority: 0.5, garrisonFloor: 0.8, vassalAssumption: 'none', allyAssumption: 'none', secrecy: 0.5 },
    militaryFinance: { readiness: 0.82 }, stockpile: { food: 5000 }, treasury: 1000,
    construction: { assets: [] }, relations: new Map(), diplomaticIntelligence: [],
    subregionalControl: { places: [{ id: `${id}-city`, kind: 'principal_settlement', name: `${id} city` }] },
  };
}

const player = region('wessex', 'W', ['essex']);
const ally = region('kent', 'K', ['essex']);
const enemy = region('essex', 'E', ['wessex','kent']);
const regionsById = new Map([[player.id, player],[ally.id, ally],[enemy.id, enemy]]);
const plan = {
  id: 'joint-1', type: 'joint_operation', active: true, proposerRegionId: player.id, partnerRegionId: ally.id,
  proposerActorId: 'W', partnerActorId: 'K', enemyRegionId: enemy.id, enemyActorId: 'E',
  attackTick: 20, createdTick: 8, proposerDeclaredFraction: 0.6, partnerDeclaredFraction: 0.5,
  objective: 'subjugation', subregionalObjective: 'capital', execution: {}, sourceMessageId: 'dmsg-1',
};

// Mobilisation advice should arrive before the staging and launch prompts.
let events = tickPlayerJointOperationAdvisor(player, [plan], regionsById, [], 12);
assert.equal(events.length, 1);
assert.equal(events[0].type, 'joint_operation_mobilise_advice');
let result = resolvePlayerJointOperationAdvice(events[0], 'yes', player, regionsById, [], [], 12);
assert.equal(result.accepted, true);
assert.equal(player.militaryStrategy.posture, 'mobilise_war');

// The staging prompt names a concrete muster location from the player's own subregional geography.
events = tickPlayerJointOperationAdvisor(player, [plan], regionsById, [], 18);
assert.equal(events.length, 1);
assert.equal(events[0].type, 'joint_operation_stage_advice');
assert.equal(events[0].assessment.staging.name, 'wessex city');
result = resolvePlayerJointOperationAdvice(events[0], 'yes', player, regionsById, [], [], 18);
assert.equal(result.accepted, true);
assert.equal(plan.playerPreparation.proposer.stagingNodeId, 'wessex-city');

// A delivered diplomatic reply is visible; private ally intent is not surfaced in council advice.
player.diplomaticIntelligence.push({ type: 'joint_operation_reply_received', jointOperationId: plan.id, accepted: true, learnedTick: 14 });
plan.partnerPrivateIntent = { honour: false, commitmentFraction: 0.02, delayWeeks: 4 };
const assessment = jointOperationCouncilAssessment(player, plan, regionsById, [], 19);
assert.equal(assessment.allySignal, 'confirmed_words');
assert.match(assessment.allySummary, /formally accepted/);
assert.doesNotMatch(assessment.allySummary, /renege|2%|delay/i, 'council must not reveal hidden ally intent');

// On the agreed date the player gets a final confirmation rather than an automatic attack.
events = tickPlayerJointOperationAdvisor(player, [plan], regionsById, [], 20);
assert.equal(events.length, 1);
assert.equal(events[0].type, 'joint_operation_launch_confirmation');
result = resolvePlayerJointOperationAdvice(events[0], 'no', player, regionsById, [], [], 20);
assert.equal(result.accepted, false);
assert.equal(plan.execution.proposer.status, 'reneged_by_player');

console.log('player joint-operation advisor regressions passed');
