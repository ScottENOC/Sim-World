import assert from 'node:assert/strict';
import {
  airCombatAssessment,
  ensureAirspaceSecurity,
  recordHostileAirMission,
} from '../js/military/airspaceGreyZone.js';

function region(id){
  return {
    id,name:id.toUpperCase(),polityId:id,governance:{sovereignPolityId:id},
    unlockedTechIds:new Set(['radar']),
    stockpile:{aviation_fuel:20},report:{},
    aviation:{aircraft:[],flightExperience:0},
    airDefence:{detection:.55,readiness:.55},
    airborneEarlyWarning:{coverage:.35},
  };
}

{
  const attacker=region('attacker'),defender=region('defender');
  const baseline=airCombatAssessment(attacker,defender,{hostile:true,mission:'attack'});
  attacker.airspaceIntelligence={defender:{radarMapping:.85,responseKnowledge:.75,roeKnowledge:.7,lastProbeTick:10}};
  const s=ensureAirspaceSecurity(defender);
  s.byActor.attacker={encounters:12,habituation:.65,hostilityExpectation:.12,lastSeenTick:10};
  const prepared=airCombatAssessment(attacker,defender,{hostile:true,mission:'attack'});
  assert(prepared.preparation>baseline.preparation,'probing intelligence should improve attack preparation');
  assert(prepared.defenceRiskMultiplier<baseline.defenceRiskMultiplier,'mapped radar and response patterns should reduce opening air-defence exposure');
  assert(prepared.strikeEffectivenessMultiplier>baseline.strikeEffectivenessMultiplier,'pre-war knowledge and habituation should modestly improve opening strike effectiveness');
}

{
  const attacker=region('attacker'),defender=region('trained');
  attacker.airspaceIntelligence={trained:{radarMapping:.65,responseKnowledge:.6,roeKnowledge:.55,lastProbeTick:10}};
  const s=ensureAirspaceSecurity(defender);
  s.training=.85;s.alertness=.8;s.byActor.attacker={encounters:12,habituation:.15,hostilityExpectation:.55,lastSeenTick:10};
  const hard=airCombatAssessment(attacker,defender,{hostile:true,mission:'attack'});
  const soft=region('soft');
  attacker.airspaceIntelligence.soft={radarMapping:.65,responseKnowledge:.6,roeKnowledge:.55,lastProbeTick:10};
  const ss=ensureAirspaceSecurity(soft);
  ss.training=.2;ss.alertness=.35;ss.byActor.attacker={encounters:12,habituation:.65,hostilityExpectation:.1,lastSeenTick:10};
  const easy=airCombatAssessment(attacker,soft,{hostile:true,mission:'attack'});
  assert(hard.defenceRiskMultiplier>easy.defenceRiskMultiplier,'a defender that used probes as training should remain harder to penetrate than one that habituated');
  assert(hard.strikeEffectivenessMultiplier<easy.strikeEffectivenessMultiplier,'defensive training should offset some attacker preparation');
}

{
  const defender=region('defender');
  const s=ensureAirspaceSecurity(defender);
  s.byActor.attacker={encounters:20,habituation:.8,hostilityExpectation:.08,lastSeenTick:5};
  const beforeHabituation=s.byActor.attacker.habituation,beforeHostility=s.byActor.attacker.hostilityExpectation,beforeAlert=s.alertness;
  recordHostileAirMission(defender,'attacker',{detected:true,currentTick:20});
  assert(s.byActor.attacker.habituation<beforeHabituation,'a real hostile sortie should break part of the routine-incursion habituation');
  assert(s.byActor.attacker.hostilityExpectation>beforeHostility,'a real attack should sharply raise expectations of future hostility');
  assert(s.alertness>beforeAlert,'a detected real attack should raise general air-defence alertness');
}

{
  const attacker=region('attacker'),defender=region('defender');
  attacker.airspaceIntelligence={defender:{radarMapping:.9,responseKnowledge:.8,roeKnowledge:.7,lastProbeTick:10}};
  const s=ensureAirspaceSecurity(defender);
  s.byActor.attacker={encounters:15,habituation:.7,hostilityExpectation:.1,lastSeenTick:10};
  const first=airCombatAssessment(attacker,defender,{hostile:true,mission:'attack'});
  recordHostileAirMission(defender,'attacker',{detected:true,currentTick:20});
  const second=airCombatAssessment(attacker,defender,{hostile:true,mission:'attack'});
  assert(second.defenceRiskMultiplier>first.defenceRiskMultiplier,'the surprise advantage should shrink after the defender observes a real attack');
}

console.log('Airspace combat coupling regressions passed.');
