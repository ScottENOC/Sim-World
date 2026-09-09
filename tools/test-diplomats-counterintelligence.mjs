import assert from 'node:assert/strict';
import {
  communicationCapabilities, ensureCommunicationState, interceptedContentChance,
  languageComprehension, recordLanguageContact, tickCommunicationPractices,
} from '../js/diplomacy/languageCommunication.js';
import { ensureDiplomaticService, diplomatsFor, tickDiplomats } from '../js/diplomacy/diplomats.js';
import { ensureCounterIntelligence, genuineAuthentication } from '../js/diplomacy/counterIntelligence.js';
import { sendJointOperationProposal, tickDiplomaticCouriers } from '../js/diplomacy/couriers.js';

function region(id, overrides = {}) {
  return {
    id, name: id, neighbors: [], isCoastal: false, population: 10000,
    cultureGroups: [{ identityId: `culture-${id}`, cultureId: `culture-${id}`, share: 1 }],
    governance: { sovereignPolityId: `polity-${id}`, administrativeControl: 1 },
    army: { personnel: 1000, away: 0 }, safetyRating: 1, stability: 0.8,
    tradeEconomy: { weeklyImports: 0, weeklyExports: 0 }, recentTradePartners: new Map(),
    unlockedTechIds: new Set(), diplomaticMessages: [], diplomaticIntelligence: [],
    stockpile: { food: 10000 }, treasury: 1000,
    ...overrides,
  };
}

function polity(r, breakthroughs = []) {
  return { id: r.governance.sovereignPolityId, capitalRegionId: r.id, administration: {
    recordKeeping: 0.5, accounting: 0.5, communications: 0.5, officialdom: 0.25,
    breakthroughs: new Set(breakthroughs),
  }};
}

const a = region('A');
const b = region('B');
a.neighbors = ['B']; b.neighbors = ['A'];
ensureCommunicationState(a); ensureCommunicationState(b);
assert.equal(languageComprehension(a, b), 0, 'unrelated new languages should not be instantly understood');
for (let i = 0; i < 80; i++) recordLanguageContact(a, b, 1, { written: false });
assert.ok(languageComprehension(a, b) > 0.3, 'repeated contact should teach spoken language');

// Oral dispatches work without writing and are less automatically compromised than documents.
const proposal = sendJointOperationProposal(a, b, region('E'), [a, b, region('E')], 10, { attackTick: 30 });
assert.equal(proposal.sent, true);
assert.equal(proposal.message.medium, 'oral_memorised');
assert.ok(interceptedContentChance(proposal.message, 0.5) < 0.7, 'capturing an oral courier should not guarantee learning the message');

// Writing + administrative use causes seals to emerge; ciphers require much deeper archives/security experience.
const c = region('C', { tradeEconomy: { weeklyImports: 800, weeklyExports: 800 } });
const pc = polity(c, ['writing']);
for (let week = 0; week < 80; week++) tickCommunicationPractices([c], [pc], [], [], week, 7);
assert.equal(communicationCapabilities(c).writing, true);
assert.equal(communicationCapabilities(c).seals, true, 'a mature writing/trade administration should develop seal authentication');
assert.equal(communicationCapabilities(c).ciphers, false, 'writing and seals alone should not grant systematic ciphers');
const sc = ensureCommunicationState(c);
sc.interceptionExperience = 25; sc.forgeryExperience = 20; sc.diplomaticTraffic = 20;
pc.administration.breakthroughs.add('palace_archives');
for (let week = 80; week < 280; week++) tickCommunicationPractices([c], [pc], [], [], week, 7);
assert.equal(communicationCapabilities(c).ciphers, true, 'ciphers should emerge only after archives plus sustained security experience');
const auth = genuineAuthentication(c, { coded: true });
assert.equal(auth.sealed, true);
assert.equal(auth.coded, true);

// A posted diplomat learns the host language over time and improves court reporting.
const d = region('D'); d.neighbors = ['F'];
const f = region('F'); f.neighbors = ['D'];
ensureDiplomaticService(d);
const envoy = diplomatsFor(d)[0];
envoy.status = 'posted'; envoy.postedRegionId = f.id; envoy.localFamiliarity = 0.2; envoy.lastReportTick = -100;
const before = envoy.languageSkills?.[ensureCommunicationState(f).languageId] || 0;
for (let week = 0; week < 52; week++) tickDiplomats([d, f], week, 7, () => 0.5);
const after = envoy.languageSkills[ensureCommunicationState(f).languageId];
assert.ok(after > before, 'resident envoys should learn the host language');
assert.ok(d.diplomaticIntelligence.some((x) => x.type === 'diplomat_military_observation' && Number.isFinite(x.languageComprehension)));

// Delivered diplomacy improves mutual comprehension rather than assuming perfect translation.
const g = region('G'); const h = region('H'); const enemy = region('I');
g.neighbors = ['H']; h.neighbors = ['G'];
const sent = sendJointOperationProposal(g, h, enemy, [g, h, enemy], 0, { attackTick: 10 });
assert.equal(sent.sent, true);
const pre = languageComprehension(h, g);
tickDiplomaticCouriers([g, h, enemy], [], [], 2, 14, () => 0.99);
assert.ok(languageComprehension(h, g) >= pre, 'diplomatic contact should build language familiarity');
assert.ok(sent.message.deliveryComprehension !== null, 'delivery should record how well the recipient understood it');

ensureCounterIntelligence(c);
console.log('diplomat / counter-intelligence / language regressions passed');
