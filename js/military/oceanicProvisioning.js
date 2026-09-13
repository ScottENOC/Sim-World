const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const DAYS_PER_YEAR = 365.2425;

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
  state.deficiencyWeeks = Math.max(0, Number(state.deficiencyWeeks) || 0);
  state.scurvyBurden = clamp(state.scurvyBurden || 0);
  state.crewReadiness = clamp(state.crewReadiness ?? 1, 0.35, 1);
  state.lastSeverity = state.lastSeverity || 'none';
  state.portCalls = Math.max(0, Number(state.portCalls) || 0);
  return state;
}

export function provisioningPractice(region) {
  return { ...ensureRegionalPractice(region) };
}

function portFoodSignal(port, crewCount) {
  const food = Math.max(0, Number(port?.stockpile?.food) || 0);
  const need = Math.max(1, crewCount * 0.7);
  const stockSignal = clamp(food / need, 0, 1);
  const land = clamp(0.35 + (Number(port?.landQuality) || 0.5) * 0.65, 0.35, 1);
  return clamp(stockSignal * 0.72 + land * 0.28);
}

export function serviceProvisioningInPort(fleet, port, owner, weeks = 1, crewCount = 1) {
  const state = ensureFleetProvisioning(fleet);
  const practice = ensureRegionalPractice(owner || port);
  const foodSignal = portFoodSignal(port, crewCount);

  // Fresh food is abstracted rather than tied to one crop. Citrus can later be
  // represented explicitly, but vegetables, greens and other fresh foods also
  // prevent deficiency. A food-poor harbour therefore cannot magically cure a crew.
  const freshRecovery = clamp(0.28 * weeks * foodSignal, 0, 1);
  state.freshProvisionQuality = clamp(state.freshProvisionQuality + freshRecovery);

  // Existing salt becomes useful to fleets as part of preserved provisions.
  // It extends calorie endurance but does not by itself prevent scurvy.
  const saltNeed = Math.max(0, crewCount) * 0.0018 * Math.max(0.25, weeks);
  const saltAvailable = Math.max(0, Number(port?.stockpile?.salt) || 0);
  const saltUsed = Math.min(saltNeed, saltAvailable);
  if (port?.stockpile) port.stockpile.salt = Math.max(0, saltAvailable - saltUsed);
  const saltCoverage = saltNeed > 0 ? saltUsed / saltNeed : 0;
  state.preservedRationQuality = clamp(0.5 + foodSignal * 0.18 + saltCoverage * 0.22 + practice.antiScurvyPractice * 0.08);

  if (foodSignal > 0.35) {
    state.deficiencyWeeks = Math.max(0, state.deficiencyWeeks - 1.8 * weeks * foodSignal);
    state.scurvyBurden = Math.max(0, state.scurvyBurden - 0.16 * weeks * foodSignal);
  }

  // Sailors and officials learn empirically from bad voyages and successful
  // recovery. This is practice diffusion, not a magical vitamin-C technology.
  if (state.scurvyBurden > 0.08 && foodSignal > 0.45) {
    practice.outbreaksObserved += 1;
    practice.antiScurvyPractice = clamp(practice.antiScurvyPractice + (0.006 + state.scurvyBurden * 0.018) * weeks);
  }
  const experienceTarget = clamp(Math.log1p(practice.longVoyageExperience) / 6.5);
  practice.antiScurvyPractice = clamp(practice.antiScurvyPractice +
    Math.max(0, experienceTarget - practice.antiScurvyPractice) * 0.003 * weeks);

  state.crewReadiness = clamp(1 - state.scurvyBurden * 0.48, 0.45, 1);
  state.portCalls += weeks > 0 ? 1 : 0;
  return { freshRecovery, foodSignal, saltCoverage, saltUsed, ...state };
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
  const missionUse = fleet.mission === 'hide' ? 0.78 :
    (fleet.mission === 'blockade' || fleet.mission === 'patrol') ? 1.12 : 1;

  // Fresh provisions disappear much faster than preserved calories. After
  // roughly 6-8 weeks a conventional voyage can still have food while its diet
  // quality has become dangerous.
  state.freshProvisionQuality = clamp(state.freshProvisionQuality - 0.115 * weeks * missionUse);
  const dietaryProtection = clamp(
    state.freshProvisionQuality * 0.78 +
    state.preservedRationQuality * 0.12 +
    practice.antiScurvyPractice * 0.42,
  );
  const deficiency = clamp((0.46 - dietaryProtection) / 0.46);

  if (deficiency > 0.05) state.deficiencyWeeks += weeks * deficiency;
  else state.deficiencyWeeks = Math.max(0, state.deficiencyWeeks - weeks * 0.35);

  // Symptoms are delayed, but a conventional poor diet should become a serious
  // operational problem on voyages measured in months rather than years.
  const symptomaticWeeks = Math.max(0, state.deficiencyWeeks - 2.5);
  if (symptomaticWeeks > 0) {
    const pressure = clamp(symptomaticWeeks / 9) * deficiency;
    state.scurvyBurden = clamp(state.scurvyBurden + pressure * 0.09 * weeks);
  } else if (dietaryProtection > 0.6) {
    state.scurvyBurden = Math.max(0, state.scurvyBurden - 0.025 * weeks);
  }

  state.crewReadiness = clamp(1 - state.scurvyBurden * 0.48, 0.45, 1);
  if ((fleet.weeksAtSea || 0) >= 6) practice.longVoyageExperience += weeks * Math.max(1, fleet.ships?.length || 1);

  // Scurvy feeds into the existing fatigue/morale model rather than inventing a
  // second combat system. Severe cases can cripple a well-fed fleet.
  fleet.fatigue = clamp((fleet.fatigue || 0) + state.scurvyBurden * 0.012 * weeks);
  fleet.morale = clamp((fleet.morale ?? 1) - state.scurvyBurden * 0.009 * weeks);

  const severity = severityForBurden(state.scurvyBurden);
  const changed = severity !== state.lastSeverity;
  const worsened = ['warning', 'outbreak', 'severe', 'critical'].indexOf(severity) >
    ['warning', 'outbreak', 'severe', 'critical'].indexOf(state.lastSeverity);
  state.lastSeverity = severity;
  return { ...state, dietaryProtection, deficiency, severity, event: changed && worsened && severity !== 'none' ? {
    type: 'fleet_scurvy', fleetId: fleet.id, ownerRegionId: fleet.ownerRegionId,
    ownerActorId: fleet.ownerActorId, severity, burden: state.scurvyBurden,
    deficiencyWeeks: state.deficiencyWeeks,
  } : null };
}

export function provisioningCombatMultiplier(fleet) {
  return clamp(ensureFleetProvisioning(fleet).crewReadiness, 0.45, 1);
}

export function shouldReturnForProvisioning(fleet) {
  const state = ensureFleetProvisioning(fleet);
  return state.scurvyBurden >= 0.24 || state.crewReadiness < 0.86 ||
    (state.freshProvisionQuality < 0.06 && state.deficiencyWeeks > 5);
}
