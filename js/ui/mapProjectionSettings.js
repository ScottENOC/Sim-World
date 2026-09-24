import './mapZoomBehaviour.js?v=20260924-zoom1';

const STORAGE_KEY = 'worldsim-map-projection';
const DEFAULT_PROJECTION = 'equal-earth';
const VALID_PROJECTIONS = new Set(['equal-earth', 'natural-earth', 'mercator']);

function readProjection() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return VALID_PROJECTIONS.has(saved) ? saved : DEFAULT_PROJECTION;
  } catch {
    return DEFAULT_PROJECTION;
  }
}

function writeProjection(value) {
  if (!VALID_PROJECTIONS.has(value)) return;
  try { window.localStorage.setItem(STORAGE_KEY, value); }
  catch { /* storage can be unavailable in private/restricted browsing */ }
}

const selectedProjection = readProjection();
const baseD3 = window.d3;

if (baseD3?.geoMercator && baseD3?.geoEqualEarth && baseD3?.geoNaturalEarth1) {
  const selectedFactory = {
    'equal-earth': baseD3.geoEqualEarth,
    'natural-earth': baseD3.geoNaturalEarth1,
    mercator: baseD3.geoMercator,
  }[selectedProjection];

  // MapRenderer historically asks D3 for geoMercator directly. Keep that renderer
  // stable and substitute the selected projection only at boot. This intentionally
  // does not support changing projection during a live, zoomed session.
  window.d3 = new Proxy(baseD3, {
    get(target, property, receiver) {
      if (property === 'geoMercator') return selectedFactory;
      return Reflect.get(target, property, receiver);
    },
  });
}

const select = document.getElementById('map-projection');
const status = document.getElementById('map-projection-status');
if (select) {
  select.value = selectedProjection;
  select.addEventListener('change', () => {
    const next = VALID_PROJECTIONS.has(select.value) ? select.value : DEFAULT_PROJECTION;
    writeProjection(next);
    if (status) status.textContent = next === selectedProjection
      ? 'This projection is active for the current session.'
      : 'Saved. Reload or return to the main menu and load/start a game to apply it.';
  });
}

if (status) {
  status.textContent = 'Projection changes are applied when the game is next loaded.';
}

window.__worldsimMapProjection = selectedProjection;
