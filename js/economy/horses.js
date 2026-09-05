import { accumulateExperience, skillMultiplier } from '../technology/learningByDoing.js?v=20260904-weather1';
import { ensureMilitaryPolicy } from '../military/policies.js?v=20260904-policy1';
import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';

const HORSES_PER_SQ_KM_AT_CAPACITY = 0.12;
const STARTING_CAPACITY_FRACTION = 0.28;
const ANNUAL_BASE_MORTALITY = 0.04;
const ANNUAL_BIRTH_RATE = 0.12;
const CRISIS_WEEKLY_MORTALITY = 0.004;
const HORSES_PER_BREEDER = 50;
const TRAINING_PER_WORKER_PER_WEEK = 0.02;
const MAX_HORSE_WORKFORCE_FRACTION = 0.005;
const FARMERS_PER_DRAUGHT_HORSE = 20;
const TRADERS_PER_TRANSPORT_HORSE = 2;
const WAR_HORSES_PER_SOLDIER = 0.05;
const WEEKLY_ROLE_RELEASE_RATE = 0.08;
export const HORSE_FODDER_PER_WEEK = 0.25;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function weeklyRate(annualRate) {
  return 1 - Math.pow(1 - annualRate, 1 / 52);
}

export function horseCapacity(region) {
  return Math.max(2, region.areaSqKm * region.landQuality * HORSES_PER_SQ_KM_AT_CAPACITY);
}

export function ensureHorseEconomy(region) {
  if (!region.horseEconomy) region.horseEconomy = {};
  const defaults = { draft: 0, transport: 0, war: 0, breeders: 0, trainers: 0,
    births: 0, deaths: 0, capacity: horseCapacity(region), pastureFraction: 0 };
  for (const [key, value] of Object.entries(defaults)) {
    if (!Number.isFinite(region.horseEconomy[key])) region.horseEconomy[key] = value;
  }
  if (region.horseEconomy.capacity <= 0) region.horseEconomy.capacity = horseCapacity(region);
  if (!Number.isFinite(region.stockpile.horses)) region.stockpile.horses = 0;
  return region.horseEconomy;
}

export function seedHorseHerd(region, rng = Math.random) {
  const horses = ensureHorseEconomy(region);
  const localVariation = 0.45 + rng() * 1.1;
  const startingHerd = horses.capacity * STARTING_CAPACITY_FRACTION * localVariation;
  region.stockpile.horses = startingHerd * 0.7;
  horses.draft = startingHerd * 0.18;
  horses.transport = startingHerd * 0.09;
  horses.war = startingHerd * 0.03;
}

export function totalHorses(region) {
  const horses = ensureHorseEconomy(region);
  return Math.max(0, region.stockpile.horses || 0) + horses.draft + horses.transport + horses.war;
}

function applyLosses(region, fraction) {
  const horses = ensureHorseEconomy(region);
  const before = totalHorses(region);
  region.stockpile.horses *= (1 - fraction);
  horses.draft *= (1 - fraction);
  horses.transport *= (1 - fraction);
  horses.war *= (1 - fraction);
  return before * fraction;
}

function trainForRole(region, role, wanted, availableTraining) {
  const horses = ensureHorseEconomy(region);
  const gap = Math.max(0, wanted - horses[role]);
  const trained = Math.min(gap, region.stockpile.horses, availableTraining);
  horses[role] += trained;
  region.stockpile.horses -= trained;
  return trained;
}

function releaseSurplusRole(region, role, wanted) {
  const horses = ensureHorseEconomy(region);
  const surplus = Math.max(0, horses[role] - wanted);
  const released = surplus * WEEKLY_ROLE_RELEASE_RATE;
  horses[role] -= released;
  region.stockpile.horses += released;
  return released;
}

export function tickHorseEconomy(region, workingAge, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedWeeks(elapsedDays));
  const horses = ensureHorseEconomy(region);
  horses.capacity = horseCapacity(region);
  const herdBefore = totalHorses(region);
  const baselineMortality = 1 - Math.pow(1 - weeklyRate(ANNUAL_BASE_MORTALITY), weekScale);
  const crisisWeekly = (1 - clamp01(region.stability ?? 1)) * CRISIS_WEEKLY_MORTALITY;
  const crisisMortality = 1 - Math.pow(1 - crisisWeekly, weekScale);
  const mortality = 1 - (1 - baselineMortality) * (1 - crisisMortality);
  horses.deaths = applyLosses(region, Math.min(0.2, mortality));

  const herd = totalHorses(region);
  const husbandrySkill = skillMultiplier(region, 'horseHusbandry');
  horses.births = herd * (1 - Math.pow(1 - weeklyRate(ANNUAL_BIRTH_RATE), weekScale)) *
    Math.max(0, 1 - herd / horses.capacity) * husbandrySkill;
  region.stockpile.horses += horses.births;

  const workforceCap = Math.max(0, workingAge * MAX_HORSE_WORKFORCE_FRACTION);
  horses.breeders = Math.min(workforceCap, totalHorses(region) / HORSES_PER_BREEDER);
  const laborAfterBreeding = Math.max(0, workforceCap - horses.breeders);
  const horsePriority = ensureMilitaryPolicy(region).warHorseAllocation;
  const civilScale = 1.2 - horsePriority * 0.65;
  const transportScale = 1.1 - horsePriority * 0.45;
  const warScale = 0.25 + horsePriority * 1.25;
  const draftWanted = (region.occupations?.farmer || 0) / FARMERS_PER_DRAUGHT_HORSE * civilScale;
  const transportWanted = (region.occupations?.trader || 0) / TRADERS_PER_TRANSPORT_HORSE * transportScale;
  const warWanted = Math.max(0, region.army?.personnel || 0) * WAR_HORSES_PER_SOLDIER * warScale;
  const oldReleaseRate = WEEKLY_ROLE_RELEASE_RATE;
  const effectiveReleaseRate = 1 - Math.pow(1 - oldReleaseRate, weekScale);
  const releaseRole = (role, wanted) => {
    const surplus = Math.max(0, horses[role] - wanted);
    const released = surplus * effectiveReleaseRate; horses[role] -= released; region.stockpile.horses += released; return released;
  };
  const released = releaseRole('draft', draftWanted) +
    releaseRole('transport', transportWanted) +
    releaseRole('war', warWanted);
  const totalTrainingWanted = Math.max(0, draftWanted - horses.draft) +
    Math.max(0, transportWanted - horses.transport) + Math.max(0, warWanted - horses.war);
  horses.trainers = Math.min(laborAfterBreeding,
    totalTrainingWanted / (TRAINING_PER_WORKER_PER_WEEK * weekScale * husbandrySkill));
  let training = horses.trainers * TRAINING_PER_WORKER_PER_WEEK * weekScale * husbandrySkill;
  const priorities = horsePriority >= 0.5
    ? [['war', warWanted], ['draft', draftWanted], ['transport', transportWanted]]
    : [['draft', draftWanted], ['transport', transportWanted], ['war', warWanted]];
  for (const [role, wanted] of priorities) training -= trainForRole(region, role, wanted, training);

  accumulateExperience(region, 'horseHusbandry', horses.breeders + horses.trainers);
  horses.pastureFraction = Math.min(0.06, 0.06 * totalHorses(region) / horses.capacity);
  return {
    workers: horses.breeders + horses.trainers,
    breeders: horses.breeders,
    trainers: horses.trainers,
    births: horses.births,
    deaths: horses.deaths,
    herd: totalHorses(region),
    untrained: region.stockpile.horses,
    draft: horses.draft,
    transport: horses.transport,
    war: horses.war,
    capacity: horses.capacity,
    pastureFraction: horses.pastureFraction,
    fodderNeeded: totalHorses(region) * HORSE_FODDER_PER_WEEK * weekScale,
    unmetDemand: Math.max(0, draftWanted + transportWanted + warWanted -
      horses.draft - horses.transport - horses.war - region.stockpile.horses),
    released,
    warHorseAllocation: horsePriority,
    herdBefore,
  };
}

export function draughtFarmMultiplier(region, farmerCount) {
  const coverage = clamp01((region.horseEconomy?.draft || 0) /
    Math.max(1, farmerCount / FARMERS_PER_DRAUGHT_HORSE));
  return 1 + coverage * 0.15;
}

export function horseTransportMultiplier(region) {
  const traders = Math.max(1, region.occupations?.trader || 0);
  const coverage = clamp01((region.horseEconomy?.transport || 0) /
    Math.max(1, traders / TRADERS_PER_TRANSPORT_HORSE));
  return 1 + coverage * 0.75;
}

export function horseMilitaryMultiplier(region) {
  const soldiers = Math.max(1, (region.army?.personnel || 0) + (region.army?.away || 0));
  const coverage = clamp01((region.horseEconomy?.war || 0) /
    Math.max(1, soldiers * WAR_HORSES_PER_SOLDIER));
  return 1 + coverage * 0.20;
}

export function horseLandSpeedMultiplier(region) {
  return 1 + clamp01((region.horseEconomy?.war || 0) /
    Math.max(1, (region.army?.personnel || 0) * WAR_HORSES_PER_SOLDIER)) * 0.5;
}
