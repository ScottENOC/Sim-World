import { EXERCISE_MISSIONS, eligibleExerciseAllies, startCombinedExercise, combinedExerciseSummary } from '../military/combinedExercises.js?v=20260919-exercises1';

const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(v)=>`${Math.round(Math.max(0,Math.min(1,Number(v)||0))*100)}%`;

function activeFor(region,land,sea){return [...land,...sea].flatMap(h=>(h.combinedExercises||[]).filter(x=>x.active&&x.participants?.some(p=>p.regionId===region.id)).map(x=>({host:h,exercise:x})));}

export function renderCombinedExerciseControls(container,region,{regions=[],seaRegions=[],agreements=[],fleets=[],currentTick=0,onAction=null}={}){
  if(!container||!region)return null;
  const allies=eligibleExerciseAllies(region,regions,agreements),summary=combinedExerciseSummary(region),active=activeFor(region,regions,seaRegions);
  const hostIds=new Set([region.id,...allies.map(a=>a.id)]);for(const r of [region,...allies])for(const id of r.adjacentSeaIds||[])hostIds.add(id);
  const hosts=[...regions,...seaRegions].filter(r=>hostIds.has(r.id));
  const section=document.createElement('div');section.className='raid-section combined-exercise-section';
  const allyHtml=allies.length?allies.map(a=>`<label class="control-row"><span>${esc(a.name)}</span><input type="checkbox" data-exercise-ally value="${esc(a.id)}" checked></label>`).join(''):'<div class="raid-status">No military ally is currently eligible for combined exercises.</div>';
  const activeHtml=active.length?active.map(({host,exercise})=>`<div class="raid-status"><strong>${esc(EXERCISE_MISSIONS[exercise.missionType?.toUpperCase()]?.label||exercise.missionType)}</strong> at ${esc(host.name||host.id)} · ${exercise.participants.length} participants · ${Math.max(0,Math.ceil(exercise.durationWeeks-exercise.elapsedWeeks))} weeks remaining</div>`).join(''):'<div class="raid-status">No combined exercise currently under way.</div>';
  section.innerHTML=`<strong>Combined allied exercises</strong>
    <div class="raid-status">Domestic forces train automatically in peacetime. Combined exercises additionally build interoperability and let allies exchange mission-specific experience.</div>
    ${activeHtml}
    <label class="control-row">Exercise area<select data-exercise-host>${hosts.map(h=>`<option value="${esc(h.id)}">${esc(h.name||h.id)}${h.isSea||h.type==='sea'?' (sea)':''}</option>`).join('')}</select></label>
    <label class="control-row">Mission<select data-exercise-mission>${Object.values(EXERCISE_MISSIONS).map(m=>`<option value="${m.id}">${esc(m.label)}</option>`).join('')}</select></label>
    <label class="control-row">Duration<select data-exercise-duration><option value="8">8 weeks</option><option value="12" selected>12 weeks</option><option value="24">24 weeks</option></select></label>
    <label class="control-row">Scale<select data-exercise-scale><option value="0.1">Small</option><option value="0.2" selected>Medium</option><option value="0.35">Large</option></select></label>
    <div class="raid-status"><strong>Invite allies</strong></div>${allyHtml}
    <button data-start-combined-exercise ${allies.length?'':'disabled'}>Begin combined exercise</button><div class="raid-status" data-exercise-result></div>
    <div class="raid-status">Training: general war ${pct(summary.skills.general_war)} · defence ${pct(summary.skills.defence)} · coastal assault ${pct(summary.skills.coastal_assault)}</div>`;
  container.appendChild(section);
  section.querySelector('[data-start-combined-exercise]')?.addEventListener('click',()=>{
    const participantRegionIds=[...section.querySelectorAll('[data-exercise-ally]:checked')].map(x=>x.value),result=startCombinedExercise({organiserRegionId:region.id,hostRegionId:section.querySelector('[data-exercise-host]')?.value,participantRegionIds,missionType:section.querySelector('[data-exercise-mission]')?.value,durationWeeks:Number(section.querySelector('[data-exercise-duration]')?.value)||12,scale:Number(section.querySelector('[data-exercise-scale]')?.value)||.2},regions,seaRegions,agreements,currentTick,fleets);
    const out=section.querySelector('[data-exercise-result]');if(out)out.textContent=result.started?'Forces are deploying; combined training has begun.':`Exercise could not begin (${String(result.reason||'unknown').replaceAll('_',' ')}).`;onAction?.(result);
  });
  return section;
}
