// Population is dynamic: births, deaths, aging and famine response. Rates use
// elapsed historical days, so changing the world cadence does not change the
// underlying annual demography.

import { FOOD_PER_PERSON_PER_WEEK } from '../economy/labor.js?v=20260904-weather1';
import { chooseEmigrationDestinations } from './migration.js?v=20260904-weather1';
import { migrateReligion } from './religion.js?v=20260905-religion1';
import { DAYS_PER_YEAR, annualFractionRate, elapsedWeeks } from '../core/simTime.js?v=20260905-time1';

const CHILD_BAND_YEARS = 14;
const WORKING_BAND_YEARS = 45;
const BASE_ANNUAL_BIRTH_RATE = 0.030;
const EDUCATION_BIRTH_PENALTY = 0.5;
const BASE_ANNUAL_DEATH_RATE = { children: 0.025, workingAge: 0.01, elderly: 0.07 };
const ARMY_BASE_ANNUAL_DEATH_RATE = 0.015;
const STARVATION_STABILITY_PENALTY_PER_WEEK = 0.15;
const WELL_FED_STABILITY_RECOVERY_PER_WEEK = 0.01;
const FAMINE_DEATH_SHARE = 0.30;
const FAMINE_EMIGRATE_SHARE = 0.45;
const FAMINE_BANDIT_SHARE = 0.25;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function tickDemographics(regions, religiousWorld = null, elapsedDays = 7) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) applyBaselineDemographics(region, elapsedDays);
  for (const region of regions) applyFamineResponse(region, regionsById, religiousWorld, elapsedDays);
}

function applyBaselineDemographics(region, elapsedDays) {
  const d = region.demographics;
  const totalPop = d.children + d.workingAge + d.elderly;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const foodSecurityFactor = clamp01(region.stability);
  const annualBirth = BASE_ANNUAL_BIRTH_RATE * (1 - region.educationLevel * EDUCATION_BIRTH_PENALTY);
  const births = totalPop * annualBirth * years * (0.4 + 0.6 * foodSecurityFactor);
  const childDeaths = d.children * annualFractionRate(BASE_ANNUAL_DEATH_RATE.children, elapsedDays);
  const workingDeaths = d.workingAge * annualFractionRate(BASE_ANNUAL_DEATH_RATE.workingAge, elapsedDays);
  const elderlyDeaths = d.elderly * annualFractionRate(BASE_ANNUAL_DEATH_RATE.elderly, elapsedDays);
  const childToWorking = d.children * Math.min(1, years / CHILD_BAND_YEARS);
  const workingToElderly = d.workingAge * Math.min(1, years / WORKING_BAND_YEARS);

  d.children = Math.max(0, d.children + births - childDeaths - childToWorking);
  d.workingAge = Math.max(0, d.workingAge + childToWorking - workingDeaths - workingToElderly);
  d.elderly = Math.max(0, d.elderly + workingToElderly - elderlyDeaths);

  const militaryDeathFraction = annualFractionRate(ARMY_BASE_ANNUAL_DEATH_RATE, elapsedDays);
  region.army.personnel = Math.max(0, region.army.personnel * (1 - militaryDeathFraction));
  region.navy.personnel = Math.max(0, region.navy.personnel * (1 - militaryDeathFraction));
  region.population = Math.round(d.children + d.workingAge + d.elderly);
}

function applyFamineResponse(region, regionsById, religiousWorld, elapsedDays) {
  const foodNeeded = region._foodNeeded || 0;
  const shortfall = Math.max(0, -(region.stockpile.food || 0));
  const deficitRatio = foodNeeded > 0 ? Math.min(1, shortfall / foodNeeded) : 0;
  const weeks = elapsedWeeks(elapsedDays);
  region.stability = clamp01(region.stability - deficitRatio * STARVATION_STABILITY_PENALTY_PER_WEEK * weeks +
    (deficitRatio === 0 ? WELL_FED_STABILITY_RECOVERY_PER_WEEK * weeks : 0));
  region.stockpile.food = Math.max(0, region.stockpile.food || 0);
  if (shortfall <= 0.5) return;

  const humansPresent = Math.max(0, region.population + region.army.personnel + region.navy.personnel);
  const foodPerPersonThisTick = FOOD_PER_PERSON_PER_WEEK * Math.max(0.001, weeks);
  const distressed = Math.min(humansPresent, shortfall / foodPerPersonThisTick);
  const deaths = distressed * FAMINE_DEATH_SHARE;
  const emigrants = distressed * FAMINE_EMIGRATE_SHARE;
  const banditsNew = distressed * FAMINE_BANDIT_SHARE;
  const destinations = emigrants > 0 ? chooseEmigrationDestinations(region, regionsById, emigrants) : [];
  const emigrantsWhoFoundADestination = destinations.reduce((sum, route) => sum + route.count, 0);

  removeFromBands(region, deaths + emigrantsWhoFoundADestination + banditsNew);
  region.banditPopulation += banditsNew;
  for (const { dest, count } of destinations) {
    migrateReligion(region, dest, count, religiousWorld);
    addToBands(dest, count);
    if (region.unlockedTechIds.has('iron_smelting')) {
      const sourceReadiness = Math.max(0.05, region.ironWorkingReadiness || 0);
      dest.ironWorkingExposure = Math.min(10,
        (dest.ironWorkingExposure || 0) + (count / Math.max(1, dest.population)) * sourceReadiness);
    }
  }
  syncPopulation(region);
}

export function removeFromBands(region, count) {
  const d = region.demographics;
  const weights = {
    children: d.children * 1.3, workingAge: d.workingAge * 0.7, elderly: d.elderly * 1.3,
    army: region.army.personnel * 0.7, navy: region.navy.personnel * 0.7,
  };
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  if (weightTotal <= 0 || count <= 0) return;
  d.children = Math.max(0, d.children - count * (weights.children / weightTotal));
  d.workingAge = Math.max(0, d.workingAge - count * (weights.workingAge / weightTotal));
  d.elderly = Math.max(0, d.elderly - count * (weights.elderly / weightTotal));
  region.army.personnel = Math.max(0, region.army.personnel - count * (weights.army / weightTotal));
  region.navy.personnel = Math.max(0, region.navy.personnel - count * (weights.navy / weightTotal));
}

function addToBands(region, count) {
  region.demographics.workingAge += count * 0.70;
  region.demographics.children += count * 0.25;
  region.demographics.elderly += count * 0.05;
  syncPopulation(region);
}

export function addWorkingAgePopulation(region, count) {
  if (count <= 0) return;
  region.demographics.workingAge += count;
  syncPopulation(region);
}

export function syncPopulation(region) {
  const d = region.demographics;
  region.population = Math.round(d.children + d.workingAge + d.elderly);
}
