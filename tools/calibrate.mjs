#!/usr/bin/env node
// Deterministic, headless calibration runner. This is deliberately analysis,
// not calibration-by-stealth: it records what the current mechanics do and
// never alters game parameters.
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Region } from '../js/world/region.js';
import { SeaRegion, linkSeaAdjacency } from '../js/world/seaRegion.js';
import { seedCensus } from '../js/society/census.js';
import { tickEconomy } from '../js/economy/labor.js';
import { tickTrade } from '../js/economy/trade.js';
import { tickStateFinance } from '../js/economy/stateFinance.js';
import { tickDemographics } from '../js/society/demographics.js';
import { tickBanditry } from '../js/military/banditry.js';
import { tickNationAi } from '../js/ai/nationAi.js';
import { tickDiplomacy } from '../js/diplomacy/relations.js';
import { initialisePolities, tickPolities } from '../js/politics/polities.js';
import { tickRaids } from '../js/military/raiding.js';
import { tickCampaigns } from '../js/military/campaigns.js';
import { tickBreakthroughs } from '../js/technology/breakthroughs.js';
import { initialiseKnowledge, buildFishingContactPairs, tickFishingKnowledge,
  pruneKnowledge } from '../js/core/knowledge.js';
import { initialiseDeposit } from '../js/world/resources/extraction.js';
import { ironSmeltingChance } from '../js/technology/breakthroughs.js';
import { prepareConstructionLabor, tickConstruction, tickInfrastructureMaintenance } from '../js/economy/construction.js';
import { prepareSiegeWorkforce, tickSiegeEquipment } from '../js/military/siegeEquipment.js';

const ROOT = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(fs.readFileSync(new URL(path, ROOT), 'utf8'));
const meta = readJson('data/world/regions.meta.json').regions;
const resources = readJson('data/world/resources.initial.json');
const seaMeta = readJson('data/world/seaRegions.meta.json').seaRegions;
const toolTypes = readJson('data/world/toolTypes.json');

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const years = Math.max(1, Number(option('years', 200)));
const seedCount = Math.max(1, Number(option('seeds', 3)));
const snapshotYears = Math.max(1, Number(option('snapshot-years', 5)));
const outputPath = option('output', null);
const baseSeed = Number(option('base-seed', 0x12345678)) >>> 0;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function makeWorld(rng) {
  const regions = meta.map((m) => {
    const region = new Region({ id: m.id, name: m.name, feature: null,
      centroid: m.centroid, areaSqKm: m.areaSqKm, neighbors: m.neighbors });
    const endowment = resources[m.id];
    region.landQuality = endowment.landQuality;
    const forestK = region.areaSqKm * endowment.forestFraction;
    region.forest = { currentStock: forestK * endowment.forestStartCoverage, K: forestK };
    region.deposits = Object.fromEntries(Object.entries(endowment.deposits)
      .map(([key, deposit]) => [key, initialiseDeposit(key, deposit)]));
    if (!region.deposits.clay) {
      const clayStock = Math.max(50_000, Math.round(region.areaSqKm * 2_000));
      region.deposits.clay = { tiers: [{ id: 'surface', label: 'Surface clay beds',
        initialStock: clayStock, remainingStock: clayStock, difficulty: 0.12,
        requiredTechId: null, maxWorkers: Math.max(20, Math.round(region.areaSqKm * 0.2)) }] };
    }
    return region;
  });
  const seas = seaMeta.map((m) => {
    const sea = new SeaRegion({ id: m.id, name: m.name, feature: null,
      centroid: m.centroid, areaSqKm: m.areaSqKm, adjacentLand: m.adjacentLand });
    sea.fish = { currentStock: sea.areaSqKm * 2 * 0.7, K: sea.areaSqKm * 2 };
    return sea;
  });
  seedCensus(regions, rng);
  linkSeaAdjacency(regions, seas);
  initialiseKnowledge(regions);
  return { regions, seas, fishingPairs: buildFishingContactPairs(regions, seas) };
}

function total(regions, fn) { return regions.reduce((sum, region) => sum + fn(region), 0); }
function pct(value, denominator) { return +(100 * value / Math.max(1, denominator)).toFixed(1); }

function classifySpecialities(regions, window) {
  const result = { raiding: [], tin: [], copper: [], bronze: [], food: [], horses: [] };
  for (const region of regions) {
    const activity = window.get(region.id);
    const externalIncome = activity.loot + activity.exports;
    // A raiding core needs repeated success and must dominate the region's
    // external income, not merely supplement an otherwise trading economy.
    if (activity.raidsWon >= 2 && activity.loot > activity.exports &&
        activity.loot / Math.max(1, externalIncome) >= 0.5) {
      result.raiding.push({ id: region.id, name: region.name,
        loot: Math.round(activity.loot), exports: Math.round(activity.exports),
        raidsWon: activity.raidsWon });
    }
    const exportsByResource = activity.exportsByResource;
    const eligibleExports = Object.entries(exportsByResource)
      .filter(([resource]) => result[resource])
      .sort((a, b) => b[1] - a[1]);
    const largest = eligibleExports[0];
    const eligibleTotal = eligibleExports.reduce((sum, [, value]) => sum + value, 0);
    // Product specialisation is export-led: subsistence food production does
    // not make every region a farming specialist. A product must provide at
    // least 40% of these tracked export earnings during the window.
    if (largest && largest[1] >= 10 && largest[1] / Math.max(1, eligibleTotal) >= 0.4) {
      result[largest[0]].push({ id: region.id, name: region.name,
        exportIncome: Math.round(largest[1]), exportSharePct: pct(largest[1], eligibleTotal) });
    }
  }
  for (const entries of Object.values(result)) {
    entries.sort((a, b) => (b.loot || b.exportIncome || 0) - (a.loot || a.exportIncome || 0));
  }
  return result;
}

function newWindow(regions) {
  return new Map(regions.map((region) => [region.id, { exports: 0, exportsByResource: {}, loot: 0, raidsWon: 0,
    raidBaseline: region.raidEconomy.totalLootValue, winBaseline: region.raidEconomy.raidsWon,
    output: { tin: 0, copper: 0, bronze: 0, food: 0, horses: 0 } }]));
}

function assertFiniteWorld(regions, initialPopulation, tick) {
  for (const region of regions) {
    const values = [region.population, region.banditPopulation, region.wallet, region.treasury,
      region.stockpile.food || 0];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid state in ${region.name} at tick ${tick}: ${values.join(', ')}`);
    }
  }
  const population = total(regions, (region) => region.population + region.banditPopulation);
  if (population > initialPopulation * 5) {
    throw new Error(`Implausible population growth at tick ${tick}: ${population}`);
  }
}

function snapshot(regions, initial, year, window, polities = []) {
  const specialities = classifySpecialities(regions, window);
  const windowActivity = [...window.values()];
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const surfaceTin = total(regions, (r) => r.deposits.tin?.tiers[0]?.remainingStock || 0);
  const surfaceCopper = total(regions, (r) => r.deposits.copper?.tiers[0]?.remainingStock || 0);
  const farmers = total(regions, (r) => r.occupations.farmer || 0);
  const farmerTools = total(regions, (r) => Object.values(r.equipment.farmer || {})
    .reduce((sum, quantity) => sum + quantity * 10, 0));
  return {
    year,
    populationPct: pct(total(regions, (r) => r.population), initial.population),
    weeklyTrade: Math.round(total(regions, (r) => r.tradeEconomy.weeklyExports || 0)),
    smoothedWeeklyTrade: Math.round(total(regions, (r) => r.tradeEconomy.exportIncomeEma || 0)),
    weeklyFoodImports: Math.round(total(regions, (r) => r.tradeEconomy.weeklyFoodImports || 0)),
    smoothedWeeklyFoodImports: Math.round(total(regions, (r) => r.tradeEconomy.foodImportEma || 0)),
    surfaceTinPct: pct(surfaceTin, initial.surfaceTin),
    surfaceCopperPct: pct(surfaceCopper, initial.surfaceCopper),
    farmerToolCoveragePct: Math.min(100, pct(farmerTools, farmers)),
    foodDependentRegions: regions.filter((r) => (r.foodImportDependence || 0) >= 0.1).length,
    distressedRegions: regions.filter((r) => r.stability < 0.5).length,
    bandits: Math.round(total(regions, (r) => r.banditPopulation)),
    raidWindow: {
      wins: Math.round(windowActivity.reduce((sum, activity) => sum + activity.raidsWon, 0)),
      lootValue: Math.round(windowActivity.reduce((sum, activity) => sum + activity.loot, 0)),
    },
    totalWallet: Math.round(total(regions, (r) => r.wallet)),
    totalTreasury: Math.round(total(regions, (r) => r.treasury)),
    weeklyBronzeOutput: Math.round(total(regions, (r) => r.report.smithing?.bronze || 0)),
    bronzeStock: Math.round(total(regions, (r) => r.stockpile.bronze || 0)),
    averageMilitaryReadinessPct: +(total(regions, (r) => r.militaryFinance.readiness) /
      regions.length * 100).toFixed(1),
    stateFinance: {
      revenue: +total(regions, (r) => r.militaryFinance.weeklyTaxRevenue +
        r.militaryFinance.weeklyTradeDuties).toFixed(1),
      administrationDue: +total(regions, (r) => r.militaryFinance.administrationDue).toFixed(1),
      administrationInKind: +total(regions, (r) => r.militaryFinance.administrationInKind).toFixed(1),
      payrollDue: +total(regions, (r) => r.militaryFinance.payrollDue).toFixed(1),
      payrollPaid: +total(regions, (r) => r.militaryFinance.payrollPaid).toFixed(1),
      statesInArrears: regions.filter((r) => r.militaryFinance.arrearsWeeks > 0).length,
      fullyFundedStates: regions.filter((r) => r.militaryFinance.payRatio >= 0.95).length,
      soldiersAndSailors: Math.round(total(regions, (r) => r.army.personnel + r.navy.personnel)),
    },
    ironRegions: regions.filter((r) => r.unlockedTechIds.has('iron_smelting')).length,
    ironDiscoveryChance: {
      averagePerRegionPerWeek: +(total(regions, (r) => ironSmeltingChance(r,
        regionsById, year * 52)) / regions.length).toExponential(3),
      maximumPerRegionPerWeek: +Math.max(...regions.map((r) => ironSmeltingChance(r,
        regionsById, year * 52))).toExponential(3),
      maximumSmithingExperience: Math.round(Math.max(...regions.map((r) => r.experience.smithing || 0))),
    },
    advancedBoatRegions: regions.filter((r) => r.unlockedTechIds.has('advanced_boatbuilding')).length,
    totalHorses: Math.round(total(regions, (r) => (r.stockpile.horses || 0) +
      (r.horseEconomy?.draft || 0) + (r.horseEconomy?.transport || 0) + (r.horseEconomy?.war || 0))),
    weather: {
      averageYieldMultiplier: +(total(regions, (r) => r.weather?.yieldMultiplier || 1) /
        regions.length).toFixed(3),
      droughtRegions: regions.filter((r) => r.weather?.condition === 'drought').length,
      dryRegions: regions.filter((r) => r.weather?.condition === 'dry').length,
    },
    politics: {
      kingdoms: polities.filter((polity) => polity.kingdomSinceTick !== null).length,
      subjectRegions: regions.filter((region) => region.governance?.relationship !== 'core').length,
      writingPolities: polities.filter((polity) => polity.administration?.breakthroughs?.has('writing')).length,
      delegatedProvinces: regions.filter((region) => region.governance?.relationship === 'delegated').length,
      integratedProvinces: regions.filter((region) => region.governance?.relationship === 'integrated').length,
    },
    specialities: Object.fromEntries(Object.entries(specialities).map(([key, entries]) =>
      [key, { count: entries.length, leaders: entries.slice(0, 5) }])),
  };
}

function run(seed) {
  const rng = mulberry32(seed);
  const { regions, seas, fishingPairs } = makeWorld(rng);
  const polities = initialisePolities(regions);
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const initial = {
    population: total(regions, (r) => r.population),
    surfaceTin: total(regions, (r) => r.deposits.tin?.tiers[0]?.initialStock || 0),
    surfaceCopper: total(regions, (r) => r.deposits.copper?.tiers[0]?.initialStock || 0),
  };
  let raids = [];
  let campaigns = [];
  const agreements = [];
  let window = newWindow(regions);
  const timeline = [];
  for (let tick = 1; tick <= years * 52; tick += 1) {
    campaigns = tickCampaigns(campaigns, regionsById, polities, tick, toolTypes, rng).remaining;
    prepareConstructionLabor(regions);
    prepareSiegeWorkforce(regions);
    tickEconomy(regions, seas, toolTypes, rng, tick);
    tickFishingKnowledge(fishingPairs, tick);
    tickTrade(regions, tick);
    tickStateFinance(regions);
    tickInfrastructureMaintenance(regions);
    tickConstruction(regions, tick);
    tickSiegeEquipment(regions);
    tickBreakthroughs(regions, tick, rng);
    tickDemographics(regions);
    tickDiplomacy(regions, agreements, toolTypes, tick);
    tickPolities(polities, regions, tick);
    tickBanditry(regions, toolTypes, agreements);
    tickNationAi(regions, '__calibration__', raids, campaigns, agreements, polities, tick, toolTypes, rng);
    const raidResult = tickRaids(raids, regionsById, tick, toolTypes, rng);
    raids = raidResult.remaining;
    pruneKnowledge(regions, tick);
    assertFiniteWorld(regions, initial.population, tick);

    for (const region of regions) {
      const activity = window.get(region.id);
      activity.exports += region.tradeEconomy.weeklyExports || 0;
      for (const [resource, income] of Object.entries(region.tradeEconomy.weeklyExportsByResource || {})) {
        activity.exportsByResource[resource] = (activity.exportsByResource[resource] || 0) + income;
      }
      activity.output.tin += region.report.mining?.tin || 0;
      activity.output.copper += region.report.mining?.copper || 0;
      activity.output.bronze += region.report.smithing?.bronze || 0;
      activity.output.food += (region.report.farming?.food || 0) +
        (region.report.gathering?.food || 0) + (region.report.shoreFishing?.food || 0) +
        (region.report.boatFishing?.food || 0);
      activity.output.horses += region.report.horses?.births || 0;
      activity.loot = region.raidEconomy.totalLootValue - activity.raidBaseline;
      activity.raidsWon = region.raidEconomy.raidsWon - activity.winBaseline;
    }
    if (tick % (snapshotYears * 52) === 0 || tick === years * 52) {
      timeline.push(snapshot(regions, initial, +(tick / 52).toFixed(1), window, polities));
      window = newWindow(regions);
    }
  }
  return { seed, timeline };
}

const started = performance.now();
const runs = [];
for (let index = 0; index < seedCount; index += 1) {
  const seed = (baseSeed + Math.imul(index, 0x9E3779B9)) >>> 0;
  runs.push(run(seed));
  console.error(`Completed seed ${index + 1}/${seedCount} (${seed})`);
}
const report = {
  generatedAt: new Date().toISOString(),
  configuration: { years, seedCount, snapshotYears, baseSeed },
  elapsedSeconds: +((performance.now() - started) / 1000).toFixed(1),
  raidingSpecialityDefinition: 'At least two successful raids in the window; loot exceeds exports and is at least 50% of external income.',
  runs,
};
const json = JSON.stringify(report, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${json}\n`);
else process.stdout.write(`${json}\n`);
