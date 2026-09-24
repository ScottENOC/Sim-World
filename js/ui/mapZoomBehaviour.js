import { MapRenderer } from './mapRenderer.js?v=20260904-war1';

const MAX_MAP_ZOOM = 8;

function ensureInteractionSurface(renderer) {
  if (renderer._interactionSurface?.isConnected) return renderer._interactionSurface;

  const surface = document.createElement('div');
  surface.className = 'map-interaction-surface';
  surface.setAttribute('aria-hidden', 'true');
  Object.assign(surface.style, {
    position: 'absolute',
    inset: '0',
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  });

  renderer.canvas.insertAdjacentElement('afterend', surface);
  renderer._interactionSurface = surface;
  return surface;
}

MapRenderer.prototype._setupZoom = function setupStableMapZoom() {
  const interactionSurface = ensureInteractionSurface(this);
  const zoom = d3.zoom()
    .scaleExtent([1, MAX_MAP_ZOOM])
    .on('start', () => {
      this._isInteracting = true;
      this.onInteraction();
    })
    .on('zoom', (event) => {
      this.transform = event.transform;
      this.onInteraction();
      // The visual preview may transform the canvas, but D3 now measures the
      // fingers against the separate, untransformed surface. This keeps the
      // geographic point under the pinch midpoint fixed, like familiar map apps.
      this._applyGesturePreview(event.transform);
    })
    .on('end', () => {
      this._isInteracting = false;
      this.onInteraction();
      this._requestDraw();
    });

  d3.select(interactionSurface).call(zoom);
  this._zoom = zoom;
};

MapRenderer.prototype._setupTap = function setupStableMapTap() {
  const interactionSurface = ensureInteractionSurface(this);
  interactionSurface.addEventListener('pointerdown', () => this.onInteraction(), { passive: true });
  interactionSurface.addEventListener('click', (event) => {
    this.onInteraction();
    const rect = interactionSurface.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = this._hitTest(x, y);

    if (hit) {
      this.selectedId = hit.id;
      this.onSelect(hit);
      this._requestDraw();
    }
  });
};

export { MAX_MAP_ZOOM, ensureInteractionSurface };
