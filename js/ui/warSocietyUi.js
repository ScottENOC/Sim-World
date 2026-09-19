import { WAR_INFORMATION_POLICIES, setWarInformationPolicy, warSocietySummary } from '../society/warSociety.js?v=20260919-war-society1';

const pct=(v)=>`${Math.round((Number(v)||0)*100)}%`;
export function renderWarSocietyControls(container,polity,{onAction=null}={}){
  if(!container||!polity)return;const s=warSocietySummary(polity);const wrap=document.createElement('div');wrap.className='raid-section war-society-section';
  wrap.innerHTML=`<strong>War and society</strong><div class="raid-status">Weariness ${pct(s.warWeariness)} · trauma burden ${pct(s.combatTraumaBurden)} · public knowledge ${pct(s.publicWarKnowledge)} · war legitimacy ${pct(s.warLegitimacy)} · government credibility ${pct(s.credibility)}</div><label class="control-row">War correspondence<select data-war-information>${Object.values(WAR_INFORMATION_POLICIES).map(p=>`<option value="${p.id}" ${p.id===s.informationPolicy?'selected':''}>${p.label}</option>`).join('')}</select></label>`;
  wrap.querySelector('[data-war-information]')?.addEventListener('change',e=>{setWarInformationPolicy(polity,e.target.value,{playerIssued:true});onAction?.();});container.appendChild(wrap);
}
