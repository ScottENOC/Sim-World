// Canvas rendering rather than one SVG <path> per region: a few hundred
// DOM nodes with complex borders is what gets janky on a phone once you
// add pinch-zoom. This scales to the full world later without a rewrite.

const COLORS = {
  ocean: '#10141c',
  land: '#3a4a3e',
  landSelected: '#c08a4e',
  border: '#6b7d63',
};

export class MapRenderer {
  constructor(canvas, regions, { onSelect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.regions = regions;
    this.onSelect = onSelect || (() => {});
    this.selectedId = null;
    this.transform = d3.zoomIdentity;

    this._resize();
    window.addEventListener('resize', () => this._resize());

    const featureCollection = {
      type: 'FeatureCollection',
      features: regions.map((r) => r.feature),
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
    // Test in screen space by re-tracing each region's path under the
    // current zoom transform and asking the canvas if the point is inside.
    this.ctx.save();
    this.ctx.translate(this.transform.x, this.transform.y);
    this.ctx.scale(this.transform.k, this.transform.k);
    let found = null;
    for (const region of this.regions) {
      this.ctx.beginPath();
      this.path(region.feature);
      if (this.ctx.isPointInPath(x, y)) {
        found = region;
        break;
      }
    }
    this.ctx.restore();
    return found;
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(this.transform.x, this.transform.y);
    ctx.scale(this.transform.k, this.transform.k);

    ctx.lineWidth = 1 / this.transform.k;
    ctx.strokeStyle = COLORS.border;

    for (const region of this.regions) {
      ctx.beginPath();
      this.path(region.feature);
      ctx.fillStyle = region.id === this.selectedId ? COLORS.landSelected : COLORS.land;
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }
}
