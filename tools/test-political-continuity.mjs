#!/usr/bin/env node
import { launchCampaign, CAMPAIGN_OBJECTIVES } from '../js/military/campaigns.js';
import {
  initialisePoliticalContinuity, plausibleGovernanceScore, createConquestSettlementOffer,
  evaluateSettlementOffer, acceptSettlementOffer, rejectSettlementOffer,
  transferRegion, grantRegionalAutonomy, canFactionContinue, resolvePartialConquest, lobbyForRestoration, restorationBacking,
} from '../js/politics/continuity.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

function region(id, name, polityId, cultureId) {
  return {
    id, name, population: 10000, neighbors: [], centroid: [0, 0], polityId,
    controllingActorId: id,
    cultureGroups: [{ identityId: cultureId, cultureId, ancestryId: cultureId, ancestry: { [cultureId]: 1 }, affiliations: [], share: 1, identityStrength: 0.3, cohabitationYears: 0 }],
    cultureState: { elapsedYears: 0, tickAccumulatorYears: 0, isolationYears: 0, polityYears: 0, fusionIds: [], branchIds: [], identityArchive: [{ id: cultureId, label: cultureId, familyId: cultureId, kind: 'attested', confidence: 1, createdYear: -1300, parentIds: [], parentWeights: {}, originRegionId: id }], persecutionMemory: {} },
    cultureFamiliarity: {}, _cultureReady: false,
    governance: { sovereignPolityId: polityId, localPolityId: polityId, localRulerId: id, relationship: 'core', autonomy: 0, administrativeControl: 1, tributeRate: 0, militaryObligation: 0, delegatedPowers: { collectTaxes: false, commandArmy: false, appointOfficials: false, judgeDisputes: false }, levyHistory: { sent: 0, returned: 0, campaigns: 0 } },
    attitudes: {}, knowledge: { observations: [], knownSubjectIds: new Set(), directContactIds: new Set(), _observationByStream: new Map() },
  };
}
function polity(id, capital) {
  return { id, name: id, capitalRegionId: capital.id, rulerRegionId: capital.id, subjectToPolityId: null,
    administration: { legitimacy: 0.45, breakthroughs: new Set(), recordKeeping: 0, accounting: 0, communications: 0, officialdom: 0, delegation: 0 }, report: {} };
}

const home = region('home', 'Home', 'p_home', 'culture_home');
const refuge = region('refuge', 'Refuge', 'p_home', 'culture_home');
const conquerorRegion = region('conqueror', 'Conqueror', 'p_conq', 'culture_other');
const hostRegion = region('host', 'Host', 'p_host', 'culture_home');
home.neighbors = ['refuge', 'conqueror']; refuge.neighbors = ['home', 'host']; conquerorRegion.neighbors = ['home']; hostRegion.neighbors = ['refuge'];
const pHome = polity('p_home', home); const pConq = polity('p_conq', conquerorRegion); const pHost = polity('p_host', hostRegion);
const regions = [home, refuge, conquerorRegion, hostRegion]; const polities = [pHome, pConq, pHost];
initialisePoliticalContinuity(polities, regions, 0);
pHome.continuity.claims[home.id] = 1; pHome.continuity.claims[refuge.id] = 0.95;
pHome.continuity.legitimacy = 0.7;

assert(plausibleGovernanceScore(pHome, home, regions, polities) > 0.7, 'Homeland should be strongly governable by former ruler');

// Losing the capital while another sovereign region survives must move the court,
// not vassalise or delete the whole polity.
const partial = resolvePartialConquest(conquerorRegion, home, polities, regions, 5);
assert(partial?.partial && partial.wasCapital, 'Capital loss should resolve as partial conquest');
assert(pHome.continuity.status === 'claimant' && pHome.continuity.seatRegionId === refuge.id, 'Claimant court should retreat to surviving territory');
assert(refuge.governance.sovereignPolityId === pHome.id, 'Surviving region must remain sovereign');
assert(home.governance.sovereignPolityId === pConq.id, 'Lost capital should pass to conqueror');
// Reset for last-region settlement tests.
home.governance.sovereignPolityId = pHome.id; home.governance.relationship = 'core'; home.governance.localPolityId = pHome.id;
pHome.capitalRegionId = home.id; pHome.rulerRegionId = home.id; pHome.continuity.status = 'sovereign'; pHome.continuity.seatRegionId = home.id;

const offer = createConquestSettlementOffer(conquerorRegion, home, 'governor', polities, regions, 10);
assert(offer && offer.defeatedPolityId === pHome.id, 'Conquest offer should identify defeated polity');
const evaluation = evaluateSettlementOffer(offer, polities, regions);
assert(Number.isFinite(evaluation.acceptScore) && Number.isFinite(evaluation.exileScore), 'Settlement evaluation missing both choices');

const accepted = acceptSettlementOffer(offer, polities, regions, 10);
assert(accepted.accepted && pHome.continuity.status === 'governor', 'Accepted governorship should preserve defeated faction as governor');
assert(home.governance.sovereignPolityId === pConq.id, 'Conqueror should become sovereign after accepted settlement');
assert(pConq.administration.legitimacy > 0.45, 'Cooperating old ruler should grant conqueror legitimacy');

// Reset to test rejection/exile.
home.governance.sovereignPolityId = pHome.id; home.governance.localPolityId = pHome.id; home.governance.relationship = 'core';
pHome.subjectToPolityId = null; pHome.continuity.status = 'sovereign'; pHome.continuity.hostPolityId = null;
const rejectedOffer = createConquestSettlementOffer(conquerorRegion, home, 'vassal_ruler', polities, regions, 20);
const rejected = rejectSettlementOffer(rejectedOffer, polities, regions, 20, false);
assert(rejected.exile && pHome.continuity.status === 'exile', 'Rejected settlement should preserve government in exile');
assert(pHome.continuity.exilePopulation >= 25, 'Exile government should retain a small political community');
assert(canFactionContinue(pHome, regions, polities), 'Loss of homeland must not immediately end faction');
const lobby = lobbyForRestoration(pHome, pHost, regions);
assert(lobby.success && lobby.support > 0, 'Exile government should be able to build foreign restoration support');
assert(restorationBacking(pHome)[0]?.polityId === pHost.id, 'Restoration backing should persist by foreign polity');

// Region can be liberated/returned to the exiled polity.
const transfer = transferRegion(home, pConq, pHome, regions, polities, 30, 'liberation');
assert(transfer.transferred && home.governance.sovereignPolityId === pHome.id, 'Liberation should transfer sovereignty back');

// Autonomy should ratchet an imperial province toward vassal status.
home.governance.sovereignPolityId = pConq.id; home.governance.relationship = 'integrated'; home.governance.autonomy = 0.65; home.governance.administrativeControl = 0.7;
const autonomy = grantRegionalAutonomy(home, 0.31);
assert(autonomy.changed && home.governance.relationship === 'vassal', 'High autonomy should become vassal relationship');

// NPCs should use the same autonomy tool when a remote subject becomes hard to govern.
const strained = refuge;
strained.governance.sovereignPolityId = pConq.id;
strained.governance.localPolityId = pHome.id;
strained.governance.relationship = 'integrated';
strained.governance.autonomy = 0.55;
strained.governance.administrativeControl = 0.1;
strained.stability = 0.15;
const autonomyBefore = strained.governance.autonomy;
const npcEvents = (await import('../js/politics/continuity.js')).tickPoliticalContinuity(polities, regions, 1.1, 100, { playerPolityId: pHome.id });
assert(strained.governance.autonomy > autonomyBefore, 'NPC sovereign should grant autonomy to an ungovernable subject');
assert(npcEvents.some((event) => event.type === 'autonomy_granted' && event.regionId === strained.id), 'NPC autonomy decision should emit an event');

assert(CAMPAIGN_OBJECTIVES.liberation, 'Liberation campaign objective must exist');
// Campaign launch plumbing retains the beneficiary polity for later victory transfer.
conquerorRegion.army = { personnel: 500, away: 0 }; home.army = { personnel: 50, away: 0 };
conquerorRegion.adjacentSeaIds = []; home.adjacentSeaIds = [];
conquerorRegion.neighbors = ['home'];
conquerorRegion.knowledge.directContactIds.add('home');
home.knowledge.directContactIds.add('conqueror');
const liberationCampaign = launchCampaign(conquerorRegion, home, 'liberation', 200, 200,
  { campaigns: [], regions, polities, beneficiaryPolityId: pHome.id });
assert(liberationCampaign?.beneficiaryPolityId === pHome.id, 'Liberation campaign must preserve beneficiary claimant');

console.log('POLITICAL_CONTINUITY_TESTS_OK', {
  governability: plausibleGovernanceScore(pHome, home, regions, polities),
  settlementChoice: evaluation,
  exilePopulation: pHome.continuity.exilePopulation,
  autonomy: home.governance.autonomy,
});
