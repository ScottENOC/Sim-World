import { renderElectricGridControls } from './electricGridUi.js?v=20260921-grid-ui1';

function gridUiRelevant(region) {
  if (!region) return false;
  const state = region.gridInterconnection;
  return Boolean(
    region.unlockedTechIds?.has?.('electrical_generation') ||
    region.unlockedTechIds?.has?.('high_voltage_transmission') ||
    region.construction?.completed?.local_electric_grid ||
    state?.links?.length || state?.projects?.length || state?.incidents?.length
  );
}

function tryRender() {
  const sim = window.__worldsim;
  const controls = document.getElementById('region-controls');
  if (!sim?.map || !Array.isArray(sim.regions) || !controls || controls.querySelector('#electric-grid-controls')) return;
  const selected = sim.regions.find((region) => region.id === sim.map.selectedId);
  if (!selected || !gridUiRelevant(selected)) return;
  renderElectricGridControls(selected, sim.regions, sim.activePlayerPolityId);
}

function install() {
  const controls = document.getElementById('region-controls');
  if (!controls) return false;
  const observer = new MutationObserver(() => queueMicrotask(tryRender));
  observer.observe(controls, { childList: true });
  tryRender();
  return true;
}

if (!install()) {
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 100);
  setTimeout(() => clearInterval(timer), 30000);
}
