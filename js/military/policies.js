import { operationalInfrastructure } from '../economy/construction.js?v=20260907-classical1';
import { militaryExperienceProfile } from './professionalisation.js?v=20260908-prof1';

export const DEFENSIVE_POSTURES = Object.freeze(['settlements', 'trade_routes', 'borders']);
export const RAIDER_TREATMENTS = Object.freeze(['reintegrate', 'recruit', 'punish']);
export const NAVAL_PRIORITIES = Object.freeze(['fisheries', 'trade', 'war']);

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

export function ensureMilitaryPolicy(region) {
  if (!region.militaryPolicy) region.militaryPolicy = {};
  const policy = region.militaryPolicy;
  if (!Number.isFinite(policy.armyPermanence)) policy.armyPermanence = 0.5;
  if (!DEFENSIVE_POSTURES.includes(policy.defensivePosture)) policy.defensivePosture = 'settlements';
  if (!RAIDER_TREATMENTS.includes(policy.raiderTreatment)) policy.raiderTreatment = 'reintegrate';
  if (!NAVAL_PRIORITIES.includes(policy.navalPriority)) policy.navalPriority = 'trade';
  if (!Number.isFinite(policy.warHorseAllocation)) policy.warHorseAllocation = 0.5;
  policy.armyPermanence = clamp01(policy.armyPermanence);
  policy.warHorseAllocation = clamp01(policy.warHorseAllocation);
  return policy;
}

export function setMilitaryPolicy(region, key, value) {
  const policy = ensureMilitaryPolicy(region);
  if (key === 'armyPermanence' || key === 'warHorseAllocation') policy[key] = clamp01(value);
  else if (key === 'defensivePosture' && DEFENSIVE_POSTURES.includes(value)) policy[key] = value;
  else if (key === 'raiderTreatment' && RAIDER_TREATMENTS.includes(value)) policy[key] = value;
  else if (key === 'navalPriority' && NAVAL_PRIORITIES.includes(value)) policy[key] = value;
  else return false;
  return true;
}

export function mobilisedArmyTarget(region) {
  const policy = ensureMilitaryPolicy(region);
  const threat = clamp01(1 - (region.safetyRating ?? 1));
  const mobilisationShare = 0.2 + policy.armyPermanence * 0.8 + threat * (1 - policy.armyPermanence) * 0.8;
  return Math.max(0, region.targetArmySize || 0) * Math.min(1, mobilisationShare);
}

function emergentFormationCohesion(region) {
  const formations = region.militaryFormations?.traditions || [];
  const specBonus = {
    standardised_heavy_infantry: 0.10,
    elite_chariot_formation: 0.05,
    cavalry_corps: 0.06,
    siege_engineer_corps: 0.04,
    naval_infantry: 0.07,
    professional_cohorts: 0.14,
  };
  let bonus = 0;
  for (const formation of formations) {
    if (formation.status !== 'active') continue;
    bonus += (specBonus[formation.archetypeId] || 0) * clamp01(formation.coverage) * clamp01(formation.readiness);
  }
  return Math.min(0.22, bonus);
}

export function armyCohesionMultiplier(region) {
  let multiplier = 0.82 + ensureMilitaryPolicy(region).armyPermanence * 0.28;
  if (region.unlockedTechIds?.has('mass_heavy_infantry')) multiplier += 0.08;
  if (region.unlockedTechIds?.has('military_drill')) multiplier += 0.08;
  if (operationalInfrastructure(region, 'drill_ground')) multiplier += 0.07;
  const professional = militaryExperienceProfile(region, null);
  multiplier += professional.institutional * 0.10 + (professional.officerSchool ? 0.05 : 0);
  multiplier += emergentFormationCohesion(region);
  return multiplier;
}

export function postureProfile(region) {
  const posture = ensureMilitaryPolicy(region).defensivePosture;
  if (posture === 'trade_routes') return { localPower: 0.9, settlementProtection: 0.9, tradeSecurity: 1.25, borderControl: 0.75, raidDefence: 0.9 };
  if (posture === 'borders') return { localPower: 0.85, settlementProtection: 0.82, tradeSecurity: 0.9, borderControl: 1.55, raidDefence: 1.18 };
  return { localPower: 1.15, settlementProtection: 1.3, tradeSecurity: 0.9, borderControl: 0.85, raidDefence: 1.05 };
}

export function navalMissionProfile(region) {
  const priority = ensureMilitaryPolicy(region).navalPriority;
  const doctrine = region.unlockedTechIds?.has('naval_warfare') ? 1.12 : 1;
  const base = priority === 'fisheries' ? { fishing: 1.2, trade: 1.0, war: 0.45 }
    : priority === 'war' ? { fishing: 1.0, trade: 0.95, war: 1.0 }
      : { fishing: 1.0, trade: 1.2, war: 0.6 };
  const baseBonus = operationalInfrastructure(region, 'naval_base') ? 1.12 : 1;
  return { ...base, war: base.war * doctrine * baseBonus };
}

function stableFraction(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

export function chooseAiMilitaryPolicies(region) {
  const policy = ensureMilitaryPolicy(region);
  const temperament = stableFraction(region.id);
  const threat = clamp01(1 - (region.safetyRating ?? 1));
  policy.armyPermanence = clamp01(0.2 + temperament * 0.35 + threat * 0.5);
  const banditShare = (region.banditPopulation || 0) / Math.max(1, region.population || 0);
  policy.defensivePosture = banditShare > 0.01 ? 'settlements'
    : (region.tradeEconomy?.exportIncomeEma || 0) > Math.max(2, region.population * 0.0002) ? 'trade_routes' : 'borders';
  policy.raiderTreatment = region.stability < 0.55 ? 'reintegrate'
    : temperament > 0.72 ? 'punish' : temperament < 0.32 ? 'recruit' : 'reintegrate';
  const foodPressure = (region.report?.foodPlan?.importDependence || 0) > 0.05;
  policy.navalPriority = foodPressure ? 'fisheries'
    : (region.tradeEconomy?.exportIncomeEma || 0) > 5 ? 'trade' : temperament > 0.6 ? 'war' : 'fisheries';
  policy.warHorseAllocation = clamp01(0.25 + threat * 0.55 + temperament * 0.2);
  return policy;
}
