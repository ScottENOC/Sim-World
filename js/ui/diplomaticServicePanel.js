import { DIPLOMAT_AUTHORITY, attemptBribeDiplomat, detainDiplomat, diplomatPublicProfile, dispatchDiplomat, diplomatsFor, expelDiplomat, foreignGovernmentTrust, recallDiplomat, releaseDiplomat, setDiplomatAuthority } from '../diplomacy/diplomats.js?v=20260909-agent-trust1';
import { authoriseRuntimeGovernmentAction } from '../politics/institutionalRuntimeAuthority.js?v=20260916-institution-diplomacy1';
import { fundPoliticalDestabilisation, fundRestorationOperation, restorationTarget } from '../politics/foreignPoliticalIntervention.js?v=20260917-intervention1';

const pct = (v) => `${Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100)}%`;
const actorId = (r) => r?.governance?.sovereignPolityId || r?.controllingActorId || r?.id;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function statusText(d, regionsById) {
  const host = d.postedRegionId ? regionsById.get(d.postedRegionId) : null;
  if (d.status === 'posted') return `Posted to ${host?.name || d.postedRegionId}`;
  if (d.status === 'en_route') return `Travelling to ${host?.name || d.postedRegionId}`;
  if (d.status === 'returning') return `Returning from ${host?.name || d.postedRegionId}`;
  if (d.status === 'detained') return `Detained in ${host?.name || d.postedRegionId}`;
  return 'At court';
}

function languageSummary(d, regionsById) {
  const skills = Object.entries(d.languageSkills || {}).sort((a,b) => Number(b[1]?.spoken || b[1] || 0) - Number(a[1]?.spoken || a[1] || 0)).slice(0,3);
  if (!skills.length) return 'No notable foreign-language competence';
  return skills.map(([id, skill]) => `${esc(String(id).replace(/^lang:/,''))} ${pct(skill?.spoken ?? skill)}`).join(' · ');
}

export function diplomaticServiceView(home, regions) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const own = diplomatsFor(home).map((d) => {
    const p = diplomatPublicProfile(d);
    return { ...p, statusText: statusText(d, regionsById), languages: languageSummary(d, regionsById), maxMilitaryCommitmentFraction: d.maxMilitaryCommitmentFraction || 0 };
  });
  const foreign = [];
  for (const origin of regions) {
    if (origin.id === home.id) continue;
    for (const d of diplomatsFor(origin)) {
      if (d.postedRegionId !== home.id || !['posted','detained'].includes(d.status)) continue;
      const p = diplomatPublicProfile(d);
      foreign.push({ ...p, homeRegionId: origin.id, homeName: origin.name, governmentTrust: foreignGovernmentTrust(home, actorId(origin)) });
    }
  }
  return { own, foreign };
}

function ownCard(d, regions) {
  const homeTargets = regions.filter((r) => r.id !== d.homeRegionId);
  const authorityOptions = Object.values(DIPLOMAT_AUTHORITY).map((a) => `<option value="${a}" ${d.authority===a?'selected':''}>${a.replaceAll('_',' ')}</option>`).join('');
  const posting = d.status === 'home'
    ? `<select data-dip-target="${esc(d.id)}"><option value="">— choose court —</option>${homeTargets.map((r)=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select><button data-dip-dispatch="${esc(d.id)}">Post envoy</button>`
    : d.status === 'posted' ? `<button data-dip-recall="${esc(d.id)}">Recall</button>` : '';
  return `<div class="raid-status diplomatic-agent-card" data-own-diplomat="${esc(d.id)}"><strong>${esc(d.name)}</strong> · ${esc(d.statusText)}<br>
    Reliability ${pct(d.reliability)} · loyalty ${pct(d.loyalty)} · suspicion ${pct(d.suspectedCompromise)}<br>
    Languages: ${d.languages}<br>
    <label class="control-row">Mandate <select data-dip-authority="${esc(d.id)}">${authorityOptions}</select></label>
    <label class="control-row">Maximum military commitment <span>${pct(d.maxMilitaryCommitmentFraction)}</span><input data-dip-commitment="${esc(d.id)}" type="range" min="0" max="80" value="${Math.round(d.maxMilitaryCommitmentFraction*100)}"></label>
    ${posting}</div>`;
}

function interventionTargets(home, regions, options = {}) {
  const polities = options.polities || [];
  const sponsorId = actorId(home);
  const sponsor = polities.find((candidate) => candidate.id === sponsorId) || null;
  const visible = new Set(options.visiblePolityIds || []);
  const exiles = polities
    .filter((candidate) => candidate.continuity?.status === 'exile')
    .map((exile) => ({ exile, target: restorationTarget(exile, polities) }))
    .filter(({ exile, target }) => target && target.id !== sponsorId &&
      (exile.continuity?.hostPolityId === sponsorId || (exile.continuity?.exileSupport?.[sponsorId] || 0) >= 0.1));
  const destabilise = polities.filter((candidate) => candidate.id !== sponsorId && candidate.continuity?.status !== 'exile' &&
    (!visible.size || visible.has(candidate.id)));
  return { sponsor, exiles, destabilise };
}

function interventionHtml(view) {
  if (!view.sponsor) return '';
  const exileOptions = view.exiles.map(({ exile, target }) =>
    `<option value="${esc(exile.id)}">${esc(exile.name)} → ${esc(target.name)}</option>`).join('');
  const targetOptions = view.destabilise.map((target) => `<option value="${esc(target.id)}">${esc(target.name)}</option>`).join('');
  const exileControls = exileOptions
    ? `<label class="control-row">Back exile claimant<select data-covert-exile>${exileOptions}</select></label><label class="control-row">Funding <input data-covert-exile-amount type="number" min="1" step="5" value="10"></label><button data-covert-restoration>Fund restoration network</button>`
    : '<div class="raid-status">No exile claimant is currently hosted by or meaningfully connected to your government.</div>';
  const destabiliseControls = targetOptions
    ? `<label class="control-row">Destabilise government<select data-covert-target>${targetOptions}</select></label><label class="control-row">Operation<select data-covert-mode><option value="revolution">Support revolutionary underground</option><option value="coup">Cultivate coup network</option></select></label><label class="control-row">Funding <input data-covert-target-amount type="number" min="1" step="5" value="10"></label><button data-covert-destabilise>Authorise covert support</button>`
    : '<div class="raid-status">No known foreign government is currently available as a covert-action target.</div>';
  return `<div class="diplomatic-covert"><strong>Covert political intervention</strong>
    <div class="raid-status">These are state intelligence operations, not omnipotent commands. Money builds networks over time; counter-intelligence can expose them, and coups or revolutions still depend on conditions inside the target state.</div>
    ${exileControls}${destabiliseControls}<div class="raid-status" data-covert-result></div></div>`;
}

function foreignCard(d) {
  const detained = d.status === 'detained';
  return `<div class="raid-status diplomatic-agent-card" data-foreign-diplomat="${esc(d.id)}"><strong>${esc(d.name)}</strong> of ${esc(d.homeName)} · ${esc(d.status)}<br>
    Known reliability ${pct(d.reliability)} · suspicion ${pct(d.suspectedCompromise)} · trust in their government: ${esc(d.governmentTrust.label)}<br>
    <label class="control-row">Bribe offered <input type="number" min="0" step="1" value="5" data-bribe-value="${esc(d.id)}"></label>
    <button data-dip-bribe="${esc(d.id)}" data-origin="${esc(d.homeRegionId)}">Attempt to turn</button>
    ${detained ? `<button data-dip-release="${esc(d.id)}" data-origin="${esc(d.homeRegionId)}">Release and send home</button>` : `<button data-dip-expel="${esc(d.id)}" data-origin="${esc(d.homeRegionId)}">Expel</button><button data-dip-detain="${esc(d.id)}" data-origin="${esc(d.homeRegionId)}">Detain</button>`}
    <div class="raid-status" data-dip-result="${esc(d.id)}"></div></div>`;
}

export function renderDiplomaticServicePanel(container, home, regions, currentTick, options = {}) {
  if (!container || !home) return null;
  const view = diplomaticServiceView(home, regions);
  const covert = interventionTargets(home, regions, options);
  const section = document.createElement('div');
  section.className = 'raid-section diplomatic-service-panel';
  section.innerHTML = `<strong>Diplomatic service</strong><div class="raid-status">Envoys are real agents. Reputation and suspicion are known; hidden compromise is not.</div>
    <div class="raid-status" data-dip-government-result></div>
    ${interventionHtml(covert)}
    <div class="diplomatic-own"><strong>Your envoys</strong>${view.own.map((d)=>ownCard({...d,homeRegionId:home.id},regions)).join('') || '<div class="raid-status">No envoys available.</div>'}</div>
    <div class="diplomatic-foreign"><strong>Foreign envoys at your court</strong>${view.foreign.map(foreignCard).join('') || '<div class="raid-status">No resident foreign envoys.</div>'}</div>`;
  container.appendChild(section);
  const rerender = () => { section.remove(); renderDiplomaticServicePanel(container, home, regions, currentTick, options); };
  const authoriseCovertAction = (targetPolityId) => authoriseRuntimeGovernmentAction(home, 'order_intelligence_operation', {
    polities: options.polities,
    approvals: options.intelligenceApprovals,
    context: { evidence: 0.25, legalBasis: 0.25, emergency: 0, foreignActorId: targetPolityId },
    rng: options.institutionalRng,
    currentTick,
    registerRefusal: options.registerInstitutionalRefusal !== false,
  });
  section.querySelector('[data-covert-restoration]')?.addEventListener('click', () => {
    const exileId = section.querySelector('[data-covert-exile]')?.value;
    const exile = (options.polities || []).find((candidate) => candidate.id === exileId);
    const target = exile ? restorationTarget(exile, options.polities || []) : null;
    const out = section.querySelector('[data-covert-result]');
    if (!covert.sponsor || !exile || !target) return;
    const authorisation = authoriseCovertAction(target.id);
    if (!authorisation.allowed) {
      if (out) out.textContent = 'The required institution refused authority for this covert operation.';
      options.onAction?.({ funded: false, reason: 'institutional_authorisation_refused', authorisation });
      return;
    }
    const amount = Number(section.querySelector('[data-covert-exile-amount]')?.value || 0);
    const result = fundRestorationOperation(covert.sponsor, exile, target, regions, currentTick, amount, options.operationRng || Math.random);
    if (out) out.textContent = result.funded
      ? `${result.amount.toFixed(1)} treasury units committed. The network's true penetration and whether the target noticed it remain uncertain.`
      : `Operation could not be funded (${String(result.reason).replaceAll('_', ' ')}).`;
    options.onAction?.({ ...result, detected: undefined, authorisation });
  });
  section.querySelector('[data-covert-destabilise]')?.addEventListener('click', () => {
    const targetId = section.querySelector('[data-covert-target]')?.value;
    const target = (options.polities || []).find((candidate) => candidate.id === targetId);
    const mode = section.querySelector('[data-covert-mode]')?.value || 'revolution';
    const out = section.querySelector('[data-covert-result]');
    if (!covert.sponsor || !target) return;
    const authorisation = authoriseCovertAction(target.id);
    if (!authorisation.allowed) {
      if (out) out.textContent = 'The required institution refused authority for this covert operation.';
      options.onAction?.({ funded: false, reason: 'institutional_authorisation_refused', authorisation });
      return;
    }
    const amount = Number(section.querySelector('[data-covert-target-amount]')?.value || 0);
    const result = fundPoliticalDestabilisation(covert.sponsor, target, regions, currentTick, mode, amount, options.operationRng || Math.random);
    if (out) out.textContent = result.funded
      ? `${result.amount.toFixed(1)} treasury units committed to ${mode === 'coup' ? 'elite/coup contacts' : 'an underground revolutionary network'}. Effectiveness and detection remain intelligence uncertainties.`
      : `Operation could not be funded (${String(result.reason).replaceAll('_', ' ')}).`;
    options.onAction?.({ ...result, detected: undefined, authorisation });
  });
  section.querySelectorAll('[data-dip-authority]').forEach((el)=>el.addEventListener('change',()=>{ const commitment=section.querySelector(`[data-dip-commitment="${CSS.escape(el.dataset.dipAuthority)}"]`); setDiplomatAuthority(home,el.dataset.dipAuthority,el.value,{maxMilitaryCommitmentFraction:Number(commitment?.value||20)/100}); rerender(); }));
  section.querySelectorAll('[data-dip-commitment]').forEach((el)=>el.addEventListener('change',()=>{ const d=diplomatsFor(home).find(x=>x.id===el.dataset.dipCommitment); if(d) setDiplomatAuthority(home,d.id,d.authority,{maxMilitaryCommitmentFraction:Number(el.value)/100}); rerender(); }));
  section.querySelectorAll('[data-dip-dispatch]').forEach((b)=>b.addEventListener('click',()=>{ const select=section.querySelector(`[data-dip-target="${CSS.escape(b.dataset.dipDispatch)}"]`); const target=regions.find(r=>r.id===select?.value); if(target) dispatchDiplomat(home,target,regions,b.dataset.dipDispatch,currentTick); rerender(); }));
  section.querySelectorAll('[data-dip-recall]').forEach((b)=>b.addEventListener('click',()=>{ recallDiplomat(home,b.dataset.dipRecall,regions,currentTick); rerender(); }));
  const foreignOrigin=(b)=>regions.find(r=>r.id===b.dataset.origin);
  section.querySelectorAll('[data-dip-bribe]').forEach((b)=>b.addEventListener('click',()=>{ const origin=foreignOrigin(b); const val=Number(section.querySelector(`[data-bribe-value="${CSS.escape(b.dataset.dipBribe)}"]`)?.value||0); const result=origin?attemptBribeDiplomat(origin,b.dataset.dipBribe,actorId(home),val,0):{attempted:false}; const out=section.querySelector(`[data-dip-result="${CSS.escape(b.dataset.dipBribe)}"]`); if(out) out.textContent=result.success?'The approach appears to have succeeded. Whether the envoy remains trustworthy to their own court is hidden from them.':result.attempted?'The envoy refused. The approach may itself create suspicion.':'The attempt could not be made.'; options.onAction?.(result); }));
  section.querySelectorAll('[data-dip-expel]').forEach((b)=>b.addEventListener('click',()=>{ const origin=foreignOrigin(b); if(origin) expelDiplomat(origin,b.dataset.dipExpel,home,regions,currentTick,'player_expulsion'); rerender(); }));
  section.querySelectorAll('[data-dip-detain]').forEach((b)=>b.addEventListener('click',()=>{
    const origin=foreignOrigin(b);
    if(!origin) return;
    const authorisation=authoriseRuntimeGovernmentAction(home,'detain_political_actor',{
      polities:options.polities,
      approvals:options.detentionApprovals,
      context:{
        evidence:options.detentionEvidence ?? 0.5,
        legalBasis:options.detentionLegalBasis ?? 0.5,
        emergency:options.detentionEmergency ?? 0,
        foreignActorId:actorId(origin),
      },
      rng:options.institutionalRng,
      currentTick,
      registerRefusal:options.registerInstitutionalRefusal !== false,
    });
    if(!authorisation.allowed){
      const out=section.querySelector('[data-dip-government-result]');
      if(out) out.textContent='The required institution refused authority to detain this envoy.';
      options.onAction?.({detained:false,reason:'institutional_authorisation_refused',authorisation});
      return;
    }
    const result=detainDiplomat(origin,b.dataset.dipDetain,home,currentTick,'player_security_order');
    options.onAction?.({detained:Boolean(result),result,authorisation});
    rerender();
  }));
  section.querySelectorAll('[data-dip-release]').forEach((b)=>b.addEventListener('click',()=>{ const origin=foreignOrigin(b); if(origin) releaseDiplomat(origin,b.dataset.dipRelease,home,regions,currentTick); rerender(); }));
  return section;
}
