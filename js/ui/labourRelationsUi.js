import { ensureLabourRelations, setPolityLabourPolicy, BARGAINING_POLICIES, STRIKE_LAWS, POLICE_RESPONSES } from '../society/labourRelations.js?v=20260918-labour-relations1';

const pct=(v)=>`${Math.round((Number(v)||0)*100)}%`;
function selectedRegion(){const w=globalThis.__worldsim,id=w?.map?.selectedId;return w?.regions?.find?.(r=>r.id===id)||null;}
function playerPolityId(){return globalThis.__worldsim?.activePlayerPolityId||null;}
function canRule(region){const id=playerPolityId();return Boolean(region&&id&&(region.governance?.sovereignPolityId===id||region.governance?.localPolityId===id));}
function optionMap(obj,current){return Object.entries(obj).map(([id,d])=>`<option value="${id}" ${current===id?'selected':''}>${d.label}</option>`).join('');}
function applyPolity(patch){return setPolityLabourPolicy(globalThis.__worldsim?.regions||[],playerPolityId(),patch,{playerChoice:true});}

export function renderLabourRelationsControls(){
  const host=typeof document!=='undefined'?document.getElementById('region-controls'):null;
  if(!host||host.querySelector('#labour-relations-panel'))return;
  const region=selectedRegion();if(!canRule(region))return;
  const s=ensureLabourRelations(region),r=region.report?.labourRelations||{};
  const panel=document.createElement('div');panel.id='labour-relations-panel';panel.className='raid-section labour-relations-section';
  const strike=r.activeStrike?`<strong>STRIKE ACTIVE</strong> · ${pct(r.strikeIntensity)} effective participation · ${Number(r.strikeWeeks||0).toFixed(1)} weeks`:`No active strike · pressure ${pct(r.strikePressure)}`;
  panel.innerHTML=`<strong>Industrial relations</strong>
    <div class="raid-status">Union density ${pct(r.unionDensity)} · grievance ${pct(r.grievance)} · bargaining trust ${pct(r.bargainingTrust)}<br>${strike}<br>
    ${r.patrioticRestraint>0.05?`Defence-emergency restraint ${pct(r.patrioticRestraint)} · `:''}Industrial output ${pct(r.outputMultiplier??1)} · munitions output ${pct(r.munitionsMultiplier??1)}<br>
    ${r.repressionMemory>0.03?`Repression memory ${pct(r.repressionMemory)} · `:''}${r.hiringPenalty>0.005?`wage-floor hiring drag ${pct(r.hiringPenalty)}`:''}</div>
    <label class="control-row">Minimum wage floor <span id="labour-min-wage-label">${pct(s.policy.minimumWageRatio)} of reference wage</span>
      <input id="labour-min-wage" type="range" min="0" max="125" step="5" value="${Math.round(s.policy.minimumWageRatio*100)}">
    </label>
    <label class="control-row">Collective bargaining<select id="labour-bargaining">${optionMap(BARGAINING_POLICIES,s.policy.collectiveBargaining)}</select></label>
    <label class="control-row">Strike law<select id="labour-strike-law">${optionMap(STRIKE_LAWS,s.policy.strikeLaw)}</select></label>
    <label class="control-row">Police response<select id="labour-police">${optionMap(POLICE_RESPONSES,s.policy.policeResponse)}</select></label>
    <div class="raid-status">These labour policies apply across your polity. Wage floors can reduce low-pay grievance but can discourage hiring if set above current productive capacity. Trade protection is controlled through the existing per-good import/export policy system, so bans and future tariffs affect labour through actual trade, prices and jobs rather than a second slider. Police action and strike bans can restore output quickly, but repeated coercion damages bargaining trust and makes future conflict harder to settle.</div>`;
  host.appendChild(panel);
  document.getElementById('labour-min-wage')?.addEventListener('input',e=>{const v=Number(e.target.value)/100;applyPolity({minimumWageRatio:v});document.getElementById('labour-min-wage-label').textContent=`${pct(v)} of reference wage`;});
  document.getElementById('labour-bargaining')?.addEventListener('change',e=>applyPolity({collectiveBargaining:e.target.value}));
  document.getElementById('labour-strike-law')?.addEventListener('change',e=>applyPolity({strikeLaw:e.target.value}));
  document.getElementById('labour-police')?.addEventListener('change',e=>applyPolity({policeResponse:e.target.value}));
}

function showLabourNotice(detail){
  document.getElementById('labour-relations-notice')?.remove();
  const box=document.createElement('div');box.id='labour-relations-notice';
  box.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:10000;max-height:58vh;overflow:auto;background:rgba(20,24,28,.96);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:12px;padding:12px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:14px system-ui';
  const started=detail.type==='strike_started',ended=detail.type==='strike_ended';
  const title=started?`Strike begins in ${detail.regionName}`:ended?`Strike ends in ${detail.regionName}`:`Labour tensions rising in ${detail.regionName}`;
  const causes=(detail.causes||[]).map(c=>`<li>${c}</li>`).join('');
  box.innerHTML=`<strong style="font-size:16px">${title}</strong>${causes?`<ul>${causes}</ul>`:''}${ended?`<div>The dispute lasted ${Number(detail.durationWeeks||0).toFixed(1)} weeks.</div>`:`<div>This is not a random event: current wages, prices, job security, working conditions, bargaining institutions and prior coercion are driving the pressure.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
      <button data-labour-quick="recognise">Recognise bargaining</button>
      <button data-labour-quick="wage">Raise wage floor modestly</button>
      <button data-labour-quick="order">Police keep order</button>
      <button data-labour-quick="force">Break strike by force</button>
    </div>
    <div style="margin-top:8px;font-size:12px;opacity:.85">Recognition and wage policy can lower the underlying grievance; coercion restores more output immediately but builds repression memory and weakens future bargaining trust.</div>`}
    <button data-labour-close style="margin-top:10px">Dismiss</button>`;
  document.body.appendChild(box);
  box.querySelector('[data-labour-close]')?.addEventListener('click',()=>box.remove());
  box.querySelector('[data-labour-quick="recognise"]')?.addEventListener('click',()=>{applyPolity({collectiveBargaining:'recognised',policeResponse:'negotiate'});box.remove();});
  box.querySelector('[data-labour-quick="wage"]')?.addEventListener('click',()=>{const region=(globalThis.__worldsim?.regions||[]).find(r=>(r.governance?.sovereignPolityId||r.polityId)===playerPolityId());const current=ensureLabourRelations(region||{}).policy.minimumWageRatio;applyPolity({minimumWageRatio:Math.min(1.25,current+.1),policeResponse:'negotiate'});box.remove();});
  box.querySelector('[data-labour-quick="order"]')?.addEventListener('click',()=>{applyPolity({policeResponse:'keep_order'});box.remove();});
  box.querySelector('[data-labour-quick="force"]')?.addEventListener('click',()=>{applyPolity({strikeLaw:'banned',policeResponse:'force'});box.remove();});
}

function install(){
  const host=document.getElementById('region-controls');if(host){const observer=new MutationObserver(()=>queueMicrotask(renderLabourRelationsControls));observer.observe(host,{childList:true});renderLabourRelationsControls();}
  globalThis.addEventListener?.('labourrelations:notice',e=>showLabourNotice(e.detail));
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
