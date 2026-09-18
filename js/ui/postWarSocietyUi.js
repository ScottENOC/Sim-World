import {
  VETERAN_SUPPORT_POLICIES,
  postWarSocietySummary,
  setVeteranSupportPolicy,
} from '../society/postWarSociety.js?v=20260918-postwar1';

const pct = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const num = (value) => Math.round(Number(value) || 0).toLocaleString();

export function renderPostWarSocietyControls(container, polity, onChange = null) {
  if (!container || !polity) return null;
  container.querySelector('[data-postwar-society-panel]')?.remove();
  const s = postWarSocietySummary(polity);
  const panel = document.createElement('div');
  panel.className = 'raid-section postwar-society-section';
  panel.dataset.postwarSocietyPanel = 'true';
  panel.innerHTML = `
    <strong>Demobilisation and veterans</strong>
    <div class="raid-status">
      Veterans ${num(s.veteranPopulation)} · awaiting reintegration ${num(s.reintegrationQueue)}<br>
      Reintegration stress ${pct(s.reintegrationStress)} · political pressure ${pct(s.politicalPressure)}<br>
      Mobilisation memory ${pct(s.mobilisationMemory)} · support coverage ${pct(s.supportCoverage)}<br>
      Current support cost ${s.fiscalCost.toFixed(2)}
    </div>
    <label class="control-row">Veteran support
      <select data-veteran-support>
        ${Object.values(VETERAN_SUPPORT_POLICIES).map((item) => `<option value="${item.id}" ${item.id === s.veteranSupport ? 'selected' : ''}>${item.label}</option>`).join('')}
      </select>
    </label>
    <div class="raid-status">Veterans are created by actual reductions in armed strength after active conflict subsides. Jobs, housing and hardship determine how quickly they reintegrate. Support costs real treasury money; inadequate reintegration can increase household hardship and post-war political pressure.</div>
  `;
  panel.querySelector('[data-veteran-support]').addEventListener('change', (event) => {
    const result = setVeteranSupportPolicy(polity, event.target.value, { playerIssued: true });
    onChange?.(result);
    renderPostWarSocietyControls(container, polity, onChange);
  });
  container.appendChild(panel);
  return panel;
}
