import assert from 'node:assert/strict';
import {
  createNuclearDiplomaticProposal,evaluateNuclearDiplomaticProposal,respondToNuclearProposal,
  concludeNuclearDiplomaticProposal,establishNuclearWeaponFreeZone,respondToDetectedNuclearViolation,
  NUCLEAR_DIPLOMATIC_RESPONSES,ensureNuclearDiplomacy,tickNuclearDiplomacy
} from '../js/diplomacy/nuclearDiplomacy.js';
import { NUCLEAR_TREATY_TYPES,nuclearTreatyConstraints,ensureNuclearArmsControl } from '../js/diplomacy/nuclearArmsControl.js';
import {
  establishNuclearSecurityArrangement,deployNuclearAssetsToAlly,NUCLEAR_ALLIANCE_TYPES,
  ALLIED_NUCLEAR_ASSETS,ALLIED_DEPLOYMENT_MODES,ALLIED_RED_LINE_CATEGORIES
} from '../js/diplomacy/nuclearAlliedDeployments.js';
import { ensureNuclearWeaponState } from '../js/military/nuclearWeaponisation.js';
import { ensureStrategicDelivery,STRATEGIC_MISSILE_TECH_ID } from '../js/military/strategicDelivery.js';

function region(id){return{id,name:id,treasury:1000,stockpile:{},unlockedTechIds:new Set(),fleets:[],relations:{},governance:{administrativeControl:.75},nuclearDeterrence:{riskTolerance:.3},industrialSupply:{capability:{precision_machining:.8},inventory:{}},industrialPlants:{componentCapability:{electronics:.8,engine:.8}},structuralTransformation:{capability:{manufacture:.8}}};}
function nuclear(r){const w=ensureNuclearWeaponState(r);w.prototypeCount=2;w.validationConfidence=.9;w.tests.push({completed:true,publiclyDeclared:true,tick:1});return r;}

const guarantor=nuclear(region('guarantor')),minor=region('minor');
ensureNuclearArmsControl(minor).armsRace.threatPressure=.72;
minor.relations.guarantor={trust:.82,hostility:.05};guarantor.relations.minor={trust:.8,hostility:.05};
let p=createNuclearDiplomaticProposal(guarantor,[minor],{id:'np-guarantee',name:'NP plus guarantee',type:NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms:{prohibitAcquisition:true,safeguards:true,verification:.7,inspectionAccess:.5,securityAssurance:.72},securityGuarantee:{commitment:.78,redLineCategories:[ALLIED_RED_LINE_CATEGORIES.NUCLEAR_ATTACK,ALLIED_RED_LINE_CATEGORIES.HOMELAND_INVASION]},economicIncentive:.2,currentTick:10});
let evaln=evaluateNuclearDiplomaticProposal(minor,guarantor,p);assert.ok(evaln.score>.55,'credible assurance should make non-proliferation bargain acceptable to a threatened friendly state');
let response=respondToNuclearProposal(minor,guarantor,p.id,{currentTick:11});assert.equal(response.accepted,true);
let concluded=concludeNuclearDiplomaticProposal(guarantor,[minor],p.id,{currentTick:12});assert.equal(concluded.concluded,true);assert.equal(nuclearTreatyConstraints(minor).prohibitAcquisition,true);assert.ok(minor.nuclearAlliance?.arrangements?.['guarantee-np-guarantee-minor'],'accepted bargain should create the promised extended-deterrence arrangement');

const a=region('zone-a'),b=region('zone-b'),c=region('zone-c');
let zone=establishNuclearWeaponFreeZone([a,b,c],{id:'southern-zone',currentTick:20});assert.equal(zone.members.length,3);for(const member of [a,b,c]){const zc=nuclearTreatyConstraints(member);assert.equal(zc.prohibitAcquisition,true);assert.equal(zc.prohibitTesting,true);assert.equal(zc.prohibitForeignNuclearBasing,true);assert.equal(zc.maxPrototypes,0);}

const provider=nuclear(region('provider'));provider.unlockedTechIds.add(STRATEGIC_MISSILE_TECH_ID);ensureStrategicDelivery(provider).land.mobileLaunchers=3;
establishNuclearSecurityArrangement(provider,a,{id:'basing-zone',type:NUCLEAR_ALLIANCE_TYPES.BASING_RIGHTS,basingRights:true,crisisBasing:true,assetTypes:[ALLIED_NUCLEAR_ASSETS.LAND_MISSILE],maxAssets:2,currentTick:21});
let dep=deployNuclearAssetsToAlly(provider,a,{arrangementId:'basing-zone',assetType:ALLIED_NUCLEAR_ASSETS.LAND_MISSILE,count:2,mode:ALLIED_DEPLOYMENT_MODES.CRISIS,startTick:22});assert.equal(dep.deployed,false);assert.equal(dep.reason,'treaty_prohibits_foreign_nuclear_basing','weapon-free zone must block foreign nuclear deployments as well as indigenous acquisition');

const violator=region('violator');establishNuclearWeaponFreeZone([violator,region('other-zone')],{id:'zone-violation',verification:1,inspectionAccess:1,currentTick:30});const vw=ensureNuclearWeaponState(violator);vw.prototypeCount=1;vw.policy.secrecy=0;const inspector=region('inspector');ensureNuclearArmsControl(inspector).verificationCapacity=1;
let action=respondToDetectedNuclearViolation(inspector,violator,'zone-violation',{response:NUCLEAR_DIPLOMATIC_RESPONSES.SANCTIONS,currentTick:40,rng:()=>0});assert.equal(action.acted,true);assert.ok(action.inspection.detected.includes('prohibited_nuclear_acquisition'));assert.ok(violator.nuclearDiplomaticPressure>0,'detected violation should be able to produce diplomatic/economic pressure');assert.ok(ensureNuclearDiplomacy(violator).reputation<.6,'detected cheating should damage nuclear-diplomacy reputation');

const heavy=nuclear(region('heavy')),peer=nuclear(region('peer'));ensureStrategicDelivery(heavy).land.mobileLaunchers=20;heavy.relations.peer={trust:.2,hostility:.7};
p=createNuclearDiplomaticProposal(peer,[heavy],{id:'bad-cap',type:NUCLEAR_TREATY_TYPES.ARMS_LIMITATION,terms:{maxLandLaunchers:1,verification:1,inspectionAccess:1},currentTick:50});evaln=evaluateNuclearDiplomaticProposal(heavy,peer,p);assert.equal(evaln.accept,false,'drastic unilateral force cuts with intrusive inspections should not be automatically accepted');

const expiring=region('expiring'),target=region('target');createNuclearDiplomaticProposal(expiring,[target],{id:'expire-me',currentTick:100,expiresTick:110});let events=tickNuclearDiplomacy([expiring,target],110,7);assert.ok(events.some(e=>e.type==='nuclear_proposal_expired'));

console.log('nuclear diplomacy regressions passed');
