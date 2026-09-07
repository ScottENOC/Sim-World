// Stable map-overlay scaling for the map-first UI.
//
// Fog-of-war discovery must not recolour the entire known world. The original
// renderer recalculated gradient min/max and categorical colour assignment from
// only the currently visible regions every time refreshLayer() ran. This module
// gives each layer a stable scale for the session and deterministic categorical
// colours, while preserving the existing renderer and overlay drawing code.

const FIXED_DOMAINS = new Map([
  ['Population / km²', [0, 8]],
  ['Stability', [0, 1]],
]);

const PALETTE = ['#c08a4e', '#4e8ac0', '#8ac04e', '#c04e8a', '#4ec0a8', '#a84ec0', '#c0a84e', '#6a6ac0'];

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hashText(text) {
  let hash = 2166136261;
  for (const ch of String(text ?? '')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicColour(key) {
  return PALETTE[hashText(key) % PALETTE.length];
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function robustDomain(regions, valueFn, label) {
  const fixed = FIXED_DOMAINS.get(label);
  if (fixed) return fixed;

  const values = regions.map((region) => finite(valueFn(region), NaN)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return [0, 1];

  // Economic/military overlays are usually zero-heavy with a long tail. The
  // 95th percentile makes the ordinary range readable while extreme values
  // simply saturate at the strongest colour.
  const upper = Math.max(1e-9, percentile(values, 0.95), values[Math.min(values.length - 1, 3)] || 0);
  return [0, upper];
}

function syncLegend(map) {
  const info = map?.getLegendInfo?.();
  if (!info) return;
  const label = document.getElementById('legend-label');
  const gradient = document.getElementById('legend-gradient');
  const categorical = document.getElementById('legend-categorical');
  const bar = document.getElementById('legend-bar');
  if (label) label.textContent = info.label;

  if (info.type === 'categorical') {
    gradient?.classList.add('hidden');
    categorical?.classList.remove('hidden');
    if (categorical) {
      categorical.innerHTML = info.entries.map((entry) =>
        `<div class="legend-swatch-row"><span class="legend-swatch" style="background:${entry.color}"></span>${entry.key}</div>`).join('');
    }
    return;
  }

  categorical?.classList.add('hidden');
  gradient?.classList.remove('hidden');
  const minEl = document.getElementById('legend-min');
  const maxEl = document.getElementById('legend-max');
  if (minEl) minEl.textContent = info.min;
  if (maxEl) maxEl.textContent = info.max;
  if (bar) bar.style.background = `linear-gradient(to right, ${info.colorLow}, ${info.colorHigh})`;
}

function install() {
  const sim = window.__worldsim;
  const map = sim?.map;
  if (!map || map._stableOverlayScalesInstalled) return Boolean(map);
  map._stableOverlayScalesInstalled = true;
  map._overlayDomains = new Map();

  const originalSetLayer = map.setLayer.bind(map);
  map.setLayer = function setStableLayer(config) {
    if (!config) return originalSetLayer(config);

    if (config.type === 'categorical') {
      this.layerConfig = config;
      const keys = [...new Set(this.regions.map((region) => config.valueFn(region)).filter((value) => value !== undefined && value !== null))];
      const colorByKey = new Map(keys.map((key) => [key, deterministicColour(key)]));
      this.layer = {
        type: 'categorical', valueFn: config.valueFn, label: config.label,
        colorByKey, visualOverlay: config.visualOverlay || null,
      };
      this._syncAnimationLoop();
      this.draw();
      syncLegend(this);
      return;
    }

    const rawValueFn = (region) => finite(config.valueFn(region), 0);
    const key = config.scaleKey || config.label || 'unnamed-gradient';
    if (!this._overlayDomains.has(key)) {
      const explicit = Array.isArray(config.fixedDomain) && config.fixedDomain.length === 2
        ? [finite(config.fixedDomain[0], 0), finite(config.fixedDomain[1], 1)]
        : robustDomain(this.regions, rawValueFn, config.label);
      this._overlayDomains.set(key, explicit);
    }
    const [domainMin, domainMax] = this._overlayDomains.get(key);
    const min = finite(domainMin, 0);
    const max = Math.max(finite(domainMax, 1), min + 1e-9);
    const paintedValueFn = (region) => Math.max(min, Math.min(max, rawValueFn(region)));

    this.layerConfig = config;
    this.layer = {
      type: 'gradient',
      valueFn: paintedValueFn,
      label: config.label,
      format: config.format || ((value) => Math.round(value).toLocaleString()),
      colorLow: config.colorLow || '#28352b',
      colorHigh: config.colorHigh || '#c08a4e',
      min,
      max,
      visualOverlay: config.visualOverlay || null,
    };
    this._syncAnimationLoop();
    this.draw();
    syncLegend(this);
  };

  // refreshLayer should update painted values, not choose a new scale.
  map.refreshLayer = function refreshStableLayer() {
    this._visualProfileCache?.clear();
    if (this.layerConfig) this.setLayer(this.layerConfig);
    else this.draw();
  };

  // All layer buttons share the same legend widget; sync it after their own
  // click handlers have switched the active layer.
  document.querySelector('.layer-toggle')?.addEventListener('click', () => {
    queueMicrotask(() => syncLegend(map));
  }, { capture: true });

  // Re-apply the current population layer immediately. Its legend becomes a
  // meaningful 0.0–8.0 people/km² range instead of 0.0–0.0.
  if (map.layerConfig) map.setLayer(map.layerConfig);
  return true;
}

if (typeof window !== 'undefined') {
  let attempts = 0;
  const tryInstall = () => {
    attempts += 1;
    if (install() || attempts >= 1200) return;
    setTimeout(tryInstall, 100);
  };
  setTimeout(tryInstall, 0);
}
