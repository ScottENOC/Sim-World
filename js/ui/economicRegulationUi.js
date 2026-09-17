import { ECONOMIC_REGULATIONS, economicRegulatoryCapacity, ensureEconomicRegulation, regulationAvailability, setEconomicRegulation, applyRegulationToTerritories } from '../economy/economicRegulation.js';
import { authoriseRuntimeGovernmentAction } from '../politics/institutionalRuntimeAuthority.js';

const pct=v=>`${Math.round(Math.max(0,Math.min(1,Number(v)||0))*100)}%`;
let message='';
function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||null;}
function playerState(sim){const id=sim?.activePlayerPolityId,polity=sim?.polities?.find(p=>p.id===id)||null,territories=sim?.regions?.filter(r=>polityId(r)===id)||[];return{id,polity,territories};}
function reasonText(reason){return ({administrative_capacity:'The state lacks the administrative capacity to enforce this reliably.',inspection_capacity:'A durable inspection service and records are required.',enforcement_capacity:'The state lacks enough officials and records to enforce service standards.',audit_capacity:'Auditing maintenance requires stronger accounting and records.',permitting_capacity:'Permitting requires a capable bureaucracy, records and technical knowledge.',financial_legal_capacity:'Rehabilitation bonds require strong administration plus developed finance and corporate law.'})[reason]||'The government cannot yet administer this instrument.';}
function render(sim,panel){
  const{polity,territories}=playerState(sim);if(!polity){panel.innerHTML='';return;}
  const state=ensureEconomicRegulation(polity),availability=regulationAvailability(polity,territories),capacity=economicRegulatoryCapacity(polity,territories);
  const rows=Object.entries(ECONOMIC_REGULATIONS).map(([id,def])=>{const a=availability[id],level=state.levels[id]||0;if(!a.available)return `<div class="advisor-note regulation-locked"><strong>${def.label}</strong><br><small>Not yet administratively credible. ${reasonText(a.reason)}</small></div>`;return `<label class="advisor-field"><span>${def.label} <small>${def.description}</small></span><input type="range" min="0" max="1" step="0.1" value="${level}" data-economic-regulation="${id}"><strong>${pct(level)}</strong></label>`;}).join('');
  panel.innerHTML=`<h3>Economic regulation</h3><p class="advisor-voice">“A law we cannot inspect, record or enforce is only a proclamation. As the state grows more capable, more sophisticated regulation becomes possible.”</p>${message?`<p class="advisor-note">${message}</p>`:''}<div class="advisor-report-row"><span>Regulatory administrative capacity</span><strong>${pct(capacity.general)}</strong></div><p class="advisor-note">Controls appear only when the administration can plausibly administer them. Complex instruments also require supporting legal, financial and technical institutions.</p>${rows}`;
  panel.querySelectorAll('[data-economic-regulation]').forEach(input=>input.addEventListener('change',()=>{
    const seat=territories.find(r=>r.id===sim?.fogOfWar?.playerRegionId)||territories[0];if(!seat)return;
    const auth=authoriseRuntimeGovernmentAction(seat,'change_economic_policy',{polities:sim.polities,currentTick:sim.clock?.tickIndex||0,context:{publicSupport:.5}});
    if(!auth.allowed){message='The change was refused by the institutions that hold economic-regulation power.';render(sim,panel);return;}
    const result=setEconomicRegulation(polity,input.dataset.economicRegulation,Number(input.value),{territories});
    if(!result.changed){message=reasonText(result.reason);render(sim,panel);return;}
    applyRegulationToTerritories(polity,territories);message=`${ECONOMIC_REGULATIONS[input.dataset.economicRegulation].label} set to ${pct(input.value)}.`;render(sim,panel);
  }));
}
function maybeMount(sim){const content=document.getElementById('advisor-content'),treasurer=document.querySelector('[data-advisor="treasurer"]');if(!content||!treasurer?.classList.contains('active'))return;let panel=document.getElementById('economic-regulation-advisor-panel');if(!panel){panel=document.createElement('section');panel.id='economic-regulation-advisor-panel';panel.className='advisor-section';content.appendChild(panel);}render(sim,panel);}
export function installEconomicRegulationUi(sim=window.__worldsim){const content=document.getElementById('advisor-content');if(!sim||!content||content.dataset.economicRegulationUiInstalled==='true')return false;content.dataset.economicRegulationUiInstalled='true';let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;maybeMount(sim);});};new MutationObserver(schedule).observe(content,{childList:true,subtree:false});document.getElementById('advisor-tabs')?.addEventListener('click',schedule);document.getElementById('btn-council')?.addEventListener('click',schedule);schedule();return true;}
if(typeof window!=='undefined'&&window.__worldsim)installEconomicRegulationUi(window.__worldsim);
