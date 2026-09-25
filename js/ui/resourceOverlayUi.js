import { CONSTRUCTION_TYPES } from '../economy/construction.js?v=20260905-projects1';
import {
  availableResourceIds,
  finalizeResourceFlowTick,
  installResourceFlowTracking,
  resourceMetricValue,
} from '../economy/resourceFlow.js?v=20260925-resource1';
import { sourceAllModernConstructionSupplies } from '../economy/modernDomesticConstructionSupply.js?v=20260925-resource1';

const COMMON_RESOURCES = [
  'food', 'wood', 'stone', 'clay', 'pottery', 'textiles', 'clothes', 'pitch',
  'copper', 'tin', 'bronze', 'ironOre', 'iron', 'steel', 'coal', 'oil', 'petrol',
  'natural_gas', 'aviation_fuel', 'aluminium', 'titanium', 'lead', 'lithium', 'cobalt',
  'nickel', 'graphite', 'salt', 'saltpetre', 'sulfur', 'gunpowder',
  'machine_components', 'electrical_components', 'electronics',
  'lead_acid_battery_cells', 'advanced_rechargeable_cells', 'lithium_ion_cells',
  'motor_vehicle',
];

const METRICS = Object.freeze({
  stockpiled: { label: 'Stockpiled', colourLow: '#28352b', colourHigh: '#c08a4e' },
  production: { label: 'Production', colourLow: '#28352b', colourHigh: '#4e9a70' },
  consumption: { label: 'Consumption', colourLow: '#28352b', colourHigh: '#b86a56' },
  net: { label: 'Net production', colourLow: '#9c5148', colourHigh: '#4e9a70' },
});

function humanise(id) {
  return String(id || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function constructionResourceIds() {
  const ids = new Set();
  for (const type of Object.values(CONSTRUCTION_TYPES)) {
    for (const id of Object.keys(type?.materials || {})) ids.add(id);
  }
  return [...ids];
}

function allResourceIds(sim) {
  return availableResourceIds(sim?.regions || [], [...COMMON_RESOURCES, ...constructionResourceIds()]);
}

function formatValue(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (abs >= 100) return Math.round(n).toLocaleString();
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function installStyles() {
  if (document.getElementById('resource-overlay-styles')) return;
  const style = document.createElement('style');
  style.id = 'resource-overlay-styles';
  style.textContent = `
    #resource-overlay-controls { margin-top:7px; padding-top:7px; border-top:1px solid rgba(192,138,78,.28); pointer-events:auto; position:relative; z-index:2; touch-action:manipulation; }
    #resource-overlay-controls.hidden { display:none; }
    #resource-overlay-controls .resource-row { display:flex; gap:6px; align-items:center; }
    #resource-overlay-controls select { min-width:0; flex:1; background:rgba(12,16,24,.9); color:var(--parchment); border:1px solid var(--bronze-dim); border-radius:6px; padding:5px 7px; font-size:11px; pointer-events:auto; }
    #resource-overlay-controls .resource-metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px; margin-top:6px; pointer-events:auto; }
    #resource-overlay-controls .resource-metric { min-height:28px; padding:4px 5px; border:1px solid rgba(192,138,78,.36); border-radius:6px; background:rgba(16,20,28,.72); color:var(--parchment-dim); font-size:10px; pointer-events:auto; }
    #resource-overlay-controls .resource-metric.active { color:var(--parchment); border-color:var(--bronze); background:rgba(192,138,78,.18); }
    #resource-overlay-note { margin-top:5px; color:var(--parchment-dim); font-size:9px; line-height:1.25; }
  `;
  document.head.appendChild(style);
}

function ensureControls(sim) {
  const legend = document.getElementById('legend');
  if (!legend) return null;
  let controls = document.getElementById('resource-overlay-controls');
  if (controls) return controls;
  controls = document.createElement('div');
  controls.id = 'resource-overlay-controls';
  controls.className = 'hidden';
  controls.innerHTML = `
    <div class="resource-row"><select id="resource-overlay-resource" aria-label="Resource"></select></div>
    <div class="resource-metrics" role="group" aria-label="Resource measure">
      ${Object.entries(METRICS).map(([id, metric]) => `<button type="button" class="resource-metric${id === 'stockpiled' ? ' active' : ''}" data-resource-metric="${id}">${metric.label}</button>`).join('')}
    </div>
    <div id="resource-overlay-note">Production and consumption show gross additions/removals recorded during the last simulation turn; trade is included. Domestic construction transfers are excluded.</div>`;
  legend.appendChild(controls);

  // The legend itself deliberately ignores pointer events so map gestures work
  // around it. Resource controls must opt back in and swallow their own pointer
  // events so taps never fall through to the full-screen map interaction layer.
  for (const eventName of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend']) {
    controls.addEventListener(eventName, (event) => event.stopPropagation(), { passive: eventName.startsWith('touch') });
  }

  const select = controls.querySelector('#resource-overlay-resource');
  const ids = allResourceIds(sim);
  select.innerHTML = ids.map((id) => `<option value="${id}">${humanise(id)}</option>`).join('');
  select.value = ids.includes('wood') ? 'wood' : ids[0] || '';
  return controls;
}

function activeMetric(controls) {
  return controls?.querySelector('.resource-metric.active')?.dataset?.resourceMetric || 'stockpiled';
}

function setResourceLayer(sim, controls) {
  const resourceId = controls?.querySelector('#resource-overlay-resource')?.value;
  if (!resourceId || !sim?.map) return;
  const metricId = activeMetric(controls);
  const metric = METRICS[metricId] || METRICS.stockpiled;
  const scaleKey = 'resource-overlay-active';
  sim.map._overlayDomains?.delete?.(scaleKey);
  sim.map.setLayer({
    type: 'gradient',
    label: `${humanise(resourceId)} · ${metric.label}`,
    valueFn: (region) => resourceMetricValue(region, resourceId, metricId),
    format: formatValue,
    colorLow: metric.colourLow,
    colorHigh: metric.colourHigh,
    scaleKey,
    visualOverlay: 'resource',
  });
}

function installButton(sim) {
  const group = document.querySelector('.layer-toggle');
  if (!group) return false;
  let button = document.getElementById('layer-resources');
  if (!button) {
    button = document.createElement('button');
    button.id = 'layer-resources';
    button.type = 'button';
    button.className = 'layer-btn';
    button.textContent = 'Resources';
    button.title = 'Map regional stockpiles and recent resource flows';
    group.appendChild(button);
  }
  const controls = ensureControls(sim);
  if (!controls || button.dataset.installed === '1') return Boolean(controls);
  button.dataset.installed = '1';

  button.addEventListener('click', () => {
    group.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    controls.classList.remove('hidden');
    setResourceLayer(sim, controls);
  });
  controls.querySelector('#resource-overlay-resource')?.addEventListener('change', () => setResourceLayer(sim, controls));
  controls.querySelectorAll('.resource-metric').forEach((metricButton) => metricButton.addEventListener('click', () => {
    controls.querySelectorAll('.resource-metric').forEach((candidate) => candidate.classList.toggle('active', candidate === metricButton));
    setResourceLayer(sim, controls);
  }));
  group.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement && event.target !== button) {
      button.classList.remove('active');
      controls.classList.add('hidden');
    }
  }, true);
  return true;
}

function installFlowAndSupply(sim) {
  if (sim._resourceFlowUiInstalled) return;
  sim._resourceFlowUiInstalled = true;
  installResourceFlowTracking(sim.regions);

  sim.clock?.onTick?.((time) => {
    finalizeResourceFlowTick(sim.regions, time?.tickIndex, time?.elapsedDays);
    sourceAllModernConstructionSupplies(sim.regions);
    const controls = document.getElementById('resource-overlay-controls');
    if (sim.map?.layer?.visualOverlay === 'resource' && controls && !controls.classList.contains('hidden')) {
      setResourceLayer(sim, controls);
    }
  });

  // The Council's own click handler creates the project at the target first;
  // this bubbled handler then sources an initial domestic material buffer
  // immediately, avoiding a deliberately wasted/stalled first turn.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('#start-construction')) return;
    queueMicrotask(() => {
      installResourceFlowTracking(sim.regions);
      sourceAllModernConstructionSupplies(sim.regions);
    });
  });
}

export function installResourceOverlayUi(sim) {
  if (!sim?.map || !Array.isArray(sim?.regions)) return false;
  installStyles();
  installFlowAndSupply(sim);
  return installButton(sim);
}

if (typeof window !== 'undefined') {
  let attempts = 0;
  const tryInstall = () => {
    attempts += 1;
    if (installResourceOverlayUi(window.__worldsim) || attempts >= 1200) return;
    setTimeout(tryInstall, 100);
  };
  setTimeout(tryInstall, 0);
}