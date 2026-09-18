import { ensureSocialProtection, setSocialProtectionPolicy, socialProtectionEligibility, socialProtectionSummary } from '../society/socialProtection.js?v=20260918-social1';

function selectedRegion(){
  const world=globalThis.__worldsim;const id=world?.map?.selectedId;
  return world?.regions?.find?.(r=>r.id===id)||null;
}
function playerCanRule(region){
  const world=globalThis.__worldsim;const polityId=world?.activePlayerPolityId;
  return Boolean(region&&polityId&&(region.governance?.sovereignPolityId===polityId||region.governance?.localPolityId===polityId));
}
function pct(value){return `${Math.round((Number(value)||0)*100)}%`;}
function money(value){return Number(value||0).toFixed(1);}

export function renderSocialProtectionControls(){
  const host=document.getElementById('region-controls');if(!host||host.querySelector('#social-protection-panel'))return;
  const region=selectedRegion();if(!playerCanRule(region))return;
  const s=ensureSocialProtection(region),elig=socialProtectionEligibility(region),summary=socialProtectionSummary(region);
  const panel=document.createElement('div');panel.id='social-protection-panel';panel.className='raid-section social-protection-section';
  panel.innerHTML=`<strong>Social protection</strong>
    <div class="raid-status">Unemployment ${pct(region.employment?.unemploymentRate)} · hardship ${pct(region.employment?.hardship)} · relief coverage ${pct(summary.coverage)}<br>
    Family/informal relief ${money(summary.familyRelief)} · church relief ${money(summary.churchRelief)} · state relief ${money(summary.stateRelief)}<br>
    Insurance fund ${money(summary.insuranceFund)} · contributions ${money(summary.contributions)} · unemployment benefits ${money(summary.unemploymentBenefits)} · pensions ${money(summary.pensions)}${summary.unfundedBenefits>0?` · <strong>unfunded ${money(summary.unfundedBenefits)}</strong>`:''}</div>
    <label class="control-row">Poor relief
      <select id="social-poor-relief">
        ${[['none','None'],['charity','Family and religious charity'],['mixed','Charity plus local/state relief'],['state','State-led poor relief']].map(([id,label])=>`<option value="${id}" ${s.poorRelief===id?'selected':''}>${label}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Unemployment insurance
      <select id="social-unemployment" ${elig.unemploymentInsurance?'':'disabled'}>
        ${[[0,'None'],[0.2,'20% replacement'],[0.4,'40% replacement'],[0.6,'60% replacement']].map(([v,label])=>`<option value="${v}" ${Math.abs(s.unemploymentReplacementRate-v)<0.01?'selected':''}>${label}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Old-age pension
      <select id="social-pension" ${elig.pensions?'':'disabled'}>
        ${[[0,'None'],[0.15,'Basic'],[0.3,'Moderate'],[0.45,'Generous']].map(([v,label])=>`<option value="${v}" ${Math.abs(s.pensionReplacementRate-v)<0.01?'selected':''}>${label}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Payroll/social insurance contribution <span id="social-contribution-label">${pct(s.contributionRate)}</span>
      <input id="social-contribution" type="range" min="0" max="18" step="1" value="${Math.round(s.contributionRate*100)}">
    </label>
    <div class="raid-status">${elig.unemploymentInsurance?'Unemployment insurance institutions are viable.':'Unemployment insurance needs a larger formal labour market, stronger administration and basic literacy.'}<br>${elig.pensions?'A contributory pension system is administratively viable.':'Mass pensions need stronger administrative and record-keeping capacity.'}</div>`;
  host.appendChild(panel);
  document.getElementById('social-poor-relief')?.addEventListener('change',e=>setSocialProtectionPolicy(region,{poorRelief:e.target.value},{playerChoice:true}));
  document.getElementById('social-unemployment')?.addEventListener('change',e=>setSocialProtectionPolicy(region,{unemploymentReplacementRate:Number(e.target.value)},{playerChoice:true}));
  document.getElementById('social-pension')?.addEventListener('change',e=>setSocialProtectionPolicy(region,{pensionReplacementRate:Number(e.target.value)},{playerChoice:true}));
  document.getElementById('social-contribution')?.addEventListener('input',e=>{
    const value=Number(e.target.value)/100;setSocialProtectionPolicy(region,{contributionRate:value},{playerChoice:true});
    const label=document.getElementById('social-contribution-label');if(label)label.textContent=pct(value);
  });
}

function install(){
  const host=document.getElementById('region-controls');if(!host)return;
  const observer=new MutationObserver(()=>queueMicrotask(renderSocialProtectionControls));
  observer.observe(host,{childList:true});
  renderSocialProtectionControls();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
