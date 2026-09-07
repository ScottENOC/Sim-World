import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { ensureExternalities, recognisedHazards, setHazardRegulation, leadPlumbingStatus } from '../society/externalities.js?v=20260907-classical2';

const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();

function policyLabel(value) {
  if (value >= 0.85) return 'Phase out and replace';
  if (value >= 0.55) return 'Strict restrictions';
  if (value >= 0.2) return 'Precautionary limits';
  return 'No restrictions';
}

function hazardSection(player) {
  const hazards = recognisedHazards(player);
  if (!hazards.length) return '';
  const e = ensureExternalities(player);
  const cards = hazards.map((hazard) => {
    const regulation = Number(e.regulation?.[hazard.id]) || 0;
    const state = e.hazards?.[hazard.id] || {};
    const plumbing = hazard.id === 'lead' ? leadPlumbingStatus(player) : null;
    const leadDetail = plumbing ? `
      <div class="advisor-report-row"><span>Lead plumbing coverage</span><strong>${percent(plumbing.coverage)}</strong></div>
      <div class="advisor-report-row"><span>Installed lead</span><strong>${number(plumbing.installedLead)}</strong></div>
      <div class="advisor-report-row"><span>Water capacity supported</span><strong>+${number(plumbing.waterCapacityBonus)}</strong></div>` : '';
    return `<article class="hazard-policy-card">
      <p class="advisor-note"><strong>${hazard.label}</strong> is now considered a credible cause of chronic illness. Confidence: ${percent(hazard.confidence)}. This conclusion was inferred from accumulated observations; it was not known when the material was first adopted.</p>
      ${leadDetail}
      <div class="advisor-report-row"><span>Years of recorded exposure</span><strong>${(Number(state.yearsExposed) || 0).toFixed(1)}</strong></div>
      <label class="advisor-field"><span>Government response</span><select data-hazard-policy="${hazard.id}">
        <option value="0" ${regulation < 0.1 ? 'selected' : ''}>No restrictions</option>
        <option value="0.3" ${regulation >= 0.1 && regulation < 0.45 ? 'selected' : ''}>Precautionary limits</option>
        <option value="0.65" ${regulation >= 0.45 && regulation < 0.8 ? 'selected' : ''}>Strict restrictions</option>
        <option value="0.95" ${regulation >= 0.8 ? 'selected' : ''}>Phase out and replace</option>
      </select></label>
      <p class="advisor-note">Current policy: ${policyLabel(regulation)}. Stronger controls reduce new exposure immediately, but replacing installed infrastructure takes years.</p>
    </article>`;
  }).join('');
  return `<section class="advisor-section"><h3>Recognised health hazards</h3>${cards}</section>`;
}

if (!AdvisorCouncil.prototype.__hazardPolicyPatched) {
  AdvisorCouncil.prototype.__hazardPolicyPatched = true;
  const originalRenderSteward = AdvisorCouncil.prototype.renderSteward;
  AdvisorCouncil.prototype.renderSteward = function renderStewardWithHazards(player) {
    return originalRenderSteward.call(this, player) + hazardSection(player);
  };

  const originalWireCurrent = AdvisorCouncil.prototype.wireCurrent;
  AdvisorCouncil.prototype.wireCurrent = function wireCurrentWithHazards(player) {
    const result = originalWireCurrent.call(this, player);
    document.querySelectorAll('[data-hazard-policy]').forEach((select) => {
      select.addEventListener('change', () => {
        setHazardRegulation(player, select.dataset.hazardPolicy, Number(select.value));
        this.render(false);
      });
    });
    return result;
  };
}
