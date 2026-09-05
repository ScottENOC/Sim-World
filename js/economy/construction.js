import { localPrice } from './prices.js?v=20260904-weather1';

export const HILL_FORT_TECH_ID = 'hill_forts';

export const CONSTRUCTION_TYPES = Object.freeze({
  public_granary: {
    id: 'public_granary', name: 'Public granary', requiredTechId: null,
    description: 'A guarded communal storehouse using raised floors, sealed rooms and pottery vessels.',
    workRequired: 2600, defaultWorkers: 50, minWorkers: 15, maxWorkers: 200,
    materials: { stone: 250, wood: 300, pottery: 200 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.02,
  },
  harbour: {
    id: 'harbour', name: 'Harbour', requiredTechId: null, coastal: true, unique: true,
    description: 'Quays, sheltered moorings, ramps and stores capable of supporting large vessels.',
    workRequired: 7800, defaultWorkers: 100, minWorkers: 30, maxWorkers: 500,
    materials: { stone: 800, wood: 600 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.025,
  },
  shipyard: {
    id: 'shipyard', name: 'Advanced shipyard', requiredTechId: 'advanced_boatbuilding', coastal: true, unique: true,
    requiresInfrastructure: 'harbour',
    description: 'Specialist slips, sheds, cranes and stores for constructing advanced vessels.',
    workRequired: 6200, defaultWorkers: 80, minWorkers: 25, maxWorkers: 350,
    materials: { stone: 350, wood: 900, bronze: 20 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.03,
  },
  hill_fort: {
    id: 'hill_fort', name: 'Hill fort', requiredTechId: HILL_FORT_TECH_ID,
    description: 'A fortified refuge and defended seat of power on commanding ground.',
    workRequired: 5200, defaultWorkers: 100, minWorkers: 25, maxWorkers: 400,
    materials: { stone: 600, wood: 150 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.015,
  },
});

let nextProjectId = 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function ensureConstruction(region) {
  if (!region.construction) region.construction = { projects: [], completed: {}, workersReserved: 0, lastWeek: null };
  if (!Array.isArray(region.construction.projects)) region.construction.projects = [];
  if (!region.construction.completed) region.construction.completed = {};
  if (!Array.isArray(region.construction.assets)) {
    region.construction.assets = [];
    for (const [typeId, count] of Object.entries(region.construction.completed)) {
      for (let i = 0; i < (Number(count) || 0); i++) region.construction.assets.push({ id: `legacy-${typeId}-${i}`, typeId, condition: 1 });
    }
  }
  if (!Number.isFinite(region.construction.maintenanceWorkersReserved)) region.construction.maintenanceWorkersReserved = 0;
  return region.construction;
}

export function syncNextProjectId(regions = []) {
  nextProjectId = Math.max(1, ...regions.flatMap((region) => ensureConstruction(region).projects)
    .map((project) => (Number(project.id) || 0) + 1));
}

export function availableConstructionTypes(region) {
  const state = ensureConstruction(region);
  return Object.values(CONSTRUCTION_TYPES).filter((type) =>
    (!type.requiredTechId || region.unlockedTechIds.has(type.requiredTechId)) &&
    (!type.coastal || region.isCoastal) &&
    (!type.requiresInfrastructure || operationalInfrastructure(region, type.requiresInfrastructure)) &&
    (!type.unique || !state.assets.some((asset) => asset.typeId === type.id)) &&
    !state.projects.some((project) => project.typeId === type.id && project.status === 'active'));
}

export function startConstruction(region, typeId, requestedWorkers, currentTick) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!type || (type.requiredTechId && !region.unlockedTechIds.has(type.requiredTechId)) ||
      (type.coastal && !region.isCoastal) ||
      (type.requiresInfrastructure && !operationalInfrastructure(region, type.requiresInfrastructure))) return null;
  const state = ensureConstruction(region);
  if (type.unique && state.assets.some((asset) => asset.typeId === type.id)) return null;
  if (state.projects.some((project) => project.typeId === typeId && project.status === 'active')) return null;
  const workers = Math.round(clamp(Number(requestedWorkers) || type.defaultWorkers, type.minWorkers, type.maxWorkers));
  const project = {
    id: nextProjectId++, typeId, status: 'active', startedTick: currentTick,
    targetWorkers: workers, workersThisWeek: 0, workDone: 0,
    workRequired: type.workRequired, materialsRequired: { ...type.materials }, kind: 'build',
    materialsUsed: Object.fromEntries(Object.keys(type.materials).map((key) => [key, 0])),
    wagesPaid: 0, suppliesPaid: 0, stalledReason: null, completedTick: null,
  };
  state.projects.push(project);
  return project;
}

export function setConstructionWorkers(region, projectId, workers) {
  const project = ensureConstruction(region).projects.find((item) => item.id === Number(projectId));
  const type = project && CONSTRUCTION_TYPES[project.typeId];
  if (!project || !type || project.status !== 'active') return false;
  project.targetWorkers = Math.round(clamp(Number(workers) || type.minWorkers, type.minWorkers, type.maxWorkers));
  return true;
}

export function cancelConstruction(region, projectId) {
  const project = ensureConstruction(region).projects.find((item) => item.id === Number(projectId));
  if (!project || project.status !== 'active') return false;
  project.status = 'cancelled';
  project.workersThisWeek = 0;
  return true;
}

// Called before ordinary production. Builders are a real claim on working-age
// labour, not a cosmetic progress number layered on top of a full economy.
export function prepareConstructionLabor(regions) {
  for (const region of regions) {
    const state = ensureConstruction(region);
    const project = state.projects.find((item) => item.status === 'active');
    const maintenanceNeed = state.assets.reduce((sum, asset) => {
      const type = CONSTRUCTION_TYPES[asset.typeId];
      return sum + (type ? type.workRequired * (type.maintenanceRate || 0.02) / 52 / 20 : 0);
    }, 0);
    state.maintenanceWorkersReserved = Math.min(Math.ceil(maintenanceNeed), Math.floor(Math.max(0, availableWorkers(region)) * 0.05));
    if (!project) { state.workersReserved = 0; continue; }
    const available = Math.max(0, availableWorkers(region) - state.maintenanceWorkersReserved);
    state.workersReserved = Math.min(project.targetWorkers, Math.floor(available * 0.35));
  }
}

export function constructionEstimate(region, typeId, workers) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!type) return null;
  const assigned = clamp(Number(workers) || type.defaultWorkers, type.minWorkers, type.maxWorkers);
  const weeks = Math.ceil(type.workRequired / assigned);
  const wages = type.workRequired * type.wagePerWorkerWeek;
  const supplies = Object.entries(type.materials).reduce((sum, [resource, amount]) =>
    sum + amount * localPrice(region, resource), 0);
  return { workers: assigned, weeks, wages, supplies, totalCost: wages + supplies, materials: { ...type.materials } };
}

function completeProject(region, project, type, currentTick) {
  project.status = 'completed'; project.completedTick = currentTick; project.workersThisWeek = 0;
  const state = ensureConstruction(region);
  if (project.kind === 'repair') {
    const asset = state.assets.find((item) => item.id === project.repairAssetId);
    if (asset) asset.condition = 1;
    return { type: 'construction_completed', regionId: region.id, regionName: region.name, project,
      constructionType: { ...type, name: `${type.name} repairs` } };
  }
  state.completed[type.id] = (state.completed[type.id] || 0) + 1;
  state.assets.push({ id: `${project.id}-${type.id}`, typeId: type.id, condition: 1 });
  if (!region.infrastructure) region.infrastructure = {};
  if (type.id === 'hill_fort') region.infrastructure.hillForts = (region.infrastructure.hillForts || 0) + 1;
  if (type.id === 'public_granary') region.infrastructure.publicGranaries = (region.infrastructure.publicGranaries || 0) + 1;
  return { type: 'construction_completed', regionId: region.id, regionName: region.name, project, constructionType: type };
}

export function tickConstruction(regions, currentTick) {
  const events = [];
  for (const region of regions) {
    const state = ensureConstruction(region);
    const project = state.projects.find((item) => item.status === 'active');
    if (!project) { state.workersReserved = 0; state.lastWeek = null; continue; }
    const type = CONSTRUCTION_TYPES[project.typeId];
    const requiredWork = project.workRequired || type.workRequired;
    const requiredMaterials = project.materialsRequired || type.materials;
    const remainingWork = Math.max(0, requiredWork - project.workDone);
    const workers = Math.min(state.workersReserved || 0, remainingWork);
    const desiredFraction = workers / requiredWork;
    let affordableFraction = desiredFraction;
    const fullWageCost = requiredWork * type.wagePerWorkerWeek;
    const fullSupplyCost = Object.entries(requiredMaterials).reduce((sum, [resource, total]) =>
      sum + total * localPrice(region, resource), 0);
    const fullCost = fullWageCost + fullSupplyCost;
    if (fullCost > 0) affordableFraction = Math.min(affordableFraction, Math.max(0, region.treasury || 0) / fullCost);
    for (const [resource, total] of Object.entries(requiredMaterials)) {
      affordableFraction = Math.min(affordableFraction, Math.max(0, region.stockpile?.[resource] || 0) / total);
    }
    const work = Math.min(remainingWork, requiredWork * Math.max(0, affordableFraction));
    const actualWorkers = Math.min(workers, work);
    const fraction = work / requiredWork;
    const wages = actualWorkers * type.wagePerWorkerWeek;
    let supplies = 0;
    for (const [resource, total] of Object.entries(requiredMaterials)) {
      const used = Math.min(region.stockpile[resource] || 0, total * fraction);
      supplies += used * localPrice(region, resource);
      region.stockpile[resource] = Math.max(0, (region.stockpile[resource] || 0) - used);
      project.materialsUsed[resource] = (project.materialsUsed[resource] || 0) + used;
    }
    const publicSpend = Math.min(region.treasury || 0, wages + supplies);
    region.treasury = Math.max(0, (region.treasury || 0) - publicSpend);
    region.wallet = Math.max(0, (region.wallet || 0) + publicSpend);
    project.workDone += work; project.wagesPaid += wages; project.suppliesPaid += supplies; project.workersThisWeek = Math.round(actualWorkers);
    project.stalledReason = work > 0 ? null : workers <= 0 ? 'No labour is available'
      : (region.treasury || 0) <= 0 ? 'The treasury cannot meet wages' : 'Required materials are unavailable';
    state.lastWeek = { projectId: project.id, workers: project.workersThisWeek, work, wages, supplies, stalledReason: project.stalledReason };
    if (project.workDone >= requiredWork - 0.001) events.push(completeProject(region, project, type, currentTick));
  }
  return events;
}

export function hillFortDefenceMultiplier(region) {
  const forts = effectiveInfrastructureCount(region, 'hill_fort');
  return 1 + Math.min(0.45, forts * 0.22);
}

function availableWorkers(region) {
  return Math.max(0, (region.demographics?.workingAge || 0) - (region.army?.personnel || 0) -
    (region.navy?.personnel || 0) - (region.emergencyMilitiaPersonnel || 0));
}

export function assetEffectiveness(asset) {
  const condition = Math.max(0, Math.min(1, Number(asset?.condition) || 0));
  return condition <= 0.2 ? 0 : Math.min(1, (condition - 0.2) / 0.6);
}

export function effectiveInfrastructureCount(region, typeId) {
  return ensureConstruction(region).assets.filter((asset) => asset.typeId === typeId)
    .reduce((sum, asset) => sum + assetEffectiveness(asset), 0);
}

export function operationalInfrastructure(region, typeId) {
  return effectiveInfrastructureCount(region, typeId) >= 0.5;
}

export function startRepair(region, assetId, requestedWorkers, currentTick) {
  const state = ensureConstruction(region);
  const asset = state.assets.find((item) => item.id === assetId);
  const type = asset && CONSTRUCTION_TYPES[asset.typeId];
  if (!asset || !type || asset.condition >= 0.999 || state.projects.some((item) => item.status === 'active')) return null;
  const damage = 1 - asset.condition;
  const workers = Math.round(clamp(Number(requestedWorkers) || type.defaultWorkers, type.minWorkers, type.maxWorkers));
  const project = {
    id: nextProjectId++, typeId: type.id, kind: 'repair', repairAssetId: asset.id, status: 'active',
    startedTick: currentTick, targetWorkers: workers, workersThisWeek: 0, workDone: 0,
    workRequired: Math.max(type.minWorkers, type.workRequired * damage * 0.6),
    materialsRequired: Object.fromEntries(Object.entries(type.materials).map(([key, amount]) => [key, amount * damage * 0.7])),
    materialsUsed: Object.fromEntries(Object.keys(type.materials).map((key) => [key, 0])),
    wagesPaid: 0, suppliesPaid: 0, stalledReason: null, completedTick: null,
  };
  state.projects.push(project);
  return project;
}

export function tickInfrastructureMaintenance(regions) {
  for (const region of regions) {
    const state = ensureConstruction(region);
    let workers = state.maintenanceWorkersReserved || 0;
    for (const asset of state.assets) {
      const type = CONSTRUCTION_TYPES[asset.typeId];
      if (!type) continue;
      const rate = type.maintenanceRate || 0.02;
      const workerNeed = type.workRequired * rate / 52 / 20;
      const workerRatio = Math.min(1, workers / Math.max(0.001, workerNeed));
      const materialNeeds = Object.fromEntries(Object.entries(type.materials).map(([key, amount]) => [key, amount * rate / 52]));
      let materialRatio = 1;
      let cost = workerNeed * type.wagePerWorkerWeek;
      for (const [resource, amount] of Object.entries(materialNeeds)) {
        materialRatio = Math.min(materialRatio, (region.stockpile?.[resource] || 0) / Math.max(0.001, amount));
        cost += amount * localPrice(region, resource);
      }
      const moneyRatio = Math.min(1, (region.treasury || 0) / Math.max(0.001, cost));
      const ratio = Math.max(0, Math.min(workerRatio, materialRatio, moneyRatio));
      workers = Math.max(0, workers - workerNeed * ratio);
      for (const [resource, amount] of Object.entries(materialNeeds)) region.stockpile[resource] = Math.max(0, (region.stockpile[resource] || 0) - amount * ratio);
      const paid = cost * ratio; region.treasury = Math.max(0, region.treasury - paid); region.wallet = Math.max(0, (region.wallet || 0) + paid);
      asset.condition = clamp(asset.condition + ratio * 0.00015 - (1 - ratio) * 0.002, 0, 1);
      asset.maintenanceRatio = ratio;
    }
  }
}

export function chooseAiConstruction(region, currentTick, rng = Math.random) {
  const state = ensureConstruction(region);
  if (state.projects.some((project) => project.status === 'active')) return null;
  const damaged = state.assets.filter((asset) => asset.condition < 0.75).sort((a, b) => a.condition - b.condition)[0];
  if (damaged && (region.treasury || 0) >= 5 && rng() < 0.01) {
    return startRepair(region, damaged.id, CONSTRUCTION_TYPES[damaged.typeId]?.defaultWorkers || 50, currentTick);
  }
  if (region.isCoastal && effectiveInfrastructureCount(region, 'harbour') < 0.5 &&
      (region.targetNavySize || 0) + (region.targetFishingBoats || 0) >= 5 &&
      (region.stockpile?.stone || 0) >= 400 && (region.stockpile?.wood || 0) >= 300 && rng() < 0.002) {
    return startConstruction(region, 'harbour', 100, currentTick);
  }
  if (region.isCoastal && region.unlockedTechIds.has('advanced_boatbuilding') &&
      operationalInfrastructure(region, 'harbour') && !operationalInfrastructure(region, 'shipyard') &&
      (region.stockpile?.stone || 0) >= 175 && (region.stockpile?.wood || 0) >= 450 && rng() < 0.003) {
    return startConstruction(region, 'shipyard', 80, currentTick);
  }
  const granaries = Math.max(0, region.infrastructure?.publicGranaries || 0);
  const potteryCoverage = (region.stockpile?.pottery || 0) / Math.max(1, region.population * 0.6);
  const granaryReady = (region.stockpile?.stone || 0) >= 125 && (region.stockpile?.wood || 0) >= 150 &&
    (region.stockpile?.pottery || 0) >= 100 && (region.treasury || 0) >= 5;
  if (granaries < 3 && potteryCoverage >= 0.15 && granaryReady && rng() < 0.002) {
    const workers = Math.min(100, Math.max(15, Math.round((region.demographics?.workingAge || 0) * 0.01)));
    return startConstruction(region, 'public_granary', workers, currentTick);
  }
  if (!region.unlockedTechIds.has(HILL_FORT_TECH_ID) || rng() > 0.003) return null;
  const threatened = (region.safetyRating || 0) < 0.72 || (region.conflictPressure || 0) > 0;
  const materialsReady = (region.stockpile?.stone || 0) >= 300 && (region.stockpile?.wood || 0) >= 75;
  if (!threatened || !materialsReady || (region.treasury || 0) < 5) return null;
  const workers = Math.min(200, Math.max(25, Math.round((region.demographics?.workingAge || 0) * 0.02)));
  return startConstruction(region, 'hill_fort', workers, currentTick);
}
