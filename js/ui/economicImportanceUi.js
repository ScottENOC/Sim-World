import { perceivedEconomicImportance, importanceLabel } from '../economy/economicImportance.js?v=20260907-importance1';

function observer(sim) {
  const playerId = sim?.fogOfWar?.playerRegionId;
  return sim?.regions?.find((region) => region.id === playerId) || null;
}

function setLegend(map) {
  const info = map.getLegendInfo?.();
  if (!info) return;
  const label = document.getElementById('legend-label');
  const min = document.getElementById('legend-min');
  const max = document.getElementById('legend-max');
  const gradient = document.getElementById('legend-gradient');
  const categorical = document.getElementById('legend-categorical');
  if (label) label.textContent = info.label;
  if (min) min.textContent = info.min;
  if (max) max.textContent = info.max;
  gradient?.classList.remove('hidden');
  categorical?.classList.add('hidden');
  document.getElementById('legend')?.classList.remove('hidden');
}

function install(sim = window.__worldsim) {
  if (!sim?.map || !sim?.regions) return false;
  const old = document.querySelector('.layer-btn[data-layer="wealth"]');
  if (!old) return false;
  if (document.querySelector('.layer-btn[data-layer="importance"]')) return true;

  // Clone strips main.js's old click listener so the omniscient wallet layer can
  // no longer run even briefly before our replacement handler.
  const button = old.cloneNode(true);
  button.dataset.layer = 'importance';
  button.textContent = 'Importance';
  button.setAttribute('aria-label', 'Perceived economic importance');
  old.replaceWith(button);

  const config = {
    scaleKey: 'perceived-economic-importance',
    valueFn: (region) => {
      const player = observer(sim);
      return perceivedEconomicImportance(player, region, sim.regions, sim.clock?.tickIndex || 0).score;
    },
    label: 'Estimated economic importance',
    format: (value) => importanceLabel(value),
    colorLow: '#2b3036',
    colorHigh: '#c08a4e',
    fixedDomain: [0, 100],
  };

  button.addEventListener('click', () => {
    document.querySelectorAll('.layer-btn,.visual-overlay-btn').forEach((item) => {
      item.classList?.remove('active');
      if (item.classList?.contains('visual-overlay-btn')) {
        item.dataset.active = '0';
        item.style.background = 'rgba(23,29,41,.6)';
        item.style.color = '#a8a08c';
        item.style.borderColor = '#7a5a34';
      }
    });
    button.classList.add('active');
    sim.map.setLayer(config);
    setLegend(sim.map);
  });

  return true;
}

if (typeof window !== 'undefined') {
  let attempts = 0;
  const poll = () => {
    attempts += 1;
    if (install() || attempts >= 1200) return;
    setTimeout(poll, 100);
  };
  setTimeout(poll, 0);
}
