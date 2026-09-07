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
  bar.innerHTML = '<div><strong id="map-focus-name">—</strong><span>Selected · zoom to inspect · use layers or Council for detail and orders</span></div><button id="map-focus-close" aria-label="Clear selection">×</button>';
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
      position:absolute; z-index:11; left:12px; right:12px;
      bottom:calc(12px + env(safe-area-inset-bottom));
      min-height:52px; padding:9px 48px 9px 14px;
      border:1px solid var(--bronze-dim); border-radius:11px;
      background:rgba(23,29,41,.92); box-shadow:0 5px 20px rgba(0,0,0,.25);
      display:flex; align-items:center; justify-content:space-between;
    }
    #map-focus-bar.hidden { display:none; }
    #map-focus-bar strong { display:block; font-size:15px; line-height:20px; color:var(--parchment); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #map-focus-bar span { display:block; margin-top:2px; color:var(--parchment-dim); font-size:11px; line-height:15px; }
    #map-focus-close { position:absolute; top:8px; right:9px; width:34px; height:34px; border-radius:50%; border:1px solid var(--bronze-dim); background:rgba(16,20,28,.82); color:var(--parchment-dim); font-size:20px; }
    .legend { max-width:min(94vw,430px); right:14px; width:auto; }
    .layer-toggle { flex-wrap:wrap; }
    .layer-toggle > button { flex:1 1 62px !important; min-width:58px; min-height:30px; font-size:11px !important; }
    @media (max-width:520px) {
      .legend { left:10px; right:10px; bottom:calc(78px + env(safe-area-inset-bottom)); max-width:none; }
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
