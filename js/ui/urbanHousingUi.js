import { ensureUrbanHousing, setUrbanHousingPolicy, urbanHousingEligibility, urbanHousingSummary } from '../society/urbanHousing.js?v=20260918-urban-housing1';
import { ensurePublicHealth, setPublicHealthPolicy, publicHealthEligibility } from '../society/publicHealth.js?v=20260918-public-health1';
import { medicalCapabilities, medicalKnowledgeIndex } from '../technology/medicalProgress.js?v=20260918-medical1';

function selectedRegion(){const world=globalThis.__worldsim;const id=world?.map?.selectedId;return world?.regions?.find?.(r=>r.id===id)||null;}
function playerCanRule(region){const world=globalThis.__worldsim;const polityId=world?.activePlayerPolityId;return Boolean(region&&polityId&&(region.governance?.sovereignPolityId===polityId||region.governance?.localPolityId===polityId));}
function pct(v){return `${Math.round((Number(v)||0)*100)}%`;}
function money(v){return Number(v||0).toFixed(1);}
function medicalSummary(region){const c=medicalCapabilities(region);const labels=[];if(c.professionalMedicine)labels.push('professional medicine');if(c.anatomy)labels.push('anatomy');if(c.nursing)labels.push('professional nursing');if(c.antisepsis)labels.push('antisepsis');if(c.germTheory)labels.push('germ theory');if(c.vaccination)labels.push('vaccination');if(c.antibiotics)labels.push('antibiotics');return labels.length?labels.join(' · '):'traditional/empirical care';}

export function renderUrbanHousingControls(){
  const host=typeof document!=='undefined'?document.getElementById('region-controls'):null;if(!host||host.querySelector('#urban-housing-panel'))return;
  const region=selectedRegion();if(!playerCanRule(region))return;
  const s=ensureUrbanHousing(region),e=urbanHousingEligibility(region),r=urbanHousingSummary(region);
  const h=ensurePublicHealth(region),he=publicHealthEligibility(region),hr=region.publicHealthReport||h;
  const panel=document.createElement('div');panel.id='urban-housing-panel';panel.className='raid-section urban-housing-section';
  panel.innerHTML=`<strong>Urban housing & living conditions</strong>
    <div class="raid-status">Overcrowding ${pct(r.overcrowding)} · rent pressure ${pct(r.rentPressure)} · slum pressure ${pct(r.slumPressure)} · health risk ${pct(r.healthRisk)}<br>
    Public housing stock ${Math.round(r.publicHousingCapacity||0)} residents · built this tick ${Math.round(r.publicHousingBuilt||0)} · public housing spend ${money(r.publicHousingSpend)} · sanitation spend ${money(r.sanitationSpend)}</div>
    <label class="control-row">Municipal sanitation
      <select id="urban-sanitation" ${e.sanitation?'':'disabled'}>
        ${[[0,'None'],[0.3,'Basic drains / refuse'],[0.65,'Municipal sanitation'],[1,'Comprehensive water & sewerage']].map(([v,l])=>`<option value="${v}" ${Math.abs(s.sanitationLevel-v)<0.02?'selected':''}>${l}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Building standards
      <select id="urban-standards" ${e.buildingStandards?'':'disabled'}>
        ${[[0,'None'],[0.25,'Basic safety rules'],[0.6,'Tenement / density standards'],[1,'Strict modern standards']].map(([v,l])=>`<option value="${v}" ${Math.abs(s.buildingStandards-v)<0.02?'selected':''}>${l}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Annual social-housing budget share <span id="urban-housing-budget-label">${pct(s.socialHousingBudgetShare)}</span>
      <input id="urban-housing-budget" type="range" min="0" max="12" step="1" value="${Math.round(s.socialHousingBudgetShare*100)}" ${e.socialHousing?'':'disabled'}>
    </label>
    <div class="raid-status">${e.socialHousing?'Municipal/social housing institutions are viable.':'Public housing needs a substantial urban population, stronger administration and basic record-keeping.'}<br>Public construction uses treasury cash plus real wood and stone/clay, and adds to the same persistent housing stock used by private builders.</div>
    <hr>
    <strong>Public health & hospitals</strong>
    <div class="raid-status">Medical knowledge ${pct(medicalKnowledgeIndex(region))} · ${medicalSummary(region)}<br>
    Operational beds ${Math.round(hr.operationalBeds||0)} · public beds ${Math.round(hr.publicBeds||0)} · charitable/infirmary beds ${Math.round(hr.charitableBeds||0)}<br>
    Staffing ${pct(hr.staffingRatio)} · funding ${pct(hr.fundingRatio)} · hospital spend ${money(hr.hospitalSpend)} · construction ${money(hr.hospitalBuildSpend)}</div>
    <label class="control-row">Public-health administration
      <select id="public-health-admin" ${he.publicHealthAdministration?'':'disabled'}>
        ${[[0,'None'],[0.35,'Local health officers'],[0.7,'Municipal health department'],[1,'Comprehensive public-health service']].map(([v,l])=>`<option value="${v}" ${Math.abs(h.publicHealthAdministration-v)<0.03?'selected':''}>${l}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Annual public-hospital budget share <span id="public-hospital-budget-label">${pct(h.publicHospitalBudgetShare)}</span>
      <input id="public-hospital-budget" type="range" min="0" max="12" step="1" value="${Math.round(h.publicHospitalBudgetShare*100)}" ${he.publicHospitals?'':'disabled'}>
    </label>
    <div class="raid-status">${he.publicHospitals?'A state hospital service is institutionally viable.':'Public hospitals need a sizeable urban population, stronger administration and basic literacy/record-keeping.'}<br>Hospital construction consumes treasury cash, wood and stone/clay. Beds only help when they are staffed and funded; epidemics and mass casualties can overwhelm them.</div>`;
  host.appendChild(panel);
  document.getElementById('urban-sanitation')?.addEventListener('change',ev=>setUrbanHousingPolicy(region,{sanitationLevel:Number(ev.target.value)},{playerChoice:true}));
  document.getElementById('urban-standards')?.addEventListener('change',ev=>setUrbanHousingPolicy(region,{buildingStandards:Number(ev.target.value)},{playerChoice:true}));
  document.getElementById('urban-housing-budget')?.addEventListener('input',ev=>{const value=Number(ev.target.value)/100;setUrbanHousingPolicy(region,{socialHousingBudgetShare:value},{playerChoice:true});const label=document.getElementById('urban-housing-budget-label');if(label)label.textContent=pct(value);});
  document.getElementById('public-health-admin')?.addEventListener('change',ev=>setPublicHealthPolicy(region,{publicHealthAdministration:Number(ev.target.value)},{playerChoice:true}));
  document.getElementById('public-hospital-budget')?.addEventListener('input',ev=>{const value=Number(ev.target.value)/100;setPublicHealthPolicy(region,{publicHospitalBudgetShare:value},{playerChoice:true});const label=document.getElementById('public-hospital-budget-label');if(label)label.textContent=pct(value);});
}

function install(){const host=document.getElementById('region-controls');if(!host)return;const observer=new MutationObserver(()=>queueMicrotask(renderUrbanHousingControls));observer.observe(host,{childList:true});renderUrbanHousingControls();}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
