// Sea regions don't have population, an economy, or a government of their
// own — they're a shared resource pool that multiple land regions can draw
// from, which is the point (a real commons: whoever overfishes the Irish
// Sea affects England, Scotland, Wales, N. Ireland, AND Ireland, not just
// themselves).
export class SeaRegion {
  constructor({ id, name, feature, centroid, areaSqKm, adjacentLand }) {
    this.id = id;
    this.name = name;
    this.feature = feature;
    this.centroid = centroid;
    this.areaSqKm = areaSqKm;
    this.adjacentLand = adjacentLand; // land region ids that can fish here

    this.fish = { currentStock: 0, K: 0 }; // set by loadSeaWorld from areaSqKm
  }
}

const FISH_DENSITY_PER_KM2 = 2;   // stock-units per km² at full carrying capacity
const FISH_START_COVERAGE = 0.7;  // pre-exploitation seas start well-stocked, not maxed out

export async function loadSeaWorld() {
  const [geoRes, metaRes] = await Promise.all([
    fetch('data/world/seaRegions.geo.json'),
    fetch('data/world/seaRegions.meta.json'),
  ]);
  const geo = await geoRes.json();
  const meta = await metaRes.json();
  const metaById = new Map(meta.seaRegions.map((s) => [s.id, s]));

  return geo.features.map((feature) => {
    const id = feature.properties.id;
    const m = metaById.get(id);
    const sea = new SeaRegion({
      id,
      name: feature.properties.name,
      feature,
      centroid: m.centroid,
      areaSqKm: m.areaSqKm,
      adjacentLand: m.adjacentLand,
    });
    const K = sea.areaSqKm * FISH_DENSITY_PER_KM2;
    sea.fish = { currentStock: K * FISH_START_COVERAGE, K };
    return sea;
  });
}

// Called from main.js after both loadWorld() and loadSeaWorld() resolve —
// sets each land region's adjacentSeaIds from the sea's own adjacentLand
// list, so land regions don't need to know about seaRegions.geo.json at all.
export function linkSeaAdjacency(landRegions, seaRegions) {
  const landById = new Map(landRegions.map((r) => [r.id, r]));

  // The sea metadata is now the source of truth for coastlines. Reset first
  // so an inland region can never inherit the old prototype's `isCoastal`.
  for (const land of landRegions) {
    land.adjacentSeaIds = [];
    land.isCoastal = false;
  }

  for (const sea of seaRegions) {
    for (const landId of sea.adjacentLand) {
      const land = landById.get(landId);
      if (!land) continue;
      if (!land.adjacentSeaIds.includes(sea.id)) land.adjacentSeaIds.push(sea.id);
      land.isCoastal = true;
    }
  }
}
