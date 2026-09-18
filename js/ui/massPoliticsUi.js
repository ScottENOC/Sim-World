import {
  ASSOCIATION_LAWS,
  FRANCHISE_LEVELS,
  massPoliticsSummary,
  setMassPoliticsPolicy,
} from '../politics/massPolitics.js?v=20260918-mass-politics1';

const pct = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

export function renderMassPoliticsControls(container, polity, regions = [], onChange = null) {
  if (!container || !polity) return null;
  const previous = container.querySelector('[data-mass-politics-panel]');
  if (previous) previous.remove();
  const summary = massPoliticsSummary(polity);
  const panel = document.createElement('div');
  panel.className = 'raid-section mass-politics-section';
  panel.dataset.massPoliticsPanel = 'true';
  panel.innerHTML = `
    <strong>Mass politics</strong>
    <div class="raid-status">
      Political awareness ${pct(summary.politicalAwareness)} · organised participation ${pct(summary.organisation)}<br>
      Effective electorate ${pct(summary.effectiveElectorateShare)} · representation gap ${pct(summary.representationGap)}<br>
      Reform pressure ${pct(summary.reformPressure)} · radicalisation ${pct(summary.radicalisation)}<br>
      Administrative capacity ${pct(summary.administrativeCapacity)} · mobilisation memory ${pct(summary.mobilisationMemory)}
    </div>
    <label class="control-row">Franchise
      <select data-mass-politics-franchise>
        ${Object.values(FRANCHISE_LEVELS).map((item) => `<option value="${item.id}" ${item.id === summary.franchise ? 'selected' : ''}>${item.label}</option>`).join('')}
      </select>
    </label>
    <label class="control-row">Political associations
      <select data-mass-politics-associations>
        ${Object.values(ASSOCIATION_LAWS).map((item) => `<option value="${item.id}" ${item.id === summary.associations ? 'selected' : ''}>${item.label}</option>`).join('')}
      </select>
    </label>
    <div class="raid-status">Broad participation only becomes effective when representative institutions, administration and communications can actually register people, organise voting and count results. Restricting political organisation can suppress it in the short term but leaves repression memory and can increase radicalisation while representation pressure remains unresolved.</div>
  `;

  const apply = (patch, select) => {
    const result = setMassPoliticsPolicy(polity, patch, { playerIssued: true });
    if (!result.changed) {
      select.value = patch.franchise ? summary.franchise : summary.associations;
      if (result.reason === 'no_representative_institution') {
        const note = document.createElement('div');
        note.className = 'raid-status';
        note.textContent = 'A mass franchise requires an established representative institution first.';
        panel.appendChild(note);
      }
      return;
    }
    onChange?.(result);
    renderMassPoliticsControls(container, polity, regions, onChange);
  };

  panel.querySelector('[data-mass-politics-franchise]').addEventListener('change', (event) => apply({ franchise: event.target.value }, event.target));
  panel.querySelector('[data-mass-politics-associations]').addEventListener('change', (event) => apply({ associations: event.target.value }, event.target));
  container.appendChild(panel);
  return panel;
}
