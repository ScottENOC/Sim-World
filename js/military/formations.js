import { operationalInfrastructure } from '../economy/construction.js?v=20260907-classical1';
import { ensureMilitaryPolicy } from './policies.js?v=20260904-policy1';
import { culturalMemoryEffects } from '../society/culturalMemory.js?v=20260907-memory1';
import { recordSocietalMemory } from '../society/societalMemoryEvents.js?v=20260907-memory2';
import {
  militaryExperienceProfile,
  officerSchoolStatus,
  tickMilitaryProfessionalisation,
} from './professionalisation.js?v=20260908-prof1';

const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const FORMATION_ARCHETYPES = Object.freeze({
  standardised_heavy_infantry: {
    id: 'standardised_heavy_infantry', label: 'Standardised heavy infantry', minArmy: 300,
    discoveryYears: 12, maxCoverage: 0.42, combatBonus: 0.13, cohesionBonus: 0.10,
    annualMetalPerSoldier: 0.004, annualTreasuryPerSoldier: 0.0015,
    terrain: { plains: 1, hills: 1.02, mountains: 0.95, forest: 0.96, wetland: 0.88 },
  },
  elite_chariot_formation: {
    id: 'elite_chariot_formation', label: 'Elite chariot formation', minArmy: 180,
    discoveryYears: 10, maxCoverage: 0.22, combatBonus: 0.12, cohesionBonus: 0.05,
    mobilityBonus: 0.05, annualMetalPerSoldier: 0.003, annualTreasuryPerSoldier: 0.0020,
    terrain: { plains: 1.08, hills: 0.78, mountains: 0.35, forest: 0.48, wetland: 0.40 },
  },
  cavalry_corps: {
    id: 'cavalry_corps', label: 'Organised cavalry corps', minArmy: 250,
    discoveryYears: 14, maxCoverage: 0.30, combatBonus: 0.12, cohesionBonus: 0.06,
    mobilityBonus: 0.09, annualMetalPerSoldier: 0.003, annualTreasuryPerSoldier: 0.0022,
    terrain: { plains: 1.06, hills: 0.94, mountains: 0.70, forest: 0.76, wetland: 0.68 },
  },
  crossbow_companies: {
    id: 'crossbow_companies', label: 'Crossbow companies', minArmy: 180,
    discoveryYears: 10, maxCoverage: 0.32, combatBonus: 0.18, cohesionBonus: 0.05,
    annualMetalPerSoldier: 0.0025, annualTreasuryPerSoldier: 0.0022,
    terrain: { plains: 1.02, hills: 1.04, mountains: 0.98, forest: 0.94, wetland: 0.90 },
  },
  knightly_retinues: {
    id: 'knightly_retinues', label: 'Knightly heavy-cavalry retinues', minArmy: 240,
    discoveryYears: 18, maxCoverage: 0.20, combatBonus: 0.28, cohesionBonus: 0.08, mobilityBonus: 0.08,
    annualMetalPerSoldier: 0.009, annualTreasuryPerSoldier: 0.0055,
    terrain: { plains: 1.10, hills: 0.96, mountains: 0.68, forest: 0.72, wetland: 0.60 },
  },
  siege_engineer_corps: {
    id: 'siege_engineer_corps', label: 'Siege engineer corps', minArmy: 350,
    discoveryYears: 16, maxCoverage: 0.16, combatBonus: 0.04, cohesionBonus: 0.04,
    siegeBonus: 0.35, annualMetalPerSoldier: 0.006, annualTreasuryPerSoldier: 0.0028,
    terrain: { plains: 1, hills: 1, mountains: 0.95, forest: 0.92, wetland: 0.86 },
  },
  naval_infantry: {
    id: 'naval_infantry', label: 'Naval infantry and marines', minArmy: 220,
    discoveryYears: 13, maxCoverage: 0.22, combatBonus: 0.08, cohesionBonus: 0.07,
    amphibiousBonus: 0.30, annualMetalPerSoldier: 0.003, annualTreasuryPerSoldier: 0.0021,
    terrain: { plains: 1, hills: 1, mountains: 0.92, forest: 0.98, wetland: 0.98 },
  },
  professional_cohorts: {
    id: 'professional_cohorts', label: 'Professional cohort organisation', minArmy: 800,
    discoveryYears: 18, maxCoverage: 0.55, combatBonus: 0.12, cohesionBonus: 0.14,
    mobilityBonus: 0.04, siegeBonus: 0.10, annualMetalPerSoldier: 0.0045, annualTreasuryPerSoldier: 0.0030,
    terrain: { plains: 1.02, hills: 1.02, mountains: 0.98, forest: 0.99, wetland: 0.92 },
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
function hasInfra(region, id) { return operationalInfrastructure(region, id); }
function armySize(region) { return Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0)); }
function metalAdequacy(region, army) {
  const metal = Math.max(0, region.stockpile?.iron || 0) + Math.max(0, region.stockpile?.bronze || 0);
  return clamp01(metal / Math.max(8, army * 0.015));
}
function siegeInventory(region) {
  const inventory = region.siegeEquipment?.inventory || {};
  return Object.values(inventory).reduce((sum, byMetal) => sum + Object.values(byMetal || {}).reduce((a, b) => a + (Number(b) || 0), 0), 0);
}

function conditionsFor(region, archetypeId) {
  const army = armySize(region);
  const policy = ensureMilitaryPolicy(region);
  const permanence = clamp01(policy.armyPermanence || 0);
  const martialMemory = culturalMemoryEffects(region).martialTradition || 0;
  const experience = militaryExperienceProfile(region, null);
  const drill = hasInfra(region, 'drill_ground');
  const arsenal = hasInfra(region, 'royal_arsenal');
  const harbour = hasInfra(region, 'harbour');
  const navalBase = hasInfra(region, 'naval_base');
  const admin = hasInfra(region, 'administrative_centre');
  const base = {
    army, permanence, martialMemory, experience,
    metalAdequacy: metalAdequacy(region, army),
    trainingSignal: clamp01(permanence * 0.35 + martialMemory * 0.15 + experience.institutional * 0.32 + (drill ? 0.18 : 0)),
  };
  if (archetypeId === 'standardised_heavy_infantry') {
    return { ...base, eligible: hasTech(region, 'mass_heavy_infantry') && hasTech(region, 'military_drill') &&
      hasTech(region, 'standard_weights') && arsenal && drill && army >= 300 };
  }
  if (archetypeId === 'elite_chariot_formation') {
    return { ...base, eligible: hasTech(region, 'light_chariotry') && drill && arsenal &&
      (region.chariotry?.chariots || 0) >= 8 && army >= 180 };
  }
  if (archetypeId === 'cavalry_corps') {
    const warHorses = Math.max(0, region.horseEconomy?.war || 0);
    return { ...base, eligible: hasTech(region, 'mounted_cavalry') && hasTech(region, 'military_drill') && drill &&
      warHorses >= Math.max(35, army * 0.08) && army >= 250 };
  }
  if (archetypeId === 'crossbow_companies') {
    return { ...base, eligible: hasTech(region, 'crossbows') && arsenal && army >= 180 &&
      base.metalAdequacy >= 0.18 };
  }
  if (archetypeId === 'knightly_retinues') {
    const warHorses = Math.max(0, region.horseEconomy?.war || 0);
    return { ...base, eligible: hasTech(region, 'heavy_cavalry') && drill && arsenal &&
      warHorses >= Math.max(45, army * 0.12) && base.metalAdequacy >= 0.35 && army >= 240 };
  }
  if (archetypeId === 'siege_engineer_corps') {
    return { ...base, eligible: hasTech(region, 'military_drill') && arsenal && drill && army >= 350 &&
      ((region.siegeEquipment?.experience || 0) >= 0.15 || siegeInventory(region) >= 2) };
  }
  if (archetypeId === 'naval_infantry') {
    return { ...base, eligible: hasTech(region, 'naval_warfare') && harbour && navalBase && drill &&
      (region.navy?.personnel || 0) >= 100 && army >= 220 };
  }
  if (archetypeId === 'professional_cohorts') {
    return { ...base, eligible: hasTech(region, 'mass_heavy_infantry') && hasTech(region, 'military_drill') &&
      hasTech(region, 'standard_weights') && hasTech(region, 'formal_taxation') && arsenal && drill && admin &&
      officerSchoolStatus(region).active && experience.institutional >= 0.42 && permanence >= 0.55 && army >= 800 };
  }
  return { ...base, eligible: false };
}

function formationName(region, archetypeId) {
  const place = region.settlements?.places?.find((p) => p.id === region.settlements?.principalId)?.name || region.name;
  const names = {
    standardised_heavy_infantry: `${place} Heavy Cohorts`,
    elite_chariot_formation: `${place} Chariot Guard`,
    cavalry_corps: `${place} Horse Corps`,
    crossbow_companies: `${place} Crossbow Companies`,
    knightly_retinues: `${place} Knightly Retinue`,
    siege_engineer_corps: `${place} Siege Corps`,
    naval_infantry: `${place} Sea Guard`,
    professional_cohorts: `${place} Professional Cohorts`,
  };
  return names[archetypeId] || `${place} Formation`;
}

function createTradition(region, spec) {
  const state = ensureMilitaryFormations(region);
  const existing = state.traditions.find((f) => f.archetypeId === spec.id && f.status !== 'retired');
  if (existing) return existing;
  const formation = {
    id: `${region.id}:formation:${state.traditions.length + state.retired.length + 1}`,
    archetypeId: spec.id, name: formationName(region, spec.id), status: 'active', ageYears: 0,
    readiness: 0.50, coverage: 0.06, prestige: 0.15, underfundedYears: 0, originRegionId: region.id,
  };
  state.traditions.push(formation);
  recordSocietalMemory(region, {
    sourceType: 'formation', sourceId: formation.id, label: `Founding of the ${formation.name}`,
    theme: 'military_tradition', motif: spec.id, valence: 1, strength: 0.2,
    practicalRelevance: 1, symbolicLegacy: 0.07,
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
  return Math.min(1, metalNeed > 0 ? metalPaid / metalNeed : 1, moneyNeed > 0 ? moneyPaid / moneyNeed : 1);
}

export function tickMilitaryFormations(region, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const state = ensureMilitaryFormations(region);
  if (years <= 0) return state;
  tickMilitaryProfessionalisation(region, elapsedDays);

  for (const spec of Object.values(FORMATION_ARCHETYPES)) {
    const conditions = conditionsFor(region, spec.id);
    let progress = Number(state.progress[spec.id]) || 0;
    if (conditions.eligible) {
      const learning = 0.35 + conditions.trainingSignal * 0.38 + conditions.metalAdequacy * 0.12 +
        conditions.experience.field * 0.10 + conditions.experience.institutional * 0.18;
      progress += years / spec.discoveryYears * learning;
    } else {
      progress = Math.max(0, progress - years / 40);
    }
    state.progress[spec.id] = clamp01(progress);
    if (progress >= 1) createTradition(region, spec);
  }

  for (const formation of state.traditions) {
    if (formation.status !== 'active') continue;
    const spec = FORMATION_ARCHETYPES[formation.archetypeId];
    if (!spec) continue;
    formation.ageYears += years;
    const conditions = conditionsFor(region, spec.id);
    const upkeep = payFormationUpkeep(region, formation, spec, years, conditions.army);
    const desiredCoverage = conditions.eligible
      ? spec.maxCoverage * (0.45 + conditions.trainingSignal * 0.40 + conditions.experience.institutional * 0.15) * (0.62 + upkeep * 0.38)
      : 0.03;
    formation.coverage = clamp01(formation.coverage + (desiredCoverage - formation.coverage) * (1 - Math.exp(-years / 6)));
    const readinessTarget = clamp01(0.24 + conditions.trainingSignal * 0.34 + conditions.experience.field * 0.14 +
      conditions.experience.institutional * 0.12 + upkeep * 0.24);
    formation.readiness = clamp01(formation.readiness + (readinessTarget - formation.readiness) * (1 - Math.exp(-years / 4)));
    formation.prestige = clamp01(formation.prestige + (formation.readiness * formation.coverage - formation.prestige) * (1 - Math.exp(-years / 18)));
    formation.underfundedYears = upkeep < 0.55 ? formation.underfundedYears + years : Math.max(0, formation.underfundedYears - years * 0.5);
    if ((!conditions.eligible && formation.coverage < 0.04) || formation.underfundedYears > 18) {
      formation.status = 'retired';
      state.retired.push({ ...formation });
    }
  }
  state.traditions = state.traditions.filter((f) => f.status === 'active');
  return state;
}

export function activeFormation(region, archetypeId = null) {
  const active = ensureMilitaryFormations(region).traditions.filter((f) => f.status === 'active');
  return archetypeId ? active.find((f) => f.archetypeId === archetypeId) || null : active[0] || null;
}

function summedFormationEffect(region, key, terrain = null) {
  let effect = 0;
  for (const formation of ensureMilitaryFormations(region).traditions) {
    if (formation.status !== 'active') continue;
    const spec = FORMATION_ARCHETYPES[formation.archetypeId];
    if (!spec) continue;
    const terrainFit = terrain ? (spec.terrain?.[terrain] ?? 1) : 1;
    effect += (spec[key] || 0) * clamp01(formation.coverage) * clamp01(formation.readiness) * terrainFit;
  }
  return effect;
}

export function formationCombatMultiplier(region, terrain = null) {
  return 1 + Math.min(0.34, summedFormationEffect(region, 'combatBonus', terrain));
}
export function formationCohesionBonus(region) { return Math.min(0.22, summedFormationEffect(region, 'cohesionBonus')); }
export function formationMobilityBonus(region) { return Math.min(0.15, summedFormationEffect(region, 'mobilityBonus')); }
export function formationSiegeBonus(region) { return Math.min(0.40, summedFormationEffect(region, 'siegeBonus')); }
export function formationAmphibiousBonus(region) { return Math.min(0.35, summedFormationEffect(region, 'amphibiousBonus')); }

export function formationSummary(region) {
  const state = ensureMilitaryFormations(region);
  return {
    active: state.traditions.map((f) => ({ ...f })), progress: { ...state.progress },
    retired: state.retired.slice(-8).map((f) => ({ ...f })),
  };
}
