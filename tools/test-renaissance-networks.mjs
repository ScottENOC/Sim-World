import assert from 'node:assert/strict';
import { tickRenaissanceNetworks, ensureRenaissanceState } from '../js/society/renaissanceNetworks.js';

function region(id, name, polityId, overrides = {}) {
  return {
    id, name, population: 90000, wallet: 3200, treasury: 900, educationLevel: 0.62,
    neighbors: [], tradePartnerIds: new Set(), recentTradePartners: new Map(),
    governance: { sovereignPolityId: polityId, administrativeControl: 0.62, autonomy: 0.18 },
    urbanisation: { urbanPopulation: 24000 },
    tradeEconomy: { weeklyImports: 150, weeklyExports: 170 },
    medievalCommerce: {
      finance: { merchantCredit: 0.7, stateCredit: 0.65 },
      trade: { commercialLaw: 0.72 },
      labour: { labourScarcity: 0.08, bargainingPower: 0.2 },
    },
    medievalSociety: {
      urban: { industrialSpecialisation: 0.72, guilds: 0.66, communeAutonomy: 0.42 },
      education: { technicalSchools: 0.62, knowledgeCapacity: 0.72, urbanAcademies: 0.68 },
      estates: { hereditaryPower: 0.62, eliteLandShare: 0.48 },
    },
    medievalCompletion: {
      city: { guildPower: 0.66, communeAutonomy: 0.42 },
      church: { wealth: 500, bishopric: 0.58 },
      university: { founded: true, foundedTick: 0, students: 1400, law: 0.7, medicine: 0.55, theology: 0.62, naturalPhilosophy: 0.74, institutionalMemory: 0.68 },
      actors: [],
    },
    religion: { stateReligionId: 'faith', shares: { faith: 0.8 } },
    counterIntelligence: { credentialSecurity: 0.32, codePractice: 0.12, verificationCaution: 0.42, compromisedCredentialActors: [], detectedForgeries: [] },
    unlockedTechIds: new Set(['writing']),
    ...overrides,
  };
}

const oxford = region('oxf', 'Oxford-like centre', 'eng');
const paris = region('par', 'Paris-like centre', 'fra', { medievalCompletion: {
  city: { guildPower: 0.58, communeAutonomy: 0.28 }, church: { wealth: 650, bishopric: 0.7 },
  university: { founded: true, foundedTick: 0, students: 1000, law: 0.64, medicine: 0.5, theology: 0.76, naturalPhilosophy: 0.58, institutionalMemory: 0.62 }, actors: [],
}});
const province = region('src', 'Foreign province', 'fra', {
  population: 130000, wallet: 1800, educationLevel: 0.52,
  urbanisation: { urbanPopulation: 11000 },
  medievalCompletion: { city: { guildPower: 0.4, communeAutonomy: 0.18 }, church: { wealth: 220, bishopric: 0.38 }, university: { founded: false, students: 0, institutionalMemory: 0 }, actors: [] },
  medievalSociety: { urban: { industrialSpecialisation: 0.48, guilds: 0.4, communeAutonomy: 0.18 }, education: { technicalSchools: 0.42, knowledgeCapacity: 0.55, urbanAcademies: 0.32 }, estates: { hereditaryPower: 0.7, eliteLandShare: 0.55 } },
});

oxford.neighbors = ['src']; province.neighbors = ['oxf'];
oxford.tradePartnerIds.add('src'); province.tradePartnerIds.add('oxf');
paris.tradePartnerIds.add('src'); province.tradePartnerIds.add('par');

const polities = [
  { id: 'eng', stateAdministration: { court: { centralisationDrive: 0.62 } } },
  { id: 'fra', stateAdministration: { court: { centralisationDrive: 0.58 } } },
];
const regions = [oxford, paris, province];
const worldState = { elapsedDays: 0 };
let events = [];
for (let year = 1; year <= 180; year++) {
  events.push(...tickRenaissanceNetworks(regions, polities, year * 52, 365.2425, () => 0, { worldState, playerPolityId: 'eng' }));
}

const ox = ensureRenaissanceState(oxford);
const src = ensureRenaissanceState(province);
assert.equal(ox.printing.mechanicalPress, true, 'dense literate craft centre should establish printing');
assert.ok(ox.printing.publicationFlow > 0.1, 'printing should become a meaningful information industry');
assert.ok(ox.patronage.knowledgeProduction > 0.2, 'patronage should sustain knowledge production');
assert.ok(ox.university.prestige > 0.25, 'old high-quality university should develop prestige');
assert.ok(ox.university.foreignStudents > 0, 'prestigious university should attract foreign students');
assert.ok(ox.university.brainGain > 0, 'some foreign students should remain in the host region');
assert.ok(src.university.brainDrainPressure > 0, 'source regions should feel brain-drain pressure');
assert.ok((src.university.foreignAffinity.eng || 0) > 0, 'returning alumni should create host-polity affinity');
assert.ok(ox.university.eliteClosure > 0.05, 'prestige plus hereditary elites should create social closure');
assert.ok(ox.university.espionageExposure > 0, 'international elite networks should create intelligence exposure');
assert.ok(ox.university.notableAlumni.length > 0, 'large international flows should occasionally create persistent notable alumni');
assert.ok(events.some(e => e.type === 'printing_established'), 'printing establishment should produce a player-visible event');
assert.ok(events.some(e => e.type === 'notable_foreign_alumnus'), 'important alumni should produce a player-visible event');
assert.ok(Number.isFinite(oxford.informationVelocity) && Number.isFinite(oxford.knowledgeProduction));

console.log(JSON.stringify({
  printing: ox.printing,
  university: {
    prestige: ox.university.prestige,
    foreignStudents: ox.university.foreignStudents,
    brainGain: ox.university.brainGain,
    eliteClosure: ox.university.eliteClosure,
    espionageExposure: ox.university.espionageExposure,
    notableAlumni: ox.university.notableAlumni.length,
  },
  source: { brainDrainPressure: src.university.brainDrainPressure, affinityToHost: src.university.foreignAffinity.eng || 0 },
}, null, 2));
