import { operationalInfrastructure } from '../economy/construction.js?v=20260913-early-modern1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

export const STATIONARY_STEAM_TECH_ID = 'stationary_steam_engine';
export const HIGH_PRESSURE_STEAM_TECH_ID = 'high_pressure_steam';
export const MARINE_STEAM_TECH_ID = 'marine_steam_engine';
export const SCREW_PROPULSION_TECH_ID = 'screw_propulsion';
export const IRON_HULL_TECH_ID = 'iron_hull_shipbuilding';
export const STEEL_HULL_TECH_ID = 'steel_hull_shipbuilding';

export const NAVAL_GUN_TYPES = Object.freeze({
  SMOOTHBORE: 'smoothbore_muzzle_loader',
  RIFLED: 'rifled_muzzle_loader',
  BREECH: 'rifled_breech_loader',
});

function capability(region, key) {
  return clamp(region.industrialSupply?.capability?.[key] || 0);
}

function resourceAccess(region, key, stockThreshold = 1) {
  return (region.stockpile?.[key] || 0) >= stockThreshold || Boolean(region.resourceDeposits?.[key] || region.deposits?.[key]);
}

function coalAccess(region) {
  return resourceAccess(region, 'coal', 8);
}

function shipyardAccess(region) {
  return Boolean(region?.isCoastal && (operationalInfrastructure(region, 'shipyard') || operationalInfrastructure(region, 'naval_base')));
}

function harbourAccess(region) {
  return Boolean(region?.isCoastal && operationalInfrastructure(region, 'harbour'));
}

function practiceChance(baseAnnualChance, years, readiness, exposure = 0) {
  const annual = clamp(baseAnnualChance * (0.15 + readiness * 0.85) + exposure * 0.08, 0, 0.85);
  return 1 - Math.pow(1 - annual, Math.max(0, years));
}

function recentKnowledgeSources(region, regionsById, techId) {
  const ids = new Set(region.neighbors || []);
  if (region.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  else for (const id of region.tradePartnerIds || []) ids.add(id);
  let count = 0;
  for (const id of ids) if (regionsById.get(id)?.unlockedTechIds?.has?.(techId)) count += 1;
  return count;
}

function diffusionExposure(region, regionsById, techId) {
  return clamp(recentKnowledgeSources(region, regionsById, techId) * 0.12, 0, 0.6);
}

export function ensureIndustrialMarine(region) {
  region.industrialMarine ||= {};
  const state = region.industrialMarine;
  for (const key of ['steamEngineering', 'marineEngineering', 'ironHullEngineering', 'steelHullEngineering', 'navalGunEngineering']) {
    state[key] = clamp(state[key] || 0);
  }
  state.merchantFleet ||= {};
  for (const key of ['sailTonnage', 'paddleSteamTonnage', 'screwSteamTonnage', 'ironSteamTonnage', 'steelSteamTonnage']) {
    if (!Number.isFinite(state.merchantFleet[key])) state.merchantFleet[key] = 0;
  }
  state.lastBreakthroughs ||= [];
  state.lastGunUpgrade ||= null;
  return state;
}

function unlock(region, techId, title, events) {
  if (hasTech(region, techId)) return false;
  region.unlockedTechIds ||= new Set();
  region.unlockedTechIds.add(techId);
  events.push({ type: 'industrial_marine_breakthrough', techId, regionId: region.id, regionName: region.name, title });
  return true;
}

function tickSteamKnowledge(region, regionsById, years, rng, events) {
  const state = ensureIndustrialMarine(region);
  const machining = capability(region, 'precision_machining');
  const steel = capability(region, 'steelmaking');
  const miningPractice = clamp((region.occupations?.miner || region.report?.mining?.workers || 0) / 800);
  const drainage = hasTech(region, 'mine_drainage') ? 1 : 0;
  const coal = coalAccess(region) ? 1 : 0;

  const steamTarget = clamp(coal * (0.20 + drainage * 0.25 + machining * 0.35 + steel * 0.20));
  state.steamEngineering += (steamTarget - state.steamEngineering) * clamp(years * (0.035 + miningPractice * 0.025));
  state.steamEngineering = clamp(state.steamEngineering);

  if (!hasTech(region, STATIONARY_STEAM_TECH_ID) && coal && drainage) {
    const exposure = diffusionExposure(region, regionsById, STATIONARY_STEAM_TECH_ID);
    if (rng() < practiceChance(0.035, years, state.steamEngineering, exposure)) {
      unlock(region, STATIONARY_STEAM_TECH_ID, 'Practical steam engine', events);
      state.steamEngineering = Math.max(state.steamEngineering, 0.12);
    }
  }

  if (hasTech(region, STATIONARY_STEAM_TECH_ID)) {
    state.steamEngineering = clamp(state.steamEngineering + years * (0.025 + machining * 0.045) * (1 - state.steamEngineering));
    if (!hasTech(region, HIGH_PRESSURE_STEAM_TECH_ID) && machining > 0.18) {
      const exposure = diffusionExposure(region, regionsById, HIGH_PRESSURE_STEAM_TECH_ID);
      if (rng() < practiceChance(0.026, years, state.steamEngineering * machining, exposure)) {
        unlock(region, HIGH_PRESSURE_STEAM_TECH_ID, 'Improved high-pressure steam engine', events);
      }
    }
  }
}

function tickMarineKnowledge(region, regionsById, years, rng, events) {
  const state = ensureIndustrialMarine(region);
  if (!region.isCoastal) return;
  const machining = capability(region, 'precision_machining');
  const steel = capability(region, 'steelmaking');
  const dockyard = shipyardAccess(region) ? 1 : 0;
  const advancedBoatbuilding = hasTech(region, 'advanced_boatbuilding') ? 1 : 0;
  const steam = state.steamEngineering;
  const marineTarget = clamp(dockyard * advancedBoatbuilding * (0.25 + steam * 0.45 + machining * 0.30));
  state.marineEngineering += (marineTarget - state.marineEngineering) * clamp(years * 0.055);
  state.marineEngineering = clamp(state.marineEngineering);

  if (!hasTech(region, MARINE_STEAM_TECH_ID) && hasTech(region, HIGH_PRESSURE_STEAM_TECH_ID) && dockyard && advancedBoatbuilding) {
    const exposure = diffusionExposure(region, regionsById, MARINE_STEAM_TECH_ID);
    if (rng() < practiceChance(0.045, years, state.marineEngineering, exposure)) {
      unlock(region, MARINE_STEAM_TECH_ID, 'Marine steam engine', events);
      state.marineEngineering = Math.max(state.marineEngineering, 0.10);
    }
  }

  if (hasTech(region, MARINE_STEAM_TECH_ID)) {
    state.marineEngineering = clamp(state.marineEngineering + years * (0.035 + machining * 0.045) * (1 - state.marineEngineering));
    if (!hasTech(region, SCREW_PROPULSION_TECH_ID) && machining > 0.28) {
      const exposure = diffusionExposure(region, regionsById, SCREW_PROPULSION_TECH_ID);
      if (rng() < practiceChance(0.035, years, state.marineEngineering * machining, exposure)) {
        unlock(region, SCREW_PROPULSION_TECH_ID, 'Screw propulsion', events);
      }
    }
  }

  const ironTarget = clamp(dockyard * state.marineEngineering * (0.25 + steel * 0.35 + machining * 0.40));
  state.ironHullEngineering += (ironTarget - state.ironHullEngineering) * clamp(years * 0.035);
  state.ironHullEngineering = clamp(state.ironHullEngineering);
  if (!hasTech(region, IRON_HULL_TECH_ID) && hasTech(region, MARINE_STEAM_TECH_ID) && hasTech(region, 'iron_smelting') && state.ironHullEngineering > 0.16) {
    const exposure = diffusionExposure(region, regionsById, IRON_HULL_TECH_ID);
    if (rng() < practiceChance(0.028, years, state.ironHullEngineering, exposure)) unlock(region, IRON_HULL_TECH_ID, 'Iron-hulled shipbuilding', events);
  }

  const steelTarget = clamp(state.ironHullEngineering * steel * (0.45 + machining * 0.55));
  state.steelHullEngineering += (steelTarget - state.steelHullEngineering) * clamp(years * 0.025);
  state.steelHullEngineering = clamp(state.steelHullEngineering);
  if (!hasTech(region, STEEL_HULL_TECH_ID) && hasTech(region, IRON_HULL_TECH_ID) && hasTech(region, 'steelmaking') && state.steelHullEngineering > 0.20) {
    const exposure = diffusionExposure(region, regionsById, STEEL_HULL_TECH_ID);
    if (rng() < practiceChance(0.022, years, state.steelHullEngineering, exposure)) unlock(region, STEEL_HULL_TECH_ID, 'Steel-hulled shipbuilding', events);
  }
}

function consume(region, key, amount) {
  const available = Math.max(0, region.stockpile?.[key] || 0);
  const taken = Math.min(available, Math.max(0, amount));
  if (taken > 0) region.stockpile[key] -= taken;
  return taken;
}

function tickMerchantSteam(region, years) {
  const state = ensureIndustrialMarine(region);
  if (!hasTech(region, MARINE_STEAM_TECH_ID) || !harbourAccess(region) || !shipyardAccess(region)) return;
  const fleet = state.merchantFleet;
  const capital = Math.max(0, region.corporateCapital?.firms?.reduce?.((sum, firm) => sum + Math.max(0, firm.capitalIndex || 0), 0) || 0);
  const demand = clamp(Math.log1p(Math.max(0, region.tradeRouteHabits?.size || region.recentTradePartners?.size || 0)) / 4 + Math.log1p(capital) / 10);
  const engineering = state.marineEngineering;
  const potential = years * (0.6 + demand * 2.2) * (0.2 + engineering * 0.8);
  if (potential <= 0.001) return;

  const screw = hasTech(region, SCREW_PROPULSION_TECH_ID);
  const ironHull = hasTech(region, IRON_HULL_TECH_ID);
  const steelHull = hasTech(region, STEEL_HULL_TECH_ID);
  const targetKey = steelHull ? 'steelSteamTonnage' : ironHull ? 'ironSteamTonnage' : screw ? 'screwSteamTonnage' : 'paddleSteamTonnage';
  const metalKey = steelHull ? 'steel' : 'iron';
  const metalNeed = potential * (steelHull ? 0.65 : ironHull ? 0.8 : 0.18);
  const woodNeed = potential * (steelHull ? 0.15 : ironHull ? 0.25 : 0.75);
  const coalNeed = potential * 0.12;
  const machineInventory = Math.max(0, region.industrialSupply?.inventory?.machine_components || 0);
  const machineNeed = potential * 0.08;
  const ratios = [
    metalNeed > 0 ? Math.max(0, region.stockpile?.[metalKey] || 0) / metalNeed : 1,
    woodNeed > 0 ? Math.max(0, region.stockpile?.wood || 0) / woodNeed : 1,
    coalNeed > 0 ? Math.max(0, region.stockpile?.coal || 0) / coalNeed : 1,
    machineNeed > 0 ? (machineInventory > 0 ? machineInventory / machineNeed : capability(region, 'precision_machining') * 0.65) : 1,
  ];
  const build = potential * clamp(Math.min(...ratios));
  if (build <= 0.001) return;
  consume(region, metalKey, metalNeed * (build / potential));
  consume(region, 'wood', woodNeed * (build / potential));
  consume(region, 'coal', coalNeed * (build / potential));
  if (machineInventory > 0) region.industrialSupply.inventory.machine_components = Math.max(0, machineInventory - machineNeed * (build / potential));
  fleet[targetKey] += build;
  region.marketDemand ||= {};
  region.marketDemand.coal = Math.max(region.marketDemand.coal || 0, coalNeed * 0.25);
  region.marketDemand[metalKey] = Math.max(region.marketDemand[metalKey] || 0, metalNeed * 0.15);
}

function desiredNavalGunType(region) {
  const machining = capability(region, 'precision_machining');
  if (hasTech(region, 'rifling') && machining >= 0.55 && hasTech(region, 'steelmaking')) return NAVAL_GUN_TYPES.BREECH;
  if (hasTech(region, 'rifling')) return NAVAL_GUN_TYPES.RIFLED;
  return NAVAL_GUN_TYPES.SMOOTHBORE;
}

function tickNavalGunModernisation(region, years) {
  const guns = region.earlyModernMilitary?.naval?.guns;
  if (!guns?.length) return;
  const state = ensureIndustrialMarine(region);
  const machining = capability(region, 'precision_machining');
  const desired = desiredNavalGunType(region);
  const desiredRank = desired === NAVAL_GUN_TYPES.BREECH ? 2 : desired === NAVAL_GUN_TYPES.RIFLED ? 1 : 0;
  state.navalGunEngineering = clamp(state.navalGunEngineering + years * (0.02 + machining * 0.06) * (1 - state.navalGunEngineering));
  const upgradeBudget = Math.max(0, Math.floor(guns.length * years * (0.03 + state.navalGunEngineering * 0.10)));
  let upgraded = 0;
  for (const gun of guns) {
    if (upgraded >= upgradeBudget) break;
    gun.technology ||= NAVAL_GUN_TYPES.SMOOTHBORE;
    const rank = gun.technology === NAVAL_GUN_TYPES.BREECH ? 2 : gun.technology === NAVAL_GUN_TYPES.RIFLED ? 1 : 0;
    if (rank >= desiredRank) continue;
    const metalCost = rank === 0 ? 0.18 : 0.32;
    const metalKey = hasTech(region, 'steelmaking') && (region.stockpile?.steel || 0) >= metalCost ? 'steel' : 'iron';
    if ((region.stockpile?.[metalKey] || 0) < metalCost) break;
    region.stockpile[metalKey] -= metalCost;
    gun.technology = rank === 0 ? NAVAL_GUN_TYPES.RIFLED : NAVAL_GUN_TYPES.BREECH;
    gun.metal = metalKey === 'steel' ? 'steel' : gun.metal;
    upgraded += 1;
  }
  if (upgraded) state.lastGunUpgrade = { type: desired, count: upgraded };
}

export function navalGunTechnologyMultiplier(gun) {
  const type = gun?.technology || NAVAL_GUN_TYPES.SMOOTHBORE;
  if (type === NAVAL_GUN_TYPES.BREECH) return 1.62;
  if (type === NAVAL_GUN_TYPES.RIFLED) return 1.28;
  return 1;
}

export function industrialMarineFleetProfile(region) {
  const state = ensureIndustrialMarine(region);
  return {
    steamReadiness: state.steamEngineering,
    marineReadiness: state.marineEngineering,
    ironHullReadiness: state.ironHullEngineering,
    steelHullReadiness: state.steelHullEngineering,
    hasSteamships: hasTech(region, MARINE_STEAM_TECH_ID),
    hasScrewPropulsion: hasTech(region, SCREW_PROPULSION_TECH_ID),
    hasIronHulls: hasTech(region, IRON_HULL_TECH_ID),
    hasSteelHulls: hasTech(region, STEEL_HULL_TECH_ID),
    merchantFleet: { ...state.merchantFleet },
  };
}

export function tickIndustrialMarine(regions, elapsedDays = 7, rng = Math.random) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];
  for (const region of regions) {
    ensureIndustrialMarine(region);
    tickSteamKnowledge(region, regionsById, years, rng, events);
    tickMarineKnowledge(region, regionsById, years, rng, events);
    tickMerchantSteam(region, years);
    tickNavalGunModernisation(region, years);
  }
  for (const region of regions) region.industrialMarine.lastBreakthroughs = events.filter((event) => event.regionId === region.id).map((event) => event.techId);
  return events;
}
