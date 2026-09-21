import { FOOD_CANNING_TECH_ID, MECHANICAL_REFRIGERATION_TECH_ID, CFC_REFRIGERATION_TECH_ID, recordRefrigerationUse } from '../technology/foodPreservationEnvironmentalHealth.js?v=20260919-preservation1';
import { tickFoodDiversity } from './foodDiversity.js?v=20260921-pests1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const has = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

function wealthSignal(region) {
  const perCapita = Math.max(0, Number(region?.wallet) || 0) / Math.max(1, Number(region?.population) || 1);
  return clamp(Math.log1p(perCapita * 80) / Math.log(9));
}

function electricitySignal(region) {
  return clamp(region?.electricity?.householdService ?? region?.electricity?.serviceCoverage ?? region?.electricity?.industrialService ?? 0);
}

function manufacturingSignal(region) {
  return clamp(region?.structuralTransformation?.capability?.manufacture ?? region?.industrialSupply?.capability?.precision_machining ?? 0);
}

function motorFreightSignal(region) {
  const engine = clamp(region?.industrialPlants?.componentCapability?.engine ?? region?.industrialSupply?.capability?.precision_machining ?? 0);
  const petroleum = has(region, 'petroleum_refining') ? 1 : clamp((region?.stockpile?.diesel || 0) / Math.max(1, (region?.population || 1) * 0.002));
  return clamp(engine * 0.62 + petroleum * 0.28 + manufacturingSignal(region) * 0.10);
}

function approach(current, target, annualRate, elapsedDays) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const fraction = 1 - Math.exp(-Math.max(0, annualRate) * years);
  return current + (target - current) * fraction;
}

export function ensureHouseholdFoodSecurity(region) {
  region.householdFoodSecurity ||= {};
  const s = region.householdFoodSecurity;
  s.refrigeratorUptake = clamp(s.refrigeratorUptake || 0);
  s.cannedPantryUptake = clamp(s.cannedPantryUptake || 0);
  s.refrigeratedRoadShare = clamp(s.refrigeratedRoadShare || 0);
  s.privateReserve = Math.max(0, Number(s.privateReserve) || 0);
  s.targetReserveWeeks = Math.max(0, Number(s.targetReserveWeeks) || 0.45);
  s.reserveWeeks = Math.max(0, Number(s.reserveWeeks) || 0);
  s.spoilageLastTick = Math.max(0, Number(s.spoilageLastTick) || 0);
  s.releasedLastTick = Math.max(0, Number(s.releasedLastTick) || 0);
  s.storedLastTick = Math.max(0, Number(s.storedLastTick) || 0);
  s.dietDiversity = clamp(s.dietDiversity || 0);
  s.dietHealthSupport = Number.isFinite(s.dietHealthSupport) ? s.dietHealthSupport : 0.94;
  s.pestFoodLossLastTick = Math.max(0, Number(s.pestFoodLossLastTick) || 0);
  return s;
}

export function householdFoodSecurityProfile(region) {
  const s = ensureHouseholdFoodSecurity(region);
  return { ...s };
}

export function refrigeratedLandFoodTransportMultiplier(region) {
  const s = ensureHouseholdFoodSecurity(region);
  return 1 + s.refrigeratedRoadShare * 0.75;
}

export function tickHouseholdFoodSecurity(region, elapsedDays = 7) {
  const s = ensureHouseholdFoodSecurity(region);
  const weeks = Math.max(0.01, (Number(elapsedDays) || 0) / 7);
  const wealth = wealthSignal(region);
  const power = electricitySignal(region);
  const manufacture = manufacturingSignal(region);
  const canningKnown = has(region, FOOD_CANNING_TECH_ID);
  const refrigerationKnown = has(region, MECHANICAL_REFRIGERATION_TECH_ID);

  const cannedTarget = canningKnown ? clamp(0.10 + wealth * 0.60 + manufacture * 0.30) : 0;
  s.cannedPantryUptake = clamp(approach(s.cannedPantryUptake, cannedTarget, 0.22, elapsedDays));

  const refrigeratorTarget = refrigerationKnown
    ? clamp(power * (0.08 + wealth * 0.66 + manufacture * 0.26))
    : 0;
  const refrigeratorRate = has(region, CFC_REFRIGERATION_TECH_ID) ? 0.18 : 0.11;
  s.refrigeratorUptake = clamp(approach(s.refrigeratorUptake, refrigeratorTarget, refrigeratorRate, elapsedDays));

  const coldRoadTarget = refrigerationKnown
    ? clamp(motorFreightSignal(region) * (0.18 + manufacture * 0.42 + wealth * 0.20) * (0.35 + power * 0.65))
    : 0;
  s.refrigeratedRoadShare = clamp(approach(s.refrigeratedRoadShare, coldRoadTarget, 0.10, elapsedDays));

  s.targetReserveWeeks = clamp(
    0.45 + wealth * 0.65 + s.cannedPantryUptake * 3.8 + s.refrigeratorUptake * 1.55,
    0.25,
    7.5,
  );

  // Crop composition and pest ecology update before household reserves react.
  // The old baseline already includes ordinary pest losses, so only the
  // *abnormal* outbreak multiplier is deducted from this tick's farm output.
  const diet=tickFoodDiversity(region,elapsedDays);
  s.dietDiversity=diet.diversityIndex;
  s.dietHealthSupport=diet.healthSupport;
  region.dietaryHealthMultiplier=s.dietHealthSupport;
  const pestLossFraction=clamp(1-(region.agriculturalPests?.yieldMultiplier??1),0,.48);
  const farmFood=Math.max(0,Number(region.report?.farming?.food)||0);
  s.pestFoodLossLastTick=farmFood*pestLossFraction;
  if(s.pestFoodLossLastTick>0){
    region.stockpile ||= {};
    region.stockpile.food=(Number(region.stockpile.food)||0)-s.pestFoodLossLastTick;
  }

  const weeklyNeed = Math.max(1, (Number(region?._foodNeeded) || Number(region?.population) || 1) / weeks);
  const baseWeeklySpoilage = 0.032;
  const shelfStableProtection = s.cannedPantryUptake * 0.78;
  const chilledProtection = s.refrigeratorUptake * 0.18;
  const weeklySpoilage = clamp(baseWeeklySpoilage * (1 - shelfStableProtection - chilledProtection), 0.0015, baseWeeklySpoilage);
  const spoilageFraction = 1 - Math.pow(1 - weeklySpoilage, weeks);
  s.spoilageLastTick = s.privateReserve * spoilageFraction;
  s.privateReserve = Math.max(0, s.privateReserve - s.spoilageLastTick);

  s.releasedLastTick = 0;
  if ((region.stockpile?.food || 0) < 0 && s.privateReserve > 0) {
    const shortfall = -(region.stockpile.food || 0);
    s.releasedLastTick = Math.min(shortfall, s.privateReserve);
    s.privateReserve -= s.releasedLastTick;
    region.stockpile.food += s.releasedLastTick;
  }

  const targetReserve = weeklyNeed * s.targetReserveWeeks;
  const gap = Math.max(0, targetReserve - s.privateReserve);
  const regionalSurplus = Math.max(0, (region.stockpile?.food || 0) - weeklyNeed * 0.5);
  const transferRate = 1 - Math.exp(-0.18 * weeks);
  s.storedLastTick = Math.min(gap * transferRate, regionalSurplus);
  if (s.storedLastTick > 0) {
    region.stockpile.food -= s.storedLastTick;
    s.privateReserve += s.storedLastTick;
  }

  const households = Math.max(1, (Number(region.population) || 1) / 2.5);
  const refrigerationLoad = households * s.refrigeratorUptake * 0.00008 +
    Math.max(1, Number(region.population) || 1) * s.refrigeratedRoadShare * 0.000015;
  if (refrigerationLoad > 0) recordRefrigerationUse(region, refrigerationLoad, weeks);

  s.reserveWeeks = s.privateReserve / weeklyNeed;
  region.marketDemand ||= {};
  region.marketDemand.food = Math.max(0, Number(region.marketDemand.food) || 0) + gap / 52;
  region.report ||= {};
  region.report.householdFoodSecurity = {
    refrigeratorUptake: s.refrigeratorUptake,
    cannedPantryUptake: s.cannedPantryUptake,
    refrigeratedRoadShare: s.refrigeratedRoadShare,
    targetReserveWeeks: s.targetReserveWeeks,
    reserveWeeks: s.reserveWeeks,
    privateReserve: s.privateReserve,
    spoilage: s.spoilageLastTick,
    released: s.releasedLastTick,
    stored: s.storedLastTick,
    pestFoodLoss:s.pestFoodLossLastTick,
    dietDiversity:s.dietDiversity,
    dietHealthSupport:s.dietHealthSupport,
    refrigeratedLandFoodTransportMultiplier: refrigeratedLandFoodTransportMultiplier(region),
  };
  return region.report.householdFoodSecurity;
}

export function tickHouseholdFoodSecurityAll(regions, elapsedDays = 7) {
  return (regions || []).map((region) => tickHouseholdFoodSecurity(region, elapsedDays));
}
