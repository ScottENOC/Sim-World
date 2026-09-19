import assert from 'node:assert/strict';
import { NUCLEAR_PROGRAMME_POSTURES, ensureStrategicNuclearState } from '../js/economy/strategicNuclear.js';
import { NUCLEAR_WEAPONISATION_TECH_ID, NUCLEAR_TEST_VALIDATION_TECH_ID, NUCLEAR_TEST_POLICIES, NUCLEAR_WEAPON_PROGRAMMES, ensureNuclearWeaponState, setNuclearWeaponPolicy, tickNuclearWeaponProgramme, nuclearDeterrentStatus, estimateForeignNuclearWeaponCapability } from '../js/military/nuclearWeaponisation.js';
import { nuclearWeaponisationBreakthroughChances } from '../js/technology/nuclearWeaponisation.js';

function region(id='nuclear-state'){
 const r={id,name:id,population:1500000,treasury:2000,stockpile:{strategic_uranium_material:2,separated_plutonium:1},unlockedTechIds:new Set(['nuclear_physics','uranium_fuel_cycle','industrial_electrification','isotope_separation','spent_fuel_reprocessing','advanced_factories']),industrialSupply:{capability:{precision_machining:.88,industrial_chemistry:.8}},structuralTransformation:{capability:{manufacture:.86}},massEducation:{literacy:.9},governance:{administrativeControl:.86,administration:{recordKeeping:.9}},construction:{completed:{},projects:[],workersReserved:0,assets:[{id:'lab1',typeId:'nuclear_weapons_research_establishment',condition:1,scale:1}]},knowledge:{addObservation(){},observations:[]}};
 ensureStrategicNuclearState(r).policy.posture=NUCLEAR_PROGRAMME_POSTURES.STRATEGIC;
 return r;
}

const r=region();
let chances=nuclearWeaponisationBreakthroughChances(r);
assert.ok(chances.weaponisation>0,'deliberate strategic programme with material and lab should permit weaponisation research');
ensureStrategicNuclearState(r).policy.posture=NUCLEAR_PROGRAMME_POSTURES.CIVILIAN;
assert.equal(nuclearWeaponisationBreakthroughChances(r).weaponisation,0,'civilian posture must not accidentally discover weaponisation');
ensureStrategicNuclearState(r).policy.posture=NUCLEAR_PROGRAMME_POSTURES.STRATEGIC;
r.unlockedTechIds.add(NUCLEAR_WEAPONISATION_TECH_ID);
setNuclearWeaponPolicy(r,{programme:NUCLEAR_WEAPON_PROGRAMMES.RESEARCH,testPolicy:NUCLEAR_TEST_POLICIES.NONE,secrecy:.85});
const materialBefore=r.stockpile.strategic_uranium_material+r.stockpile.separated_plutonium;
for(let i=0;i<260;i++) tickNuclearWeaponProgramme(r,i,7,()=>0);
const state=ensureNuclearWeaponState(r);
assert.ok(state.prototypeCount>=1,'sustained funded research should eventually create an untested prototype capability');
assert.ok(r.stockpile.strategic_uranium_material+r.stockpile.separated_plutonium<materialBefore,'prototype work must consume abstract strategic material');
assert.equal(nuclearDeterrentStatus(r),'untested_device_capability','an untested prototype should remain explicitly unvalidated');

r.unlockedTechIds.add(NUCLEAR_TEST_VALIDATION_TECH_ID);
setNuclearWeaponPolicy(r,{testPolicy:NUCLEAR_TEST_POLICIES.PUBLIC});
for(let i=260;i<420&&!state.tests.length;i++) tickNuclearWeaponProgramme(r,i,7,()=>0);
assert.ok(state.tests.some(t=>t.publiclyDeclared),'public-test policy should eventually produce an unmistakable demonstration');
assert.equal(nuclearDeterrentStatus(r),'demonstrated_device_capability');
const observer=region('observer');observer.knowledge={addObservation(){},observations:[]};
const estimate=estimateForeignNuclearWeaponCapability(observer,r);
assert.equal(estimate.assessment,'nuclear_capability_demonstrated','public tests should not remain strategically ambiguous');
assert.equal(estimate.exactPrototypeCountKnown,false,'foreign observers must not receive exact internal stockpile/device counts');

const covert=region('covert');covert.unlockedTechIds.add(NUCLEAR_WEAPONISATION_TECH_ID);covert.unlockedTechIds.add(NUCLEAR_TEST_VALIDATION_TECH_ID);
const cs=ensureNuclearWeaponState(covert);cs.weaponisationProgress=1;cs.prototypeCount=1;cs.validationConfidence=.4;
setNuclearWeaponPolicy(covert,{programme:NUCLEAR_WEAPON_PROGRAMMES.PROTOTYPE,testPolicy:NUCLEAR_TEST_POLICIES.COVERT,secrecy:1});
for(let i=0;i<180&&!cs.tests.length;i++) tickNuclearWeaponProgramme(covert,i,7,()=>0);
assert.ok(cs.tests.length>0,'covert testing should be possible');
assert.equal(cs.tests[0].publiclyDeclared,false,'covert tests must not automatically become public declarations');

const noMaterial=region('no-material');noMaterial.stockpile.strategic_uranium_material=0;noMaterial.stockpile.separated_plutonium=0;noMaterial.unlockedTechIds.add(NUCLEAR_WEAPONISATION_TECH_ID);setNuclearWeaponPolicy(noMaterial,{programme:NUCLEAR_WEAPON_PROGRAMMES.RESEARCH});
for(let i=0;i<520;i++)tickNuclearWeaponProgramme(noMaterial,i,7,()=>0);
assert.equal(ensureNuclearWeaponState(noMaterial).prototypeCount,0,'knowledge alone must not create a prototype without strategic material');

console.log('Nuclear weaponisation and testing regressions passed.');
