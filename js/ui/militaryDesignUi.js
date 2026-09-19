import {
  EQUIPMENT_FAMILIES,
  MILITARY_MATERIALS,
  authoriseEquipmentMark,
  militaryMaterialOptions,
  previewEquipmentDesign,
  currentEquipmentDesign,
} from '../military/equipmentGenerations.js?v=20260919-light-metal-designs1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const FAMILY_FOR_PRODUCT=Object.freeze({fighter:EQUIPMENT_FAMILIES.FIGHTER,bomber:EQUIPMENT_FAMILIES.BOMBER,tank:EQUIPMENT_FAMILIES.TANK,self_propelled_gun:EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN});
const LABELS=Object.freeze({fighter:'Fighter',bomber:'Bomber',tank:'Tank',self_propelled_gun:'Self-propelled gun'});

function polityId(r){return r?.governance?.sovereignPolityId||r?.polityId||null;}
function playerRegions(sim){const id=sim?.activePlayerPolityId;return (sim?.regions||[]).filter(r=>polityId(r)===id||r.id===id);}
function eligibleLines(sim){
  const rows=[];for(const region of playerRegions(sim))for(const line of region.industrialPlants?.lines||[]){const family=FAMILY_FOR_PRODUCT[line.productId];if(family)rows.push({region,line,family,productId:line.productId});}return rows;
}
function stat(v){return `${Math.round(clamp(v)*100)}%`;}
function prioritiesFor(family){return family===EQUIPMENT_FAMILIES.FIGHTER||family===EQUIPMENT_FAMILIES.BOMBER?['speed','range','payload','manoeuvrability','firepower','reliability']:['mobility','protection','firepower','reliability'];}
function readPriority(panel,key){return clamp(Number(panel.querySelector(`[data-design-priority="${key}"]`)?.value)||100,25,250)/100;}
function selection(panel,rows){const idx=Number(panel.querySelector('#military-design-line')?.value)||0;return rows[idx]||rows[0]||null;}
function materialLabel(stats){return stats?.structureMaterial==='titanium'?'Titanium-intensive':stats?.structureMaterial==='aluminium'?'Aluminium alloy':'Conventional';}

function renderPreview(panel,row){
  if(!row)return;const material=panel.querySelector('#military-design-material')?.value||MILITARY_MATERIALS.CONVENTIONAL;const priorities={};for(const key of prioritiesFor(row.family))priorities[key]=readPriority(panel,key);
  const preview=previewEquipmentDesign(row.region,row.family,{material,priorities});const box=panel.querySelector('#military-design-preview');if(!preview||!box)return;
  const aircraft=row.family===EQUIPMENT_FAMILIES.FIGHTER||row.family===EQUIPMENT_FAMILIES.BOMBER;
  const inputs=Object.entries(preview.systemInputs||{}).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k.replaceAll('_',' ')} ${Number(v).toFixed(1)}`).join(' · ')||'standard components only';
  box.innerHTML=aircraft
    ? `<strong>${materialLabel(preview)} preview</strong><br>Speed ${stat(preview.speed)} · range ${stat(preview.range)} · payload ${stat(preview.payload)} · manoeuvre ${stat(preview.manoeuvrability)} · firepower ${stat(preview.firepower)} · reliability ${stat(preview.reliability)}<br><small>Structural mass ${Math.round((preview.structuralMassMultiplier??1)*100)}% of conventional · production inputs: ${inputs}</small>`
    : `<strong>${materialLabel(preview)} preview</strong><br>Mobility ${stat(preview.mobility)} · protection ${stat(preview.protection)} · firepower ${stat(preview.firepower)} · reliability ${stat(preview.reliability)}<br><small>Structural mass ${Math.round((preview.structuralMassMultiplier??1)*100)}% of conventional · production inputs: ${inputs}</small>`;
}

function render(sim,panel){
  const rows=eligibleLines(sim);if(!rows.length){panel.innerHTML='<h3>Equipment design bureau</h3><p class="advisor-note">No fighter, bomber, tank or self-propelled-gun production line is available to design for.</p>';return;}
  const current=selection(panel,rows)||rows[0],materials=militaryMaterialOptions(current.region,current.family),keys=prioritiesFor(current.family);
  const stock=current.region.stockpile||{};
  panel.innerHTML=`<h3>Equipment design bureau</h3><p class="advisor-voice">“We can optimise a machine for one job, but not every job. Lighter structures buy performance; scarce materials and difficult fabrication buy nothing if the factories cannot sustain them.”</p>
    <label class="advisor-field"><span>Production line</span><select id="military-design-line">${rows.map((r,i)=>`<option value="${i}" ${r===current?'selected':''}>${r.region.name} · ${LABELS[r.productId]||r.productId}</option>`).join('')}</select></label>
    <label class="advisor-field"><span>Primary structural material</span><select id="military-design-material">${materials.map(m=>`<option value="${m.id}" ${m.available?'':'disabled'}>${m.label}${m.available?'':` · ${m.reason}`}</option>`).join('')}</select></label>
    <div class="advisor-note">Stocks: aluminium ${Number(stock.aluminium||0).toFixed(1)} · titanium ${Number(stock.titanium||0).toFixed(1)}. These are production materials, not just unlock conditions.</div>
    ${keys.map(k=>`<label class="advisor-field advisor-slider"><span>${k[0].toUpperCase()+k.slice(1)} priority <b data-priority-label="${k}">100%</b></span><input data-design-priority="${k}" type="range" min="25" max="250" step="25" value="100"></label>`).join('')}
    <div id="military-design-preview" class="advisor-note"></div>
    <button id="authorise-military-design" class="advisor-order">Authorise new design and retool line</button>
    <div id="military-design-result" class="advisor-note"></div>
    <p class="advisor-note">Priorities redistribute the available engineering frontier rather than creating free performance. A line entering the new model stops producing during retooling. Finished units retain the design they were built to.</p>`;

  const refresh=()=>renderPreview(panel,selection(panel,rows));
  panel.querySelector('#military-design-line')?.addEventListener('change',()=>render(sim,panel));
  panel.querySelector('#military-design-material')?.addEventListener('change',refresh);
  for(const input of panel.querySelectorAll('[data-design-priority]'))input.addEventListener('input',()=>{panel.querySelector(`[data-priority-label="${input.dataset.designPriority}"]`).textContent=`${input.value}%`;refresh();});
  panel.querySelector('#authorise-military-design')?.addEventListener('click',()=>{
    const row=selection(panel,rows);if(!row)return;const material=panel.querySelector('#military-design-material')?.value||MILITARY_MATERIALS.CONVENTIONAL;const priorities={};for(const key of prioritiesFor(row.family))priorities[key]=readPriority(panel,key);
    const currentDesign=currentEquipmentDesign(row.region,row.family),seq=(currentDesign?.sequence||0)+1,aircraft=row.family===EQUIPMENT_FAMILIES.FIGHTER||row.family===EQUIPMENT_FAMILIES.BOMBER;
    row.region.industrialSupply||={};row.region.industrialSupply.inventory||={};const inv=row.region.industrialSupply.inventory;const machineNeed=(aircraft?9:7)+seq*(aircraft?4:3),treasuryNeed=(aircraft?20:15)+seq*(aircraft?8:6);
    const result=panel.querySelector('#military-design-result');
    if((inv.machine_components||0)<machineNeed){result.textContent=`Design bureau needs ${machineNeed.toFixed(1)} machine components; only ${Number(inv.machine_components||0).toFixed(1)} are available.`;return;}
    if((row.region.treasury||0)<treasuryNeed){result.textContent=`Design and retooling require ${treasuryNeed.toFixed(1)} treasury; only ${Number(row.region.treasury||0).toFixed(1)} is available.`;return;}
    inv.machine_components-=machineNeed;row.region.treasury-=treasuryNeed;
    const design=authoriseEquipmentMark(row.region,row.family,{tick:Math.round(row.region.industrialPlants?.elapsedWeeks||0),authorisedBy:'player',reason:'player_design_bureau',material,priorities});
    const advancedMaterial=material===MILITARY_MATERIALS.CONVENTIONAL?0:material===MILITARY_MATERIALS.ALUMINIUM?3:6;
    row.line.pendingDesignId=design.id;row.line.retoolWeeksRemaining=Math.max(row.line.retoolWeeksRemaining||0,6+seq*2+advancedMaterial);row.line.status='retooling';row.line.toolingFit=Math.min(row.line.toolingFit||1,material===MILITARY_MATERIALS.TITANIUM?.72:.82);
    row.line.lastModelUpgrade={tick:Math.round(row.region.industrialPlants?.elapsedWeeks||0),designId:design.id,cost:{machineComponents:machineNeed,treasury:treasuryNeed},downtimeWeeks:row.line.retoolWeeksRemaining,authorisedBy:'player',designChoices:design.designChoices};
    result.textContent=`${design.name} authorised. ${row.line.retoolWeeksRemaining.toFixed(0)} weeks of line retooling scheduled; production will then consume the design's specified materials.`;
  });
  refresh();
}

function maybeMount(sim){const content=document.getElementById('advisor-content'),marshal=document.querySelector('[data-advisor="marshal"]');if(!content||!marshal?.classList.contains('active'))return;let panel=document.getElementById('military-design-advisor-panel');if(!panel){panel=document.createElement('section');panel.id='military-design-advisor-panel';panel.className='advisor-section';content.appendChild(panel);}render(sim,panel);}

export function installMilitaryDesignUi(sim=window.__worldsim){const content=document.getElementById('advisor-content');if(!sim||!content||content.dataset.militaryDesignUiInstalled==='true')return false;content.dataset.militaryDesignUiInstalled='true';let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;maybeMount(sim);});};new MutationObserver(schedule).observe(content,{childList:true,subtree:false});document.getElementById('advisor-tabs')?.addEventListener('click',schedule);document.getElementById('btn-council')?.addEventListener('click',schedule);schedule();return true;}
if(typeof window!=='undefined'&&window.__worldsim)installMilitaryDesignUi(window.__worldsim);
