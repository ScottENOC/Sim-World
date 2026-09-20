import assert from 'node:assert/strict';
import {
  ensureNuclearUseState, submitStrategicWarning, resolveStrategicWarning,
  evaluateNuclearReleaseDecision, requestNuclearAuthorization,
  confirmPlayerNuclearAuthorization, npcNuclearReleaseDecision,
  executeAuthorizedNuclearUse, NUCLEAR_TARGET_CATEGORIES, NUCLEAR_USE_SCALES,
  NUCLEAR_RELEASE_DOCTRINES, setNuclearReleasePolicy, setNuclearCommandContinuity
} from '../js/military/nuclearUse.js';
import { STRATEGIC_MISSILE_TECH_ID, SECURE_STRATEGIC_COMMAND_TECH_ID, STRATEGIC_EARLY_WARNING_TECH_ID } from '../js/military/strategicDelivery.js';

function region(id,{player=false}={}){
  return {
    id,name:id,treasury:1000,unlockedTechIds:new Set([STRATEGIC_MISSILE_TECH_ID,SECURE_STRATEGIC_COMMAND_TECH_ID,STRATEGIC_EARLY_WARNING_TECH_ID]),
    governance:{sovereignPolityId:id,administrativeControl:.72,leadershipContinuity:.72},
    aviation:{aircraft:[]},fleets:[],stockpile:{},industrialSupply:{inventory:{},capability:{}},
    nuclearWeapons:{policy:{programme:'prototype',testPolicy:'public',secrecy:.2},weaponisationProgress:1,validationConfidence:.9,programmeExperience:.8,prototypeCount:3,tests:[{completed:true,publiclyDeclared:true,detected:true,tick:1}],observableSignals:{}},
    strategicNuclear:{policy:{posture:'strategic',safeguards:.2,secrecy:.2,declared:true},stockpile:{},experience:{}},
    strategicDelivery:{policy:{posture:'survivable',bomberAlert:.3,bomberDispersal:.4,landDispersal:.7,submarinePatrolRate:.4},air:{experience:0},land:{fixedLaunchers:2,mobileLaunchers:6,readiness:.82,experience:.7},sea:{platformIds:[],patrolPlatformIds:[],readiness:.5,experience:0},command:{warningExperience:.8,commandExperience:.8},procurement:{landTarget:8,mobileShare:.75,seaTarget:0}},
    playerControlled:player
  };
}

const a=region('A',{player:true}), b=region('B'), c=region('C');
for(const r of [a,b,c])ensureNuclearUseState(r);
setNuclearCommandContinuity(a,{civilianAuthority:.95,militaryCommand:.95,communications:.95,succession:.8});

// Weak/ambiguous warning cannot trigger release.
const weak=submitStrategicWarning(a,{id:'weak',confidence:.45,corroboration:.25,sourceDiversity:.25,currentTick:10});
const weakEval=evaluateNuclearReleaseDecision(a,b,{warningId:weak.id,trigger:'retaliation',crisisLevel:5,redLineCrossed:true,playerControlled:true});
assert.equal(weakEval.eligible,false);
assert.ok(weakEval.reasons.includes('attack_not_independently_confirmed'));
const npcWeak=npcNuclearReleaseDecision(a,b,{warningId:weak.id,trigger:'retaliation',crisisLevel:5,redLineCrossed:true});
assert.equal(npcWeak.authorize,false);
resolveStrategicWarning(a,weak.id,{falseAlarm:true,currentTick:11});

// Confirmed nuclear attack can reach a very high retaliatory threshold.
const confirmed=submitStrategicWarning(a,{id:'confirmed',confidence:.98,corroboration:.95,sourceDiversity:.9,confirmedDetonation:true,attackType:'nuclear_attack',currentTick:20});
const evalConfirmed=evaluateNuclearReleaseDecision(a,b,{warningId:confirmed.id,trigger:'retaliation',crisisLevel:5,redLineCrossed:true,existentialThreat:true,playerControlled:true});
assert.equal(evalConfirmed.eligible,true);
assert.equal(evalConfirmed.requiresPlayerConfirmation,true);
const req=requestNuclearAuthorization(a,b,{warningId:confirmed.id,trigger:'retaliation',crisisLevel:5,redLineCrossed:true,existentialThreat:true,playerControlled:true,currentTick:20});
assert.equal(req.authorized,false);
assert.equal(req.authorization.status,'awaiting_player_confirmation');
const confirmedAuth=confirmPlayerNuclearAuthorization(a,req.authorization.id,{confirmed:true,currentTick:21});
assert.equal(confirmedAuth.status,'authorized');

// Retaliatory-only doctrine blocks first use even in a severe crisis.
const firstUse=evaluateNuclearReleaseDecision(c,b,{trigger:'first_use',crisisLevel:5,redLineCrossed:true,existentialThreat:true});
assert.equal(firstUse.eligible,false);
assert.ok(firstUse.reasons.includes('doctrine_forbids_first_use'));
setNuclearReleasePolicy(c,{doctrine:NUCLEAR_RELEASE_DOCTRINES.EXISTENTIAL_FIRST_USE});
const npcFirst=npcNuclearReleaseDecision(c,b,{trigger:'first_use',crisisLevel:5,redLineCrossed:true,existentialThreat:true});
assert.equal(npcFirst.authorize,false,'first use remains extraordinarily difficult without a qualifying warning context');

// Consequences are abstract shocks; capital use can impair continuity and creates global first-use shock.
setNuclearCommandContinuity(b,{civilianAuthority:.5,militaryCommand:.5,communications:.45,succession:.35});
b.governance.administrativeControl=.42;b.governance.leadershipContinuity=.38;
const out=executeAuthorizedNuclearUse(a,b,{authorizationId:req.authorization.id,targetCategory:NUCLEAR_TARGET_CATEGORIES.CAPITAL,scale:NUCLEAR_USE_SCALES.MAJOR,currentTick:22,worldRegions:[a,b,c]});
assert.equal(out.executed,true);
assert.ok(out.impact.governanceShock>0);
assert.ok(out.impact.displacementShock>0);
assert.equal(out.globalFirstUseShock,true);
assert.equal(a.nuclearUse.globalShock.firstUseObserved,true);
assert.equal(b.nuclearUse.globalShock.firstUseObserved,true);
assert.equal(c.nuclearUse.globalShock.firstUseObserved,true);
assert.ok(['collapsed','severely_degraded','degraded','intact'].includes(out.continuity.status));
assert.equal(out.gameOverEligible,out.continuity.collapsed);
assert.equal(a.nuclearUse.authorizations[req.authorization.id].status,'executed');

// Re-use of the same authorization is impossible.
const repeat=executeAuthorizedNuclearUse(a,b,{authorizationId:req.authorization.id,targetCategory:NUCLEAR_TARGET_CATEGORIES.MILITARY,currentTick:23,worldRegions:[a,b,c]});
assert.equal(repeat.executed,false);

console.log('nuclear use regression: ok');
