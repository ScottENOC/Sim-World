import assert from 'node:assert/strict';
import { registerInternationalCrisis, applyReligiousAuthorityPosition } from '../js/diplomacy/internationalCrises.js';
import { recordInternationalCrisisSignal, harvestInternationalCrisisSignals } from '../js/diplomacy/internationalCrisisBridge.js';
import { tickInternationalCrisisBodies } from '../js/diplomacy/internationalCrisisBodies.js';
import { tickInternationalOrganisations } from '../js/diplomacy/internationalOrganisations.js';
import { ensureDiplomacy } from '../js/diplomacy/relations.js';

function polity(id, capitalRegionId){return{id,name:id,capitalRegionId,administration:{officialdom:.65,recordKeeping:.55,communications:.55,legitimacy:.6},warSociety:{warWeariness:.45}};}
function region(id,pid){return{id,name:id,population:100000,treasury:500,wallet:200,army:{personnel:800},governance:{sovereignPolityId:pid,administrativeControl:.7},relations:new Map(),religion:{shares:{}},unlockedTechIds:new Set(['printing_press','electrical_telegraphy'])};}

{
 const a=polity('a','a1'),b=polity('b','b1'); const a1=region('a1','a'),b1=region('b1','b');
 const world={polities:[a,b],regions:[a1,b1],activeWars:[],internationalOrganisations:[]};
 recordInternationalCrisisSignal(a1,{type:'blockade',sideAActorId:'a',sideBActorId:'b',allegedAggressorActorId:'a',severity:.7,humanitarianRisk:.5});
 const made=harvestInternationalCrisisSignals(world,10);
 assert.equal(made.length,1); assert.equal(world.internationalCrises[0].type,'blockade');
}

{
 const sponsor=polity('sponsor','s1'),target=polity('target','t1'); const s1=region('s1','sponsor'),t1=region('t1','target');
 target.foreignPoliticalIntervention={operations:{'sponsor:coup':{sponsorPolityId:'sponsor',mode:'coup',network:.5,eliteContacts:.6,materialSupport:.3,exposure:.7,detected:true}}};
 const world={polities:[sponsor,target],regions:[s1,t1],activeWars:[],internationalOrganisations:[]};
 harvestInternationalCrisisSignals(world,20);
 assert.ok(world.internationalCrises.some(c=>c.type==='foreign_backed_coup'));
}

{
 const a=polity('a','a1'),b=polity('b','b1'); const a1=region('a1','a'),b1=region('b1','b');
 a1.religion.shares.faith=.7; b1.religion.shares.faith=.65;
 const authority={id:'faith-authority',religionId:'faith',active:true,diplomaticInfluence:.8,prestige:.8,influenceByPolity:{a:.7,b:.7}};
 const world={polities:[a,b],regions:[a1,b1],religiousWorld:{authorities:[authority]}};
 const crisis=registerInternationalCrisis(world,{type:'war',sideAActorId:'a',sideBActorId:'b',allegedAggressorActorId:'a',severity:.8,humanitarianRisk:.7,nuclearRisk:.4,evidence:.9},30);
 const before=crisis.restraint;
 const result=applyReligiousAuthorityPosition(authority,crisis,world,31,'call_peace');
 assert.equal(result.applied,true); assert.ok(crisis.restraint>before); assert.ok(authority.politics.peaceCalls.length===1);
}

{
 const a=polity('a','a1'),b=polity('b','b1'),c=polity('c','c1'); const a1=region('a1','a'),b1=region('b1','b'),c1=region('c1','c');
 const org={id:'intl-org-1',name:'World Assembly',level:'global',hostPolityId:'c',active:true,memberPolityIds:['a','b','c'],majorPowerIds:['a','b'],charter:{universalMembership:true},metrics:{legitimacy:.9,acceptance:.9,control:.1,impartiality:.9,greatPowerBuyIn:.7},motions:[]};
 const world={polities:[a,b,c],regions:[a1,b1,c1],activeWars:[],internationalOrganisations:[org]};
 const crisis=registerInternationalCrisis(world,{type:'war',sideAActorId:'a',sideBActorId:'b',allegedAggressorActorId:'a',severity:.8,nuclearRisk:.8,evidence:.9},40);
 tickInternationalCrisisBodies(world,42,()=>0);
 assert.ok(org.motions.length>=1); assert.ok(crisis.bodyPositions.some(p=>p.bodyType==='international_organisation'));
}

{
 const a=polity('a','a1'),b=polity('b','b1'),c=polity('c','c1'); const a1=region('a1','a'),b1=region('b1','b'),c1=region('c1','c');
 ensureDiplomacy(c1); ensureDiplomacy(a1);
 const org={id:'intl-org-2',name:'Collective Security Council',level:'global',hostPolityId:'c',active:true,memberPolityIds:['b','c'],majorPowerIds:['b'],charter:{universalMembership:true},metrics:{legitimacy:1,acceptance:1,control:0,impartiality:1,greatPowerBuyIn:.8},motions:[]};
 const world={polities:[a,b,c],regions:[a1,b1,c1],activeWars:[],internationalOrganisations:[org]};
 const crisis=registerInternationalCrisis(world,{type:'atrocity',sideAActorId:'a',sideBActorId:'b',allegedAggressorActorId:'a',severity:1,humanitarianRisk:1,evidence:1},50);
 tickInternationalCrisisBodies(world,52,()=>0);
 if(crisis.organisationSanctions?.length){assert.ok((c1.relations.get('a1')?.tradeSanctionSeverity||0)>0);}
}

{
 const a=polity('a','a1'),b=polity('b','b1'),c=polity('c','c1'); const a1=region('a1','a'),b1=region('b1','b'),c1=region('c1','c');
 const authority={id:'authority',religionId:'faith',active:true,diplomaticInfluence:.8,prestige:.7,influenceByPolity:{a:.5,b:.5}}; a1.religion.shares.faith=.5;b1.religion.shares.faith=.5;
 const world={polities:[a,b,c],regions:[a1,b1,c1],activeWars:[{id:'war-1',active:true,attackerPolityId:'a',defenderPolityId:'b'}],internationalOrganisations:[],religiousWorld:{authorities:[authority]}};
 tickInternationalOrganisations(world,62,30);
 assert.ok(world.internationalCrises?.some(c=>c.key==='war:war-1'));
}

console.log('international crisis regressions passed');
