import assert from 'node:assert/strict';
import { initialisePoliticalContinuity } from '../js/politics/continuityCore.js';
import { ensureInstitutionalCrisisState } from '../js/politics/institutionalCrises.js';
import { leadershipShockAssessment, processPendingLeadershipShocks } from '../js/politics/leadershipShocks.js';
import { SPECIAL_OPERATION_MISSIONS, ensureSpecialForces, launchSpecialOperation, tickSpecialOperations } from '../js/military/specialOperations.js';
import { classifyRaidUseOfForce, USE_OF_FORCE } from '../js/politics/useOfForce.js';

function makeRegion(id, polityId, { stability=.5, satisfaction=.5, grievance=.4 }={}) {
  return {
    id, name:id, polityId, population:100000, stability,
    treasury:100, wallet:100,
    army:{personnel:1000,away:0,cohesion:.6},
    unlockedTechIds:new Set(['special_forces','military_aviation']),
    governance:{sovereignPolityId:polityId,localPolityId:polityId,localRulerId:`ruler:${id}`,relationship:'core',autonomy:0,administrativeControl:.7},
    popularWellbeing:{satisfaction,grievance,mobilisationPotential:.45},
    militaryProfessionalisation:{institutionalExperience:.7,fieldExperience:.6},
    industrialPlants:{componentCapability:{small_arms:.8,optics:.8,electronics:.7}},
    localCommunications:{telephoneService:.7},
  };
}
function makePolity(id, capital, legitimacy=.4, officialdom=.4) {
  return {
    id,name:id,capitalRegionId:capital,rulerRegionId:capital,
    administration:{legitimacy,officialdom,delegation:officialdom,breakthroughs:new Set()},
    report:{tributeReceived:0,subjectCount:0,administrativeLoad:0,administrativeCapacity:0},
  };
}

// Weak succession + fractured elites + existing coup contacts should turn a
// leadership removal into a coup opening rather than a martyr effect.
{
  const polity=makePolity('weak','w1',.18,.08);
  polity.stateAdministration={court:{factionalism:.92},factions:{landed:{power:.7,grievance:.9},bureaucratic:{power:.4,grievance:.8}},offices:{marshal:{loyalty:.15,competence:.35}}};
  polity.foreignPoliticalIntervention={operations:{'enemy:coup':{mode:'coup',eliteContacts:.92,network:.8,materialSupport:.6}}};
  const regions=[makeRegion('w1',polity.id,{stability:.28,satisfaction:.22,grievance:.8}),makeRegion('w2',polity.id,{stability:.3,satisfaction:.25,grievance:.75})];
  initialisePoliticalContinuity([polity],regions,0);
  const result=leadershipShockAssessment(polity,regions,{vip:{role:'ruler'},removedBy:'capture',attributed:false});
  assert.equal(result.outcome,'coup_opening');
  regions[0].governance.pendingLeadershipShocks=[{tick:10,vip:{id:'r',role:'ruler'},removedBy:'capture',sourceActorId:'enemy',attributed:false}];
  const before=ensureInstitutionalCrisisState(polity).coupRisk;
  const events=processPendingLeadershipShocks([polity],regions,10,30);
  assert.equal(events[0].outcome,'coup_opening');
  assert.ok(ensureInstitutionalCrisisState(polity).coupRisk>before,'coup opening should raise coup risk');
}

// A legitimate, administratively resilient regime hit by an attributed foreign
// assassination should be capable of producing a martyr/rally effect.
{
  const polity=makePolity('strong','s1',.88,.88);
  polity.stateAdministration={court:{factionalism:.08},factions:{bureaucratic:{power:.65,grievance:.05}},offices:{steward:{loyalty:.9,competence:.9},treasurer:{loyalty:.88,competence:.9},chancellor:{loyalty:.9,competence:.92},marshal:{loyalty:.86,competence:.82},justiciar:{loyalty:.9,competence:.9}}};
  const regions=[makeRegion('s1',polity.id,{stability:.9,satisfaction:.85,grievance:.08}),makeRegion('s2',polity.id,{stability:.86,satisfaction:.8,grievance:.12})];
  initialisePoliticalContinuity([polity],regions,0);
  const crisis=ensureInstitutionalCrisisState(polity); crisis.coupRisk=.3;
  const result=leadershipShockAssessment(polity,regions,{vip:{role:'ruler'},removedBy:'assassination',attributed:true});
  assert.equal(result.outcome,'martyr_backlash');
  const legitimacyBefore=polity.administration.legitimacy;
  regions[0].governance.pendingLeadershipShocks=[{tick:20,vip:{id:'leader',role:'ruler'},removedBy:'assassination',sourceActorId:'enemy',attributed:true}];
  processPendingLeadershipShocks([polity],regions,20,30);
  assert.ok(polity.administration.legitimacy>legitimacyBefore,'martyr outcome should reinforce incumbent legitimacy');
  assert.ok(crisis.coupRisk<=.3,'martyr outcome should not increase coup risk');
}

// The actual special-operations runtime should support assassination, persist the
// killed VIP, queue the political shock and record an attributed covert attack.
{
  const attacker=makeRegion('a','A');
  const target=makeRegion('t','T');
  target.governance.governor={id:'vip-1',type:'governor',name:'Governor One'};
  const sf=ensureSpecialForces(attacker); sf.operators=20; sf.available=20; sf.training=.9; sf.experience=.8;
  const launched=launchSpecialOperation(attacker,target,SPECIAL_OPERATION_MISSIONS.VIP_ASSASSINATION,0,{teamSize:8,targetVip:{id:'vip-1',role:'governor',label:'Governor One'},durationWeeks:1});
  assert.equal(launched.launched,true);
  launched.operation.assessment.successChance=1;
  launched.operation.assessment.detectionChance=1;
  launched.operation.assessment.targetSecurity=.9;
  launched.operation.assessment.readiness=.1;
  const events=tickSpecialOperations([attacker,target],1,7,()=>0);
  const event=events.find(e=>e.operationId===launched.operation.id);
  assert.equal(event.effect,'vip_assassinated');
  assert.equal(event.attributed,true);
  assert.equal(target.governance.vipStatus['vip-1'].status,'killed');
  assert.equal(target.governance.pendingLeadershipShocks.length,1);
  assert.equal(target.militaryThreat.lastCovertAttackActorId,'A');
  assert.equal(classifyRaidUseOfForce(target,attacker,2),USE_OF_FORCE.REPRISAL,'attributed covert attack should permit reprisal classification');
}

console.log('covert leadership shock regressions passed');
