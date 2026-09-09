import assert from 'node:assert/strict';
import { sendJointOperationProposal, tickDiplomaticCouriers } from '../js/diplomacy/couriers.js';
import { activateJointOperations } from '../js/military/jointOperations.js';
import { battleParticipationFraction } from '../js/military/battleCommand.js';
import { resolveSubregionalArmyBattles } from '../js/military/subregionalArmyBattles.js';
import { ensureCommunicationState } from '../js/diplomacy/languageCommunication.js';
import { adoptInstitutionalLanguage, ensureLanguageNetwork } from '../js/diplomacy/languageNetworks.js';

function region(id, actor, neighbors = []) {
  return {
    id, name: id, governance: { sovereignPolityId: actor }, controllingActorId: actor,
    neighbors, adjacentSeaIds: [], safetyRating: 1, conflictPressure: 0,
    population: 10000, army: { personnel: 2000, away: 0 },
    relations: new Map(), diplomaticMessages: [], stockpile: { food: 5000 },
  };
}

// Proposal and reply both travel as physical courier messages. Acceptance is not instant knowledge.
// This partner is duplicitous: willing to say yes, but friendlier with Essex than with the proposer,
// which makes deliberately showing Essex the letter a plausible outcome.
const sender = region('sender', 'A', ['ally']);
const ally = region('ally', 'B', ['sender', 'essex']);
const essex = region('essex', 'E', ['ally']);
sender.relations.set('ally', { attitude: 0.2 });
ally.relations.set('sender', { attitude: -0.6 });
ally.relations.set('essex', { attitude: 0.8 });
const regions = [sender, ally, essex];
// This regression is about courier timing/betrayal, not first-contact translation.
// Give the two negotiating courts an already-shared diplomatic language.
ensureCommunicationState(sender); ensureCommunicationState(ally);
for (const court of [sender, ally]) {
  ensureLanguageNetwork(court).specialists['lang:diplomatic-test'] = { conversational: 8, working: 5, fluent: 3, literate: 0, scribes: 0, interpreters: 2 };
  adoptInstitutionalLanguage(court, 'court', 'lang:diplomatic-test');
}
const agreements = [];
const proposal = sendJointOperationProposal(sender, ally, essex, regions, 0, {
  attackTick: 12, commitmentFraction: 0.6, secrecy: 0.65,
});
assert.equal(proposal.sent, true);
assert.equal(proposal.message.status, 'in_transit');
let events = tickDiplomaticCouriers(regions, agreements, [], 1, 7, () => 0.05);
assert.equal(agreements.length, 1, 'accepted proposal should create a joint-operation plan');
assert.equal(agreements[0].attackTick, 12);
assert.ok(ally.diplomaticMessages.some((m) => m.type === 'joint_operation_reply' && m.status === 'in_transit'));
assert.notEqual(proposal.message.response?.replyMessageId, null);
assert.ok(essex.diplomaticIntelligence?.some((r) => r.type === 'joint_operation_leak'), 'a duplicitous partner can deliberately show the plan to the target');
events = tickDiplomaticCouriers(regions, agreements, [], 2, 7, () => 0.99);
assert.ok(events.some((e) => e.type === 'joint_operation_reply_delivered'), 'the acceptance itself must travel back');

// Couriers can be intercepted and physically lost before the message arrives.
const s2 = region('s2', 'S', ['mid']);
const mid = region('mid', 'M', ['s2', 't2']);
const t2 = region('t2', 'T', ['mid']);
const enemy2 = region('enemy2', 'X', []);
mid.safetyRating = 0; mid.conflictPressure = 1;
s2.relations.set('mid', { attitude: -1 });
const riskyRegions = [s2, mid, t2, enemy2];
const risky = sendJointOperationProposal(s2, t2, enemy2, riskyRegions, 0, { attackTick: 20, secrecy: 0 });
assert.equal(risky.sent, true);
events = tickDiplomaticCouriers(riskyRegions, [], [], 1, 7, () => 0);
assert.equal(risky.message.status, 'intercepted_lost');
assert.ok(events.some((e) => e.type === 'diplomatic_message_intercepted' && e.destroyed));
assert.ok(mid.diplomaticIntelligence?.some((r) => r.type === 'intercepted_joint_operation'));

// Public promises and private intentions are distinct: an accepted ally can still renege.
const renegePlan = {
  id: 'joint-test', type: 'joint_operation', active: true,
  proposerRegionId: 'sender', partnerRegionId: 'ally', enemyRegionId: 'essex', attackTick: 5,
  proposerDeclaredFraction: 0.6, partnerDeclaredFraction: 0.6,
  proposerPrivateIntent: { honour: true, commitmentFraction: 0.6, delayWeeks: 0 },
  partnerPrivateIntent: { honour: false, commitmentFraction: 0.05, delayWeeks: 0 }, execution: {},
};
const activationEvents = activateJointOperations(ally, new Map(regions.map((r) => [r.id, r])), [renegePlan], [], [], 5, () => 0.5);
assert.equal(renegePlan.execution.partner.status, 'reneged');
assert.ok(activationEvents.some((e) => e.type === 'joint_operation_reneged'));

// A field army can hold reserves instead of automatically committing every soldier.
const cautiousCampaign = { personnel: 1000, attackerMorale: 1, supply: 1, battleCommand: { intendedCommitmentFraction: 0.35 } };
const cautiousFraction = battleParticipationFraction(cautiousCampaign, sender);
assert.ok(cautiousFraction < 0.4 && cautiousFraction > 0.3);
cautiousCampaign.logisticsState = { status: 'starving', supplyFraction: 0.1 };
assert.ok(battleParticipationFraction(cautiousCampaign, sender) >= 0.95, 'starvation can force a desperate commander to commit reserves');

// The participation choice is used in real coalition battle power/casualties.
function campaign(id, attackerId, actor, fraction) {
  return {
    id, attackerId, defenderId: 'battlefield', occupationActorId: actor, warId: 'war-test',
    phase: 'engaged', completed: false, personnel: 1000, initialPersonnel: 1000,
    attackerCasualties: 0, attackerMorale: 0.9, supply: 1,
    battleCommand: { intendedCommitmentFraction: fraction },
    subregional: { currentNodeId: 'town', previousNodeId: actor === 'A' ? 'west' : 'east', targetNodeId: 'town', route: [], routeIndex: 0, edgeProgress: 0, blockedByCampaignId: null },
  };
}
const battlefield = { id: 'battlefield', subregionalControl: { places: [{ id: 'town', kind: 'town', controllerActorId: 'E' }] } };
const aHome = region('aHome', 'A'); aHome.army.away = 1000;
const bHome = region('bHome', 'B'); bHome.army.away = 1000;
const ca = campaign(101, 'aHome', 'A', 0.35);
const cb = campaign(102, 'bHome', 'B', 0.9);
const war = { id: 'war-test', participants: [
  { actorId: 'A', stances: { B: 'hostile' } }, { actorId: 'B', stances: { A: 'hostile' } },
] };
const battleEvents = resolveSubregionalArmyBattles([ca, cb], [war], battlefield,
  new Map([['aHome', aHome], ['bHome', bHome], ['battlefield', battlefield]]), 8, () => 0.5);
assert.equal(battleEvents.length, 1);
assert.ok(ca.lastBattleParticipationFraction < cb.lastBattleParticipationFraction);
assert.ok(battleEvents[0].powerA < battleEvents[0].powerB);

console.log('joint operation courier and command regressions passed');
