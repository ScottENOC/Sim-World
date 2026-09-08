import assert from 'node:assert/strict';
import { alliedCoordinationQuality, resolveSubregionalArmyBattles } from '../js/military/subregionalArmyBattles.js';

function attacker(id, actor, institutionalExperience = 0.3) {
  return {
    id, governance: { sovereignPolityId: actor }, controllingActorId: actor,
    army: { personnel: 6000, away: 2200 },
    militaryProfessionalisation: { institutionalExperience },
  };
}

function campaign(id, attackerId, actor, personnel, nodeId = 'capital', previousNodeId = 'rear') {
  return {
    id, attackerId, defenderId: 'target', occupationActorId: actor,
    phase: 'engaged', completed: false, personnel, initialPersonnel: personnel,
    attackerCasualties: 0, attackerMorale: 0.9, supply: 0.9, warId: 'war-1',
    subregional: { currentNodeId: nodeId, previousNodeId, targetNodeId: nodeId, route: [], routeIndex: 0, edgeProgress: 0, blockedByCampaignId: null },
  };
}

const defender = {
  id: 'target', subregionalControl: { places: [
    { id: 'capital', kind: 'city', controllerActorId: 'C', garrisonActorId: 'C', garrisonPersonnel: 100 },
    { id: 'rear', kind: 'village_district', controllerActorId: 'A' },
    { id: 'enemy-rear', kind: 'village_district', controllerActorId: 'C' },
  ] },
};

const aRegion = attacker('a-home', 'A', 0.45);
const bRegion = attacker('b-home', 'B', 0.45);
const cRegion = attacker('c-home', 'C', 0.35);
const regionsById = new Map([['a-home', aRegion], ['b-home', bRegion], ['c-home', cRegion], ['target', defender]]);

function warWithAB(abStance) {
  return { id: 'war-1', participants: [
    { actorId: 'A', stances: { B: abStance, C: 'hostile' } },
    { actorId: 'B', stances: { A: abStance, C: 'hostile' } },
    { actorId: 'C', stances: { A: 'hostile', B: 'hostile' } },
  ] };
}

let a = campaign(1, 'a-home', 'A', 900);
let b = campaign(2, 'b-home', 'B', 900);
let c = campaign(3, 'c-home', 'C', 1350, 'capital', 'enemy-rear');
let war = warWithAB('cooperate');
const cooperativeQuality = alliedCoordinationQuality([a, b], war, regionsById);
assert.ok(cooperativeQuality > 0.9 && cooperativeQuality <= 1, 'cooperating allies should coordinate efficiently but not exceed perfect combination');
let events = resolveSubregionalArmyBattles([a, b, c], [war], defender, regionsById, 20, () => 0.5);
assert.equal(events.length, 1, 'two cooperating allied armies should fight as one coalition against the common enemy');
assert.match(events[0].type, /^subregional_coalition_battle_/);
assert.equal(events[0].coalitionA.length, 2);
assert.equal(events[0].coalitionB.length, 1);
assert.ok(a.personnel < 900 && b.personnel < 900 && c.personnel < 1350, 'each participating army should keep and take its own casualties');
assert.ok(events[0].coordinationA > 0.9, 'battle record should expose coalition coordination quality');

// Co-belligerents still help one another, but combine less efficiently than armies explicitly cooperating.
a = campaign(4, 'a-home', 'A', 900);
b = campaign(5, 'b-home', 'B', 900);
c = campaign(6, 'c-home', 'C', 1350, 'capital', 'enemy-rear');
war = warWithAB('cobelligerent');
const cobelligerentQuality = alliedCoordinationQuality([a, b], war, regionsById);
assert.ok(cobelligerentQuality < cooperativeQuality, 'co-belligerents should have a real coordination penalty');
events = resolveSubregionalArmyBattles([a, b, c], [war], defender, regionsById, 21, () => 0.5);
assert.equal(events.length, 1);
assert.equal(events[0].coalitionA.length, 2);
assert.ok(events[0].coordinationA < cooperativeQuality);

// Armies ordered to avoid each other do not pool their strength merely because they share an enemy.
a = campaign(7, 'a-home', 'A', 900);
b = campaign(8, 'b-home', 'B', 900);
c = campaign(9, 'c-home', 'C', 1350, 'capital', 'enemy-rear');
war = warWithAB('avoid');
events = resolveSubregionalArmyBattles([a, b, c], [war], defender, regionsById, 22, () => 0.5);
assert.equal(events.length, 2, 'independent co-belligerents should each encounter the common enemy separately');
assert.ok(events.every((event) => event.coalitionA.length === 1 && event.coalitionB.length === 1));

console.log('allied battle coordination regressions passed');
