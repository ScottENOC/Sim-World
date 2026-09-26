import { MapRenderer } from './mapRenderer.js?v=20260904-war1';

const originalDrawRegionalDetail = MapRenderer.prototype._drawRegionalDetail;

MapRenderer.prototype._drawRegionalDetail = function drawStableRegionalDetail(region) {
  // Dense modern scenarios can otherwise paint dozens of settlement blocks over
  // every visible region as soon as the player reaches mid zoom. Keep broad map
  // reading clean and reserve detailed settlement symbols for the selected region.
  if (region?.id !== this.selectedId) return;
  return originalDrawRegionalDetail.call(this, region);
};
