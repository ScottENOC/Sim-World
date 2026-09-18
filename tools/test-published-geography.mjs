import assert from 'node:assert/strict';
import { initialiseKnowledge, knowledgeStage, KNOWLEDGE_TOPICS } from '../js/core/knowledge.js';
import { tickPublishedGeography } from '../js/core/publishedGeography.js';

function region(id, name, x) {
  return {
    id, name, centroid: [x, 0], neighbors: [], tradePartnerIds: new Set(), recentTradePartners: new Map(),
    educationLevel: 0.7,
    renaissance: { printing: { mechanicalPress: true, publicationFlow: 0.8, informationVelocity: 0.75, presses: 5, printCapacity: 0.8, vernacularShare: 0.7, censorship: 0, importedPrint: 0, religiousChallengePressure: 0 }, patronage: { court:0,merchant:0,religious:0,civic:0,scholarly:0,artsPrestige:0,knowledgeProduction:0,talentAttraction:0 }, university:{} },
  };
}

const a = region('a', 'A', 0), b = region('b', 'B', 2), c = region('c', 'C', 4), d = region('d', 'D', 6);
a.neighbors = ['b']; b.neighbors = ['a','c']; c.neighbors = ['b','d']; d.neighbors = ['c'];
initialiseKnowledge([a,b,c,d], []);

// Give B solid mapped knowledge of distant D, without giving A that knowledge directly.
b.knowledge.addObservation({ subjectId:'d', topic:KNOWLEDGE_TOPICS.EXISTENCE, value:{name:'D'}, source:'direct', confidence:1, specificity:1, provenance:{type:'test_map'}, subjectMatter:['identity'] });
b.knowledge.addObservation({ subjectId:'d', topic:KNOWLEDGE_TOPICS.LOCATION, value:{direction:'east'}, source:'direct', confidence:1, specificity:1, provenance:{type:'test_map'}, subjectMatter:['location'] });
assert.equal(knowledgeStage(a,d), 'unknown');

tickPublishedGeography([a,b,c,d], 52, 366);
assert.notEqual(knowledgeStage(a,d), 'unknown', 'A should learn of D through B publications');
assert.ok(a.knowledge.hasObservation({ subjectId:'d', topic:KNOWLEDGE_TOPICS.EXISTENCE, provenanceType:'published_geography' }));
assert.ok(a.knowledge.hasObservation({ subjectId:'d', topic:KNOWLEDGE_TOPICS.LOCATION, provenanceType:'published_geography' }));
assert.equal(a.knowledge.hasTopic('d', KNOWLEDGE_TOPICS.MILITARY), false, 'atlases must not leak military intelligence');
assert.equal(a.knowledge.hasTopic('d', KNOWLEDGE_TOPICS.ECONOMY), false, 'atlases must not leak economic intelligence');

// A can now republish D to its own connected readers in a later annual cycle.
a.tradePartnerIds.add('c'); c.tradePartnerIds.add('a');
c.knowledge.observations = c.knowledge.observations.filter(o => o.subjectId !== 'd'); c.knowledge._rebuildIndexes();
assert.equal(knowledgeStage(c,d), 'unknown');
tickPublishedGeography([a,b,c,d], 104, 366);
assert.notEqual(knowledgeStage(c,d), 'unknown', 'published geography should diffuse transitively over successive cycles');

// Tech/printing alone is insufficient if literacy is too low.
const e = region('e','E',8), f = region('f','F',10); e.neighbors=['f']; f.neighbors=['e']; f.educationLevel = 0.05;
initialiseKnowledge([e,f], []);
e.knowledge.addObservation({ subjectId:'a', topic:KNOWLEDGE_TOPICS.EXISTENCE, value:{name:'A'}, source:'direct', confidence:1, specificity:1, provenance:{type:'test'}, subjectMatter:['identity'] });
tickPublishedGeography([e,f,a], 156, 366);
assert.equal(f.knowledge.hasObservation({ subjectId:'a', provenanceType:'published_geography' }), false, 'illiterate regions should not automatically gain atlas knowledge');

console.log('published geography regression passed');
