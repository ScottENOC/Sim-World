import { ensureLabourRelations, setPolityLabourPolicy, BARGAINING_POLICIES, STRIKE_LAWS, POLICE_RESPONSES } from '../society/labourRelations.js?v=20260918-labour-relations1';

const pct=(v)=>`${Math.round((Number(v)||0)*100)}%`;
function selectedRegion(){const w=globalThis.__worldsim,id=w?.map?.selectedId;return w?.regions?.find?.(r=>r.id===id)||null;}
function playerPolityId(){return globalThis.__worldsim?.activePlayerPolityId||null;}
function canRule(region){const id=playerPolityId();return Boolean(region&&id&&(region.governance?.sovereignPolityId===id||region.governance?.localPolityId===id));}
function optionMap(obj,current){return Object.entries(obj).map(([id,d])=>`<option value="${id}" ${current===id?'selected':''}>${d.label}</option>`).join('');}

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
    ${r.repressionMemory>0.03?`Repression memory ${pct(r.repressionMemory)} · `:''}${r.hiringPenalty>0.005?`wage-floor hiring drag ${pct(r.hiringPenalty)} · `:''}${r.protectionCost>0.005?`protection cost pressure ${pct(r.protectionCost)}`:''}</div>
    <label class="control-row">Minimum wage floor <span id="labour-min-wage-label">${pct(s.policy.minimumWageRatio)} of reference wage</span>
      <input id="labour-min-wage" type="range" min="0" max="125" step="5" value="${Math.round(s.policy.minimumWageRatio*100)}">
    </label>
    <label class="control-row">Collective bargaining<select id="labour-bargaining">${optionMap(BARGAINING_POLICIES,s.policy.collectiveBargaining)}</select></label>
    <label class="control-row">Strike law<select id="labour-strike-law">${optionMap(STRIKE_LAWS,s.policy.strikeLaw)}</select></label>
    <label class="control-row">Police response<select id="labour-police">${optionMap(POLICE_RESPONSES,s.policy.policeResponse)}</select></label>
    <label class="control-row">Import protection <span id="labour-protection-label">${pct(s.policy.importProtection)}</span>
      <input id="labour-protection" type="range" min="0" max="60" step="5" value="${Math.round(s.policy.importProtection*100)}">
    </label>
    <div class="raid-status">These policies apply across your polity. Wage floors can reduce low-pay grievance but can discourage hiring if set above current productive capacity. Protection can shelter import-competing jobs but raises input/consumer costs. Police action and strike bans can restore output quickly, but repeated coercion damages bargaining trust and makes future conflict harder to settle.</div>`;
  host.appendChild(panel);
  const apply=(patch)=>setPolityLabourPolicy(globalThis.__worldsim?.regions||[],playerPolityId(),patch,{playerChoice:true});
  document.getElementById('labour-min-wage')?.addEventListener('input',e=>{const v=Number(e.target.value)/100;apply({minimumWageRatio:v});document.getElementById('labour-min-wage-label').textContent=`${pct(v)} of reference wage`;});
  document.getElementById('labour-bargaining')?.addEventListener('change',e=>apply({collectiveBargaining:e.target.value}));
  document.getElementById('labour-strike-law')?.addEventListener('change',e=>apply({strikeLaw:e.target.value}));
  document.getElementById('labour-police')?.addEventListener('change',e=>apply({policeResponse:e.target.value}));
  document.getElementById('labour-protection')?.addEventListener('input',e=>{const v=Number(e.target.value)/100;apply({importProtection:v});document.getElementById('labour-protection-label').textContent=pct(v);});
}

function install(){const host=document.getElementById('region-controls');if(!host)return;const observer=new MutationObserver(()=>queueMicrotask(renderLabourRelationsControls));observer.observe(host,{childList:true});renderLabourRelationsControls();}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
