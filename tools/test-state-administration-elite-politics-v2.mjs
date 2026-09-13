import assert from 'node:assert/strict';
import {
  ensureStateAdministrationElitePolitics,
  successionEliteModifier,
  tickStateAdministrationElitePolitics,
} from '../js/politics/stateAdministrationElitePolitics.js';

function polity(overrides = {}) {
  return {
    id: 'p1', name: 'Test Kingdom', capitalRegionId: 'capital',
    administration: {
      experience: { recordKeeping: 100, accounting: 100, communications: 100, officialdom: 100, delegation: 100 },
      recordKeeping: 0.18, accounting: 0.15, communications: 0.18, officialdom: 0.16, delegation: 0.12,
      legitimacy: 0.48, breakthroughs: new Set(['writing']),
    },
    institutionalPaths: { bureaucraticService: 0.15, landedRetinues: 0.62, revenueAssignments: 0.35, clanRetinues: 0.35, urbanCivic: 0.2 },
    ...overrides,
  };
}

function region(id, { capital = false, autonomy = 0.78, control = 0.2, localElite = 0.68, landed = 0.68, urban = 0.18 } = {}) {
  return {
    id, population: capital ? 50000 : 28000,
    governance: {
      sovereignPolityId: 'p1', relationship: capital ? 'core' : 'vassal', autonomy: capital ? 0 : autonomy,
      administrativeControl: capital ? 1 : control,
      governorId: capital ? null : `governor-${id}`,
      governor: capital ? null : { id: `governor-${id}`, type: 'local_ruler', competence: 0.48, loyalty: 0.48, localLegitimacy: 0.78 },
    },
    medievalPolitics: { eliteOrganisation: localElite, localFiscalCapacity: 0.55, localIdentity: 0.62 },
    medievalSociety: {
      paths: { bureaucraticService: 0.15, landedRetinues: landed, revenueAssignments: 0.35, clanRetinues: 0.3, urbanCivic: urban },
      estates: { hereditaryPower: landed, privateRetinues: landed * 0.8, eliteLandShare: landed * 0.75, taxExemption: landed * 0.55 },
      urban: { guilds: urban, council: urban * 0.8 },
      education: { examinationService: 0.08, courtSchools: 0.12, religiousSchools: 0.25, urbanAcademies: urban * 0.5 },
    },
    tradeEconomy: { weeklyExports: urban * 900, weeklyImports: urban * 700 },
    religion: { shares: { local_faith: 0.75 }, stateReligionId: id === 'capital' ? 'local_faith' : null },
    religiousSeatInfluence: id === 'capital' ? 0.45 : 0.05,
  };
}

const weakPolity = polity();
const weakTerritories = [region('capital', { capital: true }), ...Array.from({ length: 6 }, (_, i) => region(`province-${i + 1}`))];
const firstEvents = tickStateAdministrationElitePolitics(weakPolity, weakTerritories, 520, 365.2425 * 5, () => 0.99, {});
const weakState = ensureStateAdministrationElitePolitics(weakPolity);
assert.ok(Object.keys(weakState.offices).length >= 3, 'a literate growing state should form persistent court offices');
assert.ok(weakState.factions.landed.power > 0.4, 'landed elites should become a meaningful faction where estates and retinues are strong');
assert.ok(weakState.factions.provincial.power > 0.35, 'autonomous provinces should create an organised provincial interest');
assert.ok(weakState.court.administrativeOverstretch > 0.35, 'a weak centre ruling many autonomous provinces should become overstretched');
assert.ok(weakTerritories[1].governance.elitePoliticsControlMultiplier < 1, 'entrenched provincial politics should reduce effective central control');
assert.ok(weakTerritories[1].governance.elitePoliticsCorruptionDelta > 0, 'weak oversight should add tax leakage/corruption pressure');
assert.ok(weakTerritories[1].governance.elitePoliticsGrievance > 0, 'central-provincial politics should feed regional grievance');
assert.ok(Array.isArray(firstEvents), 'elite politics tick should return an event list');

const stewardId = weakState.offices.steward.holderId;
tickStateAdministrationElitePolitics(weakPolity, weakTerritories, 572, 365.2425, () => 0.99, {});
assert.equal(weakState.offices.steward.holderId, stewardId, 'officeholders should persist across ticks rather than being regenerated every year');
assert.ok(weakState.offices.steward.tenureYears >= 6, 'persistent officials should accumulate tenure');

const strongPolity = polity({
  id: 'p2', capitalRegionId: 'cap2',
  administration: {
    experience: { recordKeeping: 1500, accounting: 1500, communications: 1500, officialdom: 1500, delegation: 1200 },
    recordKeeping: 0.88, accounting: 0.9, communications: 0.82, officialdom: 0.86, delegation: 0.78,
    legitimacy: 0.72, breakthroughs: new Set(['writing', 'palace_archives', 'provincial_governorship']),
  },
  institutionalPaths: { bureaucraticService: 0.86, landedRetinues: 0.25, revenueAssignments: 0.3, clanRetinues: 0.12, urbanCivic: 0.62 },
});
const strongTerritories = [
  { ...region('cap2', { capital: true, landed: 0.2, urban: 0.7 }), governance: { sovereignPolityId: 'p2', relationship: 'core', autonomy: 0, administrativeControl: 1 } },
  ...Array.from({ length: 4 }, (_, i) => {
    const r = region(`district-${i + 1}`, { autonomy: 0.22, control: 0.78, localElite: 0.22, landed: 0.2, urban: 0.55 });
    r.governance.sovereignPolityId = 'p2';
    r.governance.relationship = 'delegated';
    r.governance.governor = { id: `royal-${i}`, type: 'royal_governor', competence: 0.78, loyalty: 0.76, localLegitimacy: 0.5 };
    r.governance.governorId = r.governance.governor.id;
    r.medievalSociety.education.examinationService = 0.72;
    r.medievalSociety.education.courtSchools = 0.68;
    return r;
  }),
];
tickStateAdministrationElitePolitics(strongPolity, strongTerritories, 520, 365.2425 * 5, () => 0.99, {});
const strongState = ensureStateAdministrationElitePolitics(strongPolity);
assert.ok(strongState.court.meritShare > weakState.court.meritShare, 'mature officialdom should support more merit-based appointments');
assert.ok(strongState.court.administrativeOverstretch < weakState.court.administrativeOverstretch, 'capable administration should handle scale better');
assert.ok(strongTerritories[1].governance.elitePoliticsCorruptionDelta < weakTerritories[1].governance.elitePoliticsCorruptionDelta,
  'strong oversight should reduce elite capture and leakage relative to a weak state');

weakState.factions.landed.power = 0.8;
weakState.factions.landed.satisfaction = 0.1;
weakState.factions.provincial.power = 0.75;
weakState.factions.provincial.satisfaction = 0.12;
assert.ok(successionEliteModifier(weakPolity, 'military_elite') > 1, 'angry powerful landed elites should strengthen a military claimant');
assert.ok(successionEliteModifier(weakPolity, 'provincial_claimant') > 1, 'angry powerful provincial elites should strengthen a provincial claimant');

console.log('State administration and elite politics v2 regression passed');
