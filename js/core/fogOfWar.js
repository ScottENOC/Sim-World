import { canSeeMap } from './knowledge.js?v=20260904-weather1';

export class FogOfWar {
  constructor(regions) {
    this.regions = regions;
    this.devMode = false;
    this.physicalWorldKnown = false;
    this.playerRegionId = null;
  }

  setDevMode(enabled) { this.devMode = Boolean(enabled); }
  setPhysicalWorldKnown(enabled) { this.physicalWorldKnown = Boolean(enabled); }
  setPlayerRegion(regionId) { this.playerRegionId = regionId; }

  isVisible(region) {
    if (this.devMode || this.physicalWorldKnown) return true;
    if (!this.playerRegionId || !region) return false;
    const playerRegion = this.regions.find((r) => r.id === this.playerRegionId);
    if (!playerRegion) return false;
    return canSeeMap(playerRegion, region);
  }

  visibleRegions() {
    if (this.devMode || this.physicalWorldKnown) return this.regions;
    return this.regions.filter((region) => this.isVisible(region));
  }
}
