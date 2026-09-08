import assert from 'node:assert/strict';
import { resolveSubregionalArmyBattles } from '../js/military/subregionalArmyBattles.js';

function attacker(id, actor) {
  return {
    id, governance: { sovereignPolityId: actor }, controllingActorId: actor,
    army: { personnel: 5000, away: 1800 }, militaryProfessionalisation: { institutionalExperience: 0.3 },
  };
}
function campaign(id, attackerId, actor, personnel, nodeId, previousNodeId) {
  return {
    id, attackerId, defenderId: 'target', occupationActorId: actor,
    phase: 'engaged', completed: false, personnel, initialPersonnel: personnel,
    attackerCasualties: 0, attackerMorale: 0.9, supply: 0.85,
    subregional: { currentNodeId: nodeId, previousNodeId, targetNodeId: nodeId, route: [], routeIndex: 0, edgeProgress: 0, blockedByCampaignId: null },
  };
}
const defender = {
  id: 'target', subregionalControl: { places: [
    { id: 'capital', kind: 'city', controllerActorId: 'A', garrisonActorId: 'A', garrisonPersonnel: 100 },
    { id: 'west', kind: 'village_district', controllerActorId: 'A' },
    { id: 'east', kind: 'village_district', controllerActorId: 'B' },
  ] },
};
const aRegion = attacker('a-home', 'A');
const bRegion = attacker('b-home', 'B');
const regionsById = new Map([['a-home', aRegion], ['b-home', bRegion], ['target', defender]]);
const hostileWar = { id: 'war-1', participants: [
  { actorId: 'A', stances: { B: 'hostile' } },
  { actorId: 'B', stances: { A: 'hostile' } },
] };

let a = campaign(1, 'a-home', 'A', 1500, 'capital', 'west');
let b = campaign(2, 'b-home', 'B', 700, 'capital', 'east');
a.warId = b.warId = 'war-1';
let events = resolveSubregionalArmyBattles([a, b], [hostileWar], defender, regionsById, 12, () => 0.5);
assert.equal(events.length, 1);
assert.equal(events[0].type, 'subregional_army_battle_decided');
assert.equal(events[0].winnerCampaignId, 1);
assert.equal(b.subregional.currentNodeId, 'east', 'loser should fall back to its previous node');
assert.ok(a.personnel < 1500 && b.personnel < 700, 'both field armies should take real casualties');
assert.ok(aRegion.army.away < 1800 && bRegion.army.away < 1800, 'losses should reduce the owning regions away ledgers');

// Similar forces should be able to remain locked in an indecisive node battle.
a = campaign(3, 'a-home', 'A', 1000, 'capital', 'west');
b = campaign(4, 'b-home', 'B', 980, 'capital', 'east');
a.warId = b.warId = 'war-1';
events = resolveSubregionalArmyBattles([a, b], [hostileWar], defender, regionsById, 13, () => 0.5);
assert.equal(events[0].type, 'subregional_army_battle_continues');
assert.equal(a.subregional.blockedByCampaignId, 4);
assert.equal(b.subregional.blockedByCampaignId, 3);

// Co-belligerents sharing a node do not fight merely because they are separate armies.
const friendlyWar = { id: 'war-2', participants: [
  { actorId: 'A', stances: { B: 'cobelligerent' } },
  { actorId: 'B', stances: { A: 'cobelligerent' } },
] };
a = campaign(5, 'a-home', 'A', 1000, 'capital', 'west');
b = campaign(6, 'b-home', 'B', 1000, 'capital', 'east');
a.warId = b.warId = 'war-2';
events = resolveSubregionalArmyBattles([a, b], [friendlyWar], defender, regionsById, 14, () => 0.5);
assert.equal(events.length, 0);
assert.equal(a.personnel, 1000);
assert.equal(b.personnel, 1000);

console.log('subregional army battle regressions passed');
