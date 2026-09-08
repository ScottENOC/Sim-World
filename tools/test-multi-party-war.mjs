import assert from 'node:assert/strict';
import { addWarParticipant, createWarFromCampaign, expectedOccupationSeverity, participantInWar, setEnemyPriority, setWarStance, stanceBetween, syncWarTheatres, WAR_AIMS, WAR_STANCES } from '../js/military/warTheatres.js';
import { KnowledgeLedger } from '../js/core/knowledge.js';

function region(id, actor, attitudeEntries = []) {
  return {
    id, name: id, neighbors: [], adjacentSeaIds: [], population: 10000,
    army: { personnel: 100, away: 0 }, raidEconomy: { totalCasualties: 0 },
    governance: { sovereignPolityId: actor }, controllingActorId: actor,
    relations: new Map(attitudeEntries), knowledge: new KnowledgeLedger(id),
  };
}
const A = region('a','A');
const B = region('b','B');
const C = region('c','C');
A.relations.set('c',{ attitude: 0.7 });
C.relations.set('a',{ attitude: 0.7 });
B.relations.set('a',{ attitude: -0.5 });
B.relations.set('c',{ attitude: -0.9 });
const regions=[A,B,C];
const regionsById=new Map(regions.map(r=>[r.id,r]));
const campaign={ id:1, attackerId:'a', defenderId:'b', objective:'subjugation', completed:false };
const war=createWarFromCampaign(campaign, regionsById, 10);
assert.ok(war && campaign.warId===war.id);
assert.equal(stanceBetween(war,'A','B'),WAR_STANCES.HOSTILE);

const joined=addWarParticipant(war,'C',11,regions,{ sideId:'A', targetActorId:'B', warAim:WAR_AIMS.DEFEAT,
  stances:{ A:WAR_STANCES.COOPERATE, B:WAR_STANCES.HOSTILE } });
assert.equal(joined.added,true);
assert.equal(stanceBetween(war,'C','A'),WAR_STANCES.COOPERATE);
assert.equal(stanceBetween(war,'C','B'),WAR_STANCES.HOSTILE);
assert.ok(participantInWar(war,'B').enemyPriorities.C>0);

setWarStance(war,'B','C',WAR_STANCES.HOSTILE);
setEnemyPriority(war,'B','C',0.85);
assert.ok(participantInWar(war,'B').enemyPriorities.C > participantInWar(war,'B').enemyPriorities.A,
  'defender can prioritise one invader over another');

const sevA=expectedOccupationSeverity('B','A',regions,war);
const sevC=expectedOccupationSeverity('B','C',regions,war);
assert.ok(sevC>sevA,'more feared occupier should be assessed as more severe');

const wars=[];
const agreements=[{ id:'wc', type:'war_commitment', fromId:'c', toId:'a', enemyActorId:'B', active:true, personnel:50 }];
const events=syncWarTheatres(wars,[{...campaign,warId:null}],regions,agreements,12);
assert.equal(wars.length,1);
assert.ok(participantInWar(wars[0],'C'),'war commitment should add third participant');
assert.ok(events.some(e=>e.type==='war_participant_joined'));
console.log('multi-party war regressions passed');
