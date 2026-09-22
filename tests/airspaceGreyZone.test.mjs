import assert from 'node:assert/strict';
import {
  AIRSPACE_PROBE_PURPOSES,
  AIRSPACE_RESPONSE_POSTURES,
  airspaceProbeIntelligence,
  airspaceReactionMultiplier,
  conductAirspaceProbe,
  ensureAirspaceSecurity,
  setAirspaceResponsePolicy,
  tickAirspaceSecurity,
} from '../js/military/airspaceGreyZone.js';

function aircraft(id,role='fighter'){
  return {id,ownerType:'military',ownerActorId:null,role,status:'serviceable',condition:1,fuel:1,totalFlights:0,designStats:{stealth:.05}};
}
function region(id,{radar=true,fighters=3}={}){
  return {
    id,name:id.toUpperCase(),polityId:id,governance:{sovereignPolityId:id},
    unlockedTechIds:new Set(radar?['radar']:[]),
    stockpile:{aviation_fuel:20},report:{},
    aviation:{aircraft:Array.from({length:fighters},(_,i)=>aircraft(`${id}-${i+1}`)),flightExperience:0},
    airDefence:{detection:.55,readiness:.55},
    airborneEarlyWarning:{coverage:.35},
  };
}

{
  const attacker=region('attacker',{fighters:2}),defender=region('defender',{fighters:4});
  const fuelBefore=defender.stockpile.aviation_fuel;
  const result=conductAirspaceProbe(attacker,defender,{purpose:AIRSPACE_PROBE_PURPOSES.PROBE,depth:.45,aircraftCount:1},10,()=>0);
  assert.equal(result.conducted,true,'a state with serviceable aircraft and fuel should be able to probe foreign airspace');
  assert.equal(result.detected,true,'strong surveillance and deterministic low draw should detect the incursion');
  assert(result.responseSorties>0,'an intercept posture should launch a defensive response');
  assert(defender.stockpile.aviation_fuel<fuelBefore,'repeated defensive scrambles should consume aviation fuel');
  assert(ensureAirspaceSecurity(defender).training>.25,'responding to incursions should train the defender');
  assert(airspaceProbeIntelligence(attacker,defender)?.responseKnowledge>0,'a detected defensive response should teach the intruder about response patterns');
  assert(defender.informationIntegrity?.incidents?.length>0,'a detected incursion should enter the contested-information system');
}

{
  const attacker=region('normaliser',{fighters:2}),passive=region('passive',{fighters:4}),active=region('active',{fighters:4});
  setAirspaceResponsePolicy(passive,{responsePosture:AIRSPACE_RESPONSE_POSTURES.IGNORE});
  setAirspaceResponsePolicy(active,{responsePosture:AIRSPACE_RESPONSE_POSTURES.INTERCEPT});
  const passiveBefore=airspaceReactionMultiplier(passive,'normaliser',{hostile:false});
  for(let i=0;i<10;i++)conductAirspaceProbe(attacker,passive,{purpose:AIRSPACE_PROBE_PURPOSES.NORMALISE,depth:.25},20+i,()=>0);
  const passiveAfter=airspaceReactionMultiplier(passive,'normaliser',{hostile:false});
  for(let i=0;i<10;i++)conductAirspaceProbe(attacker,active,{purpose:AIRSPACE_PROBE_PURPOSES.NORMALISE,depth:.25},40+i,()=>0);
  const activeAfter=airspaceReactionMultiplier(active,'normaliser',{hostile:false});
  assert(passiveAfter<passiveBefore,'unanswered routine incursions should create some habituation and reduce reaction quality');
  assert(activeAfter>passiveAfter,'actively intercepting repeated incursions should offset habituation through readiness and training');
}

{
  const attacker=region('pressure',{fighters:2}),defender=region('pressured',{fighters:5});
  const state=ensureAirspaceSecurity(defender),fuelBefore=defender.stockpile.aviation_fuel;
  const result=conductAirspaceProbe(attacker,defender,{purpose:AIRSPACE_PROBE_PURPOSES.PRESSURE,depth:.55},70,()=>0);
  assert(result.responseSorties>0,'pressure missions only impose scramble costs when the defender actually responds');
  assert(state.fatigue>0,'scramble pressure should accumulate fatigue');
  assert(defender.stockpile.aviation_fuel<fuelBefore,'scramble pressure should consume defender fuel');
}

{
  const attacker=region('signaller',{fighters:2}),defender=region('signalled',{fighters:3});
  const before=defender.strategicCrisisPressure||0;
  conductAirspaceProbe(attacker,defender,{purpose:AIRSPACE_PROBE_PURPOSES.SIGNAL,depth:.7},90,()=>0);
  assert((defender.strategicCrisisPressure||0)>before,'deliberate signalling incursions should raise strategic crisis pressure');
}

{
  const defender=region('recovery',{fighters:3});
  const s=ensureAirspaceSecurity(defender);
  s.fatigue=.8;s.byActor.rival={encounters:8,habituation:.7,hostilityExpectation:.5,lastSeenTick:1};
  tickAirspaceSecurity([defender],365.2425);
  assert(s.fatigue<.8,'fatigue should recover when incursions stop');
  assert(s.byActor.rival.habituation<.7,'habituation should decay when an intruder stops appearing');
}

console.log('Grey-zone airspace probing regressions passed.');
