import assert from 'node:assert/strict';
import { declareNuclearRedLine, estimateRedLineRisk, actualRedLineCrossing, recordRedLineProbe, beginOrUpdateNuclearCrisis, npcNuclearProbeDecision, nuclearTriadReadiness, tickNuclearDeterrence, RED_LINE_CATEGORIES } from '../js/diplomacy/nuclearDeterrence.js';
import { nuclearDeterrenceIsActive } from '../js/military/nuclearActivation.js';
import { ensureNuclearWeaponState } from '../js/military/nuclearWeaponisation.js';
import { AERIAL_REFUELLING_TECH_ID, aerialRefuellingSupport } from '../js/military/aviation.js';
import { STRATEGIC_BOMBER_DELIVERY_TECH_ID } from '../js/military/strategicDelivery.js';
import { KnowledgeLedger, KNOWLEDGE_TOPICS, KNOWLEDGE_SOURCES } from '../js/core/knowledge.js';

function region(id){return {id,name:id,population:100000,unlockedTechIds:new Set(),stockpile:{aviation_fuel:20,strategic_uranium_material:1,separated_plutonium:0},aviation:{aircraft:[]},knowledge:new KnowledgeLedger(id),governance:{administrativeControl:.8,administration:{recordKeeping:.8}},industrialSupply:{capability:{precision_machining:.8}},structuralTransformation:{capability:{manufacture:.8}},massEducation:{literacy:.8},strategicNuclear:{policy:{posture:'strategic',safeguards:.3,secrecy:.5,declared:false}}};}

const dormantWorld=[region('pre-nuclear-a'),region('pre-nuclear-b')];
assert.equal(nuclearDeterrenceIsActive(dormantWorld),false,'deterrence should remain dormant before the first completed test or use');
assert.deepEqual(tickNuclearDeterrence(dormantWorld,1,7),[],'dormant deterrence tick should do no world-level deterrence work');
const testState=ensureNuclearWeaponState(dormantWorld[0]);
testState.tests.push({completed:true,publiclyDeclared:false});
assert.equal(nuclearDeterrenceIsActive(dormantWorld),true,'a completed nuclear test should activate deterrence world-wide');
testState.tests.length=0;
assert.equal(nuclearDeterrenceIsActive(dormantWorld),true,'activation should remain latched for the loaded world after first detonation');
const freshWorld=[region('fresh-a')];
assert.equal(nuclearDeterrenceIsActive(freshWorld),false,'a fresh world must not inherit another loaded world activation latch');
const loadedPostUse=[region('loaded-post-use')];
loadedPostUse[0].nuclearUse={history:[{type:'nuclear_use_executed'}],globalShock:{firstUseObserved:true}};
assert.equal(nuclearDeterrenceIsActive(loadedPostUse),true,'persisted nuclear use should reactivate deterrence when loading a post-nuclear save');

const defender=region('defender'),challenger=region('challenger');
challenger.knowledge.addObservation({subjectId:defender.id,topic:KNOWLEDGE_TOPICS.MILITARY,source:KNOWLEDGE_SOURCES.SPY,confidence:.88,specificity:.86,observedTick:90,receivedTick:90,details:{nuclearSignals:true}});
const nw=ensureNuclearWeaponState(defender);nw.prototypeCount=1;nw.validationConfidence=.9;nw.tests=[{completed:true,publiclyDeclared:true,detected:true}];nw.observableSignals={researchFootprint:1,procurement:1,testRange:1,concealment:0};
const line=declareNuclearRedLine(defender,{category:RED_LINE_CATEGORIES.HOMELAND_INVASION,severity:.7,publiclyDeclared:true,ambiguity:.2});
assert(line);
let low=estimateRedLineRisk(challenger,defender,{category:'border_incursion',severity:.25,deniability:.8,reversible:.8});
let high=estimateRedLineRisk(challenger,defender,{category:RED_LINE_CATEGORIES.HOMELAND_INVASION,severity:.9,deniability:0,reversible:0});
assert(high.perceivedRisk>low.perceivedRisk,'major invasion must be perceived as riskier than a deniable reversible probe');
assert.equal(actualRedLineCrossing(defender,{category:RED_LINE_CATEGORIES.HOMELAND_INVASION,severity:.8}).crossed,true);
const before=line.credibility;const updated=recordRedLineProbe(defender,line.id,{crossed:false,strongResponse:false});assert(updated.credibility<before,'tolerated probes should erode perceived credibility');
const crisis=beginOrUpdateNuclearCrisis(defender,challenger,{category:RED_LINE_CATEGORIES.HOMELAND_INVASION,severity:.9},100);assert(crisis.level>=2,'genuine red-line crossing should create a serious crisis');
const probe=npcNuclearProbeDecision(challenger,defender,{category:'border_incursion',severity:.15,deniability:.9,reversible:.9});assert(probe.salamiOpportunity>high.salamiOpportunity,'small deniable actions should offer greater salami opportunity');

defender.unlockedTechIds.add(AERIAL_REFUELLING_TECH_ID);
defender.unlockedTechIds.add(STRATEGIC_BOMBER_DELIVERY_TECH_ID);
defender.aviation.aircraft.push(
  {ownerType:'military',role:'bomber',status:'serviceable',condition:1,fuel:1,crewAssignment:{pilots:1,pilotExperience:1,aircrew:4,aircrewExperience:1}},
  {ownerType:'military',role:'tanker',status:'serviceable',condition:1,fuel:1,crewAssignment:{pilots:2,pilotExperience:1,aircrew:2,aircrewExperience:1}}
);
const refuel=aerialRefuellingSupport(defender);assert(refuel.enabled,'serviceable tanker should provide aerial-refuelling support');
const triad=nuclearTriadReadiness(defender,{fleets:[{ownerRegionId:defender.id,ships:[{designId:'submarine'}]}]});
assert.equal(triad.air.available,true);assert.equal(triad.land.available,false);assert.equal(triad.sea.available,false);assert.equal(triad.fullTriad,false);
console.log('nuclear deterrence regression passed');
