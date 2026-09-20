import {
  AID_VISIBILITY,
  ASSISTANCE_TYPES,
  ensureMilitaryAssistanceState,
  militaryAidRouteAssessment,
  proxyConflictAssessment,
} from '../diplomacy/militaryAssistance.js?v=20260920-aid-ui2';
import {
  AID_CONDITIONS,
  AID_OFFER_STATUS,
  AID_REQUEST_STATUS,
  EXPORT_CONTROL_LEVEL,
  dispatchAcceptedMilitaryAidOffer,
  dispatchMilitaryAidDiplomatically,
  ensureMilitaryAidDiplomacy,
  militaryAidInstitutionalAction,
  proposeMilitaryAid,
  requestMilitaryAid,
  respondMilitaryAidOffer,
  resumeMilitaryAidProgramme,
  setMilitaryAidExportControl,
  suspendMilitaryAidProgramme,
} from '../diplomacy/militaryAidDiplomacy.js?v=20260920-aid-diplomacy-ui1';
import { chooseNpcInstitutionalApprovals, institutionalActionPrompt } from '../politics/institutionalActions.js?v=20260920-aid-diplomacy-ui1';
import { ensureEquipmentCatalogue } from '../military/equipmentGenerations.js?v=20260920-aid-ui2';

const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(v)=>`${Math.round(Math.max(0,Math.min(1,Number(v)||0))*100)}%`;
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;
const title=(s)=>String(s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

const TYPE_LABELS={
  financial:'Financial aid', civilian_logistics:'Civilian logistics', military_materiel:'Military materiel',
  training_advisers:'Training & advisers', intelligence:'Intelligence support', logistics:'Military logistics',
  volunteers:'Volunteers', direct_intervention:'Direct intervention',
};
const VISIBILITY_LABELS={covert:'Covert',deniable:'Deniable',undeclared:'Undeclared',public:'Public'};
const CONDITION_LABELS={
  end_use_monitoring:'End-use monitoring',no_reexport:'No re-export',defensive_use_only:'Defensive use only',
  reform_commitment:'Reform commitment',repayment:'Repayment',basing_access:'Basing access',
};
const CONTROL_LABELS={none:'Open',review:'Review each shipment',restricted:'Restricted',embargo:'Arms embargo'};
const SUPPLY_LABELS={
  food:'Food', firearms:'Firearms', small_arms_ammunition:'Small-arms ammunition', artillery_shells:'Artillery shells',
  artillery_rockets:'Artillery rockets', petrol:'Petrol', diesel:'Diesel', aviation_fuel:'Aviation fuel',
  heavy_fuel_oil:'Heavy fuel oil', motor_vehicle:'Motor vehicles', bronze_weapons:'Bronze weapons', iron_weapons:'Iron weapons',
};

function polityRegions(polity,regions){return (regions||[]).filter(r=>actorId(r)===polity?.id);}
function capital(polity,regions){return (regions||[]).find(r=>r.id===polity?.capitalRegionId)||polityRegions(polity,regions)[0]||null;}
function totalStock(polity,regions,key){return polityRegions(polity,regions).reduce((sum,r)=>sum+Math.max(0,Number(r.stockpile?.[key])||0),0);}
function designsInStock(polity,regions){
  const rows=[];
  for(const r of polityRegions(polity,regions)){
    const cat=ensureEquipmentCatalogue(r);
    for(const d of cat.designs||[]){const quantity=Math.max(0,Number(cat.inventoryByDesign?.[d.id])||0);if(quantity<=0)continue;const existing=rows.find(x=>x.id===d.id);if(existing)existing.quantity+=quantity;else rows.push({id:d.id,name:d.name||d.id,kind:d.kind||d.category||'equipment',quantity});}
  }
  return rows.sort((a,b)=>a.name.localeCompare(b.name));
}
function programmeRows(polity){return ensureMilitaryAssistanceState(polity).programmes.filter(p=>!p.inbound&&['active','suspended'].includes(p.status));}
function shipmentRows(polity){return ensureMilitaryAssistanceState(polity).shipments.filter(s=>!s.inbound&&['in_transit','delivered'].includes(s.status)).slice(-8).reverse();}
function openOffer(status){return status===AID_OFFER_STATUS.OPEN||status===AID_OFFER_STATUS.COUNTERED;}

export function militaryAssistancePanelModel(playerPolity,{regions=[],polities=[],visiblePolityIds=null}={}){
  if(!playerPolity)return null;
  const visible=visiblePolityIds?new Set(visiblePolityIds):null;
  const known=(polities||[]).filter(p=>p.id!==playerPolity.id&&(!visible||visible.has(p.id)));
  const recipients=known.map(p=>({id:p.id,name:p.name||p.id,route:militaryAidRouteAssessment(playerPolity,p,regions)})).filter(x=>x.route.possible).sort((a,b)=>a.name.localeCompare(b.name));
  const donors=known.map(p=>({id:p.id,name:p.name||p.id,route:militaryAidRouteAssessment(p,playerPolity,regions)})).filter(x=>x.route.possible).sort((a,b)=>a.name.localeCompare(b.name));
  const supplies=Object.keys(SUPPLY_LABELS).map(key=>({key,label:SUPPLY_LABELS[key],quantity:totalStock(playerPolity,regions,key)})).filter(x=>x.quantity>0.001);
  const equipment=designsInStock(playerPolity,regions);
  const programmes=programmeRows(playerPolity);
  const shipments=shipmentRows(playerPolity);
  const conflicts=proxyConflictAssessment(polities).filter(c=>Object.values(c.patrons||{}).flat().some(p=>p.donorPolityId===playerPolity.id));
  const treasury=Math.max(0,Number(capital(playerPolity,regions)?.treasury)||0);
  const diplomacy=ensureMilitaryAidDiplomacy(playerPolity);
  const inboundRequests=diplomacy.requests.filter(r=>r.inbound&&[AID_REQUEST_STATUS.OPEN,AID_REQUEST_STATUS.OFFERED].includes(r.status));
  const outboundRequests=diplomacy.requests.filter(r=>!r.inbound&&[AID_REQUEST_STATUS.OPEN,AID_REQUEST_STATUS.OFFERED].includes(r.status));
  const inboundOffers=diplomacy.offers.filter(o=>o.inbound&&openOffer(o.status));
  const outboundOffers=diplomacy.offers.filter(o=>!o.inbound&&openOffer(o.status));
  const acceptedOutboundOffers=diplomacy.offers.filter(o=>!o.inbound&&o.status===AID_OFFER_STATUS.ACCEPTED&&o.dispatchedTick==null);
  const exportControls=recipients.map(r=>({polityId:r.id,level:diplomacy.exportControls[r.id]?.level||EXPORT_CONTROL_LEVEL.NONE}));
  return {recipients,donors,supplies,equipment,programmes,shipments,conflicts,treasury,inboundRequests,outboundRequests,inboundOffers,outboundOffers,acceptedOutboundOffers,exportControls};
}

function summaryHtml(model,polities){
  const name=(id)=>polities.find(p=>p.id===id)?.name||id;
  const programme=model.programmes.length?model.programmes.map(p=>`<div class="raid-status"><strong>${esc(name(p.recipientPolityId))}</strong> · ${esc(TYPE_LABELS[p.type]||p.type)} · ${esc(VISIBILITY_LABELS[p.visibility]||p.visibility)} · ${esc(p.status)} · involvement ${pct(p.involvement)} <button data-aid-programme="${esc(p.id)}" data-aid-programme-action="${p.status==='suspended'?'resume':'suspend'}">${p.status==='suspended'?'Resume':'Suspend'}</button></div>`).join(''):'<div class="raid-status">No active outbound assistance programme.</div>';
  const shipment=model.shipments.length?model.shipments.slice(0,4).map(s=>`<div class="raid-status">${esc(name(s.recipientPolityId))} · ${esc(s.status.replaceAll('_',' '))} · ${esc(s.routeMode)}${s.status==='in_transit'?` · ETA week ${Math.round(s.arrivalTick)}`:''}</div>`).join(''):'<div class="raid-status">No recent aid shipments.</div>';
  const proxy=model.conflicts.length?model.conflicts.map(c=>`<div class="raid-status"><strong>Proxy exposure</strong> · escalation ${pct(c.escalation)} · patrons active on both sides</div>`).join(''):'';
  return `${programme}${shipment}${proxy}`;
}

function diplomacyInboxHtml(model,polities){
  const name=(id)=>polities.find(p=>p.id===id)?.name||id;
  const requests=model.inboundRequests.map(r=>`<div class="raid-status"><strong>${esc(name(r.recipientPolityId))} requests ${esc(TYPE_LABELS[r.requestedType]||r.requestedType)}</strong> · urgency ${pct(r.urgency)}${r.requestedFunds?` · asks ${Math.round(r.requestedFunds).toLocaleString()} funds`:''}<br><button data-aid-answer-request="${esc(r.id)}" data-aid-request-recipient="${esc(r.recipientPolityId)}">Prepare offer</button></div>`).join('');
  const offers=model.inboundOffers.map(o=>`<div class="raid-status"><strong>${esc(name(o.donorPolityId))} offers ${esc(TYPE_LABELS[o.type]||o.type)}</strong>${o.funds?` · ${Math.round(o.funds).toLocaleString()} funds`:''}${o.conditions?.length?` · ${o.conditions.map(c=>esc(CONDITION_LABELS[c]||title(c))).join(', ')}`:''}<br><button data-aid-offer-decision="accept" data-aid-offer-id="${esc(o.id)}">Accept</button> <button data-aid-offer-decision="reject" data-aid-offer-id="${esc(o.id)}">Reject</button> <button data-aid-offer-decision="counter" data-aid-offer-id="${esc(o.id)}">Counter: remove basing/repayment</button></div>`).join('');
  const outgoing=model.outboundRequests.map(r=>`<div class="raid-status">Request to ${esc(name(r.donorPolityId))} · ${esc(r.status)} · ${esc(TYPE_LABELS[r.requestedType]||r.requestedType)}</div>`).join('');
  const accepted=model.acceptedOutboundOffers.map(o=>`<div class="raid-status"><strong>${esc(name(o.recipientPolityId))} accepted your offer</strong> · ready to dispatch <button data-aid-dispatch-offer="${esc(o.id)}">Dispatch agreed package</button></div>`).join('');
  return requests||offers||outgoing||accepted?`<details open><summary><strong>Aid diplomacy</strong></summary>${requests}${offers}${outgoing}${accepted}</details>`:'<div class="raid-status">No pending military-aid diplomacy.</div>';
}

function collectPackage(section,programmeId=null){
  const supply=section.querySelector('[data-aid-supply]')?.value,equipment=section.querySelector('[data-aid-equipment]')?.value;
  const request={programmeId,type:section.querySelector('[data-aid-type]')?.value,visibility:section.querySelector('[data-aid-visibility]')?.value,funds:Number(section.querySelector('[data-aid-funds]')?.value)||0,stockpile:{},equipment:[],training:(Number(section.querySelector('[data-aid-training]')?.value)||0)/100,intelligence:(Number(section.querySelector('[data-aid-intelligence]')?.value)||0)/100,logistics:(Number(section.querySelector('[data-aid-logistics]')?.value)||0)/100};
  if(supply)request.stockpile[supply]=Number(section.querySelector('[data-aid-supply-qty]')?.value)||0;
  if(equipment)request.equipment.push({designId:equipment,quantity:Number(section.querySelector('[data-aid-equipment-qty]')?.value)||0});
  if(request.type===ASSISTANCE_TYPES.VOLUNTEERS)request.volunteers=.5;if(request.type===ASSISTANCE_TYPES.DIRECT_INTERVENTION)request.directIntervention=.7;
  return request;
}

function getApprovals(polity,type,visibility,context={}){
  const action=militaryAidInstitutionalAction(type,visibility),prompt=institutionalActionPrompt(polity,action);
  if(prompt.executiveCanActAlone)return {approved:true,approvals:[],prompt,decisions:[]};
  const decision=chooseNpcInstitutionalApprovals(polity,action,context);
  return {...decision,prompt};
}

export function renderMilitaryAssistanceControls(container,playerPolity,{regions=[],polities=[],visiblePolityIds=null,currentTick=0,onAction=null}={}){
  if(!container||!playerPolity)return null;
  let model=militaryAssistancePanelModel(playerPolity,{regions,polities,visiblePolityIds});
  const section=document.createElement('div');section.className='raid-section military-assistance-section';
  const render=()=>{
    model=militaryAssistancePanelModel(playerPolity,{regions,polities,visiblePolityIds});
    const recipientOptions=model.recipients.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    const donorOptions=model.donors.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    const supplyOptions=['<option value="">— no supply cargo —</option>',...model.supplies.map(s=>`<option value="${esc(s.key)}">${esc(s.label)} · ${Math.floor(s.quantity).toLocaleString()} available</option>`)].join('');
    const equipmentOptions=['<option value="">— no designed equipment —</option>',...model.equipment.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${Math.floor(d.quantity).toLocaleString()} available</option>`)].join('');
    const conditionOptions=Object.values(AID_CONDITIONS).map(v=>`<label><input type="checkbox" data-aid-condition value="${v}"> ${esc(CONDITION_LABELS[v]||title(v))}</label>`).join('');
    section.innerHTML=`<strong>Military assistance</strong>
      <div class="raid-status">Support another government without automatically entering its war. Aid now follows export controls, institutional authority and negotiated terms; money, supplies and equipment leave real stocks and physical shipments take time.</div>
      ${summaryHtml(model,polities)}
      ${diplomacyInboxHtml(model,polities)}
      ${model.donors.length?`<details><summary><strong>Request foreign aid</strong></summary><label class="control-row">Ask<select data-aid-donor>${donorOptions}</select></label><label class="control-row">For<select data-aid-request-type>${Object.values(ASSISTANCE_TYPES).map(v=>`<option value="${v}" ${v===ASSISTANCE_TYPES.MILITARY_MATERIEL?'selected':''}>${esc(TYPE_LABELS[v]||v)}</option>`).join('')}</select></label><label class="control-row">Requested funds<input type="number" min="0" step="10" value="0" data-aid-request-funds></label><label class="control-row">Urgency <span data-aid-urgency-label>60%</span><input type="range" min="0" max="100" value="60" data-aid-urgency></label><label class="control-row">Request<select data-aid-request-public><option value="private">Private</option><option value="public">Public</option></select></label><button data-aid-request>Send request</button></details>`:''}
      ${model.recipients.length?`<details open><summary><strong>Offer or dispatch aid</strong></summary><label class="control-row">Recipient<select data-aid-recipient>${recipientOptions}</select></label>
      <div class="raid-status" data-aid-route></div>
      <label class="control-row">Programme<select data-aid-type>${Object.values(ASSISTANCE_TYPES).map(v=>`<option value="${v}" ${v===ASSISTANCE_TYPES.MILITARY_MATERIEL?'selected':''}>${esc(TYPE_LABELS[v]||v)}</option>`).join('')}</select></label>
      <label class="control-row">Visibility<select data-aid-visibility>${Object.values(AID_VISIBILITY).map(v=>`<option value="${v}" ${v===AID_VISIBILITY.PUBLIC?'selected':''}>${esc(VISIBILITY_LABELS[v]||v)}</option>`).join('')}</select></label>
      <label class="control-row">Funds <span>${Math.floor(model.treasury).toLocaleString()} treasury</span><input type="number" min="0" step="10" value="0" data-aid-funds></label>
      <label class="control-row">Supply cargo<select data-aid-supply>${supplyOptions}</select></label>
      <label class="control-row">Supply quantity<input type="number" min="0" step="10" value="0" data-aid-supply-qty></label>
      <label class="control-row">Equipment Mark<select data-aid-equipment>${equipmentOptions}</select></label>
      <label class="control-row">Equipment quantity<input type="number" min="0" step="1" value="0" data-aid-equipment-qty></label>
      <label class="control-row">Training & advisers <span data-aid-training-label>0%</span><input type="range" min="0" max="100" value="0" data-aid-training></label>
      <label class="control-row">Intelligence <span data-aid-intelligence-label>0%</span><input type="range" min="0" max="100" value="0" data-aid-intelligence></label>
      <label class="control-row">Logistics support <span data-aid-logistics-label>0%</span><input type="range" min="0" max="100" value="0" data-aid-logistics></label>
      <details><summary>Negotiated conditions</summary>${conditionOptions}<label class="control-row">Repayment<input type="number" min="0" step="10" value="0" data-aid-repayment></label></details>
      <button data-aid-offer>Make diplomatic offer</button> <button data-aid-send>Dispatch now</button><div class="raid-status" data-aid-result></div></details>
      <details><summary><strong>Export controls</strong></summary><label class="control-row">Target<select data-aid-control-target>${recipientOptions}</select></label><label class="control-row">Policy<select data-aid-control-level>${Object.values(EXPORT_CONTROL_LEVEL).map(v=>`<option value="${v}">${esc(CONTROL_LABELS[v]||title(v))}</option>`).join('')}</select></label><button data-aid-control-apply>Apply export control</button><div class="raid-status" data-aid-control-status></div></details>`:'<div class="raid-status">No known polity currently has a viable aid route from your territory.</div>'}`;

    const recipient=section.querySelector('[data-aid-recipient]'),routeOut=section.querySelector('[data-aid-route]'),resultOut=section.querySelector('[data-aid-result]');
    const updateRoute=()=>{const row=model.recipients.find(x=>x.id===recipient?.value);if(routeOut)routeOut.textContent=row?`${row.route.mode} route · about ${row.route.travelWeeks} week(s) · ${pct(row.route.reliability)} baseline delivery reliability`:'No route selected.';};recipient?.addEventListener('change',updateRoute);updateRoute();
    for(const key of ['training','intelligence','logistics','urgency']){const input=section.querySelector(`[data-aid-${key}]`),label=section.querySelector(`[data-aid-${key}-label]`);input?.addEventListener('input',()=>{if(label)label.textContent=`${input.value}%`;});}

    section.querySelector('[data-aid-request]')?.addEventListener('click',()=>{const donor=polities.find(p=>p.id===section.querySelector('[data-aid-donor]')?.value);if(!donor)return;const made=requestMilitaryAid(playerPolity,donor,currentTick,{type:section.querySelector('[data-aid-request-type]')?.value,funds:Number(section.querySelector('[data-aid-request-funds]')?.value)||0,urgency:(Number(section.querySelector('[data-aid-urgency]')?.value)||0)/100,public:section.querySelector('[data-aid-request-public]')?.value==='public'});onAction?.(made);render();});

    section.querySelector('[data-aid-offer]')?.addEventListener('click',()=>{const recipientPolity=polities.find(p=>p.id===recipient?.value);if(!recipientPolity)return;const request=collectPackage(section),conditions=[...section.querySelectorAll('[data-aid-condition]:checked')].map(x=>x.value),repayment=Number(section.querySelector('[data-aid-repayment]')?.value)||0;const made=proposeMilitaryAid(playerPolity,recipientPolity,currentTick,{...request,conditions,repayment});if(resultOut)resultOut.textContent=made.created?'Offer sent for consideration.':`Offer could not be made (${String(made.reason||'unknown').replaceAll('_',' ')}).`;onAction?.(made);render();});

    section.querySelector('[data-aid-send]')?.addEventListener('click',()=>{const recipientPolity=polities.find(p=>p.id===recipient?.value);if(!recipientPolity)return;const request=collectPackage(section),approval=getApprovals(playerPolity,request.type,request.visibility,{publicSupport:.55});if(!approval.approved){if(resultOut)resultOut.textContent=`${approval.prompt.requiredInstitutions.map(title).join(' and ')} refused authorisation.`;return;}const sent=dispatchMilitaryAidDiplomatically(playerPolity,recipientPolity,regions,currentTick,request,{approvals:approval.approvals});if(!sent.dispatched){if(resultOut)resultOut.textContent=`Nothing dispatched (${String(sent.reason||'unknown').replaceAll('_',' ')}).`;return;}onAction?.(sent);render();});

    section.querySelectorAll('[data-aid-programme]').forEach(button=>button.addEventListener('click',()=>{const programme=model.programmes.find(p=>p.id===button.dataset.aidProgramme),recipientPolity=polities.find(p=>p.id===programme?.recipientPolityId);if(!programme||!recipientPolity)return;const result=button.dataset.aidProgrammeAction==='resume'?resumeMilitaryAidProgramme(playerPolity,recipientPolity,programme.id,currentTick):suspendMilitaryAidProgramme(playerPolity,recipientPolity,programme.id,currentTick,'player_policy_review');onAction?.(result);render();}));

    section.querySelectorAll('[data-aid-answer-request]').forEach(button=>button.addEventListener('click',()=>{const req=model.inboundRequests.find(r=>r.id===button.dataset.aidAnswerRequest);if(!req)return;const recipientPolity=polities.find(p=>p.id===req.recipientPolityId);if(!recipientPolity)return;const made=proposeMilitaryAid(playerPolity,recipientPolity,currentTick,{requestId:req.id,type:req.requestedType,funds:Math.min(model.treasury,req.requestedFunds||0),visibility:AID_VISIBILITY.PUBLIC});onAction?.(made);render();}));

    section.querySelectorAll('[data-aid-offer-decision]').forEach(button=>button.addEventListener('click',()=>{const offer=model.inboundOffers.find(o=>o.id===button.dataset.aidOfferId),donor=polities.find(p=>p.id===offer?.donorPolityId);if(!offer||!donor)return;let result;if(button.dataset.aidOfferDecision==='counter')result=respondMilitaryAidOffer(playerPolity,donor,offer.id,'counter',currentTick,{changes:{conditions:(offer.conditions||[]).filter(c=>c!==AID_CONDITIONS.BASING_ACCESS),repayment:0}});else result=respondMilitaryAidOffer(playerPolity,donor,offer.id,button.dataset.aidOfferDecision,currentTick);onAction?.(result);render();}));

    section.querySelectorAll('[data-aid-dispatch-offer]').forEach(button=>button.addEventListener('click',()=>{const offer=model.acceptedOutboundOffers.find(o=>o.id===button.dataset.aidDispatchOffer),recipientPolity=polities.find(p=>p.id===offer?.recipientPolityId);if(!offer||!recipientPolity)return;const approval=getApprovals(playerPolity,offer.type,offer.visibility,{publicSupport:.55});if(!approval.approved)return;const sent=dispatchAcceptedMilitaryAidOffer(playerPolity,recipientPolity,regions,currentTick,offer,{approvals:approval.approvals});onAction?.(sent);render();}));

    section.querySelector('[data-aid-control-apply]')?.addEventListener('click',()=>{const target=section.querySelector('[data-aid-control-target]')?.value,level=section.querySelector('[data-aid-control-level]')?.value,out=section.querySelector('[data-aid-control-status]');const prompt=institutionalActionPrompt(playerPolity,'change_economic_policy'),decision=prompt.executiveCanActAlone?{approved:true,approvals:[]}:chooseNpcInstitutionalApprovals(playerPolity,'change_economic_policy',{publicSupport:.55});if(!decision.approved){if(out)out.textContent=`${prompt.requiredInstitutions.map(title).join(' and ')} refused the export-control change.`;return;}const changed=setMilitaryAidExportControl(playerPolity,target,level,{currentTick});if(out)out.textContent=changed.changed?`Export control set to ${CONTROL_LABELS[level]||level}.`:`No change (${changed.reason}).`;onAction?.(changed);render();});
  };
  render();container.appendChild(section);return section;
}
