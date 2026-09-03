import { KnowledgeLedger } from '../core/knowledge.js?v=20260903-adaptive-clock2';

export class Region {
  constructor({ id, name, feature, centroid, areaSqKm, neighbors }) {
    this.id = id; this.name = name; this.feature = feature; this.centroid = centroid;
    this.areaSqKm = areaSqKm; this.neighbors = neighbors;
    this.population = null; this.demographics = null; this.cultureGroups = null;
    this.controllingActorId = id; this.stability = 1.0; this.banditPopulation = 0;
    this.safetyRating = 1.0; this.educationLevel = 0.05; this.experience = {};
    this.targetArmySize = 0; this.army = { personnel: 0, away: 0 };
    this.targetNavySize = 0; this.navy = { boats: 0, personnel: 0 };
    this.isCoastal = false; this.adjacentSeaIds = []; this.fishingBoats = 0; this.targetFishingBoats = 0;
    this.landQuality = null; this.forest = null; this.deposits = null; this.stockpile = {};
    this.occupations = {}; this.report = {}; this.equipment = {}; this.militaryBronzeDemand = 0;
    this.wallet = 0; this.treasury = 0; this.unlockedTechIds = new Set();
    this.knowledge = new KnowledgeLedger(id);
  }
}

export async function loadWorld() {
  const [geoRes, metaRes, resourcesRes] = await Promise.all([
    fetch('data/world/regions.geo.json'), fetch('data/world/regions.meta.json'),
    fetch('data/world/resources.initial.json'),
  ]);
  const geo = await geoRes.json(); const meta = await metaRes.json(); const resources = await resourcesRes.json();
  const metaById = new Map(meta.regions.map((r) => [r.id, r]));
  const regions = geo.features.map((feature) => {
    const id = feature.properties.id; const m = metaById.get(id);
    const region = new Region({ id, name: feature.properties.name, feature, centroid: m.centroid,
      areaSqKm: m.areaSqKm, neighbors: m.neighbors });
    const endowment = resources[id];
    if (!endowment) throw new Error(`Missing resource endowment for region ${id} (${region.name})`);
    region.landQuality = endowment.landQuality;
    const K = region.areaSqKm * endowment.forestFraction;
    region.forest = { currentStock: K * endowment.forestStartCoverage, K };
    region.deposits = {};
    for (const [key, dep] of Object.entries(endowment.deposits)) {
      region.deposits[key] = { tiers: dep.tiers.map((tier) => ({ ...tier, remainingStock: tier.initialStock })) };
    }
    return region;
  });
  return regions;
}
