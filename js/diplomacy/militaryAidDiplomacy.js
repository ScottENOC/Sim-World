import {
  AID_VISIBILITY,
  ASSISTANCE_TYPES,
  createMilitaryAssistanceProgramme,
  dispatchMilitaryAid,
  ensureMilitaryAssistanceState,
  militaryAidRouteAssessment,
} from './militaryAssistance.js?v=20260920-aid-diplomacy1';
import { attitudeToward } from './relations.js?v=20260920-aid-diplomacy1';
import { requestExecutiveAction } from '../politics/institutionalActions.js?v=20260920-aid-diplomacy1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

export const AID_REQUEST_STATUS=Object.freeze({OPEN:'open',OFFERED:'offered',ACCEPTED:'accepted',REJECTED:'rejected',EXPIRED:'expired',WITHDRAWN:'withdrawn'});
export const AID_OFFER_STATUS=Object.freeze({OPEN:'open',COUNTERED:'countered',ACCEPTED:'accepted',REJECTED:'rejected',EXPIRED:'expired',WITHDRAWN:'withdrawn'});
export const EXPORT_CONTROL_LEVEL=Object.freeze({NONE:'none',REVIEW:'review',RESTRICTED:'restricted',EMBARGO:'embargo'});
export const AID_CONDITIONS=Object.freeze({
  END_USE_MONITORING:'end_use_monitoring', NO_REEXPORT:'no_reexport', DEFENSIVE_USE_ONLY:'defensive_use_only',
  REFORM_COMMITMENT:'reform_commitment', REPAYMENT:'repayment', BASING_ACCESS:'basing_access',
});

function polityRegions(polity,regions){return (regions||[]).filter(r=>actorId(r)===polity?.id);}
function capital(polity,regions){return (regions||[]).find(r=>r.id===polity?.capitalRegionId)||polityRegions(polity,regions)[0]||null;}
function relation(a,b,regions){const ar=capital(a,regions),br=capital(b,regions);return ar&&br?attitudeToward(ar,br.id):0;}
function nextId(state,prefix,owner){const n=Math.max(1,state.nextSequence||1);state.nextSequence=n+1;return `${prefix}-${owner}-${n}`;}

export function ensureMilitaryAidDiplomacy(polity){
  polity.militaryAidDiplomacy ||= {requests:[],offers:[],exportControls:{},suspensions:[],history:[],nextSequence:1,lastNpcReviewTick:null};
  const s=polity.militaryAidDiplomacy;s.requests||=[];s.offers||=[];s.exportControls||={};s.suspensions||=[];s.history||=[];s.nextSequence=Math.max(1,s.nextSequence||1);return s;
}

export function requestMilitaryAid(recipientPolity,donorPolity,currentTick=0,request={}){
  if(!recipientPolity||!donorPolity||recipientPolity.id===donorPolity.id)return {created:false,reason:'invalid_parties'};
  const state=ensureMilitaryAidDiplomacy(recipientPolity),donorState=ensureMilitaryAidDiplomacy(donorPolity);
  const row={id:nextId(state,'aid-request',recipientPolity.id),recipientPolityId:recipientPolity.id,donorPolityId:donorPolity.id,status:AID_REQUEST_STATUS.OPEN,createdTick:currentTick,expiresTick:currentTick+Math.max(4,Number(request.validWeeks)||26),requestedType:request.type||ASSISTANCE_TYPES.MILITARY_MATERIEL,requestedFunds:Math.max(0,Number(request.funds)||0),requestedStockpile:{...(request.stockpile||{})},requestedEquipmentKind:request.equipmentKind||null,urgency:clamp(request.urgency??.5),public:Boolean(request.public),purpose:request.purpose||'security_assistance'};
  state.requests.push(row);donorState.requests.push({...row,inbound:true});state.history.push({tick:currentTick,type:'aid_requested',requestId:row.id,donorPolityId:donorPolity.id});return {created:true,request:row};
}

export function proposeMilitaryAid(donorPolity,recipientPolity,currentTick=0,terms={}){
  if(!donorPolity||!recipientPolity||donorPolity.id===recipientPolity.id)return {created:false,reason:'invalid_parties'};
  const state=ensureMilitaryAidDiplomacy(donorPolity),recipientState=ensureMilitaryAidDiplomacy(recipientPolity);
  const offer={id:nextId(state,'aid-offer',donorPolity.id),requestId:terms.requestId||null,donorPolityId:donorPolity.id,recipientPolityId:recipientPolity.id,status:AID_OFFER_STATUS.OPEN,createdTick:currentTick,expiresTick:currentTick+Math.max(4,Number(terms.validWeeks)||26),type:terms.type||ASSISTANCE_TYPES.MILITARY_MATERIEL,visibility:terms.visibility||AID_VISIBILITY.PUBLIC,funds:Math.max(0,Number(terms.funds)||0),stockpile:{...(terms.stockpile||{})},equipment:[...(terms.equipment||[])],training:clamp(terms.training),intelligence:clamp(terms.intelligence),logistics:clamp(terms.logistics),conditions:[...new Set(terms.conditions||[])],repayment:Math.max(0,Number(terms.repayment)||0),note:terms.note||null,counterOf:terms.counterOf||null};
  state.offers.push(offer);recipientState.offers.push({...offer,inbound:true});return {created:true,offer};
}

export function counterMilitaryAidOffer(counteringPolity,counterpartyPolity,offer,currentTick=0,changes={}){
  if(!offer||![AID_OFFER_STATUS.OPEN,AID_OFFER_STATUS.COUNTERED].includes(offer.status))return {created:false,reason:'offer_not_open'};
  offer.status=AID_OFFER_STATUS.COUNTERED;
  const donor=offer.donorPolityId===counteringPolity.id?counteringPolity:counterpartyPolity;
  const recipient=offer.recipientPolityId===counteringPolity.id?counteringPolity:counterpartyPolity;
  return proposeMilitaryAid(donor,recipient,currentTick,{...offer,...changes,counterOf:offer.id,requestId:offer.requestId,validWeeks:changes.validWeeks||13});
}

export function setMilitaryAidExportControl(donorPolity,targetPolityId,level=EXPORT_CONTROL_LEVEL.NONE,options={}){
  const state=ensureMilitaryAidDiplomacy(donorPolity);if(!Object.values(EXPORT_CONTROL_LEVEL).includes(level))return {changed:false,reason:'invalid_level'};
  state.exportControls[targetPolityId]={level,blockedTypes:[...(options.blockedTypes||[])],blockedResources:[...(options.blockedResources||[])],reason:options.reason||null,sinceTick:options.currentTick??0,reviewAfterTick:options.reviewAfterTick??null};
  return {changed:true,control:state.exportControls[targetPolityId]};
}

export function militaryAidExportAssessment(donorPolity,recipientPolity,request={}){
  const control=ensureMilitaryAidDiplomacy(donorPolity).exportControls[recipientPolity.id]||{level:EXPORT_CONTROL_LEVEL.NONE,blockedTypes:[],blockedResources:[]};
  if(control.level===EXPORT_CONTROL_LEVEL.EMBARGO)return {allowed:false,reason:'arms_embargo',control};
  const type=request.type||ASSISTANCE_TYPES.MILITARY_MATERIEL;if(control.blockedTypes?.includes(type))return {allowed:false,reason:'assistance_type_restricted',control};
  for(const resource of Object.keys(request.stockpile||{}))if(control.blockedResources?.includes(resource))return {allowed:false,reason:'resource_export_restricted',resource,control};
  if(control.level===EXPORT_CONTROL_LEVEL.RESTRICTED&&(type===ASSISTANCE_TYPES.VOLUNTEERS||type===ASSISTANCE_TYPES.DIRECT_INTERVENTION))return {allowed:false,reason:'escalatory_assistance_restricted',control};
  return {allowed:true,reviewRequired:control.level===EXPORT_CONTROL_LEVEL.REVIEW,control};
}

export function militaryAidInstitutionalAction(type,visibility){
  if(type===ASSISTANCE_TYPES.DIRECT_INTERVENTION||type===ASSISTANCE_TYPES.VOLUNTEERS)return 'launch_limited_military_action';
  if(visibility===AID_VISIBILITY.COVERT||visibility===AID_VISIBILITY.DENIABLE)return 'order_intelligence_operation';
  return 'change_spending';
}

export function authoriseMilitaryAid(donorPolity,type,visibility,approvals=[]){
  const action=militaryAidInstitutionalAction(type,visibility);return {...requestExecutiveAction(donorPolity,action,approvals),action};
}

export function dispatchMilitaryAidDiplomatically(donorPolity,recipientPolity,regions,currentTick=0,request={},options={}){
  const exportAssessment=militaryAidExportAssessment(donorPolity,recipientPolity,request);if(!exportAssessment.allowed)return {dispatched:false,reason:exportAssessment.reason,exportAssessment};
  const authority=authoriseMilitaryAid(donorPolity,request.type||ASSISTANCE_TYPES.MILITARY_MATERIEL,request.visibility||AID_VISIBILITY.PUBLIC,options.approvals||[]);if(!authority.allowed)return {dispatched:false,reason:'institutional_approval_required',authority,exportAssessment};
  let programmeId=request.programmeId;
  if(!programmeId){const made=createMilitaryAssistanceProgramme(donorPolity,recipientPolity,regions,currentTick,request);if(!made.created)return {dispatched:false,reason:made.reason,authority,exportAssessment};programmeId=made.programme.id;}
  const dispatched=dispatchMilitaryAid(donorPolity,recipientPolity,regions,currentTick,{...request,programmeId},options.rng||Math.random);return {...dispatched,authority,exportAssessment};
}

export function suspendMilitaryAidProgramme(donorPolity,recipientPolity,programmeId,currentTick=0,reason='policy_review'){
  const donorState=ensureMilitaryAssistanceState(donorPolity),recipientState=ensureMilitaryAssistanceState(recipientPolity);const programme=donorState.programmes.find(p=>p.id===programmeId&&!p.inbound);if(!programme)return {changed:false,reason:'programme_not_found'};
  programme.status='suspended';programme.suspendedTick=currentTick;programme.suspensionReason=reason;for(const p of recipientState.programmes)if(p.id===programmeId){p.status='suspended';p.suspendedTick=currentTick;p.suspensionReason=reason;}
  ensureMilitaryAidDiplomacy(donorPolity).suspensions.push({programmeId,recipientPolityId:recipientPolity.id,tick:currentTick,reason});return {changed:true,programme};
}

export function resumeMilitaryAidProgramme(donorPolity,recipientPolity,programmeId,currentTick=0){
  const donorState=ensureMilitaryAssistanceState(donorPolity),recipientState=ensureMilitaryAssistanceState(recipientPolity);const programme=donorState.programmes.find(p=>p.id===programmeId&&!p.inbound);if(!programme||programme.status!=='suspended')return {changed:false,reason:'programme_not_suspended'};
  programme.status='active';programme.resumedTick=currentTick;for(const p of recipientState.programmes)if(p.id===programmeId){p.status='active';p.resumedTick=currentTick;}return {changed:true,programme};
}

export function evaluateMilitaryAidOffer(recipientPolity,donorPolity,offer,regions,context={}){
  const affinity=clamp((relation(recipientPolity,donorPolity,regions)+1)/2),urgency=clamp(context.urgency??.45),dependency=clamp(ensureMilitaryAssistanceState(recipientPolity).dependencies?.[donorPolity.id]?.total||0),sovereigntyCost=clamp((offer.conditions?.length||0)*.09+(offer.conditions?.includes(AID_CONDITIONS.BASING_ACCESS)?.22:0)+(offer.repayment>0?.08:0)),route=militaryAidRouteAssessment(donorPolity,recipientPolity,regions),routeValue=route.possible?route.reliability:0;
  const score=clamp(.18+affinity*.30+urgency*.28+routeValue*.18-dependency*.10-sovereigntyCost);return {accept:score>=.55,score,affinity,urgency,dependency,sovereigntyCost,route};
}

function mirrorOfferStatus(polity,offerId,status){for(const o of ensureMilitaryAidDiplomacy(polity).offers)if(o.id===offerId)o.status=status;}
function mirrorRequestStatus(polity,requestId,status){for(const r of ensureMilitaryAidDiplomacy(polity).requests)if(r.id===requestId)r.status=status;}

export function respondMilitaryAidOffer(recipientPolity,donorPolity,offerId,decision,currentTick=0,options={}){
  const recipientState=ensureMilitaryAidDiplomacy(recipientPolity),offer=recipientState.offers.find(o=>o.id===offerId&&o.inbound);if(!offer||![AID_OFFER_STATUS.OPEN,AID_OFFER_STATUS.COUNTERED].includes(offer.status))return {changed:false,reason:'offer_not_open'};
  if(decision==='counter')return counterMilitaryAidOffer(recipientPolity,donorPolity,offer,currentTick,options.changes||{});
  const status=decision==='accept'?AID_OFFER_STATUS.ACCEPTED:AID_OFFER_STATUS.REJECTED;mirrorOfferStatus(recipientPolity,offerId,status);mirrorOfferStatus(donorPolity,offerId,status);if(offer.requestId){mirrorRequestStatus(recipientPolity,offer.requestId,status===AID_OFFER_STATUS.ACCEPTED?AID_REQUEST_STATUS.ACCEPTED:AID_REQUEST_STATUS.REJECTED);mirrorRequestStatus(donorPolity,offer.requestId,status===AID_OFFER_STATUS.ACCEPTED?AID_REQUEST_STATUS.ACCEPTED:AID_REQUEST_STATUS.REJECTED);}return {changed:true,status,offer};
}

export function tickMilitaryAidDiplomacy(polities,regions,currentTick,rng=Math.random,options={}){
  const events=[],byId=new Map((polities||[]).map(p=>[p.id,p]));
  for(const polity of polities||[]){const state=ensureMilitaryAidDiplomacy(polity);for(const req of state.requests.filter(r=>!r.inbound&&r.status===AID_REQUEST_STATUS.OPEN&&r.expiresTick<=currentTick)){req.status=AID_REQUEST_STATUS.EXPIRED;const donor=byId.get(req.donorPolityId);if(donor)mirrorRequestStatus(donor,req.id,AID_REQUEST_STATUS.EXPIRED);events.push({type:'military_aid_request_expired',requestId:req.id,recipientPolityId:polity.id,donorPolityId:req.donorPolityId});}for(const offer of state.offers.filter(o=>!o.inbound&&[AID_OFFER_STATUS.OPEN,AID_OFFER_STATUS.COUNTERED].includes(o.status)&&o.expiresTick<=currentTick)){offer.status=AID_OFFER_STATUS.EXPIRED;const recipient=byId.get(offer.recipientPolityId);if(recipient)mirrorOfferStatus(recipient,offer.id,AID_OFFER_STATUS.EXPIRED);events.push({type:'military_aid_offer_expired',offerId:offer.id,donorPolityId:polity.id,recipientPolityId:offer.recipientPolityId});}
    if(polity.id===options.playerPolityId||state.lastNpcReviewTick!=null&&currentTick-state.lastNpcReviewTick<26)continue;state.lastNpcReviewTick=currentTick;const capitalRegion=capital(polity,regions);if(!capitalRegion)continue;const pressure=Math.max(0,...Object.values(ensureMilitaryAssistanceState(polity).proxyPressure||{}));if(pressure<.45||rng()>.16)continue;const candidates=(polities||[]).filter(p=>p.id!==polity.id&&militaryAidRouteAssessment(p,polity,regions).possible).map(p=>({p,score:relation(polity,p,regions)})).sort((a,b)=>b.score-a.score);const donor=candidates[0]?.p;if(!donor||candidates[0].score<-.1)continue;const made=requestMilitaryAid(polity,donor,currentTick,{type:ASSISTANCE_TYPES.MILITARY_MATERIEL,urgency:clamp(.45+pressure*.4),purpose:'active_conflict_support'});if(made.created)events.push({type:'npc_military_aid_requested',requestId:made.request.id,recipientPolityId:polity.id,donorPolityId:donor.id});}
  return events;
}
