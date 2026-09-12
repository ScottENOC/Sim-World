import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { ensureDiseaseState, recognisedDiseaseThreats, setQuarantinePolicy } from '../society/disease.js?v=20260912-disease1';

const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

function policyLabel(value) {
  if (value >= 0.85) return 'Cordon and close markets';
  if (value >= 0.55) return 'Quarantine travellers';
  if (value >= 0.2) return 'Inspect and isolate';
  return 'No movement controls';
}

function diseaseSection(player) {
  const threats = recognisedDiseaseThreats(player);
  if (!threats.length) return '';
  const state = ensureDiseaseState(player);
  const threatRows = threats.map((threat) => `
    <div class="advisor-report-row"><span>${threat.label}</span><strong>${percent(threat.prevalence)} infected · ${percent(threat.resistance)} resistant</strong></div>`).join('');
  const policy = Number(state.quarantinePolicy) || 0;
  return `<section class="advisor-section"><h3>Epidemic response</h3>
    <p class="advisor-note">Resistance is tracked separately for each disease. Surviving one epidemic does not protect the population from unrelated pathogens.</p>
    ${threatRows}
    <label class="advisor-field"><span>Standing outbreak response</span><select data-disease-quarantine>
      <option value="0" ${policy < 0.1 ? 'selected' : ''}>No movement controls</option>
      <option value="0.3" ${policy >= 0.1 && policy < 0.5 ? 'selected' : ''}>Inspect and isolate</option>
      <option value="0.65" ${policy >= 0.5 && policy < 0.85 ? 'selected' : ''}>Quarantine travellers</option>
      <option value="1" ${policy >= 0.85 ? 'selected' : ''}>Cordon and close markets</option>
    </select></label>
    <p class="advisor-note">${policyLabel(policy)}. Controls activate when a recognised outbreak is present. Stronger controls reduce imported infections, but impede trade while active.</p>
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
