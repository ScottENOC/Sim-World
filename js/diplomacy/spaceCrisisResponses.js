import { attitudeToward } from './relations.js?v=20260920-space-crisis1';
import { conductSpaceAttack, SPACE_ATTACK_TYPES, SPACE_WARFARE_TECH_IDS } from '../military/spaceWarfare.js?v=20260920-space-crisis1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=r=>r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||r?.id||null;
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const SPACE_CRISIS_RESPONSES=Object.freeze({
  PROTEST:'protest',
  RECIPROCAL_JAM:'reciprocal_jamming',
  RECIPROCAL_DAZZLE:'reciprocal_dazzling',
  KINETIC_ASAT:'kinetic_asat_retaliation',
  GROUND_STRIKE:'ground_control_strike',
});

function regionsFor(world,actor){return (world?.regions||[]).filter(r=>actorId(r)===actor);}
function bestRegion(world,actor){return regionsFor(world,actor).sort((a,b)=>(b.population||0)-(a.population||0))[0]||null;}
function hasNationalTech(world,actor,tech){return regionsFor(world,actor).some(r=>has(r,tech));}
function orbitalCarrier(world,actor){return regionsFor(world,actor).sort((a,b)=>(b.orbitalProgramme?.satellites?.length||0)-(a.orbitalProgramme?.satellites?.length||0))[0]||null;}

function baseOutrage(attackType,success){
  const value=attackType===SPACE_ATTACK_TYPES.JAM?.30:attackType===SPACE_ATTACK_TYPES.DAZZLE?.42:attackType===SPACE_ATTACK_TYPES.ORBITAL_LASER?.68:.82;
  return clamp(value+(success?.10:0));
}

export function assessSpaceCrisisResponse(crisis,world){
  if(!crisis||crisis.type!=='space_attack')return null;
  const defender=crisis.affectedActorId||crisis.sideBActorId,attacker=crisis.allegedAggressorActorId||crisis.sideAActorId;
  const defenderRegion=bestRegion(world,defender),attackerRegion=bestRegion(world,attacker);if(!defenderRegion||!attackerRegion)return null;
  const incident=crisis.spaceIncident||{},attackType=incident.attackType||SPACE_ATTACK_TYPES.JAM;
  const outrage=baseOutrage(attackType,incident.success!==false),relations=clamp((1-attitudeToward(defenderRegion,attackerRegion.id))/2);
  const restraint=clamp(crisis.restraint||0),mediation=clamp(crisis.mediation||0),pressure=clamp(crisis.pressureB||0),damp=clamp(restraint*.42+mediation*.35+pressure*.25);
  const repeated=clamp((incident.priorIncidents||0)*.16);
  const scores={
    [SPACE_CRISIS_RESPONSES.PROTEST]:clamp(.30+damp*.55+(1-outrage)*.28),
    [SPACE_CRISIS_RESPONSES.RECIPROCAL_JAM]:clamp(.16+outrage*.36+relations*.18+repeated*.20-damp*.34),
    [SPACE_CRISIS_RESPONSES.RECIPROCAL_DAZZLE]:clamp(.08+outrage*.40+relations*.18+repeated*.22-damp*.40),
    [SPACE_CRISIS_RESPONSES.KINETIC_ASAT]:clamp((['kinetic_asat','orbital_laser_attack'].includes(attackType)?.18:.01)+outrage*.38+relations*.16+repeated*.28-damp*.58),
    [SPACE_CRISIS_RESPONSES.GROUND_STRIKE]:clamp((['kinetic_asat','orbital_laser_attack'].includes(attackType)?.12:0)+outrage*.34+relations*.14+repeated*.24-damp*.66),
  };
  if(!hasNationalTech(world,defender,SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK))scores[SPACE_CRISIS_RESPONSES.RECIPROCAL_JAM]=0;
  if(!hasNationalTech(world,defender,SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING))scores[SPACE_CRISIS_RESPONSES.RECIPROCAL_DAZZLE]=0;
  if(!hasNationalTech(world,defender,SPACE_WARFARE_TECH_IDS.KINETIC_ASAT))scores[SPACE_CRISIS_RESPONSES.KINETIC_ASAT]=0;
  if(!hasNationalTech(world,defender,'strategic_missile_systems')&&!hasNationalTech(world,defender,'strategic_bomber_delivery'))scores[SPACE_CRISIS_RESPONSES.GROUND_STRIKE]=0;
  const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
  return{defenderActorId:defender,attackerActorId:attacker,attackType,outrage,relations,dampening:damp,scores,action:ranked[0]?.[0]||SPACE_CRISIS_RESPONSES.PROTEST};
}

export function strikeOrbitalGroundInfrastructure(world,targetActorId,{severity=.25,currentTick=0,rng=Math.random}={}){
  const carrier=orbitalCarrier(world,targetActorId);if(!carrier)return{struck:false,reason:'no_orbital_infrastructure'};
  carrier.orbitalProgramme||={satellites:[],lastLaunchTick:null,totalLaunches:0,totalFailures:0};
  const state=carrier.orbitalProgramme;
  state.groundControlCondition=clamp(state.groundControlCondition??1);
  state.launchInfrastructureCondition=clamp(state.launchInfrastructureCondition??1);
  const controlDamage=clamp(severity*(.55+rng()*.35),.05,.55),launchDamage=clamp(severity*(.45+rng()*.40),.04,.50);
  state.groundControlCondition=clamp(state.groundControlCondition-controlDamage);
  state.launchInfrastructureCondition=clamp(state.launchInfrastructureCondition-launchDamage);
  state.lastGroundStrikeTick=currentTick;
  return{struck:true,regionId:carrier.id,controlDamage,launchDamage,groundControlCondition:state.groundControlCondition,launchInfrastructureCondition:state.launchInfrastructureCondition};
}

export function applySpaceCrisisResponse(crisis,world,currentTick,action,{rng=Math.random}={}){
  const assessment=assessSpaceCrisisResponse(crisis,world);if(!assessment)return{applied:false,reason:'not_space_crisis'};
  if(crisis.spaceResponse?.resolved)return{applied:false,reason:'already_responded'};
  const selected=action||assessment.action;let result={action:selected};
  if(selected===SPACE_CRISIS_RESPONSES.RECIPROCAL_JAM)result.attack=conductSpaceAttack(world.regions,assessment.defenderActorId,assessment.attackerActorId,SPACE_ATTACK_TYPES.JAM,{currentTick,rng});
  else if(selected===SPACE_CRISIS_RESPONSES.RECIPROCAL_DAZZLE)result.attack=conductSpaceAttack(world.regions,assessment.defenderActorId,assessment.attackerActorId,SPACE_ATTACK_TYPES.DAZZLE,{currentTick,rng});
  else if(selected===SPACE_CRISIS_RESPONSES.KINETIC_ASAT)result.attack=conductSpaceAttack(world.regions,assessment.defenderActorId,assessment.attackerActorId,SPACE_ATTACK_TYPES.KINETIC,{currentTick,rng});
  else if(selected===SPACE_CRISIS_RESPONSES.GROUND_STRIKE){
    const destructive=assessment.attackType===SPACE_ATTACK_TYPES.KINETIC||assessment.attackType===SPACE_ATTACK_TYPES.ORBITAL_LASER;
    result.groundStrike=strikeOrbitalGroundInfrastructure(world,assessment.attackerActorId,{severity:destructive?.34:.18,currentTick,rng});
    crisis.severity=clamp(crisis.severity+.12);crisis.nuclearRisk=clamp((crisis.nuclearRisk||0)+.08);
  } else {
    crisis.restraint=clamp((crisis.restraint||0)+.06);
  }
  crisis.spaceResponse={resolved:true,action:selected,tick:currentTick,assessment,result};
  crisis.history||=[];crisis.history.push({type:'space_crisis_response',tick:currentTick,actorId:assessment.defenderActorId,action:selected,result});
  return{applied:true,action:selected,assessment,...result};
}

export function tickSpaceCrisisResponses(world,currentTick=0,rng=Math.random){
  const events=[];
  for(const crisis of world?.internationalCrises||[]){
    if(crisis.status!=='active'||crisis.type!=='space_attack'||crisis.spaceResponse?.resolved)continue;
    if(currentTick-(crisis.createdTick||0)<1)continue;
    const assessment=assessSpaceCrisisResponse(crisis,world);if(!assessment)continue;
    const threshold=.34+clamp(crisis.restraint||0)*.18;
    if((assessment.scores[assessment.action]||0)<threshold)continue;
    const applied=applySpaceCrisisResponse(crisis,world,currentTick,assessment.action,{rng});if(applied.applied)events.push({type:'space_crisis_response',crisisId:crisis.id,tick:currentTick,...applied});
  }
  return events;
}
