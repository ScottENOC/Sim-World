const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(v)=>`${Math.round(Math.max(0,Math.min(1,Number(v)||0))*100)}%`;
function actorId(r){return r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;}
function waitForUi(cb,n=0){const w=window.__worldsim,m=document.getElementById('fleet-modal');if(w?.fleetApi&&w?.aviationApi&&m)return cb(w,m);if(n<120)setTimeout(()=>waitForUi(cb,n+1),100);}
function portRegion(world,fleet){return fleet.locationType==='port'?world.regions.find(r=>r.id===fleet.portRegionId):null;}
function targetOptions(world,fleet){
  if(fleet.locationType!=='sea')return '';
  const sea=world.seaRegions.find(s=>s.id===fleet.seaRegionId),coastal=new Set(sea?.adjacentLand||[]);
  const ids=new Set(coastal);for(const id of coastal)for(const n of world.regions.find(r=>r.id===id)?.neighbors||[])ids.add(n);
  return world.regions.filter(r=>ids.has(r.id)).map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
}
function renderCarrierSections(world){
  const modal=document.getElementById('fleet-modal');if(!modal||modal.classList.contains('hidden'))return;
  for(const card of modal.querySelectorAll('[data-fleet-card]')){
    const fleet=world.fleets.find(f=>f.id===card.dataset.fleetCard);if(!fleet||fleet.ownerActorId!==world.activePlayerPolityId)continue;
    const summary=world.aviationApi.carrierAirWingSummary(world.regions,fleet),hasCarrier=summary.carriers.length>0;
    let panel=card.querySelector('[data-carrier-air-wing]');
    if(!hasCarrier){panel?.remove();continue;}
    if(!panel){panel=document.createElement('div');panel.dataset.carrierAirWing='1';panel.className='raid-status';panel.style.cssText='margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12)';card.appendChild(panel);}
    const port=portRegion(world,fleet),available=port?(port.aviation?.aircraft||[]).filter(a=>a.ownerType==='military'&&a.baseType!=='carrier'&&a.status!=='destroyed'):[];
    const carriers=summary.carriers.map(c=>`<div style="margin:8px 0"><strong>${esc(c.name)}</strong> · air group ${c.count}/${c.capacity}<br>${c.aircraft.map(a=>`${esc(a.modelName||a.role||a.id)} (${esc(a.role)}) ${pct(a.condition)}${a.mission&&a.mission!=='idle'?` · ${esc(a.mission)}`:''}`).join('<br>')||'<small>No embarked aircraft.</small>'}</div>`).join('');
    const carrierChoices=summary.carriers.map(c=>`<option value="${esc(c.carrierId)}">${esc(c.name)} (${c.count}/${c.capacity})</option>`).join('');
    const aircraftChoices=available.map(a=>`<option value="${esc(a.id)}">${esc(a.modelName||a.role||a.id)} · ${esc(a.role)}</option>`).join('');
    const embarked=summary.carriers.flatMap(c=>c.aircraft),embarkedChoices=embarked.map(a=>`<option value="${esc(a.id)}">${esc(a.modelName||a.role||a.id)} · ${esc(a.role)}</option>`).join('');
    const targets=targetOptions(world,fleet);
    panel.innerHTML=`<strong>Carrier aviation</strong><br>Fleet aviation fuel ${summary.aviationFuel.toFixed(1)} / ${summary.aviationFuelCapacity.toFixed(1)} · ${summary.oilers} fleet oiler${summary.oilers===1?'':'s'}${carriers}
      ${port&&available.length?`<label class="control-row">Embark aircraft <select data-carrier-aircraft>${aircraftChoices}</select></label><label class="control-row">Carrier <select data-carrier-ship>${carrierChoices}</select></label><button data-embark-aircraft>Embark</button>`:''}
      ${port&&embarked.length?` <button data-disembark-aircraft>Disembark selected aircraft</button>`:''}
      ${embarked.length&&fleet.locationType==='sea'?`<label class="control-row">Air-group aircraft <select data-embarked-aircraft>${embarkedChoices}</select></label><label class="control-row">Mission <select data-carrier-mission><option value="scout">Scout</option><option value="intercept">Intercept</option><option value="attack">Attack</option><option value="idle">Stand down</option></select></label><label class="control-row">Target <select data-carrier-target>${targets}</select></label><button data-carrier-order>Issue air order</button>`:''}
      <div data-carrier-status></div>`;
    const status=panel.querySelector('[data-carrier-status]');
    panel.querySelector('[data-embark-aircraft]')?.addEventListener('click',()=>{const a=panel.querySelector('[data-carrier-aircraft]')?.value,c=panel.querySelector('[data-carrier-ship]')?.value,res=world.aviationApi.embarkAircraftOnCarrier(port,fleet,a,c);status.textContent=res.embarked?'Aircraft embarked.':`Could not embark (${String(res.reason||'unknown').replaceAll('_',' ')}).`;if(res.embarked)queueMicrotask(()=>renderCarrierSections(world));});
    panel.querySelector('[data-disembark-aircraft]')?.addEventListener('click',()=>{const select=panel.querySelector('[data-embarked-aircraft]')||null,a=select?.value||embarked[0]?.id,res=world.aviationApi.disembarkAircraftFromCarrier(port,fleet,a);status.textContent=res.disembarked?'Aircraft returned to the airfield.':`Could not disembark (${String(res.reason||'unknown').replaceAll('_',' ')}).`;if(res.disembarked)queueMicrotask(()=>renderCarrierSections(world));});
    panel.querySelector('[data-carrier-order]')?.addEventListener('click',()=>{const a=panel.querySelector('[data-embarked-aircraft]')?.value,m=panel.querySelector('[data-carrier-mission]')?.value,t=panel.querySelector('[data-carrier-target]')?.value||null,home=world.regions.find(r=>(r.aviation?.aircraft||[]).some(x=>x.id===a)),res=world.aviationApi.assignCarrierAircraftMission(home,fleet,a,m,t,world.regions,world.seaRegions);status.textContent=res.assigned?'Carrier air order issued.':`Could not issue order (${String(res.reason||'unknown').replaceAll('_',' ')}).`;});
  }
}
waitForUi((world,modal)=>{document.getElementById('btn-fleets')?.addEventListener('click',()=>setTimeout(()=>renderCarrierSections(world),0));new MutationObserver(()=>{if(!modal.classList.contains('hidden'))setTimeout(()=>renderCarrierSections(world),0);}).observe(modal,{attributes:true,subtree:true,childList:true,attributeFilter:['class']});});
