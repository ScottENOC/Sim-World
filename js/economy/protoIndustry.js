import { boundedDiffusionChance, combineIndependentChances, technologyComprehension } from '../technology/technologyComprehension.js?v=20260914-rifling1';
import { educationSkillMultiplier } from '../society/massEducation.js?v=20260914-mass-education1';

const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const WATER_POWER_TECH_ID = 'water_power_machinery';
export const WIND_POWER_TECH_ID = 'wind_power_machinery';
export const IMPROVED_POWER_TRANSMISSION_TECH_ID = 'improved_power_transmission';
export const MECHANISED_SPINNING_TECH_ID = 'mechanised_spinning';
export const COAL_HEAT_TECH_ID = 'coal_fuel_heat';
export const DEEP_MINING_TECH_ID = 'deep_mining';
export const STEAM_PUMPING_TECH_ID = 'early_steam_pumping';

const ASSETS = {
  water_mill: { tech: WATER_POWER_TECH_ID, sector: 'manufacture', baseCost: 0.45, baseReturn: 0.09, lifeYears: 45 },
  wind_mill: { tech: WIND_POWER_TECH_ID, sector: 'manufacture', baseCost: 0.42, baseReturn: 0.08, lifeYears: 38 },
  fulling_mill: { tech: WATER_POWER_TECH_ID, sector: 'manufacture', baseCost: 0.55, baseReturn: 0.11, lifeYears: 35 },
  saw_mill: { tech: WATER_POWER_TECH_ID, sector: 'manufacture', baseCost: 0.62, baseReturn: 0.105, lifeYears: 32 },
  trip_hammer: { tech: IMPROVED_POWER_TRANSMISSION_TECH_ID, sector: 'manufacture', baseCost: 0.85, baseReturn: 0.12, lifeYears: 30 },
  spinning_workshop: { tech: MECHANISED_SPINNING_TECH_ID, sector: 'manufacture', baseCost: 0.78, baseReturn: 0.13, lifeYears: 24 },
  coal_kiln: { tech: COAL_HEAT_TECH_ID, sector: 'manufacture', baseCost: 0.65, baseReturn: 0.115, lifeYears: 28 },
  deep_mine: { tech: DEEP_MINING_TECH_ID, sector: 'mining', baseCost: 1.15, baseReturn: 0.14, lifeYears: 35 },
  steam_pump: { tech: STEAM_PUMPING_TECH_ID, sector: 'mining', baseCost: 1.65, baseReturn: 0.16, lifeYears: 22 },
};

function hasTech(region, id) { return Boolean(region.unlockedTechIds?.has(id)); }
function firms(region) { return region.corporateCapital?.firms?.filter((f) => f.status === 'active') || []; }
function activeFirmCapital(region, sector = null) {
  return firms(region).filter((f) => !sector || f.sector === sector).reduce((s, f) => s + Math.max(0, f.capitalIndex || 0), 0);
}
function practicalManufacture(region) {
  const guilds = clamp01(region.medievalSociety?.urban?.guilds || 0);
  const firmsSignal = clamp01(activeFirmCapital(region, 'manufacture') / 5);
  const smithing = clamp01((region.learningByDoing?.smithing?.experience || region.experience?.smithing || 0) / 250000);
  return clamp01(guilds * 0.3 + firmsSignal * 0.35 + smithing * 0.35);
}
function practicalMining(region) {
  const firmSignal = clamp01(activeFirmCapital(region, 'mining') / 5);
  const mining = clamp01((region.learningByDoing?.mining?.experience || region.experience?.mining || 0) / 300000);
  const shafts = hasTech(region, 'shaft_mining') ? 0.25 : 0;
  return clamp01(firmSignal * 0.35 + mining * 0.4 + shafts);
}
function riverPower(region) {
  const flow = Math.max(0, region.hydrology?.managedFlow || region.hydrology?.localFlow || region.waterManagement?.effectiveRiverFlow || 0);
  const riverKnown = Boolean(region.hydrology?.riverId || region.hydrology?.riverIds?.length || region.spatial?.riverIds?.length || flow > 0);
  return riverKnown ? clamp01(0.35 + Math.log1p(flow) / 8) : 0;
}
function windPotential(region) {
  const exposure = Number(region.weather?.windExposure ?? region.climate?.windExposure ?? 0.45);
  return clamp01(exposure);
}
function coalAvailable(region) {
  return Boolean(region.deposits?.coal || region.resourceDeposits?.coal || (region.stockpile?.coal || 0) > 0);
}
function tradePartners(region, regionsById) {
  const ids = region.recentTradePartners instanceof Map ? [...region.recentTradePartners.keys()] : [...(region.tradePartnerIds || [])];
  return ids.map((id) => regionsById.get(id)).filter(Boolean);
}
function knowledgeableSources(region, regionsById, techId) {
  const ids = new Set(region.neighbors || []);
  for (const p of tradePartners(region, regionsById)) ids.add(p.id);
  let n = 0;
  for (const id of ids) if (regionsById.get(id)?.unlockedTechIds?.has(techId)) n += 1;
  return n;
}
function techChance(region, regionsById, techId, { prerequisite = true, practice = 0, independent = 0, diffusion = 0.001 } = {}) {
  if (hasTech(region, techId) || !prerequisite) return 0;
  const comprehension = technologyComprehension({ prerequisitesMet: prerequisite, practice, minimumPractice: 0.025 });
  return combineIndependentChances(independent * comprehension, boundedDiffusionChance(diffusion, knowledgeableSources(region, regionsById, techId), comprehension));
}

function breakthroughChances(region, regionsById) {
  const manufacture = practicalManufacture(region);
  const mining = practicalMining(region);
  const water = riverPower(region);
  const wind = windPotential(region);
  const coal = coalAvailable(region);
  const waterPower = techChance(region, regionsById, WATER_POWER_TECH_ID, {
    prerequisite: hasTech(region, 'water_management') && water > 0,
    practice: clamp01(manufacture * 0.65 + water * 0.35), independent: 0.000025, diffusion: 0.0015,
  });
  const windPower = techChance(region, regionsById, WIND_POWER_TECH_ID, {
    prerequisite: manufacture > 0.08,
    practice: clamp01(manufacture * 0.75 + wind * 0.25), independent: 0.000012, diffusion: 0.001,
  });
  const transmission = techChance(region, regionsById, IMPROVED_POWER_TRANSMISSION_TECH_ID, {
    prerequisite: hasTech(region, WATER_POWER_TECH_ID) || hasTech(region, WIND_POWER_TECH_ID),
    practice: manufacture, independent: 0.000018, diffusion: 0.0014,
  });
  const spinning = techChance(region, regionsById, MECHANISED_SPINNING_TECH_ID, {
    prerequisite: hasTech(region, IMPROVED_POWER_TRANSMISSION_TECH_ID) && manufacture > 0.14,
    practice: manufacture, independent: 0.000015, diffusion: 0.0014,
  });
  const coalHeat = techChance(region, regionsById, COAL_HEAT_TECH_ID, {
    prerequisite: coal && manufacture > 0.06,
    practice: manufacture, independent: 0.00002, diffusion: 0.0012,
  });
  const deepMining = techChance(region, regionsById, DEEP_MINING_TECH_ID, {
    prerequisite: hasTech(region, 'mine_drainage') && mining > 0.12,
    practice: mining, independent: 0.000018, diffusion: 0.001,
  });
  const steam = techChance(region, regionsById, STEAM_PUMPING_TECH_ID, {
    prerequisite: hasTech(region, COAL_HEAT_TECH_ID) && hasTech(region, DEEP_MINING_TECH_ID) && hasTech(region, IMPROVED_POWER_TRANSMISSION_TECH_ID),
    practice: clamp01(mining * 0.55 + manufacture * 0.45), independent: 0.000006, diffusion: 0.0007,
  });
  return { [WATER_POWER_TECH_ID]: waterPower, [WIND_POWER_TECH_ID]: windPower, [IMPROVED_POWER_TRANSMISSION_TECH_ID]: transmission,
    [MECHANISED_SPINNING_TECH_ID]: spinning, [COAL_HEAT_TECH_ID]: coalHeat, [DEEP_MINING_TECH_ID]: deepMining, [STEAM_PUMPING_TECH_ID]: steam };
}

export function ensureProtoIndustryState(region) {
  region.protoIndustry ||= {};
  const s = region.protoIndustry;
  if (!Array.isArray(s.assets)) s.assets = [];
  if (!Number.isFinite(s.productivityIndex)) s.productivityIndex = 0;
  if (!Number.isFinite(s.mechanicalPowerIndex)) s.mechanicalPowerIndex = 0;
  if (!Number.isFinite(s.coalHeatUse)) s.coalHeatUse = 0;
  if (!Number.isFinite(s.privateCapitalCommitted)) s.privateCapitalCommitted = 0;
  if (!Number.isFinite(s.nextAssetId)) s.nextAssetId = 1;
  return s;
}

function siteSuitability(region, type) {
  if (type === 'water_mill' || type === 'fulling_mill' || type === 'saw_mill' || type === 'trip_hammer') return riverPower(region);
  if (type === 'wind_mill') return windPotential(region);
  if (type === 'coal_kiln' || type === 'steam_pump') return coalAvailable(region) ? 1 : 0;
  if (type === 'deep_mine') return Object.keys(region.deposits || region.resourceDeposits || {}).some((k) => !['stone','clay'].includes(k)) ? 1 : 0;
  return 0.75;
}

function expectedReturn(region, type) {
  const cfg = ASSETS[type];
  const demand = clamp01(0.35 + Math.log1p(region.population || 0) / 14 + Math.log1p((region.tradeEconomy?.exportIncomeEma || 0) + 1) / 18);
  const suitability = siteSuitability(region, type);
  const finance = region.corporateCapital || {};
  const confidence = clamp01(finance.creditorTrust ?? 0.5);
  return cfg.baseReturn * (0.45 + demand * 0.55) * (0.3 + suitability * 0.7) * (0.7 + confidence * 0.3);
}

function chooseInvestor(region, sector, cost) {
  const candidates = firms(region).filter((f) => f.sector === sector || f.sector === 'infrastructure' || f.sector === 'manufacture');
  candidates.sort((a,b) => (b.capitalIndex || 0) - (a.capitalIndex || 0));
  return candidates.find((f) => (f.capitalIndex || 0) >= cost * 0.4) || null;
}

function maybeInvest(region, currentTick, years, rng, events) {
  const s = ensureProtoIndustryState(region);
  const finance = region.corporateCapital || {};
  const available = Math.max(0, finance.investibleWealth || 0);
  if (available < 0.2) return;
  const existingByType = new Map();
  for (const a of s.assets) if (a.status === 'active') existingByType.set(a.type, (existingByType.get(a.type) || 0) + 1);
  const candidates = Object.entries(ASSETS).filter(([type, cfg]) => hasTech(region, cfg.tech) && siteSuitability(region, type) > 0.05)
    .map(([type, cfg]) => ({ type, cfg, expected: expectedReturn(region, type), count: existingByType.get(type) || 0 }))
    .filter((x) => x.expected > 0.055 && x.count < 8)
    .sort((a,b) => (b.expected - b.count * 0.004) - (a.expected - a.count * 0.004));
  const best = candidates[0];
  if (!best) return;
  const cost = best.cfg.baseCost * (1 + best.count * 0.12);
  const investmentReadiness = clamp01((finance.financialDepth || 0) * 0.45 + (finance.creditorTrust || 0.5) * 0.25 + Math.min(1, available / Math.max(0.01, cost)) * 0.3);
  const chance = clamp01(years * investmentReadiness * Math.max(0, best.expected - 0.045) * 2.2);
  if ((rng?.() ?? Math.random()) >= chance || available < cost * 0.25) return;
  const investor = chooseInvestor(region, best.cfg.sector, cost);
  if (investor) investor.capitalIndex = Math.max(0.05, (investor.capitalIndex || 0) - cost * 0.08);
  region.wallet = Math.max(0, (region.wallet || 0) - Math.min(region.wallet || 0, cost * 0.03));
  s.privateCapitalCommitted += cost;
  const asset = { id: `${region.id}:industry:${s.nextAssetId++}`, type: best.type, ownerFirmId: investor?.id || null, builtTick: currentTick,
    ageYears: 0, status: 'active', capitalCost: cost, expectedReturn: best.expected, productivity: 1, maintenance: 1 };
  s.assets.push(asset);
  events.push({ type: 'private_industrial_investment', regionId: region.id, assetType: best.type, ownerFirmId: asset.ownerFirmId, capitalCost: cost });
}

function operateAssets(region, years) {
  const s = ensureProtoIndustryState(region);
  let power = 0, productivity = 0, coalUse = 0;
  region.stockpile ||= {};
  let coalAvailableStock = Math.max(0, region.stockpile.coal || 0);
  for (const asset of s.assets) {
    if (asset.status !== 'active') continue;
    asset.ageYears += years;
    const cfg = ASSETS[asset.type];
    const suitability = siteSuitability(region, asset.type);
    const ageWear = clamp01(asset.ageYears / Math.max(1, cfg.lifeYears));
    asset.maintenance = Math.max(0.25, (asset.maintenance || 1) - years * (0.006 + ageWear * 0.015));
    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35) * educationSkillMultiplier(region, cfg.sector === 'mining' ? 'mining' : 'manufacture'));
    if (asset.type === 'coal_kiln' || asset.type === 'steam_pump') {
      const annualFuel = asset.type === 'steam_pump' ? 28 : 18;
      const wanted = annualFuel * years * asset.productivity;
      const burned = Math.min(coalAvailableStock, wanted);
      const fuelRatio = wanted > 0 ? burned / wanted : 1;
      coalAvailableStock -= burned;
      region.stockpile.coal = Math.max(0, (region.stockpile.coal || 0) - burned);
      coalUse += burned;
      asset.productivity *= fuelRatio;
    }
    if (['water_mill','wind_mill','fulling_mill','saw_mill','trip_hammer','steam_pump'].includes(asset.type)) power += asset.productivity * (asset.type === 'steam_pump' ? 1.6 : 1);
    productivity += asset.productivity * (asset.type === 'spinning_workshop' ? 1.5 : asset.type === 'trip_hammer' ? 1.25 : 0.7);
    if (ageWear >= 1 && asset.maintenance < 0.35) asset.status = 'retired';
  }
  s.mechanicalPowerIndex = power;
  s.productivityIndex = productivity;
  s.coalHeatUse = coalUse;
  region.productionModifiers ||= {};
  region.productionModifiers.protoIndustry = 1 + Math.min(0.65, productivity * 0.025);
  region.miningModifiers ||= {};
  region.miningModifiers.protoIndustry = 1 + Math.min(0.8, s.assets.filter((a) => a.status === 'active' && ['deep_mine','steam_pump','trip_hammer'].includes(a.type)).reduce((n,a) => n + (a.productivity || 0), 0) * 0.06);
}

export function tickProtoIndustry(regions, currentTick = 0, elapsedDays = 30, rng = Math.random) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const events = [];
  for (const region of regions) {
    ensureProtoIndustryState(region);
    const chances = breakthroughChances(region, regionsById);
    for (const [techId, weeklyChance] of Object.entries(chances)) {
      const p = 1 - Math.pow(1 - clamp01(weeklyChance), weekScale);
      if (!hasTech(region, techId) && (rng?.() ?? Math.random()) < p) {
        region.unlockedTechIds.add(techId);
        events.push({ type: 'proto_industrial_breakthrough', regionId: region.id, regionName: region.name, techId, tick: currentTick });
      }
    }
    operateAssets(region, years);
    maybeInvest(region, currentTick, years, rng, events);
  }
  return events;
}
