import assert from 'node:assert/strict';
import { AI_GOVERNANCE_MEASURES, establishAiGovernanceAccord, ensureAiGovernance } from '../js/diplomacy/aiStatecraft.js';
import { applyAdditionalAiGovernanceMeasures } from '../js/diplomacy/aiGovernanceMeasures.js';

function region(id){
  return {
    id,polityId:id,population:1_000_000,governance:{sovereignPolityId:id},
    aiGovernance:{policy:{transparency:.35,registryCompliance:.4,inspectionAcceptance:.4,incidentReporting:.4,exportControlStrength:.3,strategicRestraint:.8,concealment:.1}},
    aiControl:{access:{military:.8}},strategicAi:{policy:{militaryDecisionSupport:.75}},aiMilitaryIntegration:.7,
    strategicCrisisPressure:.7,aiIncidentEscalationPressure:.6,report:{},
  };
}

const a=region('a'),b=region('b');
const world={regions:[a,b],polities:[{id:'a'},{id:'b'}]};
const result=establishAiGovernanceAccord(world,{
  memberPolityIds:['a','b'],reportingStrength:.9,verificationStrength:.8,
  measures:[AI_GOVERNANCE_MEASURES.FRONTIER_MODEL_NOTIFICATION,AI_GOVERNANCE_MEASURES.AUTONOMOUS_WEAPON_LIMITS,AI_GOVERNANCE_MEASURES.EMERGENCY_HOTLINE],
},1);
assert(result.formed);
const before={registry:ensureAiGovernance(a).policy.registryCompliance,transparency:ensureAiGovernance(a).policy.transparency,military:a.aiControl.access.military,decision:a.strategicAi.policy.militaryDecisionSupport,integration:a.aiMilitaryIntegration,crisis:a.strategicCrisisPressure,escalation:a.aiIncidentEscalationPressure};
applyAdditionalAiGovernanceMeasures(world,365.2425);
assert(ensureAiGovernance(a).policy.registryCompliance>before.registry,'frontier notification should strengthen actual registry compliance');
assert(ensureAiGovernance(a).policy.transparency>before.transparency,'frontier notification should strengthen transparency');
assert(a.aiControl.access.military<before.military,'autonomous-weapon limits should reduce military AI access');
assert(a.strategicAi.policy.militaryDecisionSupport<before.decision,'autonomous-weapon limits should reduce military decision-support autonomy');
assert(a.aiMilitaryIntegration<before.integration,'autonomous-weapon limits should reduce aggregate military AI integration');
assert(a.strategicCrisisPressure<before.crisis,'AI emergency hotlines should reduce crisis escalation pressure');
assert(a.aiIncidentEscalationPressure<before.escalation,'AI emergency hotlines should reduce AI-specific incident escalation pressure');
assert.deepEqual(new Set(a.report.aiGovernance.activeTreatyMeasures),new Set([AI_GOVERNANCE_MEASURES.FRONTIER_MODEL_NOTIFICATION,AI_GOVERNANCE_MEASURES.AUTONOMOUS_WEAPON_LIMITS,AI_GOVERNANCE_MEASURES.EMERGENCY_HOTLINE]));
console.log('Additional AI governance treaty-clause regressions passed.');
