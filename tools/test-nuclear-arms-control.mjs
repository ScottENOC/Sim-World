import assert from 'node:assert/strict';
import {
  NUCLEAR_TREATY_TYPES, COMPLIANCE_POSTURES, ensureNuclearArmsControl,
  joinNuclearTreaty, leaveNuclearTreaty, nuclearTreatyConstraints,
  npcStrategicArmsDecision, inspectNuclearTreaty, tickNuclearArmsControl
} from '../js/diplomacy/nuclearArmsControl.js';
import { ensureStrategicDelivery, STRATEGIC_MISSILE_TECH_ID, MOBILE_STRATEGIC_BASING_TECH_ID } from '../js/military/strategicDelivery.js';
import { ensureNuclearWeaponState } from '../js/military/nuclearWeaponisation.js';

function region(id){
  return {
    id,name:id,treasury:1000,stockpile:{steel:1000,reactor_fuel:2},unlockedTechIds:new Set(),fleets:[],
    industrialSupply:{capability:{precision_machining:.8},inventory:{machine_components:1000}},
    industrialPlants:{componentCapability:{electronics:.8,engine:.8}},
    structuralTransformation:{capability:{manufacture:.8}},governance:{administrativeControl:.75},
    nuclearDeterrence:{riskTolerance:.28},relations:{}
  };
}

const minor=region('minor');
joinNuclearTreaty(minor,{id:'np',type:NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms:{verification:.8,inspectionAccess:.8,securityAssurance:.5},currentTick:10});
let c=nuclearTreatyConstraints(minor);
assert.equal(c.prohibitAcquisition,true);
assert.equal(c.securityAssurance,.5);
let decision=npcStrategicArmsDecision(minor,{rivals:[],currentTick:11});
assert.equal(decision.landTarget,0,'non-nuclear member should not procure strategic delivery under compliant non-proliferation membership');

const armed=region('armed');
armed.unlockedTechIds.add(STRATEGIC_MISSILE_TECH_ID);armed.unlockedTechIds.add(MOBILE_STRATEGIC_BASING_TECH_ID);
const ds=ensureStrategicDelivery(armed);ds.land.fixedLaunchers=8;ds.land.mobileLaunchers=4;
const ws=ensureNuclearWeaponState(armed);ws.prototypeCount=3;ws.tests.push({tick:5,completed:true,publiclyDeclared:true});ws.validationConfidence=.9;
joinNuclearTreaty(armed,{id:'disarm',type:NUCLEAR_TREATY_TYPES.DISARMAMENT,terms:{maxLandLaunchers:4,maxPrototypes:1,verification:.9,inspectionAccess:.9},currentTick:20});
for(let y=0;y<2;y++)tickNuclearArmsControl([armed],30+y*365,365);
assert.ok(ds.land.fixedLaunchers+ds.land.mobileLaunchers<=4,'disarmament treaty should physically reduce deployed land launchers');
assert.ok(ws.prototypeCount<=1,'disarmament treaty should reduce abstract prototype stock');

const cheater=region('cheater');
const cw=ensureNuclearWeaponState(cheater);cw.prototypeCount=1;cw.policy.secrecy=0;
joinNuclearTreaty(cheater,{id:'np2',type:NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms:{verification:1,inspectionAccess:1},currentTick:1});
const inspector=region('inspector');ensureNuclearArmsControl(inspector).verificationCapacity=1;
let inspection=inspectNuclearTreaty(inspector,cheater,'np2',{currentTick:100,rng:()=>0});
assert.ok(inspection.detected.includes('prohibited_nuclear_acquisition'),'strong verification should detect an unconcealed prohibited acquisition in deterministic test');

const weak=region('weak');weak.nuclearDeterrence.riskTolerance=.9;ensureNuclearArmsControl(weak).treatyReliability=.1;
joinNuclearTreaty(weak,{id:'weak-regime',type:NUCLEAR_TREATY_TYPES.ARMS_LIMITATION,terms:{maxLandLaunchers:2,verification:.05,inspectionAccess:.05}});
const rival=region('rival');const rw=ensureNuclearWeaponState(rival);rw.prototypeCount=1;rw.tests.push({completed:true,publiclyDeclared:true});rw.validationConfidence=.9;
rival.unlockedTechIds.add(STRATEGIC_MISSILE_TECH_ID);ensureStrategicDelivery(rival).land.mobileLaunchers=8;weak.relations.rival={hostility:.9};
decision=npcStrategicArmsDecision(weak,{rivals:[rival],currentTick:200});
assert.ok([COMPLIANCE_POSTURES.HEDGE,COMPLIANCE_POSTURES.VIOLATE].includes(decision.treatyPosture),'high threat plus weak verification should permit hedging or violation');

const withdrawal=region('withdrawal');joinNuclearTreaty(withdrawal,{id:'exit',type:NUCLEAR_TREATY_TYPES.TEST_BAN,terms:{withdrawalNoticeDays:30},currentTick:100});
let leaving=leaveNuclearTreaty(withdrawal,'exit',{currentTick:110});assert.equal(leaving.status,'withdrawing');tickNuclearArmsControl([withdrawal],139,7);assert.equal(withdrawal.nuclearArmsControl.treaties.exit.status,'withdrawing');tickNuclearArmsControl([withdrawal],140,7);assert.equal(withdrawal.nuclearArmsControl.treaties.exit.status,'withdrawn');

console.log('nuclear arms control regressions passed');
