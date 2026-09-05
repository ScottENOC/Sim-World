import { localPrice } from '../economy/prices.js?v=20260904-weather1';
import { spendMilitaryProcurement } from '../economy/stateFinance.js?v=20260904-weather1';
import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';

export const CATAPULT_TECH_ID = 'torsion_catapults';

export const SIEGE_TYPES = Object.freeze({
  ram: {
    id: 'ram', name: 'Battering ram', requiredTechId: 'hill_forts',
    woodCost: 30, metalCost: 5, workers: 18, fortReduction: { bronze: 0.14, iron: 0.10 },
  },
  catapult: {
    id: 'catapult', name: 'Catapult', requiredTechId: CATAPULT_TECH_ID,
    woodCost: 20, metalCost: 8, workers: 30, fortReduction: { bronze: 0.28, iron: 0.20 },
  },
});

export function ensureSiegeEquipment(region) {
  if (!region.siegeEquipment) region.siegeEquipment = {};
  const state = region.siegeEquipment;
  if (!state.targets) state.targets = { ram: 0, catapult: 0 };
  if (!state.inventory) state.inventory = { ram: { bronze: 0, iron: 0 }, catapult: { bronze: 0, iron: 0 } };
  if (!state.away) state.away = { ram: { bronze: 0, iron: 0 }, catapult: { bronze: 0, iron: 0 } };
  for (const id of Object.keys(SIEGE_TYPES)) {
    if (!state.inventory[id]) state.inventory[id] = { bronze: 0, iron: 0 };
    if (!state.away[id]) state.away[id] = { bronze: 0, iron: 0 };
    if (!Number.isFinite(state.targets[id])) state.targets[id] = 0;
  }
  if (!Number.isFinite(state.experience)) state.experience = 0;
  if (!Number.isFinite(state.workersReserved)) state.workersReserved = 0;
  if (!state.lastWeek) state.lastWeek = null;
  return state;
}

export function siegeCount(region, typeId) {
  const inventory = ensureSiegeEquipment(region).inventory[typeId] || {};
  return Math.max(0, inventory.bronze || 0) + Math.max(0, inventory.iron || 0);
}

export function setSiegeTarget(region, typeId, count) {
  const type = SIEGE_TYPES[typeId];
  if (!type || (type.requiredTechId && !region.unlockedTechIds.has(type.requiredTechId))) return false;
  ensureSiegeEquipment(region).targets[typeId] = Math.max(0, Math.floor(Number(count) || 0));
  return true;
}

function nextWantedType(region) {
  const state = ensureSiegeEquipment(region);
  return Object.values(SIEGE_TYPES).find((type) =>
    (!type.requiredTechId || region.unlockedTechIds.has(type.requiredTechId)) &&
    siegeCount(region, type.id) + (state.away[type.id].bronze || 0) + (state.away[type.id].iron || 0) < state.targets[type.id]);
}

export function prepareSiegeWorkforce(regions) {
  for (const region of regions) {
    const state = ensureSiegeEquipment(region);
    let buildsRemaining = maxBuilds;
    while (buildsRemaining-- > 0) {
    const type = nextWantedType(region);
    if (!type) { state.workersReserved = 0; continue; }
    const available = Math.max(0, (region.demographics?.workingAge || 0) -
      (region.army?.personnel || 0) - (region.navy?.personnel || 0) -
      (region.emergencyMilitiaPersonnel || 0) - (region.construction?.workersReserved || 0));
    const afterMaintenance = Math.max(0, available - (region.construction?.maintenanceWorkersReserved || 0));
    const arsenalSpeed = 1 + Math.min(0.5, effectiveInfrastructureCount(region, 'royal_arsenal') * 0.5);
    state.workersReserved = Math.min(Math.ceil(type.workers / arsenalSpeed), Math.floor(afterMaintenance));
  }
}

function chooseMetal(region, type) {
  const bronzeReady = (region.stockpile?.bronze || 0) >= type.metalCost;
  const ironReady = region.unlockedTechIds.has('iron_smelting') &&
    (region.stockpile?.iron || 0) >= type.metalCost;
  if (!bronzeReady) return ironReady ? 'iron' : null;
  if (!ironReady) return 'bronze';
  const bronzeValue = type.metalCost * localPrice(region, 'bronze');
  const ironValue = type.metalCost * localPrice(region, 'iron');
  return ironValue <= bronzeValue * 0.65 ? 'iron' : 'bronze';
}

export function tickSiegeEquipment(regions, elapsedDays = 7) {
  const maxBuilds = Math.max(1, Math.floor(elapsedDays / 7));
  for (const region of regions) {
    const state = ensureSiegeEquipment(region);
    const type = nextWantedType(region);
    state.lastWeek = null;
    const requiredWorkers = type ? Math.ceil(type.workers /
      (1 + Math.min(0.5, effectiveInfrastructureCount(region, 'royal_arsenal') * 0.5))) : 0;
    if (!type || state.workersReserved < requiredWorkers) continue;
    const metal = chooseMetal(region, type);
    if (!metal || (region.stockpile?.wood || 0) < type.woodCost) {
      state.lastWeek = { stalledReason: !metal ? 'Suitable metal is unavailable' : 'Wood is unavailable' };
      continue;
    }
    const cost = type.woodCost * localPrice(region, 'wood') +
      type.metalCost * localPrice(region, metal);
    if (Math.min(region.militaryFinance?.procurementBudget || 0, region.treasury || 0) + 0.001 < cost) {
      state.lastWeek = { stalledReason: 'Military procurement funds are insufficient' };
      continue;
    }
    const paid = spendMilitaryProcurement(region, cost);
    if (paid + 0.001 < cost) {
      state.lastWeek = { stalledReason: 'Military procurement funds are insufficient' };
      continue;
    }
    region.wallet = Math.max(0, (region.wallet || 0) + paid);
    region.stockpile.wood -= type.woodCost;
    region.stockpile[metal] -= type.metalCost;
    state.inventory[type.id][metal] += 1;
    state.experience += requiredWorkers;
    state.lastWeek = { built: type.id, metal, cost };
    }
  }
}

export function takeSiegeTrain(region, personnel) {
  const state = ensureSiegeEquipment(region);
  let capacity = Math.max(0, Math.floor(personnel / 100));
  const train = { ram: { bronze: 0, iron: 0 }, catapult: { bronze: 0, iron: 0 } };
  for (const typeId of ['catapult', 'ram']) {
    for (const metal of ['bronze', 'iron']) {
      const taken = Math.min(capacity, Math.floor(state.inventory[typeId][metal] || 0));
      train[typeId][metal] = taken;
      state.inventory[typeId][metal] -= taken;
      state.away[typeId][metal] += taken;
      capacity -= taken;
    }
  }
  return train;
}

export function returnSiegeTrain(region, train) {
  const inventory = ensureSiegeEquipment(region).inventory;
  const away = ensureSiegeEquipment(region).away;
  for (const typeId of Object.keys(SIEGE_TYPES)) for (const metal of ['bronze', 'iron']) {
    const returned = Math.max(0, train?.[typeId]?.[metal] || 0);
    inventory[typeId][metal] += returned;
    away[typeId][metal] = Math.max(0, away[typeId][metal] - returned);
  }
}

export function siegeTrainCount(train) {
  return Object.values(train || {}).reduce((sum, byMetal) =>
    sum + Object.values(byMetal || {}).reduce((n, value) => n + Math.max(0, value || 0), 0), 0);
}

// Returns the fraction of a fortification bonus that survives the siege train.
// Bronze fittings bear shock and tension better than the game's early iron.
export function survivingFortBenefit(train, fortCount) {
  if (fortCount <= 0) return 1;
  let reduction = 0;
  for (const [typeId, byMetal] of Object.entries(train || {})) {
    const type = SIEGE_TYPES[typeId];
    if (!type) continue;
    for (const metal of ['bronze', 'iron']) reduction += (byMetal?.[metal] || 0) * type.fortReduction[metal];
  }
  return Math.max(0.1, 1 - reduction / Math.max(1, fortCount));
}

export function chooseAiSiegeTargets(region) {
  if (!region.unlockedTechIds.has('hill_forts')) return;
  const state = ensureSiegeEquipment(region);
  const scale = Math.max(0, Math.floor((region.army?.personnel || 0) / 500));
  state.targets.ram = Math.max(state.targets.ram, Math.min(4, scale));
  if (region.unlockedTechIds.has(CATAPULT_TECH_ID)) state.targets.catapult = Math.max(state.targets.catapult, Math.min(2, Math.floor(scale / 2)));
}
