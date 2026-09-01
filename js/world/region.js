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
    this.population = null;
    this.demographics = null;
    this.cultureGroups = null;
    this.controllingActorId = id;
    this.stability = 1.0;
    this.banditPopulation = 0;
    this.safetyRating = 1.0;
    this.educationLevel = 0.05;
    this.experience = {};
    this.targetArmySize = 0;
    this.army = { personnel: 0, away: 0 };
    this.targetNavySize = 0;
    this.navy = { boats: 0, personnel: 0 };
    this.isCoastal = true;
    this.adjacentSeaIds = [];
    this.fishingBoats = 0;
    this.targetFishingBoats = 0;
    // --- Economy ---
    this.landQuality = null;
    this.forest = null;
    this.deposits = null;
    this.stockpile = {};
    this.occupations = {};
    this.report = {};
    this.equipment = {};
    this.militaryBronzeDemand = 0;
    this.wallet = 0;
    this.treasury = 0;
    this.unlockedTechIds = new Set();

    /*
     * Knowledge is deliberately NOT a set of permanent facts.
     *
     * It is a ledger of observations/reports. A report can have a source,
     * delay, confidence, subject matter and an "observed at" date distinct
     * from the date it was received.
     *
     * This gives future systems somewhere to put:
     *   - trader reports
     *   - fishing contact
     *   - captured raider intelligence
     *   - diplomats
     *   - refugees
     *   - first/second-hand rumours
     *   - deliberate disinformation
     *
     * Map visibility remains a separate concern in core/fogOfWar.js.
     * Import KnowledgeLedger there later if/when a region's controller needs
     * to own a persistent ledger rather than the region itself.
     */
    this.knowledge = {
      observations: [],
    };
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
