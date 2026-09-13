import assert from 'node:assert/strict';
import { ensureRenaissanceState } from '../js/society/renaissanceNetworks.js';
import { ensureReformState, tickEarlyModernReform } from '../js/society/earlyModernReform.js';
import { createReligiousWorld, ensureRegionReligion } from '../js/society/religion.js';

function baseRegion(id, name, polityId, overrides = {}) {
  const region = {
    id, name, population: 120000, treasury: 850, wallet: 2600, educationLevel: 0.72,
    neighbors: [], tradePartnerIds: new Set(), recentTradePartners: new Map(),
    governance: { sovereignPolityId: polityId, administrativeControl: 0.46 },
    religion: { shares: { parent: 1 }, stateReligionId: 'parent', tolerance: 0.46, unrest: 0 },
    medievalCompletion: {
      city: { guildPower: 0.55, communeAutonomy: 0.38 },
      church: { wealth: 780, bishopric: 0.82, landShare: 0.4 },
      university: { founded: true, students: 900, institutionalMemory: 0.64 }, actors: [],
    },
    medievalSociety: {
      education: { knowledgeCapacity: 0.76 }, urban: { industrialSpecialisation: 0.7 },
      estates: { hereditaryPower: 0.6, eliteLandShare: 0.48 },
    },
    ...overrides,
  };
  const ren = ensureRenaissanceState(region);
  Object.assign(ren.printing, {
    mechanicalPress: true, publicationFlow: 0.8, vernacularShare: 0.82,
    censorship: 0.12, informationVelocity: 0.78, religiousChallengePressure: 0.72,
  });
  return region;
}

const world = createReligiousWorld();
world.religions.push({
  id: 'parent', name: 'Old Communion', parentId: null, familyId: 'parent',
  holyCityRegionId: 'origin', adminCentreRegionId: 'origin', foundedTick: 0,
  authority: 0.7, leader: { name: 'Patriarch' }, active: true, spreadMode: 'organised', monumentalPrestige: 0,
});
world.nextReligionId = 2;

const centre = baseRegion('centre', 'Print Centre', 'p1');
ensureRegionReligion(centre, world);
let reformEvents = [];
for (let year = 1; year <= 90; year++) {
  reformEvents.push(...tickEarlyModernReform([centre], world, year * 52, 365.2425, () => 0, { playerPolityId: 'p1' }));
}
const state = ensureReformState(centre);
assert.ok(state.dissentPressure > 0.3, 'print, vernacular theology and church strain should generate dissent');
assert.ok(state.reformReligionId, 'strong dissent should produce an emergent reform movement');
const reform = world.religions.find((religion) => religion.id === state.reformReligionId);
assert.ok(reform, 'reform religion must persist in religious world');
assert.equal(reform.familyId, 'parent', 'reform should remain in the parent religion family');
assert.equal(reform.parentId, 'parent', 'reform should branch from the local parent faith');
assert.ok(reformEvents.some((event) => event.type === 'religious_reform_movement'));

// Spontaneous reform is social first: it must not instantly become the state religion.
const newlyCreatedWorld = createReligiousWorld();
newlyCreatedWorld.religions.push({ ...world.religions.find((r) => r.id === 'parent') });
newlyCreatedWorld.nextReligionId = 2;
const spontaneous = baseRegion('spont', 'Spontaneous Centre', 'p2');
ensureRegionReligion(spontaneous, newlyCreatedWorld);
for (let year = 1; year <= 25 && !ensureReformState(spontaneous).reformReligionId; year++) {
  tickEarlyModernReform([spontaneous], newlyCreatedWorld, year * 52, 365.2425, () => 0);
}
assert.ok(ensureReformState(spontaneous).reformReligionId);
assert.equal(spontaneous.religion.stateReligionId, 'parent', 'movement creation should not automatically flip state religion');

// Suppression should preserve an underground network and impose unrest rather than deleting dissent.
const suppressed = baseRegion('supp', 'Suppressed Centre', 'p3', {
  governance: { sovereignPolityId: 'p3', administrativeControl: 0.95 },
  religion: { shares: { parent: 0.62, reform_existing: 0.38 }, stateReligionId: 'parent', tolerance: 0.05, unrest: 0 },
});
world.religions.push({ id: 'reform_existing', name: 'Existing Reform', parentId: 'parent', familyId: 'parent', holyCityRegionId: 'supp', foundedTick: 20, authority: 0.08, active: true, spreadMode: 'missionary' });
const ss = ensureReformState(suppressed); ss.reformReligionId = 'reform_existing'; ss.dissentPressure = 0.72; ss.pamphletNetwork = 0.68;
const initialUnrest = suppressed.religion.unrest;
for (let year = 1; year <= 20; year++) tickEarlyModernReform([suppressed], world, 5000 + year * 52, 365.2425, () => 0.99);
assert.ok(ss.persecutionPressure > 0.2, 'centralised intolerant official church should generate suppression');
assert.ok(ss.undergroundNetwork > 0, 'suppression should create or preserve underground organisation');
assert.ok(suppressed.religion.unrest > initialUnrest, 'suppression should create political cost');

// Tolerance should reduce persecution relative to otherwise similar suppression.
const tolerant = baseRegion('tol', 'Tolerant Centre', 'p4', {
  governance: { sovereignPolityId: 'p4', administrativeControl: 0.35 },
  religion: { shares: { parent: 0.62, reform_existing: 0.38 }, stateReligionId: 'parent', tolerance: 0.92, unrest: 0 },
});
const ts = ensureReformState(tolerant); ts.reformReligionId = 'reform_existing'; ts.dissentPressure = 0.72; ts.pamphletNetwork = 0.68;
for (let year = 1; year <= 20; year++) tickEarlyModernReform([tolerant], world, 7000 + year * 52, 365.2425, () => 0.99);
assert.ok(ts.persecutionPressure < ss.persecutionPressure, 'toleration should materially reduce persecution pressure');
assert.ok(ts.tolerationSettlement > 0.2, 'tolerant mixed-confession region should develop a settlement');

// A low-information pre-print society should not spontaneously reform through this system.
const prePrintWorld = createReligiousWorld();
prePrintWorld.religions.push({ ...world.religions.find((r) => r.id === 'parent') });
prePrintWorld.nextReligionId = 2;
const prePrint = baseRegion('pre', 'Pre-print Region', 'p5', { educationLevel: 0.12 });
Object.assign(ensureRenaissanceState(prePrint).printing, {
  mechanicalPress: false, publicationFlow: 0, vernacularShare: 0.05,
  censorship: 0, informationVelocity: 0.02, religiousChallengePressure: 0,
});
for (let year = 1; year <= 150; year++) tickEarlyModernReform([prePrint], prePrintWorld, year * 52, 365.2425, () => 0);
assert.equal(ensureReformState(prePrint).reformReligionId, null, 'no printing/information conditions means no Early Modern print-driven reform');

console.log(JSON.stringify({
  reform: reform.name,
  dissent: state.dissentPressure,
  suppressed: { persecution: ss.persecutionPressure, underground: ss.undergroundNetwork, unrest: suppressed.religion.unrest },
  tolerant: { persecution: ts.persecutionPressure, settlement: ts.tolerationSettlement },
}, null, 2));
