import { operationalInfrastructure } from '../economy/construction.js?v=20260907-classical1';
import { ensureMilitaryPolicy } from './policies.js?v=20260904-policy1';
import { culturalMemoryEffects } from '../society/culturalMemory.js?v=20260907-memory1';
import { recordSocietalMemory } from '../society/societalMemoryEvents.js?v=20260907-memory2';

const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const FORMATION_ARCHETYPES = Object.freeze({
  standardised_heavy_infantry: {
    id: 'standardised_heavy_infantry',
    label: 'Standardised heavy infantry',
    minArmy: 300,
    discoveryYears: 12,
    maxCoverage: 0.42,
    combatBonus: 0.13,
    cohesionBonus: 0.10,
    annualMetalPerSoldier: 0.004,
    annualTreasuryPerSoldier: 0.0015,
  },
});

export function ensureMilitaryFormations(region) {
  region.militaryFormations ||= { traditions: [], progress: {}, retired: [] };
  region.militaryFormations.traditions ||= [];
  region.militaryFormations.progress ||= {};
  region.militaryFormations.retired ||= [];
  return region.militaryFormations;
}

function hasTech(region, id) { return Boolean(region.unlockedTechIds?.has(id)); }

function heavyInfantryConditions(region) {
  const army = Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0));
  const policy = ensureMilitaryPolicy(region);
  const technology = hasTech(region, 'mass_heavy_infantry') && hasTech(region, 'military_drill') && hasTech(region, 'standard_weights');
  const institutions = operationalInfrastructure(region, 'royal_arsenal') && operationalInfrastructure(region, 'drill_ground');
  const metal = Math.max(0, region.stockpile?.iron || 0) + Math.max(0, region.stockpile?.bronze || 0);
  const metalAdequacy = clamp01(metal / Math.max(8, army * 0.015));
  const permanence = clamp01(policy.armyPermanence || 0);
  const martialMemory = culturalMemoryEffects(region).martialTradition || 0;
  return {
    eligible: technology && institutions && army >= FORMATION_ARCHETYPES.standardised_heavy_infantry.minArmy,
    army, permanence, metalAdequacy, martialMemory,
    trainingSignal: clamp01(permanence * 0.5 + martialMemory * 0.2 + (institutions ? 0.3 : 0)),
  };
}

function formationName(region) {
  const place = region.settlements?.places?.find((p) => p.id === region.settlements?.principalId)?.name || region.name;
  const strongest = [...(region.culturalMemory?.memories || [])]
    .filter((m) => m.defining && (m.theme === 'victory' || m.theme === 'defeat'))
    .sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
  if (strongest?.motif === 'chariot') return `Shield Cohorts of the Charioteers`;
  if (strongest?.theme === 'victory') return `Victory Cohorts of ${place}`;
  return `${place} Heavy Cohorts`;
}

function createHeavyInfantryTradition(region) {
  const state = ensureMilitaryFormations(region);
  const existing = state.traditions.find((f) => f.archetypeId === 'standardised_heavy_infantry' && f.status !== 'retired');
  if (existing) return existing;
  const formation = {
    id: `${region.id}:formation:${state.traditions.length + state.retired.length + 1}`,
    archetypeId: 'standardised_heavy_infantry',
    name: formationName(region),
    status: 'active',
    ageYears: 0,
    readiness: 0.55,
    coverage: 0.08,
    prestige: 0.18,
    underfundedYears: 0,
    originRegionId: region.id,
  };
  state.traditions.push(formation);
  recordSocietalMemory(region, {
    sourceType: 'formation', sourceId: formation.id,
    label: `Founding of the ${formation.name}`,
    theme: 'military_tradition', motif: 'heavy_infantry', valence: 1,
    strength: 0.2, practicalRelevance: 1, symbolicLegacy: 0.07,
  });
  return formation;
}

function payFormationUpkeep(region, formation, spec, years, army) {
  const soldiers = Math.max(0, army * formation.coverage);
  const metalNeed = soldiers * spec.annualMetalPerSoldier * years;
  let metalPaid = 0;
  for (const resource of ['iron', 'bronze']) {
    const available = Math.max(0, region.stockpile?.[resource] || 0);
    const used = Math.min(available, Math.max(0, metalNeed - metalPaid));
    if (used > 0) region.stockpile[resource] -= used;
    metalPaid += used;
  }
  const moneyNeed = soldiers * spec.annualTreasuryPerSoldier * years;
  const moneyPaid = Math.min(Math.max(0, region.treasury || 0), moneyNeed);
  region.treasury = Math.max(0, (region.treasury || 0) - moneyPaid);
  const materialRatio = metalNeed > 0 ? metalPaid / metalNeed : 1;
  const moneyRatio = moneyNeed > 0 ? moneyPaid / moneyNeed : 1;
  return Math.min(1, materialRatio, moneyRatio);
}

export function tickMilitaryFormations(region, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const state = ensureMilitaryFormations(region);
  if (years <= 0) return state;

  const spec = FORMATION_ARCHETYPES.standardised_heavy_infantry;
  const conditions = heavyInfantryConditions(region);
  let progress = Number(state.progress[spec.id]) || 0;
  if (conditions.eligible) {
    const learning = 0.45 + conditions.trainingSignal * 0.35 + conditions.metalAdequacy * 0.2;
    progress += years / spec.discoveryYears * learning;
  } else {
    progress = Math.max(0, progress - years / 35);
  }
  state.progress[spec.id] = clamp01(progress);
  if (progress >= 1) createHeavyInfantryTradition(region);

  for (const formation of state.traditions) {
    if (formation.status !== 'active') continue;
    formation.ageYears += years;
    const currentConditions = heavyInfantryConditions(region);
    const upkeep = payFormationUpkeep(region, formation, spec, years, currentConditions.army);
    const desiredCoverage = currentConditions.eligible
      ? spec.maxCoverage * (0.5 + currentConditions.trainingSignal * 0.5) * (0.65 + upkeep * 0.35)
      : 0.04;
    formation.coverage = clamp01(formation.coverage + (desiredCoverage - formation.coverage) * (1 - Math.exp(-years / 6)));
    const readinessTarget = clamp01(0.28 + currentConditions.trainingSignal * 0.42 + upkeep * 0.30);
    formation.readiness = clamp01(formation.readiness + (readinessTarget - formation.readiness) * (1 - Math.exp(-years / 4)));
    formation.prestige = clamp01(formation.prestige + (formation.readiness * formation.coverage - formation.prestige) * (1 - Math.exp(-years / 18)));
    formation.underfundedYears = upkeep < 0.55 ? formation.underfundedYears + years : Math.max(0, formation.underfundedYears - years * 0.5);
    if ((!currentConditions.eligible && formation.coverage < 0.05) || formation.underfundedYears > 18) {
      formation.status = 'retired';
      state.retired.push({ ...formation });
    }
  }
  state.traditions = state.traditions.filter((f) => f.status === 'active');
  return state;
}

export function activeFormation(region, archetypeId = 'standardised_heavy_infantry') {
  return ensureMilitaryFormations(region).traditions.find((f) => f.archetypeId === archetypeId && f.status === 'active') || null;
}

export function formationCombatMultiplier(region) {
  const formation = activeFormation(region);
  if (!formation) return 1;
  const spec = FORMATION_ARCHETYPES[formation.archetypeId];
  return 1 + spec.combatBonus * formation.coverage * formation.readiness;
}

export function formationCohesionBonus(region) {
  const formation = activeFormation(region);
  if (!formation) return 0;
  const spec = FORMATION_ARCHETYPES[formation.archetypeId];
  return spec.cohesionBonus * formation.coverage * formation.readiness;
}

export function formationSummary(region) {
  const state = ensureMilitaryFormations(region);
  return {
    active: state.traditions.map((f) => ({ ...f })),
    progress: { ...state.progress },
    retired: state.retired.slice(-5).map((f) => ({ ...f })),
  };
}
