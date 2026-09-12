import assert from 'node:assert/strict';
import { tickCivilWarFactionPolitics, maybeLaunchCivilWarCampaign } from '../js/politics/civilWarFactions.js';
import { KnowledgeLedger } from '../js/core/knowledge.js';

function region(id, owner, neighbors = []) {
  return {
    id, name: id, population: 10000, neighbors, adjacentSeaIds: [], controllingActorId: owner,
    governance: { sovereignPolityId: owner, localPolityId: owner, relationship: 'delegated', autonomy: 0.55, administrativeControl: 0.45 },
    medievalInstitutions: { grievance: 0.25, localIdentity: 0.45, eliteOrganisation: 0.45 },
    medievalSociety: { estates: { privateRetinues: 0.35 } },
    stability: 0.62, conflictPressure: 0.2,
    army: { personnel: 500, away: 0 }, navy: { personnel: 0, boats: 0 },
    demographics: { workingAge: 5000 }, unlockedTechIds: new Set(), stockpile: {}, construction: { assets: [] },
    militaryPolicy: {}, recentTradePartners: new Map(), knowledge: new KnowledgeLedger(id),
    coordinates: { lat: 0, lon: Number(id.replace(/\D/g,'')) || 0 },
  };
}

const parent = { id: 'realm', name: 'Realm', capitalRegionId: 'r0', administration: { legitimacy: 0.62 }, institutionalPaths: { bureaucraticService: 0.55 }, continuity: { legitimacy: 0.62, claims: {} }, succession: { claimants: [{ id: 'heir', kind: 'designated_heir' }, { id: 'rival', kind: 'provincial_claimant' }], crisis: { startedTick: 0, escalated: true, claimantPolityId: 'rival_state', leadingClaimantId: 'heir', contested: true } } };
const claimant = { id: 'rival_state', name: 'Rival', capitalRegionId: 'r2', claimantId: 'rival', claimantOfPolityId: 'realm', administration: { legitimacy: 0.58 }, continuity: { status: 'claimant', legitimacy: 0.58, claims: { r0: 0.68, r1: 0.96, r2: 0.96 }, successionClaim: { status: 'contesting' } } };
const r0 = region('r0', 'realm', ['r1']);
const r1 = region('r1', 'realm', ['r0','r2']);
const r2 = region('r2', 'rival_state', ['r1']);
r0.successionAlignment = 'heir'; r1.successionAlignment = 'rival'; r2.successionAlignment = 'rival';
// Make r1's local elite strongly favour the challenger despite incumbent control.
r1.medievalInstitutions.grievance = 0.95; r1.medievalInstitutions.localIdentity = 0.95; r1.medievalInstitutions.eliteOrganisation = 0.9;
r1.medievalSociety.estates.privateRetinues = 0.9; r1.governance.administrativeControl = 0.15; r1.governance.autonomy = 0.9;
const polities = [parent, claimant]; const regions = [r0, r1, r2];
let events = tickCivilWarFactionPolitics(parent, polities, regions, 20, 120, () => 0);
assert.equal(parent.succession.crisis.factionPolitics.contestedRegionIds.length, 3, 'civil war should retain the whole contested realm');
events = tickCivilWarFactionPolitics(parent, polities, regions, 40, 120, () => 0);
assert(events.some((event) => event.type === 'civil_war_defection'), 'regional elites should be able to defect between claimant factions');
assert.equal(r1.governance.sovereignPolityId, 'rival_state');

// The claimant should prosecute the war through an ordinary campaign object.
claimant.continuity.claims.r0 = 0.9;
r1.army.personnel = 900;
r1.knowledge.directContactIds.add('r0'); r0.knowledge.directContactIds.add('r1');
r2.knowledge.directContactIds.add('r1'); r1.knowledge.directContactIds.add('r2');
const campaigns = [];
const launched = maybeLaunchCivilWarCampaign(r1, new Map(regions.map((r) => [r.id, r])), campaigns, polities, 40, () => 0);
assert.equal(launched, true, 'claimant should be able to launch a normal campaign against the rival faction');
assert.equal(campaigns.length, 1);
assert.equal(campaigns[0].objective, 'subjugation');
assert.equal(campaigns[0].civilWar.parentPolityId, 'realm');

// A long, exhausted stalemate can settle without deleting either political identity.
parent.succession.crisis.factionPolitics.lastDefectionTick = 100;
parent.succession.crisis.factionPolitics.lastReviewTick = 240;
parent.succession.crisis.factionPolitics.exhaustion.realm = 0.8;
parent.succession.crisis.factionPolitics.exhaustion.rival_state = 0.8;
events = tickCivilWarFactionPolitics(parent, polities, regions, 260, 30, () => 0, { playerPolityId: null });
assert(events.some((event) => event.type === 'civil_war_settled'), 'exhausted stalemates should permit negotiated settlement');
assert.equal(parent.succession.crisis.factionPolitics.settlement.type, 'negotiated_partition');
assert.equal(claimant.continuity.status, 'sovereign');
assert.equal(parent.continuity.status, 'sovereign');

console.log('civil war factions v2 regression passed');
