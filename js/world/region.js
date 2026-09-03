import { KnowledgeLedger } from '../core/knowledge.js?v=20260904-finance1';

export class Region {
  constructor({ id, name, feature, centroid, areaSqKm, neighbors }) {
    this.id = id; this.name = name; this.feature = feature; this.centroid = centroid;
    this.areaSqKm = areaSqKm; this.neighbors = neighbors;
    this.population = null; this.demographics = null; this.cultureGroups = null;
    this.controllingActorId = id; this.stability = 1.0; this.banditPopulation = 0;
    this.safetyRating = 1.0; this.educationLevel = 0.05; this.experience = {};
    this.targetArmySize = 0; this.army = { personnel: 0, away: 0 };
    this.targetNavySize = 0; this.navy = { boats: 0, advancedBoats: 0, personnel: 0 };
    this.isCoastal = false; this.adjacentSeaIds = []; this.fishingBoats = 0;
    this.advancedFishingBoats = 0; this.targetFishingBoats = 0;
    this.landQuality = null; this.forest = null; this.deposits = null; this.stockpile = {};
    this.occupations = {}; this.report = {}; this.equipment = {}; this.militaryBronzeDemand = 0;
    this.wallet = 0; this.treasury = 0; this.unlockedTechIds = new Set();
    this.militaryFinance = {
      weeklyTaxRevenue: 0, weeklyTradeDuties: 0, revenueEma: 0,
      payrollDue: 0, payrollPaid: 0, payRatio: 1, readiness: 1,
      arrearsWeeks: 0, procurementBudget: 0, procurementSpent: 0,
      weeklyProcurementSpent: 0, fundedPersonnelCap: Infinity, deserters: 0,
      administrationDue: 0, administrationPaid: 0, stateCapacity: 1,
    };
    // Knowing iron smelting and having an iron industry are deliberately
    // separate. Readiness ramps as mines, furnaces and smiths adapt.
    this.ironWorkingReadiness = 0;
    this.ironWorkingExposure = 0;
    // Bandit groups hold a small communal food reserve. Once both stores and
    // viable victims are exhausted they must disperse, resettle or starve.
    this.banditFoodStores = 0;
    this.tradePartnerIds = new Set();
    // A deliberately small, rolling Bronze Age commercial ledger. Credit is
    // calculated from recent exports in trade.js; it is working-capital for
    // timing mismatches, never enough to prop up a failed regional economy.
    this.tradeEconomy = {
      debt: 0,
      creditLimit: 0,
      arrearsWeeks: 0,
      exportIncomeEma: 0,
      nonFoodExportIncomeEma: 0,
      importSpendEma: 0,
      foodImportEma: 0,
      bronzeExportEma: 0,
      routeReliabilityEma: 0,
      weeklyExports: 0,
      weeklyImports: 0,
    };
    this.recentTradePartners = new Map();
    this.foodImportDependence = 0;
    this.knowledge = new KnowledgeLedger(id);
  }
}

export async function loadWorld() {
  const [geoRes, metaRes, resourcesRes] = await Promise.all([
    fetch('data/world/regions.geo.json'), fetch('data/world/regions.meta.json'),
    fetch('data/world/resources.initial.json?v=20260904-finance1'),
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
    // Clay is deliberately common rather than another rare strategic ore.
    // The procedural stock avoids inflating the already-large static map data
    // with an almost identical entry for every region.
    if (!region.deposits.clay) {
      const clayStock = Math.max(50_000, Math.round(region.areaSqKm * 2_000));
      region.deposits.clay = { tiers: [{
        id: 'surface', label: 'Surface clay beds', initialStock: clayStock,
        remainingStock: clayStock, difficulty: 0.12, requiredTechId: null,
        maxWorkers: Math.max(20, Math.round(region.areaSqKm * 0.2)),
      }] };
    }
    return region;
  });
  return regions;
}
