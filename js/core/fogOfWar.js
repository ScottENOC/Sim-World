export class FogOfWar {
  constructor(regions) {
    this.regions = regions;
    this.devMode = false;
    this.playerRegionId = null;
  }

  setDevMode(enabled) {
    this.devMode = Boolean(enabled);
  }

  setPlayerRegion(regionId) {
    this.playerRegionId = regionId;
  }

  isVisible(region) {
    if (this.devMode) return true;
    if (!this.playerRegionId || !region) return false;
    if (region.id === this.playerRegionId) return true;

    const playerRegion = this.regions.find((r) => r.id === this.playerRegionId);
    return Boolean(playerRegion?.neighbors?.includes(region.id));
  }

  visibleRegions() {
    if (this.devMode) return this.regions;
    return this.regions.filter((region) => this.isVisible(region));
  }
}
