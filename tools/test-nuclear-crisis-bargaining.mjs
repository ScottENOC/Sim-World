import assert from 'node:assert/strict';
import {
  CRISIS_DEMAND_TYPES, CRISIS_PRESSURE_TOOLS, CRISIS_CONCESSION_TYPES,
  ensureNuclearCrisisBargaining, openNuclearCrisisBargaining, issueCrisisDemand,
  offerCrisisConcession, applyCrisisPressure, evaluateCrisisSettlement,
  concludeCrisisSettlement, npcCrisisBargainingAction, tickNuclearCrisisBargaining
} from '../js/diplomacy/nuclearCrisisBargaining.js';
import { tickNuclearDeterrence } from '../js/diplomacy/nuclearDeterrence.js';

function region(id){return{id,name:id,relations:{},fleets:[],unlockedTechIds:new Set(),governance:{administrativeControl:.7},nuclearDeterrence:{doctrine:'ambiguous',redLines:[],perceptions:{},resolve:.55,riskTolerance:.28,signalDiscipline:.55,crises:{}}};}
function crisis(a,b,pressure=.72){a.nuclearDeterrence.crises[b.id]={opponentActorId:b.id,level:Math.floor(pressure*5.2),pressure,lastTick:1,history:[]};}

const us=region('us'),ussr=region('ussr'),cuba=region('cuba');
crisis(us,ussr,.72);crisis(ussr,us,.72);
ussr.relations.us={trust:.35,hostility:.65};us.relations.ussr={trust:.35,hostility:.65};

// A third-party host deployment: provider and host each carry a mirrored deployment record.
const deployment={id:'cuba-missiles',arrangementId:'ussr-cuba',providerRegionId:'ussr',providerActorId:'ussr',hostRegionId:'cuba',hostActorId:'cuba',assetType:'land_missile',count:4,mode:'crisis',publiclyDeclared:false,startTick:10,endTick:null,status:'active'};
ussr.nuclearAlliance={arrangements:{},deployments:{[deployment.id]:{...deployment,role:'provider'}},history:[],coverage:[],extendedDeterrenceAssurance:0,hostAcceptance:.55};
cuba.nuclearAlliance={arrangements:{},deployments:{[deployment.id]:{...deployment,role:'host'}},history:[],coverage:[],extendedDeterrenceAssurance:0,hostAcceptance:.55};

const talks=openNuclearCrisisBargaining(us,ussr,{id:'october-crisis',currentTick:20});
assert.equal(talks.status,'open');
issueCrisisDemand(us,ussr,talks.id,{type:CRISIS_DEMAND_TYPES.REMOVE_MISSILES,targetDeploymentId:'cuba-missiles',targetRegionId:'cuba',severity:.65,deadlineTick:30,currentTick:20});
const beforePressure=ussr.nuclearDeterrence.crises.us.pressure;
applyCrisisPressure(us,ussr,talks.id,{tool:CRISIS_PRESSURE_TOOLS.QUARANTINE,intensity:.75,currentTick:21});
assert.ok(ussr.nuclearDeterrence.crises.us.pressure>beforePressure,'quarantine-style pressure should add escalation risk');
offerCrisisConcession(us,ussr,talks.id,{type:CRISIS_CONCESSION_TYPES.FACE_SAVING_STATEMENT,value:.8,currentTick:22});
offerCrisisConcession(us,ussr,talks.id,{type:CRISIS_CONCESSION_TYPES.SECRET_SIDE_DEAL,value:.8,secret:true,currentTick:22,details:{reciprocalWithdrawal:true}});
const evaluation=evaluateCrisisSettlement(ussr,us,talks.id);
assert.equal(evaluation.accept,true,'danger plus meaningful reciprocal/face-saving concessions should make a settlement acceptable');
assert.notEqual(npcCrisisBargainingAction(ussr,us,talks.id).action,'hold');
const pressureBeforeSettlement=ussr.nuclearDeterrence.crises.us.pressure;
const settlement=concludeCrisisSettlement(us,ussr,talks.id,{acceptingRegionId:'ussr',currentTick:23,publicTerms:true,regions:[us,ussr,cuba]});
assert.equal(settlement.concluded,true);
assert.equal(settlement.settlement.secretSideDeal,true);
assert.equal(ussr.nuclearAlliance.deployments['cuba-missiles'].status,'withdrawn','provider deployment should be withdrawn');
assert.equal(cuba.nuclearAlliance.deployments['cuba-missiles'].status,'withdrawn','third-party host mirror should also be withdrawn');
assert.ok(ussr.nuclearDeterrence.crises.us.pressure<pressureBeforeSettlement,'negotiated settlement should materially de-escalate crisis pressure');
assert.equal(ensureNuclearCrisisBargaining(us).cases[talks.id].status,'settled');

const a=region('a'),b=region('b');
assert.equal(openNuclearCrisisBargaining(a,b,{currentTick:1}),null,'normal relations should not create nuclear crisis talks');
crisis(a,b,.5);crisis(b,a,.5);
const deadline=openNuclearCrisisBargaining(a,b,{id:'deadline',currentTick:5});
issueCrisisDemand(a,b,deadline.id,{type:CRISIS_DEMAND_TYPES.FREEZE_DEPLOYMENTS,severity:.7,deadlineTick:10,currentTick:5});
const p0=b.nuclearDeterrence.crises.a.pressure;
const events=tickNuclearCrisisBargaining([a,b],10,7);
assert.ok(events.some(e=>e.type==='nuclear_crisis_deadline_missed'));
assert.ok(b.nuclearDeterrence.crises.a.pressure>p0,'missed ultimatum deadline should increase crisis pressure without launching anything');

// Integration smoke: bargaining tick can coexist with full deterrence/diplomacy tick.
assert.doesNotThrow(()=>tickNuclearDeterrence([a,b],11,7));
console.log('nuclear crisis bargaining regressions passed');
