// Population is dynamic now: births, deaths (baseline + famine), aging
// between age bands, and the three real famine responses all live here.
// Runs after trade, so a region that successfully imported food gets to
// actually benefit from that before anyone starves, emigrates, or turns
// to banditry over a shortfall that no longer exists.

import { FOOD_PER_PERSON_PER_WEEK } from '../economy/labor.js';
import { chooseEmigrationDestinations } from './migration.js';

const CHILD_BAND_YEARS = 14;
const WORKING_BAND_YEARS = 45; // 15-59; elderly is open-ended above that

const CHILD_TO_WORKING_RATE = 1 / (CHILD_BAND_YEARS * 52);
const WORKING_TO_ELDERLY_RATE = 1 / (WORKING_BAND_YEARS * 52);

// High pre-modern rates on both sides — this isn't a slow, gentle
// demographic system, it's meant to be genuinely volatile.
const BASE_ANNUAL_BIRTH_RATE = 0.045; // per capita of total population
const EDUCATION_BIRTH_PENALTY = 0.5;  // at educationLevel=1, birth rate halves — the "double-edged sword"

const BASE_ANNUAL_DEATH_RATE = { children: 0.025, workingAge: 0.01, elderly: 0.07 };
const ARMY_BASE_ANNUAL_DEATH_RATE = 0.015; // slightly above civilian working-age: camp disease, accidents, skirmishes

const STARVATION_STABILITY_PENALTY = 0.15;
const WELL_FED_STABILITY_RECOVERY = 0.01;

// Of the population whose food need genuinely isn't met even after trade,
// how do they split? Placeholder shares, not derived from anything — three
// real outcomes instead of a stability number sitting at zero forever with
// no further consequence.
const FAMINE_DEATH_SHARE = 0.30;
const FAMINE_EMIGRATE_SHARE = 0.45;
const FAMINE_BANDIT_SHARE = 0.25;

function weeklyRate(annualRate) {
  return annualRate / 52;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function tickDemographics(regions) {
  for (const region of regions) {
    applyBaselineDemographics(region);
  }
  // Famine response needs every region's current state to pick emigration
  // destinations, so it runs as its own pass once baseline demographics are
  // settled for everyone this tick.
  for (const region of regions) {
    applyFamineResponse(region, regions);
  }
}

function applyBaselineDemographics(region) {
  const d = region.demographics;
  const totalPop = d.children + d.workingAge + d.elderly;

  // Births — food-security modulated (people have fewer children when
  // times are hard, not just more deaths when they do), and suppressed by
  // education once that actually exists and grows above its baseline.
  const foodSecurityFactor = clamp01(region.stability);
  const birthRate = weeklyRate(BASE_ANNUAL_BIRTH_RATE * (1 - region.educationLevel * EDUCATION_BIRTH_PENALTY));
  const births = totalPop * birthRate * (0.4 + 0.6 * foodSecurityFactor); // even crisis doesn't hit exactly zero

  // Baseline deaths per band — old age, disease, ordinary accidents.
  // Famine-excess deaths are handled separately in applyFamineResponse.
  const childDeaths = d.children * weeklyRate(BASE_ANNUAL_DEATH_RATE.children);
  const workingDeaths = d.workingAge * weeklyRate(BASE_ANNUAL_DEATH_RATE.workingAge);
  const elderlyDeaths = d.elderly * weeklyRate(BASE_ANNUAL_DEATH_RATE.elderly);

  // Aging: a steady trickle from each band into the next.
  const childToWorking = d.children * CHILD_TO_WORKING_RATE;
  const workingToElderly = d.workingAge * WORKING_TO_ELDERLY_RATE;

  d.children = Math.max(0, d.children + births - childDeaths - childToWorking);
  d.workingAge = Math.max(0, d.workingAge + childToWorking - workingDeaths - workingToElderly);
  d.elderly = Math.max(0, d.elderly + workingToElderly - elderlyDeaths);

  // Soldiers/sailors aren't immortal just because they're tracked outside
  // the civilian bands — same baseline mortality logic, slightly elevated.
  region.army.personnel = Math.max(0, region.army.personnel - region.army.personnel * weeklyRate(ARMY_BASE_ANNUAL_DEATH_RATE));
  region.navy.personnel = Math.max(0, region.navy.personnel - region.navy.personnel * weeklyRate(ARMY_BASE_ANNUAL_DEATH_RATE));

  region.population = Math.round(d.children + d.workingAge + d.elderly);
}

function applyFamineResponse(region, allRegions) {
  const foodNeeded = region._foodNeeded || 0;
  const shortfall = Math.max(0, -(region.stockpile.food || 0));
  const deficitRatio = foodNeeded > 0 ? shortfall / foodNeeded : 0;

  region.stability = clamp01(
    region.stability - deficitRatio * STARVATION_STABILITY_PENALTY +
    (deficitRatio === 0 ? WELL_FED_STABILITY_RECOVERY : 0)
  );
  region.stockpile.food = Math.max(0, region.stockpile.food || 0);

  if (shortfall <= 0.5) return; // negligible, not worth splitting anyone up over

  const distressed = shortfall / FOOD_PER_PERSON_PER_WEEK; // people whose need genuinely wasn't met

  const deaths = distressed * FAMINE_DEATH_SHARE;
  const emigrants = distressed * FAMINE_EMIGRATE_SHARE;
  const banditsNew = distressed * FAMINE_BANDIT_SHARE;

  removeFromBands(region, deaths + emigrants + banditsNew);
  region.banditPopulation += banditsNew;

  if (emigrants > 0) {
    for (const { dest, count } of chooseEmigrationDestinations(region, allRegions, emigrants)) {
      addToBands(dest, count);
    }
  }

  syncPopulation(region);
}

// Famine doesn't check ID cards, and a state that can't feed its people
// can't sustain a standing army either — soldiers/sailors are pulled into
// the same proportional loss as everyone else (desertion and starvation in
// the ranks, not just civilian death/flight/banditry). Children and the
// elderly are weighted more vulnerable, the standard excess-mortality
// pattern in real famines.
export function removeFromBands(region, count) {
  const d = region.demographics;
  const weights = {
    children: d.children * 1.3,
    workingAge: d.workingAge * 0.7,
    elderly: d.elderly * 1.3,
    army: region.army.personnel * 0.7,
    navy: region.navy.personnel * 0.7,
  };
  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  if (weightTotal <= 0 || count <= 0) return;
  d.children = Math.max(0, d.children - count * (weights.children / weightTotal));
  d.workingAge = Math.max(0, d.workingAge - count * (weights.workingAge / weightTotal));
  d.elderly = Math.max(0, d.elderly - count * (weights.elderly / weightTotal));
  region.army.personnel = Math.max(0, region.army.personnel - count * (weights.army / weightTotal));
  region.navy.personnel = Math.max(0, region.navy.personnel - count * (weights.navy / weightTotal));
}

// Arrivals skew working-age — families with young children and the elderly
// are less able to make a desperate journey.
function addToBands(region, count) {
  region.demographics.workingAge += count * 0.70;
  region.demographics.children += count * 0.25;
  region.demographics.elderly += count * 0.05;
  syncPopulation(region);
}

export function syncPopulation(region) {
  const d = region.demographics;
  region.population = Math.round(d.children + d.workingAge + d.elderly);
}
