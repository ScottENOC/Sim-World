const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0).toFixed(2);
function actorId(r){return r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;}
function waitForFleetUi(callback,attempt=0){
  const world=window.__worldsim,modal=document.getElementById('fleet-modal');
  if(world?.fleetApi&&modal)return callback(world,modal);
  if(attempt<120)setTimeout(()=>waitForFleetUi(callback,attempt+1),100);
}
function designRegion(world){
  const owned=(world.regions||[]).filter(r=>actorId(r)===world.activePlayerPolityId&&r.isCoastal);
  return owned.find(r=>(r.construction?.assets||[]).some(a=>['shipyard','naval_base'].includes(a.typeId)&&(a.condition??1)>.15))||owned[0]||null;
}
function slider(key,label,value=1){return `<label class="control-row"><span>${esc(label)} <small data-value-for="${esc(key)}">${Number(value).toFixed(1)}×</small></span><input data-priority="${esc(key)}" type="range" min="0.5" max="2" step="0.1" value="${Number(value)}"></label>`;}
function selectOptions(options,current){return (options||[]).map(o=>`<option value="${esc(o.id)}" ${o.id===current?'selected':''} ${o.available?'':'disabled'}>${esc(o.label)}${o.available?'':` — ${esc(o.reason||'unavailable')}`}</option>`).join('');}
function renderPreview(panel,world,region){
  const api=world.fleetApi,classId=panel.querySelector('[data-naval-class]')?.value;if(!classId)return;
  const priorities={};panel.querySelectorAll('[data-priority]').forEach(el=>{priorities[el.dataset.priority]=Number(el.value)||1;panel.querySelector(`[data-value-for="${el.dataset.priority}"]`)?.replaceChildren(`${Number(el.value).toFixed(1)}×`);});
  const choices={superstructure:panel.querySelector('[data-superstructure]')?.value,seawaterSystems:panel.querySelector('[data-seawater]')?.value,pressureHull:panel.querySelector('[data-pressure-hull]')?.value||null,priorities};
  const p=api.previewNavalDesign(region,classId,choices),quote=api.quoteNavalMarkUpgrade(region,classId,choices),out=panel.querySelector('[data-naval-preview]');if(!p||!out)return;
  const materials=Object.entries(p.systemInputs||{}).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k} ${Number(v).toFixed(1)}`).join(' · ')||'no specialist light metals';
  const sub=classId==='submarine';
  out.innerHTML=`<strong>Preview</strong><br>${sub?`Speed ${num(p.speed)} · test-depth ×${num(p.testDepthMultiplier)} · signature ${num(p.signature)} · torpedo ${num(p.torpedoEffect)}`:`Speed ${num(p.speed)} · combat ${num(p.combat)} · durability ${num(p.durability)} · armour ${num(p.armour)} · radar ${num(p.radarSearch)}`}<br>Endurance ×${num(p.enduranceMultiplier)} · corrosion ${Math.round((p.corrosionResistance||0)*100)}% · fire resistance ${Math.round((p.fireResistance||1)*100)}%<br><small>Construction: ${esc(materials)}${p.steelConstructionMultiplier!==1?` · steel hull/base requirement ×${num(p.steelConstructionMultiplier)}`:''}. Design/tooling: ${quote.available?`${quote.machineComponents.toFixed(1)} machine components · ${quote.treasury.toFixed(1)} treasury · ${quote.downtimeWeeks} weeks`:`${esc(quote.reason||'unavailable')}`}.</small>`;
  panel._navalChoices=choices;
}
function renderBureau(world,modal){
  let panel=modal.querySelector('#naval-design-bureau');if(!panel){panel=document.createElement('section');panel.id='naval-design-bureau';panel.className='raid-section';panel.style.cssText='margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.16);border-radius:10px';modal.querySelector('#fleet-list')?.before(panel);}
  const region=designRegion(world),api=world.fleetApi;if(!region){panel.innerHTML='<h3>Naval Design Bureau</h3><p class="raid-status">No player-controlled coastal design office is available.</p>';return;}
  const classes=api.navalDesignClassOptions(region);if(!classes.length){panel.innerHTML='<h3>Naval Design Bureau</h3><p class="raid-status">Industrial warship design becomes available with steel hulls, steam warships and later naval technologies.</p>';return;}
  const priorClass=panel.querySelector('[data-naval-class]')?.value;const classId=classes.some(c=>c.id===priorClass)?priorClass:classes[0].id,current=api.currentNavalDesign(region,classId);const mats=api.navalDesignMaterialOptions(region,classId),choices=current?.designChoices||{superstructure:'steel',seawaterSystems:'conventional',pressureHull:'steel',priorities:{}};const sub=classId==='submarine';
  const defs=sub?[['speed','Speed'],['depth','Diving depth'],['stealth','Stealth'],['endurance','Endurance'],['firepower','Torpedo/firepower'],['reliability','Reliability']]:[['speed','Speed'],['endurance','Endurance'],['firepower','Firepower'],['protection','Protection'],['sensors','Sensors/topweight'],['reliability','Reliability']];
  panel.innerHTML=`<h3>Naval Design Bureau</h3><p class="raid-status">Design choices affect new construction and later refits. Steel remains the structural baseline; aluminium is a topside weight choice, while titanium is reserved for corrosion-critical machinery and, on submarines, an optional pressure hull.</p>
    <label class="control-row">Class <select data-naval-class>${classes.map(c=>`<option value="${esc(c.id)}" ${c.id===classId?'selected':''}>${esc(c.label)}</option>`).join('')}</select></label>
    ${!sub?`<label class="control-row">Superstructure <select data-superstructure>${selectOptions(mats.superstructure,choices.superstructure)}</select></label>`:''}
    <label class="control-row">Seawater & machinery systems <select data-seawater>${selectOptions(mats.seawaterSystems,choices.seawaterSystems)}</select></label>
    ${sub?`<label class="control-row">Pressure hull <select data-pressure-hull>${selectOptions(mats.pressureHull,choices.pressureHull)}</select></label>`:''}
    <details><summary>Design priorities</summary>${defs.map(([k,l])=>slider(k,l,choices.priorities?.[k]||1)).join('')}</details>
    <div data-naval-preview class="raid-status" style="margin-top:8px"></div>
    <button data-authorise-naval-mark>Authorise new design</button><div data-naval-status class="raid-status"></div>`;
  panel.querySelector('[data-naval-class]')?.addEventListener('change',()=>renderBureau(world,modal));
  panel.querySelectorAll('select:not([data-naval-class]),input').forEach(el=>el.addEventListener('input',()=>renderPreview(panel,world,region)));
  panel.querySelector('[data-authorise-naval-mark]')?.addEventListener('click',()=>{const id=panel.querySelector('[data-naval-class]')?.value,result=api.authoriseNavalMark(region,id,{authorisedBy:'player',choices:panel._navalChoices||{}}),status=panel.querySelector('[data-naval-status]');status.textContent=result.authorised?`${result.design.name} authorised. Shipyard tooling will take ${result.downtimeWeeks} weeks; existing ships retain their current design until refitted.`:`Design not authorised (${String(result.reason||'requirements').replaceAll('_',' ')}).`;if(result.authorised)renderBureau(world,modal);});
  renderPreview(panel,world,region);
}
waitForFleetUi((world,modal)=>{
  const btn=document.getElementById('btn-fleets');btn?.addEventListener('click',()=>queueMicrotask(()=>renderBureau(world,modal)));
  new MutationObserver(()=>{if(!modal.classList.contains('hidden'))renderBureau(world,modal);}).observe(modal,{attributes:true,attributeFilter:['class']});
});
