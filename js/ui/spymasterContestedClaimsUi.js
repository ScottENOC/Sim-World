import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';

const clamp=(v)=>Math.max(0,Math.min(1,Number(v)||0));
const pct=(v)=>`${Math.round(clamp(v)*100)}%`;
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(ch)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
const words=(value)=>String(value||'unknown').replaceAll('_',' ');

function confidenceLabel(value){
  const v=clamp(value);
  return v>=.76?'well corroborated':v>=.52?'probable':v>=.30?'uncertain':'poorly supported';
}

function evidenceSummary(claim){
  const items=Math.max(0,Number(claim.evidenceCount)||0);
  const sources=Math.max(0,Number(claim.independentSourceCount)||0);
  const parts=[`${items} evidence item${items===1?'':'s'}`,`${sources} independent source${sources===1?'':'s'}`];
  if((claim.provenance||0)>.05)parts.push(`provenance ${pct(claim.provenance)}`);
  if((claim.forensicSupport||0)>.05)parts.push(`forensics ${pct(claim.forensicSupport)}`);
  return parts.join(' · ');
}

function narrativeSummary(incident){
  const narratives=Array.isArray(incident?.narratives)?incident.narratives:[];
  if(!narratives.length)return '';
  const ordered=[...narratives].sort((a,b)=>(b.reach||0)-(a.reach||0)).slice(0,3);
  return `<div class="advisor-note"><strong>Competing accounts</strong><br>${ordered.map((item)=>{
    const kind=words(item.kind);
    const reach=Number.isFinite(item.reach)?` · reach ${pct(item.reach)}`:'';
    return `${esc(kind)}${reach}`;
  }).join('<br>')}</div>`;
}

function claimCard(claim,incident){
  const headline=esc(claim.headline||words(claim.type)||'Contested report');
  const age=Number.isFinite(claim.ageDays)?`${Math.max(0,Math.round(claim.ageDays))} days since report`:'age unknown';
  const eventTone=(claim.confidence||0)<.52?' warning':'';
  const attributionTone=(claim.attributionConfidence||0)<.52?' warning':'';
  const synthetic=(claim.syntheticMediaCouldExplainEvidence||0)>.18
    ? `<div class="advisor-note">Synthetic-media explanation remains plausible: ${pct(claim.syntheticMediaCouldExplainEvidence)}. This is not proof that the evidence is synthetic.</div>`:'';
  return `<article class="advisor-note contested-claim-card">
    <strong>${headline}</strong><br>
    <span>${esc(age)} · ${esc(confidenceLabel(claim.confidence))}</span>
    <div class="advisor-report-row${eventTone}"><span>Event confidence</span><strong>${pct(claim.confidence)}</strong></div>
    <div class="advisor-report-row${attributionTone}"><span>Attribution confidence</span><strong>${pct(claim.attributionConfidence)}</strong></div>
    <div class="advisor-note">${esc(evidenceSummary(claim))}</div>
    ${claim.narrativeCount?`<div class="advisor-note">${Math.round(claim.narrativeCount)} competing narrative${claim.narrativeCount===1?'':'s'} are circulating.</div>`:''}
    ${synthetic}
    ${narrativeSummary(incident)}
  </article>`;
}

export function renderContestedClaimsBrief(player){
  const summary=player?.report?.informationIntegrity;
  const claims=Array.isArray(summary?.contestedClaims)?summary.contestedClaims:[];
  const incidents=Array.isArray(player?.informationIntegrity?.incidents)?player.informationIntegrity.incidents:[];
  const environment=summary?`<div class="advisor-report-row"><span>Shared reality</span><strong>${pct(summary.sharedReality)}</strong></div>
    <div class="advisor-report-row"><span>Post-truth pressure</span><strong>${pct(summary.postTruthPressure)}</strong></div>
    <div class="advisor-report-row"><span>Synthetic-media pressure</span><strong>${pct(summary.syntheticMediaPressure)}</strong></div>
    <div class="advisor-report-row"><span>General attribution capability</span><strong>${pct(summary.attributionConfidence)}</strong></div>`:'';
  const cards=claims.length?claims.slice(0,6).map((claim)=>claimCard(claim,incidents.find((item)=>item.id===claim.id))).join(''):
    '<p class="advisor-note">No major contested public claims are currently in the intelligence ledger.</p>';
  return `<section class="advisor-section contested-claims-section"><h3>Contested information</h3>
    <p class="advisor-note">These are intelligence estimates, not hidden truth. Confidence that an event occurred is separate from confidence about who caused it.</p>
    ${environment}
    ${cards}
  </section>`;
}

const originalRenderSpymaster=AdvisorCouncil.prototype.renderSpymaster;
if(originalRenderSpymaster&&!AdvisorCouncil.prototype.__contestedClaimsUiPatched){
  AdvisorCouncil.prototype.__contestedClaimsUiPatched=true;
  AdvisorCouncil.prototype.renderSpymaster=function(player){
    const original=originalRenderSpymaster.call(this,player);
    return `${original}${renderContestedClaimsBrief(player)}`;
  };
}
