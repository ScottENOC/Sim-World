import assert from 'node:assert/strict';
import { ensureMedievalPoliticalState, medievalPoliticalAssessment, grantMedievalAutonomy, declareMedievalSecession } from '../js/politics/medievalInstitutions.js';
import { establishAutonomousReligiousSeat, religiousInstitutionScore, religiousSchismPressure, createInstitutionalSchism } from '../js/society/religiousInstitutions.js';

function region(id, polityId, localPolityId, culture, religion, pop=20000) {
  return { id, name:id, population:pop, stability:0.65, centroid:[0,0], polityId:localPolityId,
    governance:{ sovereignPolityId:polityId, localPolityId, relationship: polityId===localPolityId?'core':'vassal', autonomy:polityId===localPolityId?0:0.8, administrativeControl:polityId===localPolityId?1:0.15, tributeRate:0.12, militaryObligation:0.4, delegatedPowers:{collectTaxes:true,commandArmy:true,appointOfficials:true,judgeDisputes:true}},
    cultureGroups:[{id:culture,population:pop}], religion:{shares:{[religion]:1},stateReligionId:religion,tolerance:0.6,unrest:0,conflictHistory:{}},
    army:{personnel:300,away:0}, militaryThreat:{recentRaids:3}, banditPopulation:100, tradeEconomy:{weeklyExports:150,weeklyImports:120},
    treasury:100, militaryFinance:{weeklyTaxRevenue:20}, urbanisation:{urbanPopulation:5000}, construction:{assets:[]}, settlements:{principalId:null,places:[]},
  };
}

const capital=region('capital','empire','empire','culture_a','faith',50000); capital.army.personnel=800;
const subject=region('frontier','empire','frontier_polity','culture_b','faith_alt',25000); subject.centroid=[10,0];
const empire={id:'empire',capitalRegionId:'capital',administration:{legitimacy:0.35,communications:0.15}};
const local={id:'frontier_polity',capitalRegionId:'frontier',subjectToPolityId:'empire',administration:{legitimacy:0.3}};
const state=ensureMedievalPoliticalState(subject); state.localDefence=.7; state.eliteOrganisation=.65; state.localFiscalCapacity=.7; state.yearsUnderOwnDefence=30;
const assessment=medievalPoliticalAssessment(subject,capital,empire);
assert(assessment.independencePressure>0.15,'neglected divergent province should have meaningful independence pressure');
const oldAutonomy=subject.governance.autonomy; assert(grantMedievalAutonomy(subject)); assert(subject.governance.autonomy>oldAutonomy); assert(subject.governance.tributeRate<.12);
const secession=declareMedievalSecession(subject,[empire,local],[capital,subject],1000); assert(secession); assert.equal(subject.governance.sovereignPolityId,'frontier_polity'); assert.equal(local.subjectToPolityId,null);

const seat=region('seat','host','host','culture_a','faith',60000); seat.religion.shares={faith:1}; seat.religion.stateReligionId='faith';
const foreign=region('foreign','foreign','foreign','culture_b','faith',50000); foreign.religion.shares={faith:.8,other:.2};
const religion={id:'faith',name:'Universal Communion',familyId:'faith',parentId:null,holyCityRegionId:'seat',adminCentreRegionId:'seat',authority:.65,leader:{name:'High Keeper',opinionOfRegions:{},influence:{},currentDirectiveId:null},active:true,spreadMode:'organised'};
const world={religions:[religion],directives:[],grievances:{},nextReligionId:2,nextDirectiveId:1,observedConflicts:new Set()};
const host={id:'host',capitalRegionId:'seat',administration:{legitimacy:.5}}; const foreignPolity={id:'foreign',capitalRegionId:'foreign',administration:{legitimacy:.5}};
assert(religiousInstitutionScore(religion,[seat,foreign])>0.4);
const authority=establishAutonomousReligiousSeat(religion,seat,world,[host,foreignPolity],100); assert(authority); assert(world.authorities.length===1);
assert(seat.subregionalControl.places.some(p=>p.kind==='religious_capital' && p.controllerActorId===authority.id),'religious seat should be a subregional autonomous enclave');
assert(host.administration.legitimacy>.5,'hosting sacred seat should provide legitimacy');
const schismPressure=religiousSchismPressure(religion,[seat,foreign],[host,foreignPolity]); assert(schismPressure.candidateRegionId==='foreign');
const child=createInstitutionalSchism(religion,foreign,world,800); assert(child && child.parentId==='faith'); assert(foreign.religion.shares[child.id]>0);
console.log('medieval politics regression passed');
