import assert from 'node:assert/strict';
import { buildSocialOverlayLayers, dominantCultureId, dominantReligionInfo, influenceBand, playerInfluenceScore, socialIdentitySummary } from '../js/ui/socialOverlays.js';

function region(id, cultureId, religionId) {
  return {
    id, name: id, controllingActorId: id, governance: { sovereignPolityId: id }, population: 10000,
    cultureGroups: [{ identityId: cultureId, cultureId, ancestryId: cultureId, ancestry: { [cultureId]: 1 }, affiliations: [], share: 1, identityStrength: 0.4, cohabitationYears: 0 }],
    cultureState: { identityArchive: [], fusionIds: [], branchIds: [], persecutionMemory: {} },
    cultureFamiliarity: {},
    languageNetwork: { communities: { [`lang:${cultureId}`]: { share: 1, familyId: `langfam:${cultureId}` } }, communityShares: { [`lang:${cultureId}`]: 1 }, lastCultureLanguageShares: { [`lang:${cultureId}`]: 1 }, secondLanguage: {}, specialists: {}, institutions: { court: [`lang:${cultureId}`], administration: [`lang:${cultureId}`], legal: [], military: [], trade: [], religious: [], cultural: [] }, culturalExposure: {}, culturalPrestige: {}, mediaPractices: { oral: .12, manuscript: 0, print: 0, recorded: 0, broadcast: 0, screen: 0, networked: 0 } },
    religion: { shares: { [religionId]: 1 }, stateReligionId: null, tolerance: .65, unrest: 0, conflictHistory: {} },
    relations: new Map(), diplomaticTrust: {}, diplomaticService: { diplomats: [] }, recentTradePartners: new Map(),
    neighbors: [], adjacentSeaIds: [], knowledge: { directContactIds: new Set() },
  };
}

const a = region('a', 'culture:a', 'ra');
const b = region('b', 'culture:b', 'rb');
const hidden = region('hidden', 'culture:hidden', 'rh');
a.knowledge.directContactIds.add('b');
a.relations.set('b', { attitude: .7, lastCause: 'alliance' });
a.diplomaticTrust.b = { score: .8 };
a.diplomaticService.diplomats.push({ id: 'd1', status: 'posted', postedRegionId: 'b' });
a.recentTradePartners.set('b', 4);
const religiousWorld = { religions: [
  { id: 'ra', name: 'A Tradition', familyId: 'fam-a', holyCityRegionId: 'a', active: true },
  { id: 'rb', name: 'B Tradition', familyId: 'fam-a', holyCityRegionId: 'b', active: true },
  { id: 'rh', name: 'Hidden Tradition', familyId: 'fam-h', holyCityRegionId: 'hidden', active: true },
], directives: [], grievances: {}, nextReligionId: 4, nextDirectiveId: 1, observedConflicts: new Set() };

assert.equal(dominantCultureId(a), 'culture:a');
assert.equal(dominantReligionInfo(a, religiousWorld).label, 'A Tradition');
const summary = socialIdentitySummary(a, religiousWorld);
assert.equal(summary.cultures.length, 1);
assert.equal(summary.languages.length, 1);
assert.equal(summary.religions[0].label, 'A Tradition');

const score = playerInfluenceScore(a, b, { agreements: [{ active: true, type: 'alliance', fromId: 'a', toId: 'b' }], religiousWorld });
assert.ok(score > .75, `expected substantial influence, got ${score}`);
assert.equal(influenceBand(score), score >= .82 ? 'Strong influence' : 'Significant influence');
assert.equal(playerInfluenceScore(a, a, { religiousWorld }), 1);

const layers = buildSocialOverlayLayers({
  regions: [a, b, hidden], religiousWorld, agreements: [], fogOfWar: { devMode: false },
  getPlayerRegionId: () => 'a', getPlayerPolityId: () => 'a',
  knowledgeLevel: (_observer, target) => target.id === 'hidden' ? 0.3 : 0.7,
  knowledgeThresholds: { RESOURCES: .5 },
});
assert.notEqual(layers.culture.valueFn(b), 'Unknown', 'direct contact should reveal broad social identity');
assert.equal(layers.language.valueFn(hidden), 'Unknown', 'mapped-but-uncontacted region must not leak language');
assert.equal(layers.religion.valueFn(hidden), 'Unknown', 'mapped-but-uncontacted region must not leak religion');
assert.equal(layers.influence.valueFn(hidden), 'Unknown', 'influence overlay must not become an intelligence cheat');
assert.equal(layers.influence.valueFn(a), 'Strong influence');

console.log('social map overlay regressions passed');
