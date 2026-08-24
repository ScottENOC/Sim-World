// Canvas rendering rather than one SVG <path> per region: a few hundred
// DOM nodes with complex borders is what gets janky on a phone once you
// add pinch-zoom. This scales to the full world later without a rewrite.

const COLORS = {
  ocean: '#10141c',
  land: '#3a4a3e',
  landSelected: '#c08a4e',
  border: '#0b0e13',
  borderSelected: '#c08a4e',
  seaLow: '#141d2e',  // fished-out — barely distinguishable from the void
  seaHigh: '#2c5270', // full fish stock — a real, visible body of water
  seaBorder: '#3a5a72',
};

const CATEGORICAL_PALETTE = ['#c08a4e', '#4e8ac0', '#8ac04e', '#c04e8a', '#4ec0a8', '#a84ec0', '#c0a84e', '#6a6ac0'];

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

export class MapRenderer {
  constructor(canvas, regions, { onSelect, seaRegions = [] } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.regions = regions;
    this.seaRegions = seaRegions;
    this.onSelect = onSelect || (() => {});
    this.selectedId = null;
    this.transform = d3.zoomIdentity;
    this.layer = null; // active choropleth layer, set via setLayer()

    this._resize();
    window.addEventListener('resize', () => this._resize());

    const featureCollection = {
      type: 'FeatureCollection',
      features: [...regions.map((r) => r.feature), ...seaRegions.map((s) => s.feature)],
    };

    this.projection = d3.geoMercator();
    this._fitProjection(featureCollection);
    this.path = d3.geoPath(this.projection, this.ctx);

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

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth || window.innerWidth;
    this.height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.path) this.draw();
  }

  _setupZoom() {
    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .on('zoom', (event) => {
        this.transform = event.transform;
        this.draw();
      });
    d3.select(this.canvas).call(zoom);
    this._zoom = zoom;
  }

  _setupTap() {
    this.canvas.addEventListener('click', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = this._hitTest(x, y);
      if (hit) {
        this.selectedId = hit.id;
        this.onSelect(hit);
        this.draw();
      }
    });
  }

  _hitTest(x, y) {
    // Undo pan/zoom to get back to projection space, invert the projection
    // to lon/lat, then check GeoJSON containment directly. Deliberately NOT
    // using canvas isPointInPath here — its coordinate-space handling is
    // inconsistent enough across devices (especially at high
    // devicePixelRatio, which is exactly what every iPhone has and most
    // desktop dev setups don't) that it's the likely cause of taps
    // registering the wrong region. This approach never touches canvas
    // pixel coordinates at all, so it's DPR-independent by construction.
    const px = (x - this.transform.x) / this.transform.k;
    const py = (y - this.transform.y) / this.transform.k;
    const lonLat = this.projection.invert([px, py]);
    if (!lonLat) return null;
    for (const region of this.regions) {
      if (d3.geoContains(region.feature, lonLat)) return region;
    }
    return null;
  }

  // valueFn(region) -> number, shaded from colorLow to colorHigh. Pass
  // type: 'categorical' with a valueFn returning a string (e.g. controller
  // id) instead, for a distinct color per value rather than a gradient —
  // used by the political/controller view.
  setLayer(config) {
    if (config.type === 'categorical') {
      const values = this.regions.map(config.valueFn);
      const unique = [...new Set(values)];
      const colorByKey = new Map(unique.map((k, i) => [k, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]]));
      this.layer = { type: 'categorical', valueFn: config.valueFn, label: config.label, colorByKey };
    } else {
      const { valueFn, label, format = (v) => Math.round(v).toLocaleString(), colorLow = '#28352b', colorHigh = '#c08a4e' } = config;
      const values = this.regions.map(valueFn);
      this.layer = {
        type: 'gradient',
        valueFn, label, format, colorLow, colorHigh,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
    this.draw();
  }

  clearLayer() {
    this.layer = null;
    this.draw();
  }

  getLegendInfo() {
    if (!this.layer) return null;
    if (this.layer.type === 'categorical') {
      const { label, colorByKey } = this.layer;
      return { type: 'categorical', label, entries: [...colorByKey.entries()].map(([key, color]) => ({ key, color })) };
    }
    const { label, min, max, format, colorLow, colorHigh } = this.layer;
    return { type: 'gradient', label, min: format(min), max: format(max), colorLow, colorHigh };
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

  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    // Seas first — not interactive this pass, just a visible signal of fish
    // abundance (a fished-out sea fades toward the void; a full one reads
    // as real water) so overfishing a shared sea is visible on the map
    // itself, not just in a stat panel.
    ctx.lineWidth = 1 / this.transform.k;
    ctx.strokeStyle = COLORS.seaBorder;
    for (const sea of this.seaRegions) {
      const stockFraction = sea.fish.K > 0 ? sea.fish.currentStock / sea.fish.K : 0;
      ctx.beginPath();
      this.path(sea.feature);
      ctx.fillStyle = lerpColor(COLORS.seaLow, COLORS.seaHigh, Math.max(0, Math.min(1, stockFraction)));
      ctx.fill();
      ctx.stroke();
    }

    for (const region of this.regions) {
      const selected = region.id === this.selectedId;
      ctx.beginPath();
      this.path(region.feature);
      ctx.fillStyle = this._fillForRegion(region);
      ctx.fill();
      ctx.lineWidth = (selected ? 2.5 : 1) / this.transform.k;
      ctx.strokeStyle = selected ? COLORS.borderSelected : COLORS.border;
      ctx.stroke();
    }

    ctx.restore();
  }
}
