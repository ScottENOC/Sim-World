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

    // --- Economy (set by loadWorld from resources.initial.json) ---
    this.landQuality = null;               // multiplier: how good this land is, farming + population alike
    this.forest = null;                    // { currentStock, K }
    this.deposits = null;                  // { copper: { tiers: [{id, label, initialStock, remainingStock, difficulty, requiredTechId, maxWorkers}] }, ... }
    this.stockpile = {};                   // { wood, copper, tin, gold, stone, bronze, food }
    this.occupations = {};                 // { farmer, lumberjack, miner, smith, general } — set each tick by economy/labor.js

    // Stub until technology/techTree.js exists: nothing is ever unlocked yet,
    // so every deposit sits at its surface/alluvial tier forever. Real tech
    // diffusion will just start adding ids to this set — extraction.js
    // already reads from it, so no other code needs to change when that lands.
    this.unlockedTechIds = new Set();
  }
}

export async function loadWorld() {
  const [geoRes, metaRes, resourcesRes] = await Promise.all([
    fetch('data/world/regions.geo.json'),
    fetch('data/world/regions.meta.json'),
    fetch('data/world/resources.initial.json'),
  ]);
  const geo = await geoRes.json();
  const meta = await metaRes.json();
  const resources = await resourcesRes.json();

  const metaById = new Map(meta.regions.map((r) => [r.id, r]));

  const regions = geo.features.map((feature) => {
    const id = feature.properties.id;
    const m = metaById.get(id);
    const region = new Region({
      id,
      name: feature.properties.name,
      feature,
      centroid: m.centroid,
      areaSqKm: m.areaSqKm,
      neighbors: m.neighbors,
      distanceKm: m.distanceKm,
    });

    const endowment = resources[id];
    region.landQuality = endowment.landQuality;
    const K = region.areaSqKm * endowment.forestFraction;
    region.forest = { currentStock: K * endowment.forestStartCoverage, K };
    region.deposits = {};
    for (const [key, dep] of Object.entries(endowment.deposits)) {
      region.deposits[key] = {
        tiers: dep.tiers.map((tier) => ({ ...tier, remainingStock: tier.initialStock })),
      };
    }

    return region;
  });

  return regions;
}
