export class Region {
  constructor({ id, name, feature, centroid, areaSqKm, neighbors, distanceKm }) {
    this.id = id;
    this.name = name;
    this.feature = feature;       // GeoJSON Feature (geometry only used by the renderer)
    this.centroid = centroid;     // [lon, lat]
    this.areaSqKm = areaSqKm;
    this.neighbors = neighbors;   // region ids sharing a land border
    this.distanceKm = distanceKm; // { regionId: km } great-circle, all regions

    // --- Phase 2 stubs ---
    // Every region starts as its own polity (a "warlord") and its own
    // monoculture, per the design: N regions -> N actors, one of which is
    // the player. Real values for these get filled in by society/culture.js
    // and ai/nationAi.js once those modules exist; this just reserves the
    // shape so the map/UI can already read region.controllingActor etc.
    this.population = null;
    this.cultureGroups = null;    // [{ ancestryId, cultureId, religionId, share, identityStrength }]
    this.controllingActorId = id; // defaults to "this region governs itself"
    this.stability = 1.0;         // 0-1, feeds the Phase 2 collapse/raider-pressure system
  }
}

export async function loadWorld() {
  const [geoRes, metaRes] = await Promise.all([
    fetch('data/world/regions.geo.json'),
    fetch('data/world/regions.meta.json'),
  ]);
  const geo = await geoRes.json();
  const meta = await metaRes.json();

  const metaById = new Map(meta.regions.map((r) => [r.id, r]));

  const regions = geo.features.map((feature) => {
    const id = feature.properties.id;
    const m = metaById.get(id);
    return new Region({
      id,
      name: feature.properties.name,
      feature,
      centroid: m.centroid,
      areaSqKm: m.areaSqKm,
      neighbors: m.neighbors,
      distanceKm: m.distanceKm,
    });
  });

  return regions;
}
