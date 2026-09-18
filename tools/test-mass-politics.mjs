import assert from 'node:assert/strict';
import {
  assessMassPolitics,
  ensureMassPolitics,
  massPoliticsSummary,
  setMassPoliticsPolicy,
  tickMassPolitics,
} from '../js/politics/massPolitics.js';
import { establishParliament } from '../js/politics/institutionalPowers.js';

function region(id, overrides = {}) {
  return {
    id,
    polityId: 'p1',
    population: 100000,
    demographics: { workingAge: 55000 },
    governance: { sovereignPolityId: 'p1', administrativeControl: 0.8, tributeRate: 0.04 },
    massEducation: { literacy: 0.75 },
    settlements: { urbanisation: 0.5 },
    structuralTransformation: { wageLabourShare: 0.55 },
    labourRelations: { unionDensity: 0.3 },
    communicationState: { messengerExperience: 100 },
    unlockedTechIds: new Set(['printing_press', 'electrical_telegraphy']),
    army: { personnel: 2000 },
    navy: { personnel: 500 },
    popularWellbeing: { grievance: 0.32, satisfaction: 0.55, revolutionaryPressure: 0.08, politicalVoice: 0.1 },
    ...overrides,
  };
}

function polity() {
  return {
    id: 'p1',
    capitalRegionId: 'r1',
    administration: { recordKeeping: 0.7, officialdom: 0.65, accounting: 0.6, communications: 0.65, legitimacy: 0.5 },
    stateAdministration: { court: { meritShare: 0.65 } },
  };
}

const p = polity();
const regions = [region('r1'), region('r2')];
const early = assessMassPolitics(p, [region('r1', {
  massEducation: { literacy: 0.04 }, settlements: { urbanisation: 0.03 }, structuralTransformation: { wageLabourShare: 0.02 },
  labourRelations: { unionDensity: 0 }, communicationState: { messengerExperience: 5 }, unlockedTechIds: new Set(),
  governance: { sovereignPolityId: 'p1', administrativeControl: 0.25, tributeRate: 0.02 },
})]);
const mature = assessMassPolitics(p, regions);
assert.ok(mature.readiness > early.readiness + 0.25, 'mass politics must emerge from social/institutional development, not date');

const blocked = setMassPoliticsPolicy(p, { franchise: 'broad' }, { playerIssued: true });
assert.equal(blocked.changed, false);
assert.equal(blocked.reason, 'no_representative_institution');

establishParliament(p, { strength: 0.55, independence: 0.5, representation: 0.1 });
const changed = setMassPoliticsPolicy(p, { franchise: 'broad', associations: 'legal' }, { playerIssued: true });
assert.equal(changed.changed, true);

for (let i = 0; i < 40; i++) tickMassPolitics([p], regions, i, 30, { playerPolityId: 'p1' });
const broad = massPoliticsSummary(p);
assert.ok(broad.effectiveElectorateShare > 0.15, 'a functioning broad franchise should create a real electorate');
assert.ok(p.institutions.parliament.representation > 0.15, 'effective franchise should feed existing parliamentary representation');

const weakAdmin = polity();
establishParliament(weakAdmin, { strength: 0.5, independence: 0.45, representation: 0.1 });
setMassPoliticsPolicy(weakAdmin, { franchise: 'universal', associations: 'legal' });
const weakRegions = regions.map((r) => region(r.id, {
  governance: { sovereignPolityId: 'p1', administrativeControl: 0.08, tributeRate: 0.04 },
  communicationState: { messengerExperience: 4 }, unlockedTechIds: new Set(),
}));
weakAdmin.administration = { recordKeeping: 0.06, officialdom: 0.05, accounting: 0.08, communications: 0.04, legitimacy: 0.5 };
for (let i = 0; i < 24; i++) tickMassPolitics([weakAdmin], weakRegions, i, 30);
assert.ok(massPoliticsSummary(weakAdmin).effectiveElectorateShare < broad.effectiveElectorateShare, 'legal franchise must be constrained by real administrative capacity');

const mobilisationPolity = polity();
establishParliament(mobilisationPolity, { strength: 0.4, independence: 0.35, representation: 0.08 });
const mobilisationRegions = regions.map((r) => region(r.id, {
  army: { personnel: 18000 }, report: { conflict: { pressure: 0.8 } },
  popularWellbeing: { grievance: 0.62, satisfaction: 0.25, revolutionaryPressure: 0.35, politicalVoice: 0.08 },
}));
const mobilised = assessMassPolitics(mobilisationPolity, mobilisationRegions);
assert.ok(mobilised.reformPressure > mature.reformPressure, 'mobilisation and hardship should add representation pressure');

const repressionPolity = polity();
establishParliament(repressionPolity, { strength: 0.4, independence: 0.3, representation: 0.08 });
setMassPoliticsPolicy(repressionPolity, { franchise: 'restricted', associations: 'banned' });
for (let i = 0; i < 48; i++) tickMassPolitics([repressionPolity], mobilisationRegions, i, 30);
const repressed = massPoliticsSummary(repressionPolity);
assert.ok(repressed.repressionMemory > 0.05, 'bans should create durable repression memory rather than free stability');
assert.ok(repressed.radicalisation > 0.05, 'repression plus unresolved pressure should increase radicalisation');

const npc = polity();
const npcState = ensureMassPolitics(npc);
npcState.reformPressure = 0.65;
for (let i = 0; i < 100; i++) tickMassPolitics([npc], mobilisationRegions, i * 4, 30);
assert.equal(npc.institutions.parliament.established, true, 'capable high-pressure NPC states should be able to establish representative institutions');
assert.notEqual(ensureMassPolitics(npc).policy.franchise, 'closed');

console.log('Mass politics regression passed', {
  earlyReadiness: early.readiness.toFixed(3),
  matureReadiness: mature.readiness.toFixed(3),
  broadElectorate: broad.effectiveElectorateShare.toFixed(3),
  mobilisedPressure: mobilised.reformPressure.toFixed(3),
  repressionMemory: repressed.repressionMemory.toFixed(3),
});
