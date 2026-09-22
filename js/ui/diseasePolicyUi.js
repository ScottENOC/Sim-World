import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import './playerAttentionUi.js?v=20260923-attention1';
import { ensureDiseaseState, recognisedDiseaseThreats, setQuarantinePolicy } from '../society/disease.js?v=20260912-disease1';
import { medicalCapabilities } from '../technology/medicalProgress.js?v=20260922-amr1';

function policyLabel(value) {
  if (value >= 0.85) return 'Cordon and close markets';
  if (value >= 0.55) return 'Quarantine travellers';
  if (value >= 0.2) return 'Inspect and isolate';
  return 'No movement controls';
}

function symptomLabel(id, hasGermTheory) {
  if (hasGermTheory) {
    const labels = { smallpox: 'Smallpox', plague: 'Plague', enteric: 'Enteric infection', respiratory: 'Respiratory infection' };
    return labels[id] || 'Infectious disease';
  }
  const labels = { smallpox: 'Pox illness', plague: 'Deadly fever', enteric: 'Stomach and bowel sickness', respiratory: 'Fever and coughing illness' };
  return labels[id] || 'Sickness';
}

function burdenLabel(prevalence, deaths) {
  const p = Math.max(0, Number(prevalence) || 0);
  const d = Math.max(0, Number(deaths) || 0);
  if (p >= 0.12 || d >= 100) return 'widespread and severe';
  if (p >= 0.06 || d >= 25) return 'serious spread';
  if (p >= 0.025 || d >= 5) return 'noticeable spread';
  return 'limited signs';
}

function diseaseSection(player) {
  const threats = recognisedDiseaseThreats(player);
  if (!threats.length) return '';
  const state = ensureDiseaseState(player);
  const capabilities = medicalCapabilities(player);
  const threatRows = threats.map((threat) => `
    <div class="advisor-report-row"><span>${symptomLabel(threat.id, capabilities.germTheory)}</span><strong>${burdenLabel(threat.prevalence, threat.lastDeaths)}</strong></div>`).join('');
  const policy = Number(state.quarantinePolicy) || 0;
  const knowledgeNote = capabilities.germTheory
    ? 'Officials can distinguish infectious diseases more reliably, but outbreak size remains an estimate rather than an exact count.'
    : 'Officials recognise patterns of sickness from symptoms, deaths and local reports. They do not know the exact share of the population infected or the underlying pathogen.';
  return `<section class="advisor-section"><h3>Epidemic response</h3>
    <p class="advisor-note">${knowledgeNote}</p>
    ${threatRows}
    <label class="advisor-field"><span>Standing outbreak response</span><select data-disease-quarantine>
      <option value="0" ${policy < 0.1 ? 'selected' : ''}>No movement controls</option>
      <option value="0.3" ${policy >= 0.1 && policy < 0.5 ? 'selected' : ''}>Inspect and isolate</option>
      <option value="0.65" ${policy >= 0.5 && policy < 0.85 ? 'selected' : ''}>Quarantine travellers</option>
      <option value="1" ${policy >= 0.85 ? 'selected' : ''}>Cordon and close markets</option>
    </select></label>
    <p class="advisor-note">${policyLabel(policy)}. Controls activate when officials recognise a local or nearby outbreak. Stronger controls reduce imported infections, but impede trade while active.</p>
  </section>`;
}

if (!AdvisorCouncil.prototype.__diseasePolicyPatched) {
  AdvisorCouncil.prototype.__diseasePolicyPatched = true;
  const originalRenderSteward = AdvisorCouncil.prototype.renderSteward;
  AdvisorCouncil.prototype.renderSteward = function renderStewardWithDisease(player) {
    return originalRenderSteward.call(this, player) + diseaseSection(player);
  };

  const originalWireCurrent = AdvisorCouncil.prototype.wireCurrent;
  AdvisorCouncil.prototype.wireCurrent = function wireCurrentWithDisease(player) {
    const result = originalWireCurrent.call(this, player);
    const select = document.querySelector('[data-disease-quarantine]');
    if (select) select.addEventListener('change', () => {
      setQuarantinePolicy(player, Number(select.value));
      this.render(false);
    });
    return result;
  };
}
