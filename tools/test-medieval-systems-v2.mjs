import assert from 'node:assert/strict';
import { tickMedievalStateSystems, institutionalPathways, ensureMedievalSociety, ensureSuccessionState } from '../js/politics/medievalStateSystems.js';
import { tickMedievalCommercialInstitutions, medievalTradeFrictionMultiplier, medievalCreditMultiplier } from '../js/economy/medievalCommercialInstitutions.js';
import { tickMedievalDoctrine, medievalMilitaryCombatMultiplier } from '../js/military/medievalDoctrine.js';
import { ensureAuthorityPolitics, recogniseRuler, sanctionRuler } from '../js/society/medievalReligiousPolitics.js';

const makeRegion = (id, polityId, opts={}) => ({
  id, name:id, polityId, population:opts.population||30000, stability:0.75, isCoastal:Boolean(opts.coastal),
  governance:{ sovereignPolityId:polityId, localPolityId:`local_${id}`, relationship:opts.core?'core':'delegated', autonomy:opts.autonomy??0.25, administrativeControl:opts.control??0.7, tributeRate:0.05, delegatedPowers:{collectTaxes:true,commandArmy:true,appointOfficials:true,judgeDisputes:true} },
  medievalPolitics:{ localIdentity:opts.identity??0.25, eliteOrganisation:opts.elite??0.2, localDefence:opts.defence??0.2, localFiscalCapacity:opts.fiscal??0.25, grievance:0.1, independencePressure:0.1, centralProtection:0.7, yearsUnderOwnDefence:10, fortification:0.2, garrisonPersonnel:100, lastAutonomyDemandTick:-Infinity,lastRevoltTick:-Infinity },
  tradeEconomy:{ weeklyExports:opts.trade??300, weeklyImports:opts.trade??300, routeHabits:{a:{destId:'x'}}, exportIncomeEma:20, creditLimit:20, debt:0, arrearsWeeks:0 },
  urbanisation:{urbanPopulation:opts.urban??6000}, stockpile:{ horses:opts.horses??0, iron:400, steel:opts.steel??0, food:5000 },
  horseEconomy:{horses:opts.horses??0}, army:{personnel:1000,away:0}, navy:{boats:opts.coastal?8:0,personnel:opts.coastal?80:0},
  religion:{shares:{r1:0.7},stateReligionId:'r1',unrest:0}, unlockedTechIds:new Set(opts.tech||['writing']),
  disease:{pathogens:{smallpox:{lastDeaths:0},plague:{lastDeaths:0},enteric:{lastDeaths:0},respiratory:{lastDeaths:0}}},
  demographics:{workingAge:17000,children:9000,elderly:4000}, infrastructure:{}, projects:{},
});

const bureaucratic = { id:'bureau',name:'Bureau',capitalRegionId:'b0',administration:{officialdom:0.9,accounting:0.85,communications:0.8,recordKeeping:0.9,delegation:0.45,legitimacy:0.8,experience:{recordKeeping:1000,accounting:1000,communications:1000,officialdom:1000,delegation:1000},breakthroughs:new Set(['writing'])} };
const b0=makeRegion('b0','bureau',{core:true,elite:0.05,defence:0.08,horses:20,trade:600,urban:12000});
const b1=makeRegion('b1','bureau',{elite:0.08,defence:0.12,horses:10,trade:500,urban:10000});
let paths=institutionalPathways(bureaucratic,[b0,b1]);
assert(paths.bureaucraticService > paths.landedRetinues, 'bureaucratic path should not require landed-retinue dominance');
for(let i=0;i<120;i++) tickMedievalStateSystems([bureaucratic],[b0,b1],i*4,30,()=>0.99);
assert(ensureMedievalSociety(b0).education.examinationService > 0.2, 'bureaucratic/examination education should emerge independently');

const retinue = { id:'retinue',name:'Retinue',capitalRegionId:'r0',administration:{officialdom:0.08,accounting:0.12,communications:0.18,recordKeeping:0.15,delegation:0.45,legitimacy:0.55,experience:{recordKeeping:0,accounting:0,communications:0,officialdom:0,delegation:0},breakthroughs:new Set()} };
const r0=makeRegion('r0','retinue',{core:true,elite:0.78,defence:0.72,horses:900,identity:0.7,trade:60,urban:800});
paths=institutionalPathways(retinue,[r0]);
assert(paths.landedRetinues > paths.bureaucraticService && paths.clanRetinues > paths.bureaucraticService, 'retinue paths should work without bureaucracy');

// Succession can genuinely become contested and create a claimant polity.
const parent={ id:'empire',name:'Empire',capitalRegionId:'e0',administration:{officialdom:0.2,accounting:0.2,communications:0.25,recordKeeping:0.2,delegation:0.4,legitimacy:0.28,experience:{},breakthroughs:new Set()} };
const local={ id:'local_e1',name:'Claimant',capitalRegionId:'e1',administration:{officialdom:0.1,accounting:0.1,communications:0.1,recordKeeping:0.1,delegation:0.1,legitimacy:0.2,experience:{},breakthroughs:new Set()} };
const e0=makeRegion('e0','empire',{core:true,elite:0.1,identity:0.1,control:1});
const e1=makeRegion('e1','empire',{elite:0.9,defence:0.8,identity:0.9,autonomy:0.8,control:0.2}); e1.governance.localPolityId='local_e1';
const e2=makeRegion('e2','empire',{elite:0.8,defence:0.7,identity:0.85,autonomy:0.75,control:0.25}); e2.governance.localPolityId='local_e1';
const succession=ensureSuccessionState(parent); succession.rulerAge=90;
let seqEvents=[];
for(let i=0;i<12;i++) seqEvents.push(...tickMedievalStateSystems([parent,local],[e0,e1,e2],100+i*4,30,()=>0));
assert(seqEvents.some(e=>e.type==='succession_crisis'), 'old ruler should trigger succession');
assert(seqEvents.some(e=>e.type==='succession_civil_war'), 'contested succession should become civil war');
assert.equal(local.claimantOfPolityId,'empire');

// Merchant finance and state credit are separate routes.
const merchant=makeRegion('m','bureau',{trade:1800,urban:15000,coastal:true}); merchant.currencyUse={active:true};
const state=makeRegion('s','bureau',{trade:40,urban:2000}); state.currencyUse={active:true};
for(let i=0;i<180;i++) tickMedievalCommercialInstitutions([merchant,state],[bureaucratic],30);
assert(merchant.medievalCommerce.finance.merchantCredit > state.medievalCommerce.finance.merchantCredit);
assert(state.medievalCommerce.finance.stateCredit > 0.2, 'bureaucratic state credit should not require merchant banking');
assert(medievalTradeFrictionMultiplier(merchant) < 1);
assert(medievalCreditMultiplier(merchant) > 1);

// Epidemic mortality creates labour scarcity and bargaining power rather than only deleting population.
merchant.medievalCommerce.previousPopulation=20000; merchant.population=15000; merchant.disease.pathogens.plague.lastDeaths=2000;
tickMedievalCommercialInstitutions([merchant],[bureaucratic],365);
assert(merchant.medievalCommerce.labour.labourScarcity > 0.1);
assert(merchant.medievalCommerce.labour.bargainingPower > 0);

// Different military organisations generate meaningful counters.
const cavalry=makeRegion('cav','retinue',{horses:1500,elite:0.9,defence:0.7,tech:['heavy_cavalry','knightly_retinues']});
const pikes=makeRegion('pikes','bureau',{urban:16000,elite:0.05,tech:['crossbows']});
cavalry.medievalSociety={paths:{landedRetinues:0.9,clanRetinues:0.6,urbanCivic:0.05,bureaucraticService:0.1},urban:{militia:0},estates:{}};
pikes.medievalSociety={paths:{landedRetinues:0.05,clanRetinues:0.05,urbanCivic:0.9,bureaucraticService:0.8},urban:{militia:0.8},estates:{}};
for(let i=0;i<120;i++) tickMedievalDoctrine([cavalry,pikes],30);
assert(cavalry.medievalDoctrine.composition.heavyCavalry > pikes.medievalDoctrine.composition.heavyCavalry);
assert(pikes.medievalDoctrine.practice.antiCavalry > 0.05);
assert(medievalMilitaryCombatMultiplier(pikes,cavalry,'plains','defender') > 1);

// Transnational religious authority can recognise or sanction any polity; no specific religion hard-coded.
const authority={id:'a',religionId:'r1',diplomaticInfluence:0.8,influenceByPolity:{bureau:0.7},treasury:100};
ensureAuthorityPolitics(authority);
const before=bureaucratic.administration.legitimacy;
assert(recogniseRuler(authority,bureaucratic).changed); assert(bureaucratic.administration.legitimacy>before);
assert(sanctionRuler(authority,bureaucratic).changed); assert(authority.politics.sanctionedPolities.has('bureau'));

console.log('medieval systems v2 regression passed');
