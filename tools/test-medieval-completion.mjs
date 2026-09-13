import assert from 'node:assert/strict';
import { ensureMedievalCompletionState, tickMedievalCompletion } from '../js/politics/medievalCompletion.js';

function region(id, name, overrides = {}) {
  return {
    id, name, population: 52000, wallet: 1200, treasury: 180,
    isCoastal: true, stability: 0.72,
    governance: { sovereignPolityId: 'p1', administrativeControl: 0.48, autonomy: 0.28 },
    urbanisation: { urbanPopulation: 11500 },
    tradeEconomy: { weeklyImports: 70, weeklyExports: 95, exportIncomeEma: 65, importSpendEma: 50, creditLimit: 120, debt: 20, routeReliabilityEma: 0.82 },
    medievalCommerce: {
      finance: { merchantCredit: 0.68, depositBanking: 0.56, billsOfExchange: 0.52, stateCredit: 0.66, riskSharing: 0.58, creditCrisis: 0.02 },
      trade: { caravanNetwork: 0.55, merchantDiaspora: 0.6, convoying: 0.4, commercialLaw: 0.68, protectedMarkets: 0.62 },
      labour: { mortalityShock: 0.08, labourScarcity: 0.44, wagePressure: 0.38, bargainingPower: 0.42, estateWeakening: 0.25 }, previousPopulation: 54000,
    },
    medievalSociety: {
      paths: { bureaucraticService: 0.65, landedRetinues: 0.62, revenueAssignments: 0.5, clanRetinues: 0.25, urbanCivic: 0.72 },
      urban: { guilds: 0.72, council: 0.66, militia: 0.55, charterAutonomy: 0.48, industrialSpecialisation: 0.6 },
      estates: { eliteLandShare: 0.44, taxExemption: 0.46, hereditaryPower: 0.57, privateRetinues: 0.58 },
      education: { religiousSchools: 0.55, courtSchools: 0.58, examinationService: 0.45, urbanAcademies: 0.62, technicalSchools: 0.46, knowledgeCapacity: 0.7 },
      demographic: { labourScarcity: 0.4, wagePressure: 0.36, bargainingPower: 0.4, lastPopulation: 54000 },
    },
    disease: { quarantinePolicy: 0.35, effectiveQuarantine: 0.25, pathogens: {
      smallpox: { prevalence: 0.002, resistance: 0.2, cumulativeDeaths: 10, recognised: true, lastDeaths: 4 },
      plague: { prevalence: 0.03, resistance: 0.05, cumulativeDeaths: 600, recognised: true, lastDeaths: 420 },
      enteric: { prevalence: 0.002, resistance: 0.1, cumulativeDeaths: 12, recognised: true, lastDeaths: 5 },
      respiratory: { prevalence: 0.003, resistance: 0.12, cumulativeDeaths: 15, recognised: true, lastDeaths: 7 },
    }},
    religion: { shares: { faith1: 0.82, faith2: 0.18 }, stateReligionId: 'faith1' },
    religiousSeatInfluence: 0.56,
    corporateCapital: { financialDepth: 0.62, creditorTrust: 0.7, investibleWealth: 500, nonPerformingShare: 0.03, corporateLaw: 0.5, partnershipPractice: 0.65, charterPractice: 0.5, jointStockPractice: 0.35, limitedLiabilityPractice: 0.15, creditorConcentration: 0.2, failedFirmPressure: 0.02, nextFirmId: 1, firms: [] },
    militaryFinance: { weeklyTaxRevenue: 18 },
    army: { personnel: 2600, permanence: 0.55 },
    breakthroughs: new Set(['writing', 'gunpowder']),
    ...overrides,
  };
}

const regions = [region('r1','Harbour City'), region('r2','Inland March',{ isCoastal:false, urbanisation:{urbanPopulation:7200}, governance:{sovereignPolityId:'p1',administrativeControl:0.4,autonomy:0.5} })];
const polity = {
  id:'p1', capitalRegionId:'r1',
  administration:{ accounting:0.72, recordKeeping:0.7, officialdom:0.68, legitimacy:0.62, delegation:0.45, communications:0.55, experience:{recordKeeping:0,accounting:0,officialdom:0} },
  stateAdministration:{ court:{ centralisationDrive:0.68 } },
  institutionalPaths:{ bureaucraticService:0.68, landedRetinues:0.58, urbanCivic:0.7 },
};
const world = { religions:[{id:'faith1',name:'Faith One',authority:0.7},{id:'faith2',name:'Faith Two',authority:0.2}] };

// Half-year cadence: the first five-month call should not run.
assert.equal(tickMedievalCompletion(regions,[polity],world,100,150,()=>0).length,0);
assert.equal(regions[0].medievalCompletion, undefined);

let events = [];
for (let year=0; year<120; year++) {
  events.push(...tickMedievalCompletion(regions,[polity],world,104 + year*52,365.2425,()=>0,{playerPolityId:'p1'}));
}

const s = ensureMedievalCompletionState(regions[0]);
assert.ok(s.actors.some(a=>a.type==='landed_elite'), 'landed elite should be a persistent actor');
assert.ok(s.actors.some(a=>a.type==='city_council'), 'city council should be a persistent actor');
assert.ok(s.actors.some(a=>a.type==='guilds'), 'guilds should be a persistent actor');
assert.ok(s.actors.some(a=>a.type==='clerical_establishment'), 'clerical establishment should be a persistent actor');
assert.ok(s.city.guildPower > 0.45 && s.city.charter > 0.35, 'urban institutions should deepen');
assert.ok(s.land.nobleShare > 0.1 && s.land.clericalShare > 0.01, 'productive land should be divided among persistent interests');
assert.ok(Math.abs(s.land.nobleShare+s.land.clericalShare+s.land.urbanShare+s.land.freeholderShare+s.land.crownShare-1) < 1e-6, 'land shares should remain normalised');
assert.ok(s.church.monasteries > 0.5 && s.church.bishopric > 0.35, 'church institutions should become material institutions');
assert.ok(s.university.founded && s.university.institutionalMemory > 0.05, 'durable university should emerge from dense learning institutions');
assert.ok(s.epidemic.labourScarcity > 0.1 && s.epidemic.wagePressure > 0.08, 'mortality should reshape labour relations');
assert.ok(s.epidemic.quarantinePractice > 0.05, 'epidemic response should become an institution');
assert.ok(s.military.contractingCapacity > 0.25 && s.military.paidForceShare > 0.12, 'credit and administration should support paid forces');
assert.ok(regions[0].army.paidShare === s.military.paidForceShare, 'paid military transition should feed the army state');
assert.ok(events.some(e=>e.type==='university_founded'), 'institutional founding should produce an event');
assert.ok(Number.isFinite(regions[0].medievalActorPower) && Number.isFinite(regions[0].medievalInstitutionalDepth));
assert.ok(polity.administration.experience.recordKeeping > 0, 'university law should feed administrative learning');

console.log('Medieval completion regression passed');
