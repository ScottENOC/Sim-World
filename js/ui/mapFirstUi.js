// Map-first mobile UI.
// Region selection focuses the map. Reports and orders belong to layers/advisors.

function createFocusBar() {
  const app = document.getElementById('app');
  if (!app) return null;
  let bar = document.getElementById('map-focus-bar');
  if (bar) return bar;
  bar = document.createElement('div');
  bar.id = 'map-focus-bar';
  bar.className = 'hidden';
  bar.innerHTML = '<strong id="map-focus-name">—</strong><button id="map-focus-close" aria-label="Clear selection">×</button>';
  app.appendChild(bar);
  return bar;
}

function installStyles() {
  if (document.getElementById('map-first-styles')) return;
  const style = document.createElement('style');
  style.id = 'map-first-styles';
  style.textContent = `
    #region-sheet { display:none !important; }
    #map-focus-bar {
      position:absolute; z-index:11; left:10px; right:10px;
      bottom:calc(var(--map-legend-height, 92px) + 16px + env(safe-area-inset-bottom));
      min-height:40px; padding:5px 44px 5px 12px;
      border:1px solid var(--bronze-dim); border-radius:10px;
      background:rgba(23,29,41,.92); box-shadow:0 5px 20px rgba(0,0,0,.25);
      display:flex; align-items:center; gap:7px;
    }
    #map-focus-bar.hidden { display:none; }
    #map-focus-bar strong { display:block; min-width:0; flex:1 1 auto; font-size:14px; line-height:20px; color:var(--parchment); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #map-focus-close { position:absolute; top:4px; right:5px; width:32px; height:32px; border-radius:50%; border:1px solid var(--bronze-dim); background:rgba(16,20,28,.82); color:var(--parchment-dim); font-size:19px; }
    .legend {
      position:absolute !important; left:10px !important; right:10px !important; top:auto !important;
      bottom:calc(8px + env(safe-area-inset-bottom)) !important;
      width:auto !important; max-width:none !important; max-height:min(36vh, 260px); overflow:auto;
      box-sizing:border-box;
    }
    .layer-toggle { display:flex; flex-wrap:wrap; gap:4px; }
    .layer-toggle > button { flex:1 1 62px !important; min-width:56px; min-height:29px; font-size:10.5px !important; padding:4px 6px !important; }
    #legend-label { margin-top:5px; }
    #legend-categorical { max-height:150px; overflow:auto; }
    @media (max-width:520px) {
      #map-focus-bar { left:8px; right:8px; min-height:38px; padding-left:10px; }
      .legend { left:8px !important; right:8px !important; bottom:calc(6px + env(safe-area-inset-bottom)) !important; max-height:min(34vh, 240px); }
      .layer-toggle > button { min-width:52px; min-height:28px; font-size:10px !important; }
    }
  `;
  document.head.appendChild(style);
}

function showFocus(region, sim) {
  const bar = createFocusBar();
  if (!bar || !region) return;
  document.getElementById('map-focus-name').textContent = region.name || 'Selected region';
  bar.classList.remove('hidden');
  if (sim?.map) {
    sim.map.selectedId = region.id;
    sim.map.draw();
  }
}

function clearFocus(sim) {
  document.getElementById('map-focus-bar')?.classList.add('hidden');
  if (sim?.map) {
    sim.map.selectedId = null;
    sim.map.draw();
  }
}

function clearLegacySelectionWithoutLosingFocus(sim) {
  const selected = sim?.regions?.find((region) => region.id === sim?.map?.selectedId) || null;
  const close = document.getElementById('btn-close-sheet');
  if (!close) return;
  close.click();
  if (selected) showFocus(selected, sim);
}

function installRuntimePatch() {
  const sim = window.__worldsim;
  if (!sim?.map) return false;
  if (sim.map._mapFirstSelectionPatched) return true;
  sim.map._mapFirstSelectionPatched = true;

  sim.map.onSelect = (region) => showFocus(region, sim);

  const playerRegion = sim.regions?.find((region) => region.id === sim.fogOfWar?.playerRegionId);
  const selected = sim.regions?.find((region) => region.id === sim.map.selectedId) || playerRegion;
  if (selected && document.getElementById('picker-modal')?.classList.contains('hidden')) showFocus(selected, sim);

  if (document.getElementById('picker-modal')?.classList.contains('hidden')) {
    clearLegacySelectionWithoutLosingFocus(sim);
  } else {
    const pickerObserver = new MutationObserver(() => {
      if (document.getElementById('picker-modal')?.classList.contains('hidden')) {
        pickerObserver.disconnect();
        setTimeout(() => clearLegacySelectionWithoutLosingFocus(sim), 0);
      }
    });
    pickerObserver.observe(document.getElementById('picker-modal'), { attributes: true, attributeFilter: ['class'] });
  }

  const sheet = document.getElementById('region-sheet');
  if (sheet) {
    new MutationObserver(() => {
      if (sheet.classList.contains('hidden')) return;
      const region = sim.regions?.find((candidate) => candidate.id === sim.map.selectedId);
      clearLegacySelectionWithoutLosingFocus(sim);
      if (region) showFocus(region, sim);
    }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
  }

  document.getElementById('map-focus-close')?.addEventListener('click', () => clearFocus(sim));
  document.getElementById('btn-council')?.setAttribute('title', 'Advisors, reports and orders');

  import('./advisorMapFirst.js?v=20260907-mapfirst4').catch((error) =>
    console.error('Could not install map-first advisor extensions', error));
  import('./economicImportanceUi.js?v=20260907-importance2').catch((error) =>
    console.error('Could not install economic importance overlay', error));
  import('./foreignInvestmentUi.js?v=20260915-investment-ui1').then(({ installForeignInvestmentUi }) =>
    installForeignInvestmentUi(sim)).catch((error) =>
    console.error('Could not install foreign investment controls', error));
  import('./infrastructureMapUi.js?v=20260915-infra-map1').then(({ installInfrastructureMapUi }) =>
    installInfrastructureMapUi(sim)).catch((error) =>
    console.error('Could not install infrastructure ownership overlay', error));
  import('./electricGridMapUi.js?v=20260921-grid-map1').then(({ installElectricGridMapUi }) =>
    installElectricGridMapUi(sim)).catch((error) =>
    console.error('Could not install electric grid map overlay', error));
  import('./mobileGameplayControls.js?v=20260924-mobile-gameplay1').then(({ installMobileGameplayControls }) =>
    installMobileGameplayControls(sim)).catch((error) =>
    console.error('Could not install mobile gameplay controls', error));
  return true;
}

function installMapFirstUi() {
  installStyles();
  createFocusBar();
  document.getElementById('region-sheet')?.classList.add('hidden');
  return true;
}

if (typeof window !== 'undefined') {
  installMapFirstUi();
  let attempts = 0;
  const poll = () => {
    attempts += 1;
    if (installRuntimePatch()) return;
    if (attempts < 1200) setTimeout(poll, 100);
  };
  setTimeout(poll, 50);
}
