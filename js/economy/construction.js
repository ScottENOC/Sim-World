import { localPrice } from './prices.js?v=20260904-weather1';

export const HILL_FORT_TECH_ID = 'hill_forts';

export const CONSTRUCTION_TYPES = Object.freeze({
  public_granary: {
    id: 'public_granary', name: 'Public granary', requiredTechId: null,
    description: 'A guarded communal storehouse using raised floors, sealed rooms and pottery vessels.',
    workRequired: 2600, defaultWorkers: 50, minWorkers: 15, maxWorkers: 200,
    materials: { stone: 250, wood: 300, pottery: 200 }, wagePerWorkerWeek: 0.002,
  },
  hill_fort: {
    id: 'hill_fort', name: 'Hill fort', requiredTechId: HILL_FORT_TECH_ID,
    description: 'A fortified refuge and defended seat of power on commanding ground.',
    workRequired: 5200, defaultWorkers: 100, minWorkers: 25, maxWorkers: 400,
    materials: { stone: 600, wood: 150 }, wagePerWorkerWeek: 0.002,
  },
});

let nextProjectId = 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function ensureConstruction(region) {
  if (!region.construction) region.construction = { projects: [], completed: {}, workersReserved: 0, lastWeek: null };
  if (!Array.isArray(region.construction.projects)) region.construction.projects = [];
  if (!region.construction.completed) region.construction.completed = {};
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
    !state.projects.some((project) => project.typeId === type.id && project.status === 'active'));
}

export function startConstruction(region, typeId, requestedWorkers, currentTick) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!type || (type.requiredTechId && !region.unlockedTechIds.has(type.requiredTechId))) return null;
  const state = ensureConstruction(region);
  if (state.projects.some((project) => project.typeId === typeId && project.status === 'active')) return null;
  const workers = Math.round(clamp(Number(requestedWorkers) || type.defaultWorkers, type.minWorkers, type.maxWorkers));
  const project = {
    id: nextProjectId++, typeId, status: 'active', startedTick: currentTick,
    targetWorkers: workers, workersThisWeek: 0, workDone: 0,
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
    if (!project) { state.workersReserved = 0; continue; }
    const available = Math.max(0, (region.demographics?.workingAge || 0) -
      (region.army?.personnel || 0) - (region.navy?.personnel || 0) -
      (region.emergencyMilitiaPersonnel || 0));
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
  state.completed[type.id] = (state.completed[type.id] || 0) + 1;
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
    const remainingWork = Math.max(0, type.workRequired - project.workDone);
    const workers = Math.min(state.workersReserved || 0, remainingWork);
    const desiredFraction = workers / type.workRequired;
    let affordableFraction = desiredFraction;
    const fullWageCost = type.workRequired * type.wagePerWorkerWeek;
    const fullSupplyCost = Object.entries(type.materials).reduce((sum, [resource, total]) =>
      sum + total * localPrice(region, resource), 0);
    const fullCost = fullWageCost + fullSupplyCost;
    if (fullCost > 0) affordableFraction = Math.min(affordableFraction, Math.max(0, region.treasury || 0) / fullCost);
    for (const [resource, total] of Object.entries(type.materials)) {
      affordableFraction = Math.min(affordableFraction, Math.max(0, region.stockpile?.[resource] || 0) / total);
    }
    const work = Math.min(remainingWork, type.workRequired * Math.max(0, affordableFraction));
    const actualWorkers = Math.min(workers, work);
    const fraction = work / type.workRequired;
    const wages = actualWorkers * type.wagePerWorkerWeek;
    let supplies = 0;
    for (const [resource, total] of Object.entries(type.materials)) {
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
    if (project.workDone >= type.workRequired - 0.001) events.push(completeProject(region, project, type, currentTick));
  }
  return events;
}

export function hillFortDefenceMultiplier(region) {
  const forts = Math.max(0, region.infrastructure?.hillForts || 0);
  return 1 + Math.min(0.45, forts * 0.22);
}

export function chooseAiConstruction(region, currentTick, rng = Math.random) {
  const state = ensureConstruction(region);
  if (state.projects.some((project) => project.status === 'active')) return null;
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
