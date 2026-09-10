import { deriveRegionVisualProfile, representativeCount, stableRandom } from './regionVisuals.js?v=20260907-visual1';

// Canvas rendering rather than one SVG <path> per region: a few hundred
// DOM nodes with complex borders is what would get janky on a phone once
// you add pinch-zoom. This scales to the full world later without a rewrite.
const COLORS = {
  ocean: '#10141c',
  land: '#3a4a3e',
  landSelected: '#c08a4e',
  border: '#0b0e13',
  borderSelected: '#c08a4e',
  seaLow: '#141d2e',
  seaHigh: '#2c5270',
  seaBorder: '#3a5a72',
  farm: '#8a7848',
  forest: '#20382b',
  settlement: '#d1b987',
  settlementDark: '#715b42',
  road: '#9c835e',
  water: '#4d7890',
  mine: '#80746b',
  monument: '#d4c7a4',
  army: '#c94f43',
};

const CATEGORICAL_PALETTE = ['#c08a4e', '#4e8ac0', '#8ac04e', '#c04e8a', '#4ec0a8', '#a84ec0', '#c0a84e', '#6a6ac0'];
function categoricalColor(key, index, total) {
  if (total <= CATEGORICAL_PALETTE.length) return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
  let h = 2166136261;
  for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const hue = (h >>> 0) % 360;
  const sat = 46 + ((h >>> 8) % 24);
  const light = 48 + ((h >>> 16) % 18);
  return `hsl(${hue} ${sat}% ${light}%)`;
}
const TRADE_COLORS = {
  food: '#d7bc68', wood: '#6d9d64', copper: '#c8754f', tin: '#b8c5c9',
  bronze: '#c08a4e', iron: '#87909a', pottery: '#b56f56', textiles: '#9c76b7',
  pitch: '#57525b', basic_boat: '#6ea4b5', advanced_boat: '#8bc4d4',
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = a.map((ch, i) => Math.round(ch + (b[i] - ch) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export class MapRenderer {
  constructor(canvas, regions, { onSelect, seaRegions = [], isRegionVisible = () => true,
    isSeaRegionVisible = () => true, getConflictPressure = () => 0, onInteraction = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.regions = regions;
    this.regionsById = new Map(regions.map((region) => [region.id, region]));
    this.seaRegions = seaRegions;
    this.onSelect = onSelect || (() => {});
    this.isRegionVisible = isRegionVisible;
    this.isSeaRegionVisible = isSeaRegionVisible;
    this.getConflictPressure = getConflictPressure;
    this.onInteraction = onInteraction;
    this.selectedId = null;
    this.transform = d3.zoomIdentity;
    this.layer = null;
    this.layerConfig = null;
    this._visualProfileCache = new Map();
    this._animationHandle = null;
    this._drawQueued = false;
    this._isInteracting = false;
    this._lastAnimationDrawAt = 0;
    this._lastRenderedTransform = d3.zoomIdentity;
    this._gesturePreviewActive = false;

    this._resize();
    window.addEventListener('resize', () => this._resize());

    const featureCollection = {
      type: 'FeatureCollection',
      features: [...regions.map((r) => r.feature), ...seaRegions.map((s) => s.feature)],
    };

    this.projection = d3.geoMercator();
    this._fitProjection(featureCollection);
    this.path = d3.geoPath(this.projection, this.ctx);
    this._cacheProjectedPaths();

    this._setupZoom();
    this._setupTap();
    this.draw();
  }

  _fitProjection(featureCollection) {
    const pad = 24;
    this.projection.fitExtent(
      [[pad, pad], [this.width - pad, this.height - pad]],
      featureCollection
    );
  }

  _cacheProjectedPaths() {
    if (typeof Path2D !== 'function') {
      this._regionPaths = null;
      this._seaPaths = null;
      return;
    }

    const makePath = (feature) => {
      const path = new Path2D();
      d3.geoPath(this.projection, path)(feature);
      return path;
    };
    this._regionPaths = new Map(this.regions.map((region) => [region.id, makePath(region.feature)]));
    this._seaPaths = new Map(this.seaRegions.map((sea) => [sea.id, makePath(sea.feature)]));
    const boundsPath = d3.geoPath(this.projection);
    this._regionBounds = new Map(this.regions.map((region) => [region.id, boundsPath.bounds(region.feature)]));
    this._seaBounds = new Map(this.seaRegions.map((sea) => [sea.id, boundsPath.bounds(sea.feature)]));
  }

  _requestDraw() {
    if (this._drawQueued) return;
    this._drawQueued = true;
    requestAnimationFrame(() => {
      this._drawQueued = false;
      this.draw();
    });
  }

  _applyGesturePreview(nextTransform) {
    // Immediate compositor-only feedback: move/scale the already-painted
    // canvas while the expensive accurate map redraw waits for gesture end.
    const base = this._lastRenderedTransform || d3.zoomIdentity;
    const scale = nextTransform.k / Math.max(0.0001, base.k);
    const x = nextTransform.x - base.x * scale;
    const y = nextTransform.y - base.y * scale;
    this.canvas.style.transformOrigin = '0 0';
    this.canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    this.canvas.style.willChange = 'transform';
    this._gesturePreviewActive = true;
  }

  _clearGesturePreview() {
    if (!this._gesturePreviewActive) return;
    this.canvas.style.transform = '';
    this.canvas.style.transformOrigin = '';
    this.canvas.style.willChange = '';
    this._gesturePreviewActive = false;
  }

  _boundsOnScreen(bounds, margin = 48) {
    if (!bounds || this.transform.k <= 1.05) return true;
    const [[x0, y0], [x1, y1]] = bounds;
    const k = this.transform.k;
    const tx = this.transform.x;
    const ty = this.transform.y;
    return x1 * k + tx >= -margin && x0 * k + tx <= this.width + margin &&
      y1 * k + ty >= -margin && y0 * k + ty <= this.height + margin;
  }

  _fillAndStroke(feature, cachedPath) {
    if (cachedPath) {
      this.ctx.fill(cachedPath);
      this.ctx.stroke(cachedPath);
      return;
    }
    this.ctx.beginPath();
    this.path(feature);
    this.ctx.fill();
    this.ctx.stroke();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth || window.innerWidth;
    this.height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.path) this._requestDraw();
  }

  _setupZoom() {
    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .on('start', () => {
        this._isInteracting = true;
        this.onInteraction();
      })
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.onInteraction();
        this._applyGesturePreview(event.transform);
      })
      .on('end', () => {
        this._isInteracting = false;
        this.onInteraction();
        // Keep the preview visible until the accurate frame has been painted.
        this._requestDraw();
      });

    d3.select(this.canvas).call(zoom);
    this._zoom = zoom;
  }

  _setupTap() {
    this.canvas.addEventListener('pointerdown', () => this.onInteraction(), { passive: true });
    this.canvas.addEventListener('click', (event) => {
      this.onInteraction();
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = this._hitTest(x, y);

      if (hit) {
        this.selectedId = hit.id;
        this.onSelect(hit);
        this._requestDraw();
      }
    });
  }

  _hitTest(x, y) {
    // Undo pan/zoom to get back to projection space, invert the projection
    // to lon/lat, then check GeoJSON containment directly. Hidden regions
    // are deliberately skipped so fog of war also applies to touch input.
    const px = (x - this.transform.x) / this.transform.k;
    const py = (y - this.transform.y) / this.transform.k;
    const lonLat = this.projection.invert([px, py]);

    if (!lonLat) return null;

    for (const region of this.regions) {
      if (!this.isRegionVisible(region)) continue;
      const bounds = this._regionBounds?.get(region.id);
      if (bounds && (px < bounds[0][0] || px > bounds[1][0] || py < bounds[0][1] || py > bounds[1][1])) continue;
      if (d3.geoContains(region.feature, lonLat)) return region;
    }

    return null;
  }

  setLayer(config) {
    this.layerConfig = config;
    const visibleRegions = this.regions.filter((region) => this.isRegionVisible(region));

    if (config.type === 'categorical') {
      const values = visibleRegions.map(config.valueFn);
      const unique = [...new Set(values)];
      const colorByKey = new Map(
        unique.map((k, i) => [k, categoricalColor(k, i, unique.length)])
      );
      const counts = new Map();
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
      const legendKeys = unique.slice().sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, config.legendLimit || 12);

      this.layer = {
        type: 'categorical',
        valueFn: config.valueFn,
        label: config.label,
        colorByKey,
        legendKeys,
        visualOverlay: config.visualOverlay || null,
      };
    } else {
      const {
        valueFn,
        label,
        format = (v) => Math.round(v).toLocaleString(),
        colorLow = '#28352b',
        colorHigh = '#c08a4e',
      } = config;

      const values = visibleRegions.map(valueFn);
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 0;

      this.layer = {
        type: 'gradient',
        valueFn,
        label,
        format,
        colorLow,
        colorHigh,
        min,
        max,
        visualOverlay: config.visualOverlay || null,
      };
    }

    this._syncAnimationLoop();
    this._requestDraw();
  }

  refreshLayer() {
    this._visualProfileCache.clear();
    if (this.layerConfig) this.setLayer(this.layerConfig);
    else this._requestDraw();
  }

  clearLayer() {
    this.layer = null;
    this.layerConfig = null;
    this._syncAnimationLoop();
    this._requestDraw();
  }

  getLegendInfo() {
    if (!this.layer) return null;

    if (this.layer.type === 'categorical') {
      const { label, colorByKey, legendKeys } = this.layer;
      const keys = legendKeys || [...colorByKey.keys()];
      return {
        type: 'categorical',
        label,
        entries: keys.map((key) => ({ key, color: colorByKey.get(key) })),
        hiddenCategoryCount: Math.max(0, colorByKey.size - keys.length),
      };
    }

    const { label, min, max, format, colorLow, colorHigh } = this.layer;
    return {
      type: 'gradient',
      label,
      min: format(min),
      max: format(max),
      colorLow,
      colorHigh,
    };
  }

  _fillForRegion(region) {
    if (region.id === this.selectedId) return COLORS.landSelected;
    if (!this.layer) return COLORS.land;

    if (this.layer.type === 'categorical') {
      return this.layer.colorByKey.get(this.layer.valueFn(region)) || COLORS.land;
    }

    const { valueFn, min, max, colorLow, colorHigh } = this.layer;
    const t = max > min ? (valueFn(region) - min) / (max - min) : 0.5;
    return lerpColor(colorLow, colorHigh, t);
  }

  _regionOnScreen(region, margin = 180) {
    const projected = this.projection(region.centroid);
    if (!projected) return false;
    const x = projected[0] * this.transform.k + this.transform.x;
    const y = projected[1] * this.transform.k + this.transform.y;
    return x >= -margin && x <= this.width + margin && y >= -margin && y <= this.height + margin;
  }

  _profile(region) {
    // Profiles are cheap, but avoiding several dozen occupation/asset scans per
    // draw matters while the player is pinch-zooming on a phone. Tick refreshes
    // clear this cache through refreshLayer().
    let profile = this._visualProfileCache.get(region.id);
    if (!profile) {
      profile = deriveRegionVisualProfile(region);
      this._visualProfileCache.set(region.id, profile);
    }
    return profile;
  }

  _clipRegion(region) {
    const cached = this._regionPaths?.get(region.id);
    if (cached) {
      this.ctx.clip(cached);
      return true;
    }
    return false;
  }

  _drawRegionalDetail(region) {
    const k = this.transform.k;
    const selected = region.id === this.selectedId;
    if ((!selected && k < 4) || (selected && k < 2.6) || !this._regionOnScreen(region)) return;

    const centre = this.projection(region.centroid);
    if (!centre) return;
    const ctx = this.ctx;
    const profile = this._profile(region);
    const rand = stableRandom(`${region.id}:landscape`);
    const u = 1 / Math.sqrt(k);
    const radius = (selected ? 32 : 24) * u;

    ctx.save();
    this._clipRegion(region);

    // Agricultural populations spread across the landscape. Urban-commercial
    // regions instead reserve more visual space for a dense central settlement.
    const farmMarks = representativeCount(profile.population * profile.agricultureShare,
      { max: selected ? 22 : 12, scale: 0.055 });
    ctx.strokeStyle = COLORS.farm;
    ctx.globalAlpha = 0.48;
    ctx.lineWidth = 1.2 * u;
    for (let i = 0; i < farmMarks; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = radius * (0.42 + rand() * 0.72);
      const x = centre[0] + Math.cos(angle) * dist;
      const y = centre[1] + Math.sin(angle) * dist;
      const len = (3 + rand() * 5) * u;
      ctx.beginPath();
      ctx.moveTo(x - len, y);
      ctx.lineTo(x + len, y + len * 0.22);
      ctx.stroke();
    }

    // Existing forest stock is visible and can physically thin as logging or
    // collapse changes the underlying simulation stock.
    const trees = Math.round((selected ? 22 : 12) * profile.forestFraction);
    ctx.fillStyle = COLORS.forest;
    ctx.globalAlpha = 0.82;
    for (let i = 0; i < trees; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = radius * (0.55 + rand() * 0.8);
      const x = centre[0] + Math.cos(angle) * dist;
      const y = centre[1] + Math.sin(angle) * dist;
      const s = (1.8 + rand() * 1.7) * u;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.8);
      ctx.lineTo(x - s, y + s);
      ctx.lineTo(x + s, y + s);
      ctx.closePath();
      ctx.fill();
    }

    // Irrigated agrarian regions get a visibly linear water focus instead of
    // being rendered as the same generic circular city pattern everywhere.
    if (profile.irrigationFocus > 0.2) {
      ctx.strokeStyle = COLORS.water;
      ctx.globalAlpha = 0.55 + profile.irrigationFocus * 0.3;
      ctx.lineWidth = (1 + profile.irrigationFocus) * u;
      ctx.beginPath();
      ctx.moveTo(centre[0] - radius * 1.25, centre[1] + radius * 0.22);
      ctx.bezierCurveTo(
        centre[0] - radius * 0.45, centre[1] - radius * 0.12,
        centre[0] + radius * 0.35, centre[1] + radius * 0.4,
        centre[0] + radius * 1.25, centre[1] - radius * 0.1
      );
      ctx.stroke();
    }

    // Roads are an actual constructed asset. At this scale a route web is more
    // useful than drawing a literal road network the simulation does not track.
    if (profile.infrastructure.road > 0) {
      ctx.strokeStyle = COLORS.road;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1.2 * u;
      for (let i = 0; i < 3; i++) {
        const angle = rand() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(centre[0], centre[1]);
        ctx.lineTo(centre[0] + Math.cos(angle) * radius * 1.4, centre[1] + Math.sin(angle) * radius * 1.4);
        ctx.stroke();
      }
    }

    // Rural settlement count is driven by people who actually work dispersed
    // land-based occupations. A huge farming region therefore looks unlike a
    // similarly populous mining/craft/trading hub.
    const ruralPopulation = profile.population * Math.max(0, 1 - profile.urbanFraction);
    const hamlets = representativeCount(ruralPopulation * Math.max(0.25, profile.agricultureShare),
      { min: ruralPopulation > 500 ? 1 : 0, max: selected ? 18 : 9, scale: 0.045 });
    ctx.fillStyle = COLORS.settlementDark;
    ctx.globalAlpha = 0.88;
    for (let i = 0; i < hamlets; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = radius * (0.42 + rand() * 0.75);
      const x = centre[0] + Math.cos(angle) * dist;
      const y = centre[1] + Math.sin(angle) * dist;
      const s = (1.4 + rand() * 1.2) * u;
      ctx.fillRect(x - s, y - s, s * 2, s * 1.6);
    }

    // Principal settlement: its size is occupation- and infrastructure-driven,
    // not a direct population threshold. Water capacity can visibly constrain
    // urbanisation even when the wider region contains many people.
    const urbanPopulation = profile.population * profile.urbanFraction;
    if (urbanPopulation > 120) {
      const citySize = Math.min(12, 2.4 + Math.log10(Math.max(100, urbanPopulation)) * 1.45) * u;
      const blocks = Math.max(2, Math.min(18, Math.round(Math.sqrt(urbanPopulation) / 35)));
      ctx.fillStyle = COLORS.settlement;
      ctx.strokeStyle = COLORS.settlementDark;
      ctx.globalAlpha = 0.94;
      ctx.lineWidth = 0.8 * u;
      for (let i = 0; i < blocks; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = citySize * Math.sqrt(rand()) * 0.75;
        const s = (1.4 + rand() * 1.8) * u;
        const x = centre[0] + Math.cos(angle) * dist;
        const y = centre[1] + Math.sin(angle) * dist;
        ctx.fillRect(x - s, y - s, s * 2, s * 1.55);
        ctx.strokeRect(x - s, y - s, s * 2, s * 1.55);
      }
      if (profile.infrastructure.walls > 0) {
        ctx.beginPath();
        ctx.arc(centre[0], centre[1], citySize * 1.05, 0, Math.PI * 2);
        ctx.strokeStyle = '#bca878';
        ctx.lineWidth = 1.4 * u;
        ctx.stroke();
      }
    }

    // Mining/extractive activity follows real occupations and real deposits.
    const mineMarks = Math.min(profile.productiveDeposits.length,
      representativeCount(profile.extractiveShare * profile.working, { max: selected ? 5 : 3, scale: 0.04 }));
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < mineMarks; i++) {
      const angle = (i / Math.max(1, mineMarks)) * Math.PI * 2 + rand();
      const dist = radius * (0.72 + rand() * 0.45);
      const x = centre[0] + Math.cos(angle) * dist;
      const y = centre[1] + Math.sin(angle) * dist;
      const s = 3.2 * u;
      ctx.fillStyle = COLORS.mine;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.lineTo(x + s, y + s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c4b8a7';
      ctx.lineWidth = 0.8 * u;
      ctx.beginPath();
      ctx.moveTo(x - s * 1.2, y - s * 0.3);
      ctx.lineTo(x + s * 1.2, y + s * 0.6);
      ctx.stroke();
    }

    // Persistent monuments are deliberately conspicuous. Their condition comes
    // from construction assets, so neglected works can remain as diminished
    // landmarks instead of disappearing when their dynasty does.
    profile.monumentAssets.slice(0, selected ? 6 : 3).forEach((asset, i) => {
      const condition = clamp01(asset.condition ?? 1);
      const scale = Math.max(0.6, Number(asset.scale) || 1);
      const angle = -0.8 + i * 0.55;
      const dist = radius * (0.34 + i * 0.08);
      const x = centre[0] + Math.cos(angle) * dist;
      const y = centre[1] + Math.sin(angle) * dist;
      const s = (2.8 + Math.sqrt(scale) * 1.8) * u;
      ctx.globalAlpha = 0.35 + condition * 0.65;
      ctx.fillStyle = COLORS.monument;
      if (asset.typeId === 'monumental_tomb') {
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.lineTo(x + s, y + s);
        ctx.closePath();
        ctx.fill();
      } else if (asset.typeId === 'great_temple') {
        ctx.fillRect(x - s, y - s * 0.55, s * 2, s * 1.3);
        ctx.fillRect(x - s * 0.7, y - s, s * 0.35, s * 1.8);
        ctx.fillRect(x + s * 0.35, y - s, s * 0.35, s * 1.8);
      } else {
        ctx.fillRect(x - s * 0.65, y - s, s * 1.3, s * 2);
      }
    });

    // Harbours and local fleets appear only once the player is close enough to
    // care. Exact coastline anchoring can come later; clipping keeps this cue
    // inside the actual region rather than inventing a second geography model.
    if (profile.infrastructure.harbour > 0 && region.isCoastal) {
      const x = centre[0] + radius * 0.85;
      const y = centre[1] + radius * 0.5;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#b99c70';
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(x - 5 * u, y);
      ctx.lineTo(x + 5 * u, y);
      ctx.stroke();
      const boats = Math.min(5, representativeCount((region.navy?.boats || 0) + (region.fishingBoats || 0), { max: 5, scale: 0.22 }));
      for (let i = 0; i < boats; i++) this._drawBoat(x + (i - 2) * 5 * u, y + 5 * u, u, Boolean(region.navy?.advancedBoats));
    }

    // A home army is visible in the landscape even without selecting a military
    // overlay. It is deliberately representative rather than one sprite/person.
    if (k >= 5 && (region.army?.personnel || 0) > 0) {
      const soldiers = Math.min(12, representativeCount(region.army.personnel, { max: 12, scale: 0.12 }));
      const baseX = centre[0] - radius * 0.72;
      const baseY = centre[1] + radius * 0.64;
      ctx.fillStyle = COLORS.army;
      ctx.globalAlpha = 0.92;
      for (let i = 0; i < soldiers; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        ctx.beginPath();
        ctx.arc(baseX + col * 3.1 * u, baseY + row * 3.3 * u, 1.15 * u, 0, Math.PI * 2);
        ctx.fill();
      }
      if ((region.horseEconomy?.war || 0) > 20) {
        ctx.strokeStyle = '#d1b987';
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.arc(baseX - 4 * u, baseY + 2 * u, 2.2 * u, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawBoat(x, y, u, advanced = false) {
    const ctx = this.ctx;
    const s = (advanced ? 4.5 : 3.5) * u;
    ctx.strokeStyle = advanced ? '#d6e1de' : '#bfc9c4';
    ctx.fillStyle = advanced ? '#7fa6b2' : '#657f86';
    ctx.lineWidth = 0.9 * u;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x + s * 0.55, y + s * 0.5);
    ctx.lineTo(x - s * 0.6, y + s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - s * 1.5);
    ctx.lineTo(x + s * (advanced ? 0.9 : 0.65), y - s * 0.55);
    ctx.lineTo(x, y - s * 0.55);
    ctx.closePath();
    ctx.stroke();
  }

  _tradeRoutes() {
    const routes = [];
    for (const origin of this.regions) {
      if (!this.isRegionVisible(origin)) continue;
      for (const venture of origin.tradeEconomy?.ventures || []) {
        const dest = this.regionsById.get(venture.destId);
        if (!dest || !this.isRegionVisible(dest)) continue;
        routes.push({ origin, dest, venture });
      }
    }
    return routes;
  }

  _drawTradeOverlay(now = performance.now()) {
    const ctx = this.ctx;
    const k = this.transform.k;
    const u = 1 / k;
    const routes = this._tradeRoutes();
    const maxRoutes = k < 2 ? 90 : 180;
    for (const { origin, dest, venture } of routes.slice(0, maxRoutes)) {
      const a = this.projection(origin.centroid);
      const b = this.projection(dest.centroid);
      if (!a || !b) continue;
      const color = TRADE_COLORS[venture.resource] || '#d6c49c';
      const merchants = Math.max(1, Number(venture.merchants) || 1);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28 + clamp01(venture.reliability) * 0.42;
      ctx.lineWidth = Math.min(5, 0.8 + Math.sqrt(merchants) * 0.22) * u;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();

      const phaseSeed = stableRandom(venture.id || `${origin.id}:${dest.id}`)();
      const phase = (phaseSeed + now / 5500) % 1;
      const outward = venture.arrived ? 1 - phase : phase;
      const x = a[0] + (b[0] - a[0]) * outward;
      const y = a[1] + (b[1] - a[1]) * outward;
      ctx.globalAlpha = 0.95;
      if (venture.transportMode === 'sea') {
        const advancedShare = (origin.tradeEconomy?.advancedMerchantBoats || 0) /
          Math.max(1, origin.tradeEconomy?.merchantBoats || 1);
        this._drawBoat(x, y, 1.8 * u, advancedShare > 0.35);
      } else {
        ctx.fillStyle = color;
        const s = 2.2 * u;
        ctx.fillRect(x - s, y - s * 0.65, s * 2, s * 1.3);
        ctx.beginPath();
        ctx.arc(x - s * 0.55, y + s, s * 0.38, 0, Math.PI * 2);
        ctx.arc(x + s * 0.55, y + s, s * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawMilitaryOverlay() {
    const ctx = this.ctx;
    const k = this.transform.k;
    const u = 1 / k;
    for (const region of this.regions) {
      if (!this.isRegionVisible(region) || !this._regionOnScreen(region, 80)) continue;
      const home = Math.max(0, Number(region.army?.personnel) || 0);
      const away = Math.max(0, Number(region.army?.away) || 0);
      if (home + away < 1) continue;
      const centre = this.projection(region.centroid);
      if (!centre) continue;
      const size = Math.min(9, 3 + Math.log10(home + away + 1) * 1.2) * u;
      ctx.fillStyle = COLORS.army;
      ctx.strokeStyle = '#f0d0b4';
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 0.9 * u;
      ctx.beginPath();
      ctx.moveTo(centre[0], centre[1] - size);
      ctx.lineTo(centre[0] + size * 0.8, centre[1] + size);
      ctx.lineTo(centre[0] - size * 0.8, centre[1] + size);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if ((region.horseEconomy?.war || 0) > Math.max(10, home * 0.03)) {
        ctx.beginPath();
        ctx.arc(centre[0] + size, centre[1], size * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      const siege = region.siegeEquipment?.inventory || {};
      const siegeCount = (siege.ram?.bronze || 0) + (siege.ram?.iron || 0) +
        (siege.catapult?.bronze || 0) + (siege.catapult?.iron || 0);
      if (siegeCount > 0) {
        ctx.fillStyle = '#c9b18a';
        ctx.fillRect(centre[0] - size * 1.65, centre[1] + size * 0.3, size * 0.65, size * 0.45);
      }
    }
    ctx.globalAlpha = 1;
  }

  _syncAnimationLoop() {
    const shouldAnimate = this.layer?.visualOverlay === 'trade';
    if (!shouldAnimate && this._animationHandle !== null) {
      cancelAnimationFrame(this._animationHandle);
      this._animationHandle = null;
      return;
    }
    if (!shouldAnimate || this._animationHandle !== null) return;
    const animate = (now) => {
      this._animationHandle = requestAnimationFrame(animate);
      if (this._isInteracting || now - this._lastAnimationDrawAt < 100) return;
      this._lastAnimationDrawAt = now;
      this._requestDraw();
    };
    this._animationHandle = requestAnimationFrame(animate);
  }

  draw() {
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    // A sea is only drawn once at least one adjacent land region is visible.
    // Otherwise the outline of a hidden coastline would leak map knowledge.
    ctx.lineWidth = 1 / this.transform.k;
    ctx.strokeStyle = COLORS.seaBorder;

    for (const sea of this.seaRegions) {
      if (!this.isSeaRegionVisible(sea) || !this._boundsOnScreen(this._seaBounds?.get(sea.id))) continue;

      const stockFraction = sea.fish.K > 0 ? sea.fish.currentStock / sea.fish.K : 0;

      ctx.fillStyle = lerpColor(
        COLORS.seaLow,
        COLORS.seaHigh,
        Math.max(0, Math.min(1, stockFraction))
      );
      this._fillAndStroke(sea.feature, this._seaPaths?.get(sea.id));
    }

    for (const region of this.regions) {
      if (!this.isRegionVisible(region) || !this._boundsOnScreen(this._regionBounds?.get(region.id))) continue;

      const selected = region.id === this.selectedId;
      const conflictPressure = Math.max(0, Math.min(1, this.getConflictPressure(region) || 0));

      ctx.fillStyle = this._fillForRegion(region);
      ctx.lineWidth = (selected ? 2.5 : conflictPressure > 0 ? 2 + conflictPressure * 3 : 1) / this.transform.k;
      ctx.strokeStyle = selected ? COLORS.borderSelected : conflictPressure > 0 ? '#c94f43' : COLORS.border;
      this._fillAndStroke(region.feature, this._regionPaths?.get(region.id));
    }

    if (!this._isInteracting && this.transform.k >= 2.6) {
      for (const region of this.regions) {
        if (!this.isRegionVisible(region)) continue;
        this._drawRegionalDetail(region);
      }
    }

    if (!this._isInteracting && this.layer?.visualOverlay === 'trade') this._drawTradeOverlay();
    if (!this._isInteracting && this.layer?.visualOverlay === 'military') this._drawMilitaryOverlay();

    ctx.restore();

    // The canvas now exactly represents the current transform, so swap out
    // the temporary compositor preview without changing the apparent view.
    this._lastRenderedTransform = this.transform;
    this._clearGesturePreview();
  }
}
