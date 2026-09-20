import { ensureEquipmentCatalogue, equipmentDesignById } from '../military/equipmentGenerations.js?v=20260920-aid1';
import { attitudeToward, changeAttitude } from './relations.js?v=20260920-aid1';

const DAYS_PER_YEAR = 365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

export const ASSISTANCE_TYPES=Object.freeze({
  FINANCIAL:'financial', CIVILIAN_LOGISTICS:'civilian_logistics', MILITARY_MATERIEL:'military_materiel',
  TRAINING_ADVISERS:'training_advisers', INTELLIGENCE:'intelligence', LOGISTICS:'logistics',
  VOLUNTEERS:'volunteers', DIRECT_INTERVENTION:'direct_intervention',
});
export const AID_VISIBILITY=Object.freeze({COVERT:'covert',DENIABLE:'deniable',UNDECLARED:'undeclared',PUBLIC:'public'});

const INVOLVEMENT={financial:.05,civilian_logistics:.08,military_materiel:.16,training_advisers:.27,intelligence:.24,logistics:.20,volunteers:.52,direct_intervention:.90};
const VISIBILITY={covert:.12,deniable:.28,undeclared:.62,public:1};
const STOCKPILE_WHITELIST=new Set([
  'food','wood','steel','textiles','clothes','motor_vehicle','bronze_weapons','iron_weapons','gunpowder','firearms',
  'small_arms_ammunition','artillery_shells','artillery_rockets','torpedoes','naval_mines','petrol','diesel','aviation_fuel','heavy_fuel_oil'
]);

function polityRegions(polity,regions){return (regions||[]).filter(r=>actorId(r)===polity?.id);}
function capital(polity,regions){return (regions||[]).find(r=>r.id===polity?.capitalRegionId)||polityRegions(polity,regions)[0]||null;}
function neighbours(region){return Array.isArray(region?.neighbors)?region.neighbors:[];}

export function ensureMilitaryAssistanceState(polity){
  polity.militaryAssistance ||= {programmes:[],shipments:[],history:[],dependencies:{},proxyPressure:{},nextProgrammeSeq:1,nextShipmentSeq:1};
  const s=polity.militaryAssistance;s.programmes||=[];s.shipments||=[];s.history||=[];s.dependencies||={};s.proxyPressure||={};
  s.nextProgrammeSeq=Math.max(1,s.nextProgrammeSeq||1);s.nextShipmentSeq=Math.max(1,s.nextShipmentSeq||1);return s;
}

function educationCapacity(r){return clamp(r?.massEducation?.literacy ?? r?.education?.literacy ?? r?.education?.scribalCapacity ?? .25);}
function adminCapacity(r){return clamp(r?.governance?.administrativeControl ?? r?.stateAdministration?.administrativeCapacity ?? .35);}
function industrialCapacity(r){return clamp(r?.industrialSupply?.capability?.precision_machining ?? r?.structuralTransformation?.capability?.manufacture ?? .15);}
function professionalCapacity(r){return clamp(r?.militaryProfessionalisation?.professionalism ?? r?.professionalisation?.professionalism ?? r?.army?.professionalism ?? .2);}

export function aidAbsorptionCapacity(recipientRegion,kind='supplies',complexity=.2){
  const edu=educationCapacity(recipientRegion),admin=adminCapacity(recipientRegion),industrial=industrialCapacity(recipientRegion),professional=professionalCapacity(recipientRegion);
  const base=kind==='equipment' ? .18+edu*.20+admin*.16+industrial*.27+professional*.19
    : kind==='training' ? .24+edu*.25+admin*.18+professional*.28+industrial*.05
    : .45+admin*.22+industrial*.13+edu*.10;
  return clamp(base-(clamp(complexity)*.36),.08,1);
}

function landPath(source,target,regions,maxHops=10){
  if(!source||!target)return null;if(source.id===target.id)return [source.id];
  const byId=new Map((regions||[]).map(r=>[r.id,r])),queue=[[source.id]],seen=new Set([source.id]);
  while(queue.length){const path=queue.shift();if(path.length>maxHops+1)continue;const last=byId.get(path.at(-1));
    for(const id of neighbours(last)){if(seen.has(id)||!byId.has(id))continue;const next=[...path,id];if(id===target.id)return next;seen.add(id);queue.push(next);}}
  return null;
}

export function militaryAidRouteAssessment(donorPolity,recipientPolity,regions){
  const a=capital(donorPolity,regions),b=capital(recipientPolity,regions);if(!a||!b)return {possible:false,reason:'missing_capital'};
  const path=landPath(a,b,regions,12);
  if(path){const hops=Math.max(0,path.length-1);return {possible:true,mode:'land',path,travelWeeks:Math.max(1,Math.ceil(hops*.7)),reliability:clamp(.97-hops*.025,.62,.97)};}
  if(a.isCoastal&&b.isCoastal&&(a.adjacentSeaIds||[]).length&&(b.adjacentSeaIds||[]).length){
    return {possible:true,mode:'sea',path:[a.id,b.id],travelWeeks:4,reliability:.82};
  }
  return {possible:false,reason:'no_logistics_route'};
}

function withdrawStock(polity,regions,resource,quantity){
  let remaining=Math.max(0,Number(quantity)||0),taken=0;
  for(const r of polityRegions(polity,regions)){const have=Math.max(0,r.stockpile?.[resource]||0),q=Math.min(have,remaining);if(q<=0)continue;r.stockpile[resource]-=q;taken+=q;remaining-=q;if(remaining<=1e-6)break;}
  return taken;
}
function refundStock(polity,regions,resource,quantity){const r=capital(polity,regions);if(!r)return;r.stockpile||={};r.stockpile[resource]=(r.stockpile[resource]||0)+quantity;}

function findDesignSource(polity,regions,designId){
  for(const r of polityRegions(polity,regions)){const cat=ensureEquipmentCatalogue(r),qty=Math.max(0,cat.inventoryByDesign?.[designId]||0);if(qty>0){const design=equipmentDesignById(r,designId);if(design)return {region:r,cat,design,qty};}}
  return null;
}
function designComplexity(design){const s=design?.stats||{};return clamp(.12+(s.computationalPower||0)*.22+(s.fireControlPotential||0)*.18+(s.speed||s.mobility||0)*.12+(s.protection||0)*.10+(s.firepower||0)*.12+(s.integration||0)*.14);}

export function createMilitaryAssistanceProgramme(donorPolity,recipientPolity,regions,currentTick=0,options={}){
  if(!donorPolity||!recipientPolity||donorPolity.id===recipientPolity.id)return {created:false,reason:'invalid_parties'};
  const route=militaryAidRouteAssessment(donorPolity,recipientPolity,regions);if(!route.possible)return {created:false,reason:route.reason};
  const state=ensureMilitaryAssistanceState(donorPolity),recipientState=ensureMilitaryAssistanceState(recipientPolity);
  const type=Object.values(ASSISTANCE_TYPES).includes(options.type)?options.type:ASSISTANCE_TYPES.MILITARY_MATERIEL;
  const visibility=Object.values(AID_VISIBILITY).includes(options.visibility)?options.visibility:AID_VISIBILITY.PUBLIC;
  const id=`aid-${donorPolity.id}-${state.nextProgrammeSeq++}`;
  const p={id,donorPolityId:donorPolity.id,recipientPolityId:recipientPolity.id,type,visibility,status:'active',createdTick:currentTick,
    declaredPurpose:options.declaredPurpose||'military_assistance',annualBudget:Math.max(0,Number(options.annualBudget)||0),
    trainingLevel:0,intelligenceLevel:0,logisticsLevel:0,volunteerPresence:0,directCombat:false,
    involvement:INVOLVEMENT[type]||.1,detectionConfidence:visibility==='public'?1:0,routeMode:route.mode,lastShipmentTick:null};
  state.programmes.push(p);recipientState.programmes.push({...p,inbound:true});
  return {created:true,programme:p,route};
}

export function dispatchMilitaryAid(donorPolity,recipientPolity,regions,currentTick=0,request={},rng=Math.random){
  const donorState=ensureMilitaryAssistanceState(donorPolity),recipientState=ensureMilitaryAssistanceState(recipientPolity);
  let programme=donorState.programmes.find(p=>p.id===request.programmeId&&p.status==='active');
  if(!programme){const made=createMilitaryAssistanceProgramme(donorPolity,recipientPolity,regions,currentTick,request);if(!made.created)return {dispatched:false,reason:made.reason};programme=made.programme;}
  const route=militaryAidRouteAssessment(donorPolity,recipientPolity,regions);if(!route.possible)return {dispatched:false,reason:route.reason};
  const donorCapital=capital(donorPolity,regions);if(!donorCapital)return {dispatched:false,reason:'missing_donor_capital'};
  const funds=Math.min(Math.max(0,Number(request.funds)||0),Math.max(0,donorCapital.treasury||0));
  const cargo={funds,stockpile:{},equipment:[],services:{}};donorCapital.treasury=(donorCapital.treasury||0)-funds;
  for(const [resource,raw] of Object.entries(request.stockpile||{})){if(!STOCKPILE_WHITELIST.has(resource))continue;const q=withdrawStock(donorPolity,regions,resource,raw);if(q>0)cargo.stockpile[resource]=q;}
  for(const item of request.equipment||[]){const src=findDesignSource(donorPolity,regions,item.designId);if(!src)continue;const q=Math.min(src.qty,Math.max(0,Number(item.quantity)||0));if(q<=0)continue;src.cat.inventoryByDesign[item.designId]-=q;cargo.equipment.push({design:structuredClone(src.design),quantity:q,complexity:designComplexity(src.design)});}
  for(const key of ['training','intelligence','logistics','volunteers','directIntervention'])cargo.services[key]=clamp(request[key]||0);
  const materialCount=Object.values(cargo.stockpile).reduce((a,b)=>a+b,0)+cargo.equipment.reduce((a,b)=>a+b.quantity,0);
  const serviceLevel=Object.values(cargo.services).reduce((a,b)=>a+(typeof b==='number'?b:0),0);
  if(funds<=0&&materialCount<=0&&serviceLevel<=0)return {dispatched:false,reason:'nothing_available'};
  const id=`shipment-${donorPolity.id}-${donorState.nextShipmentSeq++}`;
  const lossRisk=clamp((1-route.reliability)*(.55+.25*rng()),0,.45),deliveredFraction=clamp(1-lossRisk,.55,1);
  const shipment={id,programmeId:programme.id,donorPolityId:donorPolity.id,recipientPolityId:recipientPolity.id,departedTick:currentTick,
    arrivalTick:currentTick+route.travelWeeks,status:'in_transit',routeMode:route.mode,routeReliability:route.reliability,deliveredFraction,cargo,
    visibility:programme.visibility,detected:programme.visibility==='public',detectionConfidence:programme.visibility==='public'?1:0};
  donorState.shipments.push(shipment);recipientState.shipments.push({...shipment,inbound:true});programme.lastShipmentTick=currentTick;
  return {dispatched:true,shipment};
}

function importDesign(recipientRegion,donorPolityId,original){
  const cat=ensureEquipmentCatalogue(recipientRegion);const existing=cat.designs.find(d=>d.foreignOriginalId===original.id&&d.donorPolityId===donorPolityId);if(existing)return existing;
  const id=`${recipientRegion.id}:foreign:${donorPolityId}:${original.id}`;
  const design={...structuredClone(original),id,name:`${original.name} (imported)`,reason:'foreign_military_assistance',foreignOriginalId:original.id,donorPolityId};cat.designs.push(design);return design;
}

function applyArrival(shipment,recipientPolity,regions){
  const dest=capital(recipientPolity,regions);if(!dest)return false;dest.stockpile||={};
  dest.treasury=(dest.treasury||0)+shipment.cargo.funds*shipment.deliveredFraction;
  for(const [resource,qty] of Object.entries(shipment.cargo.stockpile||{}))dest.stockpile[resource]=(dest.stockpile[resource]||0)+qty*shipment.deliveredFraction;
  const cat=ensureEquipmentCatalogue(dest);dest.militaryAssistanceReadiness ||= {byDesign:{},trainingSupport:0,intelligenceSupport:0,logisticsSupport:0};
  for(const item of shipment.cargo.equipment||[]){const design=importDesign(dest,shipment.donorPolityId,item.design),delivered=item.quantity*shipment.deliveredFraction;
    cat.inventoryByDesign[design.id]=(cat.inventoryByDesign[design.id]||0)+delivered;const absorption=aidAbsorptionCapacity(dest,'equipment',item.complexity);
    dest.militaryAssistanceReadiness.byDesign[design.id]={usableFraction:absorption,donorPolityId:shipment.donorPolityId,complexity:item.complexity,lastAidTick:shipment.arrivalTick};}
  const svc=shipment.cargo.services||{};dest.militaryAssistanceReadiness.trainingSupport=clamp(dest.militaryAssistanceReadiness.trainingSupport+(svc.training||0)*.18);
  dest.militaryAssistanceReadiness.intelligenceSupport=clamp(dest.militaryAssistanceReadiness.intelligenceSupport+(svc.intelligence||0)*.16);
  dest.militaryAssistanceReadiness.logisticsSupport=clamp(dest.militaryAssistanceReadiness.logisticsSupport+(svc.logistics||0)*.16);
  const recState=ensureMilitaryAssistanceState(recipientPolity);const dep=recState.dependencies[shipment.donorPolityId]||{materiel:0,training:0,logistics:0,intelligence:0,total:0};
  dep.materiel=clamp(dep.materiel+shipment.cargo.equipment.reduce((s,x)=>s+x.quantity,0)*.002+Object.values(shipment.cargo.stockpile||{}).reduce((s,x)=>s+x,0)*.00002);
  dep.training=clamp(dep.training+(svc.training||0)*.08);dep.logistics=clamp(dep.logistics+(svc.logistics||0)*.07);dep.intelligence=clamp(dep.intelligence+(svc.intelligence||0)*.07);
  dep.total=clamp(dep.materiel*.45+dep.training*.22+dep.logistics*.18+dep.intelligence*.15);recState.dependencies[shipment.donorPolityId]=dep;return true;
}

function mirrorShipmentStatus(polity,shipment){for(const s of ensureMilitaryAssistanceState(polity).shipments){if(s.id===shipment.id){s.status=shipment.status;s.detected=shipment.detected;s.detectionConfidence=shipment.detectionConfidence;}}}

export function estimateMilitaryAssistance(observerRegion,donorPolity,recipientPolity){
  const state=ensureMilitaryAssistanceState(donorPolity);const programmes=state.programmes.filter(p=>p.recipientPolityId===recipientPolity.id&&p.status==='active');
  let confidence=0,involvement=0;for(const p of programmes){const familiarity=clamp(Math.abs(attitudeToward(observerRegion,capital(recipientPolity,[observerRegion])?.id||recipientPolity.capitalRegionId))*.15+.15);const seen=p.visibility==='public'?1:clamp((VISIBILITY[p.visibility]||.2)+familiarity);confidence=Math.max(confidence,seen,p.detectionConfidence||0);involvement=Math.max(involvement,p.involvement||0);}
  return {suspected:confidence>=.2,confidence,involvement:involvement*confidence,programmeCount:confidence>.7?programmes.length:null};
}

function conflictSidePair(polity,polities){
  const c=polity?.regimeConflict;if(c?.status!=='active')return null;const a=c.incumbentPolityId,b=c.revolutionaryPolityId;if(!a||!b)return null;return {key:[a,b].sort().join(':'),a,b,opponentId:polity.id===a?b:a};
}

export function proxyConflictAssessment(polities){
  const byConflict=new Map();for(const recipient of polities||[]){const pair=conflictSidePair(recipient,polities);if(!pair)continue;const row=byConflict.get(pair.key)||{conflictKey:pair.key,sides:[pair.a,pair.b],patrons:{},escalation:0};
    for(const donor of polities||[]){if(donor.id===recipient.id)continue;for(const p of ensureMilitaryAssistanceState(donor).programmes.filter(x=>x.status==='active'&&x.recipientPolityId===recipient.id)){row.patrons[recipient.id]||=[];row.patrons[recipient.id].push({donorPolityId:donor.id,involvement:p.involvement,visibility:p.visibility});}}
    byConflict.set(pair.key,row);}
  for(const row of byConflict.values()){const a=row.patrons[row.sides[0]]||[],b=row.patrons[row.sides[1]]||[];for(const x of a)for(const y of b)if(x.donorPolityId!==y.donorPolityId)row.escalation=Math.max(row.escalation,clamp((x.involvement+y.involvement)*.55));}
  return [...byConflict.values()];
}

export function tickMilitaryAssistance(polities,regions,currentTick,elapsedDays=7,rng=Math.random,options={}){
  const events=[];const byId=new Map((polities||[]).map(p=>[p.id,p]));
  for(const donor of polities||[]){const state=ensureMilitaryAssistanceState(donor);
    for(const shipment of state.shipments.filter(s=>!s.inbound&&s.status==='in_transit'&&s.arrivalTick<=currentTick)){const recipient=byId.get(shipment.recipientPolityId);if(!recipient){shipment.status='lost';continue;}
      const programme=state.programmes.find(p=>p.id===shipment.programmeId);if(programme&&programme.visibility!=='public'&&!shipment.detected){const target=capital(recipient,regions);const detection=clamp((VISIBILITY[programme.visibility]||.2)+(target?.counterIntelligence?.verificationCaution||.2)*.12+(1-shipment.routeReliability)*.15);shipment.detectionConfidence=clamp(shipment.detectionConfidence+detection*.35);shipment.detected=rng()<detection*.35;programme.detectionConfidence=Math.max(programme.detectionConfidence||0,shipment.detectionConfidence);}
      if(applyArrival(shipment,recipient,regions)){shipment.status='delivered';mirrorShipmentStatus(recipient,shipment);state.history.push({tick:currentTick,type:'shipment_delivered',shipmentId:shipment.id,recipientPolityId:recipient.id});events.push({type:'military_aid_delivered',donorPolityId:donor.id,recipientPolityId:recipient.id,shipmentId:shipment.id,detected:shipment.detected});}}
  }
  const years=Math.max(0,elapsedDays)/DAYS_PER_YEAR;for(const r of regions||[]){const ready=r.militaryAssistanceReadiness;if(!ready)continue;ready.trainingSupport=clamp((ready.trainingSupport||0)-years*.03);ready.intelligenceSupport=clamp((ready.intelligenceSupport||0)-years*.08);ready.logisticsSupport=clamp((ready.logisticsSupport||0)-years*.05);for(const row of Object.values(ready.byDesign||{}))row.usableFraction=clamp((row.usableFraction||0)+years*(.025+ready.trainingSupport*.08),.05,1);}
  for(const conflict of proxyConflictAssessment(polities)){if(conflict.escalation<=0)continue;for(const side of conflict.sides){const p=byId.get(side);if(p)ensureMilitaryAssistanceState(p).proxyPressure[conflict.conflictKey]=conflict.escalation;}events.push({type:'proxy_conflict_pressure',...conflict});}
  return events;
}

export function npcProxyAidDecision(donorPolity,recipientPolity,opponentPolity,regions,context={}){
  const donor=capital(donorPolity,regions),recipient=capital(recipientPolity,regions),opponent=capital(opponentPolity,regions);if(!donor||!recipient||!opponent)return {support:false,score:0};
  const affinity=clamp((attitudeToward(donor,recipient.id)+1)/2),hostility=clamp((1-attitudeToward(donor,opponent.id))/2);
  const nuclearDirectRisk=clamp(context.directWarNuclearRisk||0),costTolerance=clamp((donor.treasury||0)/Math.max(100,(donor.population||1)*.002));
  const score=clamp(affinity*.32+hostility*.28+nuclearDirectRisk*.28+costTolerance*.12);
  return {support:score>=.58,score,preferredType:nuclearDirectRisk>.55?ASSISTANCE_TYPES.MILITARY_MATERIEL:(score>.78?ASSISTANCE_TYPES.TRAINING_ADVISERS:ASSISTANCE_TYPES.FINANCIAL),visibility:nuclearDirectRisk>.5?AID_VISIBILITY.DENIABLE:AID_VISIBILITY.PUBLIC};
}
