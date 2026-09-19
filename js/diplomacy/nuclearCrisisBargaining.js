import { ensureNuclearDeterrence, NUCLEAR_CRISIS_LEVELS } from './nuclearDeterrence.js?v=20260920-crisis-bargaining1';
import { ensureNuclearDiplomacy } from './nuclearDiplomacy.js?v=20260920-crisis-bargaining1';
import { ensureNuclearAllianceState, withdrawAlliedNuclearDeployment } from './nuclearAlliedDeployments.js?v=20260920-crisis-bargaining1';
import { leaveNuclearTreaty } from './nuclearArmsControl.js?v=20260920-crisis-bargaining1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

export const CRISIS_DEMAND_TYPES=Object.freeze({
  WITHDRAW_FORWARD_NUCLEAR_ASSETS:'withdraw_forward_nuclear_assets',
  REMOVE_MISSILES:'remove_missiles',
  END_BLOCKADE:'end_blockade',
  ACCEPT_INSPECTIONS:'accept_inspections',
  FREEZE_DEPLOYMENTS:'freeze_deployments',
  RENOUNCE_RED_LINE:'renounce_red_line',
  WITHDRAW_FROM_TERRITORY:'withdraw_from_territory'
});

export const CRISIS_PRESSURE_TOOLS=Object.freeze({
  PRIVATE_WARNING:'private_warning',
  PUBLIC_ULTIMATUM:'public_ultimatum',
  QUARANTINE:'quarantine',
  LIMITED_SANCTIONS:'limited_sanctions',
  READINESS_SIGNAL:'readiness_signal',
  DIPLOMATIC_ISOLATION:'diplomatic_isolation'
});

export const CRISIS_CONCESSION_TYPES=Object.freeze({
  RECIPROCAL_WITHDRAWAL:'reciprocal_withdrawal',
  SECURITY_ASSURANCE:'security_assurance',
  INSPECTION_ACCESS:'inspection_access',
  NON_INVASION_PLEDGE:'non_invasion_pledge',
  SECRET_SIDE_DEAL:'secret_side_deal',
  FACE_SAVING_STATEMENT:'face_saving_statement'
});

export function ensureNuclearCrisisBargaining(region){
  region.nuclearCrisisBargaining ||= {};
  const s=region.nuclearCrisisBargaining;
  s.cases ||= {};
  s.history ||= [];
  if(!Number.isFinite(s.faceSavingPreference))s.faceSavingPreference=.58;
  if(!Number.isFinite(s.coerciveTolerance))s.coerciveTolerance=.35;
  return s;
}

function crisisFor(region,other){
  const key=actorId(other)||other?.id;
  return ensureNuclearDeterrence(region).crises?.[key]||null;
}

function relation(region,other){
  const id=actorId(other);
  const r=region.relations?.[id]||region.diplomacy?.relations?.[id]||{};
  return {trust:clamp(r.trust??.45),hostility:clamp(r.hostility??.3)};
}

export function openNuclearCrisisBargaining(initiator,counterparty,{id=null,currentTick=null,publiclyAcknowledged=true}={}){
  if(!initiator||!counterparty||initiator===counterparty)return null;
  const cA=crisisFor(initiator,counterparty),cB=crisisFor(counterparty,initiator);
  const pressure=Math.max(cA?.pressure||0,cB?.pressure||0);
  const level=Math.max(cA?.level||0,cB?.level||0);
  if(level<NUCLEAR_CRISIS_LEVELS.TENSION&&pressure<.15)return null;
  const caseId=id||`nuclear-crisis-talks-${initiator.id}-${counterparty.id}-${currentTick??'now'}`;
  const record={id:caseId,initiatorRegionId:initiator.id,counterpartyRegionId:counterparty.id,status:'open',openedTick:currentTick,publiclyAcknowledged:Boolean(publiclyAcknowledged),demands:[],offers:[],pressureTools:[],settlement:null,lastActivityTick:currentTick};
  ensureNuclearCrisisBargaining(initiator).cases[caseId]=structuredClone(record);
  ensureNuclearCrisisBargaining(counterparty).cases[caseId]=structuredClone(record);
  return structuredClone(record);
}

function mirrorCase(a,b,caseId,mutate){
  const as=ensureNuclearCrisisBargaining(a),bs=ensureNuclearCrisisBargaining(b),ca=as.cases[caseId],cb=bs.cases[caseId];
  if(!ca||!cb||ca.status!=='open'||cb.status!=='open')return null;
  mutate(ca);mutate(cb);return structuredClone(ca);
}

export function issueCrisisDemand(issuer,recipient,caseId,{type,targetDeploymentId=null,targetRegionId=null,severity=.6,deadlineTick=null,publiclyDeclared=true,currentTick=null}={}){
  if(!Object.values(CRISIS_DEMAND_TYPES).includes(type))return null;
  return mirrorCase(issuer,recipient,caseId,c=>{c.demands.push({id:`demand-${c.demands.length+1}`,issuerRegionId:issuer.id,recipientRegionId:recipient.id,type,targetDeploymentId,targetRegionId,severity:clamp(severity),deadlineTick:Number.isFinite(deadlineTick)?deadlineTick:null,publiclyDeclared:Boolean(publiclyDeclared),status:'pending',createdTick:currentTick});c.lastActivityTick=currentTick;});
}

export function offerCrisisConcession(offerer,recipient,caseId,{type,value=.5,secret=false,linkedDemandId=null,currentTick=null,details={}}={}){
  if(!Object.values(CRISIS_CONCESSION_TYPES).includes(type))return null;
  return mirrorCase(offerer,recipient,caseId,c=>{c.offers.push({id:`offer-${c.offers.length+1}`,offererRegionId:offerer.id,recipientRegionId:recipient.id,type,value:clamp(value),secret:Boolean(secret||type===CRISIS_CONCESSION_TYPES.SECRET_SIDE_DEAL),linkedDemandId,details:{...details},status:'offered',createdTick:currentTick});c.lastActivityTick=currentTick;});
}

export function applyCrisisPressure(actor,target,caseId,{tool=CRISIS_PRESSURE_TOOLS.PRIVATE_WARNING,intensity=.5,currentTick=null}={}){
  if(!Object.values(CRISIS_PRESSURE_TOOLS).includes(tool))return null;
  const rel=relation(target,actor),targetState=ensureNuclearCrisisBargaining(target);
  const escalation={private_warning:.025,public_ultimatum:.075,quarantine:.12,limited_sanctions:.05,readiness_signal:.10,diplomatic_isolation:.045}[tool]||.04;
  const bargainingPressure=clamp(intensity)*(.35+rel.hostility*.25);
  const result=mirrorCase(actor,target,caseId,c=>{c.pressureTools.push({actorRegionId:actor.id,targetRegionId:target.id,tool,intensity:clamp(intensity),tick:currentTick});c.lastActivityTick=currentTick;});
  const crisis=crisisFor(target,actor);if(crisis){crisis.pressure=clamp(crisis.pressure+escalation*clamp(intensity));crisis.level=Math.min(NUCLEAR_CRISIS_LEVELS.RELEASE_CONSIDERATION,Math.floor(crisis.pressure*5.2));}
  targetState.coerciveTolerance=clamp(targetState.coerciveTolerance-bargainingPressure*.015);
  return result?{...result,bargainingPressure,escalationRisk:escalation}:null;
}

export function evaluateCrisisSettlement(recipient,other,caseId){
  const c=ensureNuclearCrisisBargaining(recipient).cases[caseId];if(!c||c.status!=='open')return{accept:false,score:0};
  const rel=relation(recipient,other),self=ensureNuclearCrisisBargaining(recipient),det=ensureNuclearDeterrence(recipient);
  const incomingDemands=c.demands.filter(d=>d.recipientRegionId===recipient.id&&d.status==='pending');
  const incomingOffers=c.offers.filter(o=>o.recipientRegionId===recipient.id&&o.status==='offered');
  const pressure=c.pressureTools.filter(p=>p.targetRegionId===recipient.id).reduce((n,p)=>n+p.intensity*.12,0);
  const demandCost=clamp(incomingDemands.reduce((n,d)=>n+d.severity*.22,0));
  const offerValue=clamp(incomingOffers.reduce((n,o)=>n+o.value*(o.secret?.12:.16),0));
  const faceSaving=clamp(incomingOffers.some(o=>o.type===CRISIS_CONCESSION_TYPES.FACE_SAVING_STATEMENT)?self.faceSavingPreference*.14:0);
  const crisis=crisisFor(recipient,other);const danger=clamp((crisis?.pressure||0)*.28+(crisis?.level||0)/5*.18);
  const resolve=clamp(det.resolve??.55),coercionBacklash=clamp(pressure*resolve*.55);
  const score=clamp(.34+offerValue+faceSaving+danger+rel.trust*.08+pressure*.08-demandCost-coercionBacklash-rel.hostility*.08);
  return{accept:score>=.55,score,demandCost,offerValue,faceSaving,danger,coercionBacklash};
}

function reduceCrisisPair(a,b,amount,currentTick,reason){
  for(const [x,y] of [[a,b],[b,a]]){const crisis=crisisFor(x,y);if(!crisis)continue;crisis.pressure=clamp(crisis.pressure-amount);crisis.level=Math.floor(crisis.pressure*5.2);crisis.lastTick=currentTick;crisis.history.push({tick:currentTick,category:'crisis_settlement',severity:amount,redLineCrossed:false,level:crisis.level,reason});if(crisis.history.length>20)crisis.history.shift();}
}

function applyDemandCompliance(complier,other,demand,currentTick){
  if([CRISIS_DEMAND_TYPES.WITHDRAW_FORWARD_NUCLEAR_ASSETS,CRISIS_DEMAND_TYPES.REMOVE_MISSILES].includes(demand.type)){
    const deployments=Object.values(ensureNuclearAllianceState(complier).deployments).filter(d=>d.role==='provider'&&d.status==='active'&&(!demand.targetDeploymentId||d.id===demand.targetDeploymentId));
    for(const d of deployments){const host=other?.id===d.hostRegionId?other:null;if(host)withdrawAlliedNuclearDeployment(complier,host,d.id,{currentTick});else d.status='withdrawn';}
  }
  if(demand.type===CRISIS_DEMAND_TYPES.ACCEPT_INSPECTIONS){for(const t of Object.values(complier.nuclearArmsControl?.treaties||{}))if(t.status==='active')t.terms.inspectionAccess=clamp((t.terms.inspectionAccess||0)+.2);}
  if(demand.type===CRISIS_DEMAND_TYPES.FREEZE_DEPLOYMENTS)ensureNuclearCrisisBargaining(complier).deploymentFreezeUntil=currentTick+180;
  demand.status='accepted';demand.resolvedTick=currentTick;
}

export function concludeCrisisSettlement(a,b,caseId,{acceptingRegionId=null,currentTick=null,publicTerms=true}={}){
  const ac=ensureNuclearCrisisBargaining(a).cases[caseId],bc=ensureNuclearCrisisBargaining(b).cases[caseId];if(!ac||!bc||ac.status!=='open')return{concluded:false,reason:'case_not_open'};
  const accepting=acceptingRegionId===b.id?b:a,other=accepting===a?b:a;
  const evaluation=evaluateCrisisSettlement(accepting,other,caseId);if(!evaluation.accept)return{concluded:false,reason:'settlement_not_acceptable',evaluation};
  for(const d of ac.demands.filter(x=>x.recipientRegionId===accepting.id&&x.status==='pending'))applyDemandCompliance(accepting,other,d,currentTick);
  for(const o of ac.offers.filter(x=>x.offererRegionId===other.id&&x.status==='offered'))o.status='accepted';
  const reduction=clamp(.18+evaluation.offerValue*.45+evaluation.faceSaving*.35+evaluation.demandCost*.25,.15,.72);
  reduceCrisisPair(a,b,reduction,currentTick,'negotiated_settlement');
  const settlement={tick:currentTick,acceptingRegionId:accepting.id,reduction,publicTerms:Boolean(publicTerms),secretSideDeal:ac.offers.some(o=>o.secret&&o.status==='accepted')};
  for(const c of [ac,bc]){c.status='settled';c.settlement={...settlement};c.lastActivityTick=currentTick;}
  ensureNuclearCrisisBargaining(a).history.push({type:'nuclear_crisis_settled',caseId,tick:currentTick,...settlement});
  ensureNuclearCrisisBargaining(b).history.push({type:'nuclear_crisis_settled',caseId,tick:currentTick,...settlement});
  return{concluded:true,settlement,evaluation};
}

export function npcCrisisBargainingAction(region,other,caseId,{currentTick=null}={}){
  const c=ensureNuclearCrisisBargaining(region).cases[caseId];if(!c||c.status!=='open')return{action:'none'};
  const evaln=evaluateCrisisSettlement(region,other,caseId),crisis=crisisFor(region,other),level=crisis?.level||0;
  if(evaln.accept)return{action:'accept',evaluation:evaln};
  if(level>=NUCLEAR_CRISIS_LEVELS.ALERT&&evaln.score>.4)return{action:'seek_face_saving_compromise',evaluation:evaln};
  if(level>=NUCLEAR_CRISIS_LEVELS.CRISIS&&ensureNuclearDeterrence(region).riskTolerance<.35)return{action:'offer_reciprocal_withdrawal',evaluation:evaln};
  return{action:'hold',evaluation:evaln};
}

export function tickNuclearCrisisBargaining(regions,currentTick,elapsedDays=7){
  const events=[];
  for(const region of regions||[]){
    const s=ensureNuclearCrisisBargaining(region);
    for(const c of Object.values(s.cases)){
      if(c.status!=='open')continue;
      const overdue=c.demands.some(d=>d.status==='pending'&&Number.isFinite(d.deadlineTick)&&currentTick>=d.deadlineTick);
      if(overdue){const other=(regions||[]).find(r=>r.id===(c.initiatorRegionId===region.id?c.counterpartyRegionId:c.initiatorRegionId));const crisis=other?crisisFor(region,other):null;if(crisis){crisis.pressure=clamp(crisis.pressure+.06);crisis.level=Math.min(NUCLEAR_CRISIS_LEVELS.RELEASE_CONSIDERATION,Math.floor(crisis.pressure*5.2));}events.push({type:'nuclear_crisis_deadline_missed',regionId:region.id,caseId:c.id,tick:currentTick});}
      if(Number.isFinite(c.lastActivityTick)&&currentTick-c.lastActivityTick>365){c.status='stalled';events.push({type:'nuclear_crisis_talks_stalled',regionId:region.id,caseId:c.id,tick:currentTick});}
    }
  }
  return events;
}
