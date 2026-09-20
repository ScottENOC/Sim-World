import { submitInternationalMotion, ORGANISATION_LEVELS } from './internationalOrganisations.js?v=20260920-intl-crisis1';
import { relationToward } from './relations.js?v=20260920-intl-crisis1';
import { tickPeaceNegotiations, respondPeaceNegotiation, resolveImplementationAction } from './peaceNegotiations.js?v=20260920-peace3';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||r?.id||null;

function alreadyConsidered(org,crisis){return (crisis.bodyPositions||[]).some(p=>p.bodyType==='international_organisation'&&p.bodyId===org.id);}
function crisisMotion(org,crisis){
  const capacity=ORGANISATION_LEVELS[org.level]?.capacity||.2;
  const legitimacy=clamp(org.metrics?.legitimacy||0);
  const acceptance=clamp(org.metrics?.acceptance||0);
  const severity=clamp(crisis.severity),nuclear=clamp(crisis.nuclearRisk),human=clamp(crisis.humanitarianRisk),evidence=clamp(crisis.evidence);
  const mediator=clamp(capacity*.32+legitimacy*.38+acceptance*.18+nuclear*.12);
  const sanction=clamp(capacity*.25+legitimacy*.18+evidence*.30+severity*.18+human*.09);
  const condemn=clamp(legitimacy*.22+evidence*.34+severity*.28+human*.16);
  if((nuclear>.35||crisis.mediation>.15)&&mediator>=Math.max(sanction,condemn)-.04)return{type:'mediate_peace',score:mediator};
  if(crisis.allegedAggressorActorId&&sanction>.62&&['global','collective_security','treaty'].includes(org.level))return{type:'sanctions',score:sanction};
  return{type:'condemn_war',score:condemn};
}
function applyMemberSanctions(org,targetActorId,world,currentTick,severity){
  const targets=(world.regions||[]).filter(r=>actorId(r)===targetActorId);
  for(const memberId of org.memberPolityIds||[]){
    for(const from of (world.regions||[]).filter(r=>actorId(r)===memberId)) for(const target of targets){
      const rel=relationToward(from,target.id);
      rel.tradeSanctionSeverity=Math.max(Number(rel.tradeSanctionSeverity)||0,severity);
      rel.tradeSanctionUntilTick=Math.max(Number(rel.tradeSanctionUntilTick)||0,currentTick+52);
    }
  }
}
function applyPassedMotion(org,crisis,motion,world,currentTick){
  const compliance=clamp(motion.compliance??(org.metrics?.legitimacy||0)*.6);
  if(motion.type==='mediate_peace'){
    crisis.mediation=clamp(crisis.mediation+.12+.18*compliance);
    crisis.restraint=clamp(crisis.restraint+.08+.10*compliance);
    crisis.severity=clamp(crisis.severity-.03-.04*compliance);
    crisis.nuclearRisk=clamp(crisis.nuclearRisk-.05-.08*compliance);
  }else if(motion.type==='sanctions'){
    const target=crisis.allegedAggressorActorId;
    if(target===crisis.sideAActorId)crisis.pressureA=clamp(crisis.pressureA+.12+.14*compliance);
    if(target===crisis.sideBActorId)crisis.pressureB=clamp(crisis.pressureB+.12+.14*compliance);
    const strength=.25+.35*compliance;
    applyMemberSanctions(org,target,world,currentTick,strength);
    crisis.organisationSanctions||=[];
    crisis.organisationSanctions.push({organisationId:org.id,targetActorId:target,strength,untilTick:currentTick+52});
  }else if(motion.type==='condemn_war'){
    if(crisis.allegedAggressorActorId===crisis.sideAActorId)crisis.pressureA=clamp(crisis.pressureA+.08+.10*compliance);
    if(crisis.allegedAggressorActorId===crisis.sideBActorId)crisis.pressureB=clamp(crisis.pressureB+.08+.10*compliance);
    crisis.restraint=clamp(crisis.restraint+.04*compliance);
  }
}
function normaliseCaptiveOrigins(world){
  const byRegion=new Map((world.regions||[]).map((region)=>[region.id,region]));
  for(const region of world.regions||[]){
    for(const captive of region.specialForces?.captives||[]){
      if(captive.homeActorId)continue;
      const source=byRegion.get(captive.capturedFromRegionId);
      const home=actorId(source);
      if(home)captive.homeActorId=home;
    }
  }
}
function applyConferenceCooldowns(world,currentTick){
  const muted=[];
  for(const crisis of world.internationalCrises||[]){
    const latest=[...(crisis.peaceConferences||[])].reverse().find((proposal)=>['rejected','expired'].includes(proposal.status));
    if(latest&&!crisis.peaceConferenceCooldownUntilTick)crisis.peaceConferenceCooldownUntilTick=(latest.rejectedTick||latest.expiresTick||latest.offeredTick||currentTick)+8;
    if((crisis.peaceConferenceCooldownUntilTick||0)>currentTick){
      muted.push({crisis,mediation:crisis.mediation,restraint:crisis.restraint});
      crisis.mediation=0; crisis.restraint=0;
    }else if(crisis.peaceConferenceCooldownUntilTick)delete crisis.peaceConferenceCooldownUntilTick;
  }
  return()=>{for(const item of muted){item.crisis.mediation=item.mediation;item.crisis.restraint=item.restraint;}};
}

export function internationalOrganisationCrisisAssessment(org,crisis){
  const proposal=crisisMotion(org,crisis);
  const willingness=clamp(proposal.score*(.45+.35*(org.metrics?.legitimacy||0)+.20*(org.metrics?.acceptance||0)));
  return{motionType:proposal.type,score:proposal.score,willingness};
}

export function tickInternationalCrisisBodies(world,currentTick=0,rng=Math.random,options={}){
  const events=[];
  for(const crisis of world.internationalCrises||[]){
    if(crisis.status!=='active'||currentTick-(crisis.createdTick||0)<1)continue;
    crisis.bodyPositions||=[];
    for(const org of world.internationalOrganisations||[]){
      if(!org?.active||alreadyConsidered(org,crisis)||!(org.memberPolityIds||[]).length)continue;
      const assessment=internationalOrganisationCrisisAssessment(org,crisis);
      if(assessment.willingness<.46||rng()>.28+assessment.willingness*.58)continue;
      const proposer=org.hostPolityId&&org.memberPolityIds.includes(org.hostPolityId)?org.hostPolityId:org.memberPolityIds[0];
      const targetPolityId=assessment.motionType==='sanctions'?crisis.allegedAggressorActorId:null;
      const result=submitInternationalMotion(org,{proposerPolityId:proposer,type:assessment.motionType,strength:clamp(.45+crisis.severity*.45),targetPolityId},world,currentTick);
      const record={bodyType:'international_organisation',bodyId:org.id,organisationName:org.name,motionType:assessment.motionType,tick:currentTick,passed:Boolean(result.passed),status:result.motion?.status||'not_submitted'};
      crisis.bodyPositions.push(record);
      crisis.history.push({...record,type:'international_organisation_motion'});
      if(result.passed){applyPassedMotion(org,crisis,result.motion,world,currentTick);events.push({type:'international_crisis_organisation_action',crisisId:crisis.id,organisationId:org.id,motionType:assessment.motionType,motionId:result.motion.id});}
      else events.push({type:'international_crisis_organisation_motion_failed',crisisId:crisis.id,organisationId:org.id,motionType:assessment.motionType,status:result.motion?.status||result.reason});
    }
  }

  world.activeCampaigns ||= globalThis.__worldsim?.activeCampaigns || [];
  normaliseCaptiveOrigins(world);
  const restoreMediation=applyConferenceCooldowns(world,currentTick);
  const playerPolityId=options.playerPolityId||globalThis.__worldsim?.activePlayerPolityId||null;
  const peaceEvents=tickPeaceNegotiations(world,currentTick,7,rng,{playerPolityId});
  restoreMediation();
  const compatibilityEvents=[];

  for(const event of peaceEvents){
    const crisis=(world.internationalCrises||[]).find((candidate)=>candidate.id===event.crisisId);
    const proposal=crisis?.peaceConferences?.find((candidate)=>candidate.id===event.proposalId);
    if(event.type==='peace_negotiation_action_required'&&proposal){
      event.resolveDecision=(choice,changes={})=>respondPeaceNegotiation(proposal,crisis,world,event.actorId,choice,currentTick,changes);
      compatibilityEvents.push({...event,type:'peace_conference_proposal_available'});
    }
    if(event.type==='peace_implementation_action_required'&&proposal){
      const obligation=proposal.implementation?.obligations?.find((candidate)=>candidate.id===event.obligation.id);
      event.resolveDecision=(choice)=>resolveImplementationAction(event.actorId,obligation,proposal,crisis,world,choice,currentTick,rng);
    }
  }
  events.push(...peaceEvents,...compatibilityEvents);
  return events;
}
