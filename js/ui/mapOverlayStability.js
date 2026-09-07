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

  // Most economic/military overlays are zero-heavy with a long tail. Anchoring
  // at zero and the 95th percentile keeps ordinary regions distinguishable and
  // prevents one giant polity from flattening every other colour.
  const upper = Math.max(1e-9, percentile(values, 0.95), values[Math.min(values.length - 1, 3)] || 0);
  return [0, upper];
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
      return;
    }

    const safeValueFn = (region) => finite(config.valueFn(region), 0);
    const key = config.scaleKey || config.label || 'unnamed-gradient';
    if (!this._overlayDomains.has(key)) {
      this._overlayDomains.set(key, robustDomain(this.regions, safeValueFn, config.label));
    }
    const [min, max] = this._overlayDomains.get(key);
    this.layerConfig = config;
    this.layer = {
      type: 'gradient',
      valueFn: safeValueFn,
      label: config.label,
      format: config.format || ((value) => Math.round(value).toLocaleString()),
      colorLow: config.colorLow || '#28352b',
      colorHigh: config.colorHigh || '#c08a4e',
      min: finite(min, 0),
      max: Math.max(finite(max, 1), finite(min, 0) + 1e-9),
      visualOverlay: config.visualOverlay || null,
    };
    this._syncAnimationLoop();
    this.draw();
  };

  // refreshLayer should update the painted values, not choose a new scale.
  map.refreshLayer = function refreshStableLayer() {
    this._visualProfileCache?.clear();
    if (this.layerConfig) this.setLayer(this.layerConfig);
    else this.draw();
  };

  // Re-apply the currently active layer once so the initial population legend
  // immediately becomes the stable 0.0–8.0 people/km² scale.
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
