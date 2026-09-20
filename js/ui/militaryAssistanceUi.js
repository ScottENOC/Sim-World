import {
  AID_VISIBILITY,
  ASSISTANCE_TYPES,
  createMilitaryAssistanceProgramme,
  dispatchMilitaryAid,
  ensureMilitaryAssistanceState,
  militaryAidRouteAssessment,
  proxyConflictAssessment,
} from '../diplomacy/militaryAssistance.js?v=20260920-aid-ui1';
import { ensureEquipmentCatalogue } from '../military/equipmentGenerations.js?v=20260920-aid-ui1';

const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(v)=>`${Math.round(Math.max(0,Math.min(1,Number(v)||0))*100)}%`;
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

const TYPE_LABELS={
  financial:'Financial aid', civilian_logistics:'Civilian logistics', military_materiel:'Military materiel',
  training_advisers:'Training & advisers', intelligence:'Intelligence support', logistics:'Military logistics',
  volunteers:'Volunteers', direct_intervention:'Direct intervention',
};
const VISIBILITY_LABELS={covert:'Covert',deniable:'Deniable',undeclared:'Undeclared',public:'Public'};
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
function programmeRows(polity){return ensureMilitaryAssistanceState(polity).programmes.filter(p=>p.status==='active'&&!p.inbound);}
function shipmentRows(polity){return ensureMilitaryAssistanceState(polity).shipments.filter(s=>!s.inbound&&['in_transit','delivered'].includes(s.status)).slice(-8).reverse();}

export function militaryAssistancePanelModel(playerPolity,{regions=[],polities=[],visiblePolityIds=null}={}){
  if(!playerPolity)return null;
  const visible=visiblePolityIds?new Set(visiblePolityIds):null;
  const recipients=(polities||[]).filter(p=>p.id!==playerPolity.id&&(!visible||visible.has(p.id))).map(p=>{
    const route=militaryAidRouteAssessment(playerPolity,p,regions);
    return {id:p.id,name:p.name||p.id,route};
  }).filter(x=>x.route.possible).sort((a,b)=>a.name.localeCompare(b.name));
  const supplies=Object.keys(SUPPLY_LABELS).map(key=>({key,label:SUPPLY_LABELS[key],quantity:totalStock(playerPolity,regions,key)})).filter(x=>x.quantity>0.001);
  const equipment=designsInStock(playerPolity,regions);
  const programmes=programmeRows(playerPolity);
  const shipments=shipmentRows(playerPolity);
  const conflicts=proxyConflictAssessment(polities).filter(c=>Object.values(c.patrons||{}).flat().some(p=>p.donorPolityId===playerPolity.id));
  const treasury=Math.max(0,Number(capital(playerPolity,regions)?.treasury)||0);
  return {recipients,supplies,equipment,programmes,shipments,conflicts,treasury};
}

function summaryHtml(model,polities){
  const name=(id)=>polities.find(p=>p.id===id)?.name||id;
  const programme=model.programmes.length?model.programmes.map(p=>`<div class="raid-status"><strong>${esc(name(p.recipientPolityId))}</strong> · ${esc(TYPE_LABELS[p.type]||p.type)} · ${esc(VISIBILITY_LABELS[p.visibility]||p.visibility)} · involvement ${pct(p.involvement)}</div>`).join(''):'<div class="raid-status">No active outbound assistance programme.</div>';
  const shipment=model.shipments.length?model.shipments.slice(0,4).map(s=>`<div class="raid-status">${esc(name(s.recipientPolityId))} · ${esc(s.status.replaceAll('_',' '))} · ${esc(s.routeMode)}${s.status==='in_transit'?` · ETA week ${Math.round(s.arrivalTick)}`:''}</div>`).join(''):'<div class="raid-status">No recent aid shipments.</div>';
  const proxy=model.conflicts.length?model.conflicts.map(c=>`<div class="raid-status"><strong>Proxy exposure</strong> · escalation ${pct(c.escalation)} · patrons active on both sides</div>`).join(''):'';
  return `${programme}${shipment}${proxy}`;
}

export function renderMilitaryAssistanceControls(container,playerPolity,{regions=[],polities=[],visiblePolityIds=null,currentTick=0,onAction=null}={}){
  if(!container||!playerPolity)return null;
  let model=militaryAssistancePanelModel(playerPolity,{regions,polities,visiblePolityIds});
  const section=document.createElement('div');section.className='raid-section military-assistance-section';
  const render=()=>{
    model=militaryAssistancePanelModel(playerPolity,{regions,polities,visiblePolityIds});
    const recipientOptions=model.recipients.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    const supplyOptions=['<option value="">— no supply cargo —</option>',...model.supplies.map(s=>`<option value="${esc(s.key)}">${esc(s.label)} · ${Math.floor(s.quantity).toLocaleString()} available</option>`)].join('');
    const equipmentOptions=['<option value="">— no designed equipment —</option>',...model.equipment.map(d=>`<option value="${esc(d.id)}">${esc(d.name)} · ${Math.floor(d.quantity).toLocaleString()} available</option>`)].join('');
    section.innerHTML=`<strong>Military assistance</strong>
      <div class="raid-status">Support another government without automatically entering its war. Money, supplies and equipment leave your real stocks; shipments take time and imported equipment may need training and maintenance support.</div>
      ${summaryHtml(model,polities)}
      ${model.recipients.length?`<label class="control-row">Recipient<select data-aid-recipient>${recipientOptions}</select></label>
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
      <button data-aid-send>Dispatch assistance</button><div class="raid-status" data-aid-result></div>`:'<div class="raid-status">No known polity currently has a viable aid route from your territory.</div>'}`;
    const recipient=section.querySelector('[data-aid-recipient]');
    const routeOut=section.querySelector('[data-aid-route]');
    const updateRoute=()=>{const row=model.recipients.find(x=>x.id===recipient?.value);if(routeOut)routeOut.textContent=row?`${row.route.mode} route · about ${row.route.travelWeeks} week(s) · ${pct(row.route.reliability)} baseline delivery reliability`:'No route selected.';};
    recipient?.addEventListener('change',updateRoute);updateRoute();
    for(const key of ['training','intelligence','logistics']){const input=section.querySelector(`[data-aid-${key}]`),label=section.querySelector(`[data-aid-${key}-label]`);input?.addEventListener('input',()=>{if(label)label.textContent=`${input.value}%`;});}
    section.querySelector('[data-aid-send]')?.addEventListener('click',()=>{
      const recipientPolity=polities.find(p=>p.id===recipient?.value),resultOut=section.querySelector('[data-aid-result]');if(!recipientPolity)return;
      const type=section.querySelector('[data-aid-type]')?.value,visibility=section.querySelector('[data-aid-visibility]')?.value;
      const made=createMilitaryAssistanceProgramme(playerPolity,recipientPolity,regions,currentTick,{type,visibility});
      if(!made.created){if(resultOut)resultOut.textContent=`Programme could not begin (${String(made.reason||'unknown').replaceAll('_',' ')}).`;return;}
      const supply=section.querySelector('[data-aid-supply]')?.value,equipment=section.querySelector('[data-aid-equipment]')?.value;
      const request={programmeId:made.programme.id,type,visibility,funds:Number(section.querySelector('[data-aid-funds]')?.value)||0,stockpile:{},equipment:[],training:(Number(section.querySelector('[data-aid-training]')?.value)||0)/100,intelligence:(Number(section.querySelector('[data-aid-intelligence]')?.value)||0)/100,logistics:(Number(section.querySelector('[data-aid-logistics]')?.value)||0)/100};
      if(supply)request.stockpile[supply]=Number(section.querySelector('[data-aid-supply-qty]')?.value)||0;
      if(equipment)request.equipment.push({designId:equipment,quantity:Number(section.querySelector('[data-aid-equipment-qty]')?.value)||0});
      if(type===ASSISTANCE_TYPES.VOLUNTEERS)request.volunteers=.5;if(type===ASSISTANCE_TYPES.DIRECT_INTERVENTION)request.directIntervention=.7;
      const sent=dispatchMilitaryAid(playerPolity,recipientPolity,regions,currentTick,request);
      if(!sent.dispatched){if(resultOut)resultOut.textContent=`Nothing dispatched (${String(sent.reason||'unknown').replaceAll('_',' ')}).`;return;}
      onAction?.(sent);render();
    });
  };
  render();container.appendChild(section);return section;
}
