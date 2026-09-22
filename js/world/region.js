import { KnowledgeLedger } from '../core/knowledge.js?v=20260904-weather1';
import { initialiseDeposit } from './resources/extraction.js?v=20260904-weather1';

export class Region {
  constructor({ id, name, feature, centroid, areaSqKm, neighbors }) {
    this.id = id; this.name = name; this.feature = feature; this.centroid = centroid;
    this.areaSqKm = areaSqKm; this.neighbors = neighbors;
    this.population = null; this.demographics = null; this.cultureGroups = null;
    this.controllingActorId = id; this.stability = 1.0; this.banditPopulation = 0;
    this.safetyRating = 1.0; this.educationLevel = 0.05; this.experience = {};
    this.targetArmySize = 0; this.army = { personnel: 0, away: 0 };
    this.targetNavySize = 0; this.navy = { boats: 0, advancedBoats: 0, personnel: 0, scoutingBoats: 0 };
    this.navalProcurement = { targets: {}, built: {}, lastDecisionTick: null };
    this.scouting = { active: false, lastResult: null };
    this.militaryPolicy = { armyPermanence: 0.5, defensivePosture: 'settlements',
      raiderTreatment: 'reintegrate', navalPriority: 'trade', warHorseAllocation: 0.5 };
    this.militaryExperience = { field: 0, institutional: 0, lastFieldTick: 0, engagementWeeks: 0, trainingYears: 0 };
    this.militaryInstitutions = { officerSchoolProgress: 0, officerSchoolActive: false };
    // Rulers set enduring strategic intent; the military planner derives the
    // establishment and recruitment target instead of asking for a troop count.
    this.militaryStrategy = { posture: 'peace', targetRegionId: null, targetPolityId: null,
      garrisonFloor: 1, spendingPriority: 0.45, desiredPreparationWeeks: 26, secrecy: 0.35,
      vassalAssumption: 'conservative', allyAssumption: 'conservative', planReport: {} };
    this.diplomaticMessages = [];
    this.isCoastal = false; this.adjacentSeaIds = []; this.fishingBoats = 0;
    this.advancedFishingBoats = 0; this.targetFishingBoats = 0;
    this.landQuality = null; this.forest = null; this.terrain = null; this.deposits = null; this.stockpile = {};
    this.occupations = {}; this.report = {}; this.equipment = {}; this.militaryBronzeDemand = 0;
    this.wallet = 0; this.treasury = 0; this.unlockedTechIds = new Set();
    this.construction = { projects: [], completed: {}, assets: [], workersReserved: 0,
      maintenanceWorkersReserved: 0, lastWeek: null };
    this.infrastructure = { hillForts: 0, publicGranaries: 0 };
    this.siegeEquipment = { targets: { ram: 0, catapult: 0 },
      inventory: { ram: { bronze: 0, iron: 0 }, catapult: { bronze: 0, iron: 0 } },
      away: { ram: { bronze: 0, iron: 0 }, catapult: { bronze: 0, iron: 0 } },
      experience: 0, workersReserved: 0, lastWeek: null };
    this.horseEconomy = { draft: 0, transport: 0, war: 0, breeders: 0, trainers: 0,
      births: 0, deaths: 0, capacity: 0, pastureFraction: 0 };
    this.weather = { index: 0, yieldMultiplier: 1, seasonalMultiplier: 1, condition: 'normal' };
    this.militaryFinance = {
      weeklyTaxRevenue: 0, weeklyTradeDuties: 0, revenueEma: 0,
      payrollDue: 0, payrollPaid: 0, payRatio: 1, readiness: 1,
      arrearsWeeks: 0, procurementBudget: 0, procurementSpent: 0,
      weeklyProcurementSpent: 0, fundedPersonnelCap: Infinity, deserters: 0,
      administrationDue: 0, administrationPaid: 0, administrationInKind: 0, stateCapacity: 1,
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
    // Cumulative raid accounts support both player-facing history and the
    // calibration harness. Loot itself still enters ordinary stocks/cash;
    // these values are observations, not a second source of wealth.
    this.raidEconomy = {
      raidsLaunched: 0, raidsWon: 0, totalLootValue: 0,
      totalCasualties: 0, lastRaidTick: null,
    };
    // Directional feelings toward other regional cultures. A Map keeps the
    // large world sparse: entries only appear after actual interaction.
    this.relations = new Map();
    this.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };
    this.foodImportDependence = 0;
    this.knowledge = new KnowledgeLedger(id);
  }
}

export async function loadWorld() {
  const report = (message) => {
    if (typeof window !== 'undefined' && typeof window.__reportWorldStartup === 'function') {
      window.__reportWorldStartup(message);
    }
    console.info('[land-loader]', message);
  };
  const fetchJson = async (url, label) => {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    report(`Land regions · requesting ${label}…`);
    const response = await fetch(url);
    const elapsed = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started) / 1000;
    report(`Land regions · ${label} HTTP ${response.status} after ${elapsed.toFixed(1)}s · reading body…`);
    if (!response.ok) throw new Error(`${label} request failed: HTTP ${response.status}`);
    const text = await response.text();
    report(`Land regions · ${label} received ${(text.length / 1024 / 1024).toFixed(1)} MB · parsing JSON…`);
    const parsed = JSON.parse(text);
    report(`Land regions · ${label} parsed`);
    return parsed;
  };

  const [geo, meta, resources, terrain] = await Promise.all([
    fetchJson('data/world/regions.geo.json', 'geometry'),
    fetchJson('data/world/regions.meta.json', 'metadata'),
    fetchJson('data/world/resources.initial.json?v=20260912-silkroad1', 'resources'),
    fetchJson('data/world/terrain.initial.json?v=20260912-silkroad1', 'terrain'),
  ]);
  const metaById = new Map(meta.regions.map((r) => [r.id, r]));
  const regions = [];
  report(`Land regions · constructing ${geo.features.length.toLocaleString()} regions…`);
  for (let featureIndex = 0; featureIndex < geo.features.length; featureIndex += 1) {
    const feature = geo.features[featureIndex];
    const id = feature.properties.id; const m = metaById.get(id);
    const region = new Region({ id, name: feature.properties.name, feature, centroid: m.centroid,
      areaSqKm: m.areaSqKm, neighbors: m.neighbors });
    const endowment = resources[id];
    if (!endowment) throw new Error(`Missing resource endowment for region ${id} (${region.name})`);
    if (!terrain[id]) throw new Error(`Missing terrain composition for region ${id} (${region.name})`);
    region.terrain = terrain[id];
    region.landQuality = endowment.landQuality;
    region.specialResources = { ...(endowment.specialResources || {}) };
    const K = region.areaSqKm * endowment.forestFraction;
    region.forest = { currentStock: K * endowment.forestStartCoverage, K };
    region.deposits = {};
    for (const [key, dep] of Object.entries(endowment.deposits)) {
      region.deposits[key] = initialiseDeposit(key, dep);
    }
    // Clay is deliberately common rather than another rare strategic ore.
    // The procedural stock avoids inflating the already-large static map data
    // with an almost identical entry for every region.
    if (!region.deposits.coal) {
      let h = 2166136261;
      for (const c of region.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      const coalSignal = (h >>> 0) / 4294967295;
      const sedimentary = 0.35 + Math.min(0.45, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 85) * 0.25);
      if (coalSignal < sedimentary) {
        const scale = Math.max(1, region.areaSqKm);
        const outcrop = Math.round(scale * (35 + coalSignal * 55));
        const shaft = Math.round(scale * (145 + coalSignal * 230));
        const deep = Math.round(scale * (420 + coalSignal * 720));
        region.deposits.coal = { tiers: [
          { id: 'surface', label: 'Outcropping and shallow coal seams', initialStock: outcrop, remainingStock: outcrop, difficulty: 0.20, requiredTechId: null, maxWorkers: Math.max(10, Math.round(scale * 0.02)) },
          { id: 'shaft', label: 'Shaft-accessible coal seams', initialStock: shaft, remainingStock: shaft, difficulty: 0.38, requiredTechId: 'deep_mining', maxWorkers: Math.max(28, Math.round(scale * 0.055)) },
          { id: 'deep', label: 'Deep water-bearing coal seams', initialStock: deep, remainingStock: deep, difficulty: 0.58, requiredTechId: 'early_steam_pumping', maxWorkers: Math.max(55, Math.round(scale * 0.11)) },
        ] };
      }
    }
    if (!region.deposits.oil) {
      let oh = 2166136261;
      for (const c of `${region.id}:oil`) oh = Math.imul(oh ^ c.charCodeAt(0), 16777619);
      const oilSignal = (oh >>> 0) / 4294967295;
      const basinChance = 0.16 + (region.isCoastal ? 0.08 : 0) + Math.min(0.08, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 90) * 0.05);
      if (oilSignal < basinChance) {
        const scale = Math.max(1, region.areaSqKm);
        const seep = Math.max(8, Math.round(scale * (0.12 + oilSignal * 0.2)));
        const shallow = Math.round(scale * (18 + oilSignal * 34));
        const deep = Math.round(scale * (70 + oilSignal * 125));
        const tight = Math.round(scale * (90 + oilSignal * 185));
        const offshore = region.isCoastal ? Math.round(scale * (110 + oilSignal * 240)) : 0;
        const tiers = [
          { id: 'seep', label: 'Natural petroleum seeps', initialStock: seep, remainingStock: seep, difficulty: 0.16, requiredTechId: null, maxWorkers: Math.max(2, Math.round(scale * 0.001)) },
          { id: 'shallow_onshore', label: 'Shallow onshore petroleum', initialStock: shallow, remainingStock: shallow, difficulty: 0.34, requiredTechId: 'petroleum_well_drilling', maxWorkers: Math.max(18, Math.round(scale * 0.025)) },
          { id: 'deep_onshore', label: 'Deep onshore petroleum', initialStock: deep, remainingStock: deep, difficulty: 0.5, requiredTechId: 'deep_rotary_drilling', maxWorkers: Math.max(35, Math.round(scale * 0.055)) },
          { id: 'tight', label: 'Tight oil formations', initialStock: tight, remainingStock: tight, difficulty: 0.68, requiredTechId: 'hydraulic_fracturing', maxWorkers: Math.max(45, Math.round(scale * 0.07)) },
        ];
        if (offshore > 0) tiers.push({ id: 'offshore', label: 'Offshore petroleum', initialStock: offshore, remainingStock: offshore, difficulty: 0.72, requiredTechId: 'offshore_drilling', maxWorkers: Math.max(55, Math.round(scale * 0.08)) });
        region.deposits.oil = { tiers };
      }
    }
    if (!region.deposits.natural_gas) {
      let gh = 2166136261;
      for (const c of `${region.id}:natural-gas`) gh = Math.imul(gh ^ c.charCodeAt(0), 16777619);
      const gasSignal = (gh >>> 0) / 4294967295;
      const basinChance = 0.18 + (region.isCoastal ? 0.05 : 0) + Math.min(0.07, Math.max(0, 1 - Math.abs(region.centroid?.[1] || 0) / 90) * 0.05);
      if (gasSignal < basinChance) {
        const scale = Math.max(1, region.areaSqKm);
        const conventional = Math.round(scale * (55 + gasSignal * 105));
        const deep = Math.round(scale * (120 + gasSignal * 210));
        region.deposits.natural_gas = { tiers: [
          { id: 'conventional', label: 'Conventional natural-gas reservoir', initialStock: conventional, remainingStock: conventional, difficulty: 0.38, requiredTechId: 'natural_gas_extraction', maxWorkers: Math.max(18, Math.round(scale * 0.025)) },
          { id: 'deep', label: 'Deep natural-gas reservoir', initialStock: deep, remainingStock: deep, difficulty: 0.56, requiredTechId: 'natural_gas_extraction', maxWorkers: Math.max(35, Math.round(scale * 0.05)) },
        ] };
      }
    }
    if (!region.deposits.clay) {
      const clayStock = Math.max(50_000, Math.round(region.areaSqKm * 2_000));
      region.deposits.clay = { tiers: [{
        id: 'surface', label: 'Surface clay beds', initialStock: clayStock,
        remainingStock: clayStock, difficulty: 0.12, requiredTechId: null,
        maxWorkers: Math.max(20, Math.round(region.areaSqKm * 0.2)),
      }] };
    }
    regions.push(region);
    if ((featureIndex + 1) % 100 === 0 && featureIndex + 1 < geo.features.length) {
      report(`Land regions · constructed ${(featureIndex + 1).toLocaleString()} / ${geo.features.length.toLocaleString()}…`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  report(`Land regions · constructed ${regions.length.toLocaleString()} regions`);
  return regions;
}
