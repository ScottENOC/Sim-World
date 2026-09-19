import { FOOD_CANNING_TECH_ID, MECHANICAL_REFRIGERATION_TECH_ID, CFC_REFRIGERATION_TECH_ID, recordRefrigerationUse, refrigerantProfile } from '../technology/foodPreservationEnvironmentalHealth.js?v=20260919-preservation1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function ensureRegionalPractice(region) {
  region.maritimeProvisioning ||= {};
  const state = region.maritimeProvisioning;
  state.antiScurvyPractice = clamp(state.antiScurvyPractice || 0);
  state.longVoyageExperience = Math.max(0, Number(state.longVoyageExperience) || 0);
  state.outbreaksObserved = Math.max(0, Number(state.outbreaksObserved) || 0);
  return state;
}

export function ensureFleetProvisioning(fleet) {
  fleet.provisioning ||= {};
  const state = fleet.provisioning;
  state.freshProvisionQuality = clamp(state.freshProvisionQuality ?? 1);
  state.preservedRationQuality = clamp(state.preservedRationQuality ?? 0.58);
  state.preservedWeeksRemaining = Math.max(0, Number(state.preservedWeeksRemaining ?? 10));
  state.refrigerationCapability = clamp(state.refrigerationCapability || 0);
  state.deficiencyWeeks = Math.max(0, Number(state.deficiencyWeeks) || 0);
  state.scurvyBurden = clamp(state.scurvyBurden || 0);
  state.crewReadiness = clamp(state.crewReadiness ?? 1, 0.35, 1);
  state.lastSeverity = state.lastSeverity || 'none';
  state.portCalls = Math.max(0, Number(state.portCalls) || 0);
  return state;
}

export function provisioningPractice(region) { return { ...ensureRegionalPractice(region) }; }

function portFoodSignal(port, crewCount) {
  const food = Math.max(0, Number(port?.stockpile?.food) || 0);
  const need = Math.max(1, crewCount * 0.7);
  const stockSignal = clamp(food / need, 0, 1);
  const land = clamp(0.35 + (Number(port?.landQuality) || 0.5) * 0.65, 0.35, 1);
  return clamp(stockSignal * 0.72 + land * 0.28);
}

function poweredShipShare(fleet) {
  const ships=fleet?.ships||[]; if(!ships.length)return 0;
  const powered=new Set(['paddle_steam_warship','steam_frigate','ironclad','steel_warship','destroyer','fleet_tug','submarine','dreadnought']);
  return ships.filter(s=>powered.has(s.designId)||['steam','submersible','diesel','electric'].includes(s.propulsion)).length/ships.length;
}

function refrigerationCapability(fleet,owner){
  if(!owner?.unlockedTechIds?.has?.(MECHANICAL_REFRIGERATION_TECH_ID))return 0;
  return clamp(poweredShipShare(fleet)*(owner.unlockedTechIds.has(CFC_REFRIGERATION_TECH_ID)?1:.72));
}

export function serviceProvisioningInPort(fleet, port, owner, weeks = 1, crewCount = 1) {
  const state = ensureFleetProvisioning(fleet);
  const practice = ensureRegionalPractice(owner || port);
  const foodSignal = portFoodSignal(port, crewCount);
  const freshRecovery = clamp(0.28 * weeks * foodSignal, 0, 1);
  state.freshProvisionQuality = clamp(state.freshProvisionQuality + freshRecovery);

  const saltNeed = Math.max(0, crewCount) * 0.0018 * Math.max(0.25, weeks);
  const saltAvailable = Math.max(0, Number(port?.stockpile?.salt) || 0);
  const saltUsed = Math.min(saltNeed, saltAvailable);
  if (port?.stockpile) port.stockpile.salt = Math.max(0, saltAvailable - saltUsed);
  const saltCoverage = saltNeed > 0 ? saltUsed / saltNeed : 0;
  const canned=Boolean(owner?.unlockedTechIds?.has?.(FOOD_CANNING_TECH_ID));
  state.preservedRationQuality = clamp(0.5 + foodSignal * 0.18 + saltCoverage * 0.22 + practice.antiScurvyPractice * 0.08 + (canned?.12:0));
  state.preservedWeeksRemaining=Math.max(state.preservedWeeksRemaining,canned?32:12);
  state.refrigerationCapability=refrigerationCapability(fleet,owner);

  if (foodSignal > 0.35) {
    state.deficiencyWeeks = Math.max(0, state.deficiencyWeeks - 1.8 * weeks * foodSignal);
    state.scurvyBurden = Math.max(0, state.scurvyBurden - 0.16 * weeks * foodSignal);
  }
  if (state.scurvyBurden > 0.08 && foodSignal > 0.45) {
    practice.outbreaksObserved += 1;
    practice.antiScurvyPractice = clamp(practice.antiScurvyPractice + (0.006 + state.scurvyBurden * 0.018) * weeks);
  }
  const experienceTarget = clamp(Math.log1p(practice.longVoyageExperience) / 6.5);
  practice.antiScurvyPractice = clamp(practice.antiScurvyPractice + Math.max(0, experienceTarget - practice.antiScurvyPractice) * 0.003 * weeks);
  state.crewReadiness = clamp(1 - state.scurvyBurden * 0.48, 0.45, 1);
  state.portCalls += weeks > 0 ? 1 : 0;
  return { freshRecovery, foodSignal, saltCoverage, saltUsed, canned, ...state };
}

function severityForBurden(burden) {
  if (burden >= 0.72) return 'critical';
  if (burden >= 0.42) return 'severe';
  if (burden >= 0.16) return 'outbreak';
  if (burden >= 0.05) return 'warning';
  return 'none';
}

export function tickProvisioningAtSea(fleet, owner, weeks = 1) {
  const state = ensureFleetProvisioning(fleet);
  const practice = ensureRegionalPractice(owner || {});
  const missionUse = fleet.mission === 'hide' ? 0.78 : (fleet.mission === 'blockade' || fleet.mission === 'patrol') ? 1.12 : 1;
  state.refrigerationCapability=refrigerationCapability(fleet,owner);
  const refrigeration=state.refrigerationCapability;
  const freshDecay=0.115*(1-refrigeration*.72);
  state.freshProvisionQuality = clamp(state.freshProvisionQuality - freshDecay * weeks * missionUse);
  state.preservedWeeksRemaining=Math.max(0,state.preservedWeeksRemaining-weeks*missionUse*(owner?.unlockedTechIds?.has?.(FOOD_CANNING_TECH_ID)?.42:1));
  if(refrigeration>0){recordRefrigerationUse(owner,refrigeration*Math.max(1,fleet.ships?.length||1),weeks);}

  const dietaryProtection = clamp(state.freshProvisionQuality * 0.78 + state.preservedRationQuality * 0.12 + practice.antiScurvyPractice * 0.42);
  const deficiency = clamp((0.46 - dietaryProtection) / 0.46);
  if (deficiency > 0.05) state.deficiencyWeeks += weeks * deficiency;
  else state.deficiencyWeeks = Math.max(0, state.deficiencyWeeks - weeks * 0.35);
  const symptomaticWeeks = Math.max(0, state.deficiencyWeeks - 2.5);
  if (symptomaticWeeks > 0) {
    const pressure = clamp(symptomaticWeeks / 9) * deficiency;
    state.scurvyBurden = clamp(state.scurvyBurden + pressure * 0.09 * weeks);
  } else if (dietaryProtection > 0.6) state.scurvyBurden = Math.max(0, state.scurvyBurden - 0.025 * weeks);

  state.crewReadiness = clamp(1 - state.scurvyBurden * 0.48, 0.45, 1);
  if ((fleet.weeksAtSea || 0) >= 6) practice.longVoyageExperience += weeks * Math.max(1, fleet.ships?.length || 1);
  fleet.fatigue = clamp((fleet.fatigue || 0) + state.scurvyBurden * 0.012 * weeks);
  fleet.morale = clamp((fleet.morale ?? 1) - state.scurvyBurden * 0.009 * weeks);
  const severity = severityForBurden(state.scurvyBurden);
  const changed = severity !== state.lastSeverity;
  const worsened = ['warning', 'outbreak', 'severe', 'critical'].indexOf(severity) > ['warning', 'outbreak', 'severe', 'critical'].indexOf(state.lastSeverity);
  state.lastSeverity = severity;
  return { ...state, dietaryProtection, deficiency, severity, refrigerant:refrigerantProfile(owner), event: changed && worsened && severity !== 'none' ? {
    type: 'fleet_scurvy', fleetId: fleet.id, ownerRegionId: fleet.ownerRegionId, ownerActorId: fleet.ownerActorId, severity, burden: state.scurvyBurden, deficiencyWeeks: state.deficiencyWeeks,
  } : null };
}

export function provisioningCombatMultiplier(fleet) { return clamp(ensureFleetProvisioning(fleet).crewReadiness, 0.45, 1); }

export function shouldReturnForProvisioning(fleet) {
  const state = ensureFleetProvisioning(fleet);
  return state.preservedWeeksRemaining<=0 || state.scurvyBurden >= 0.24 || state.crewReadiness < 0.86 || (state.freshProvisionQuality < 0.06 && state.deficiencyWeeks > 5);
}
