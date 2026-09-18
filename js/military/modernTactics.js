import { militaryExperienceProfile, officerSchoolStatus } from './professionalisation.js?v=20260908-prof1';
import { ensureMedievalDoctrine } from './medievalDoctrine.js?v=20260912-medieval2';
import { MACHINE_GUN_TECH_ID, FIELD_ENTRENCHMENT_TECH_ID, QUICK_FIRE_ARTILLERY_TECH_ID } from './modernLandWarfare.js?v=20260918-modern-war1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const has = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

export function ensureModernTactics(region) {
  region.modernTactics ||= {};
  const state = region.modernTactics;
  state.version = 1;
  const defaults = {
    machineGunExposure: 0,
    doctrinalShock: 0,
    legacyAssaultInertia: 0,
    dispersion: 0,
    fireAndMovement: 0,
    suppression: 0,
    artilleryCoordination: 0,
    juniorInitiative: 0,
    defensiveFireDiscipline: 0,
    lessonsCaptured: 0,
    failedAssaultMemory: 0,
    lastCombatTick: -Infinity,
  };
  for (const [key, value] of Object.entries(defaults)) if (!Number.isFinite(state[key])) state[key] = value;
  return state;
}

function legacyDoctrineCommitment(region) {
  const medieval = ensureMedievalDoctrine(region);
  const exp = militaryExperienceProfile(region, null);
  const formations = (region.militaryFormations?.traditions || []).filter((formation) => formation.status === 'active');
  const oldFormationWeight = formations.reduce((sum, formation) => {
    const obsolete = ['standardised_heavy_infantry', 'professional_cohorts', 'cavalry_corps', 'knightly_retinues'].includes(formation.archetypeId) ? 1 : 0.35;
    return sum + clamp(formation.coverage) * clamp(formation.readiness) * obsolete;
  }, 0);
  const shockTradition = clamp(medieval.practice?.cavalryShock || 0);
  const drill = clamp(medieval.practice?.firearmDrill || 0);
  const professional = clamp(exp.effective);
  // Experience itself is not bad. It becomes inertia when a force has deeply
  // institutionalised close-order/shock practices that machine-gun fire punishes.
  return clamp(shockTradition * 0.28 + drill * 0.18 + professional * 0.30 + Math.min(1, oldFormationWeight) * 0.24);
}

function modernAdaptation(state) {
  return clamp(
    state.dispersion * 0.24 +
    state.fireAndMovement * 0.24 +
    state.suppression * 0.18 +
    state.artilleryCoordination * 0.18 +
    state.juniorInitiative * 0.16
  );
}

function institutionLearningCapacity(region) {
  const exp = militaryExperienceProfile(region, null);
  const officer = officerSchoolStatus(region).active ? 1 : 0;
  const literacy = clamp(region.massEducation?.literacy ?? region.publicEducation?.literacy ?? region.education?.literacy ?? 0);
  const communications = clamp(region.administration?.communications ?? region.governance?.administrativeControl ?? 0);
  return clamp(0.12 + exp.institutional * 0.36 + officer * 0.20 + literacy * 0.16 + communications * 0.16);
}

export function modernTacticalProfile(region, opponent, { role = 'attacker', weeksEngaged = 0, terrain = 'plains' } = {}) {
  const state = ensureModernTactics(region);
  const opponentState = ensureModernTactics(opponent);
  const opponentMg = has(opponent, MACHINE_GUN_TECH_ID);
  const ownMg = has(region, MACHINE_GUN_TECH_ID);
  const opponentEntrenched = has(opponent, FIELD_ENTRENCHMENT_TECH_ID);
  const ownEntrenched = has(region, FIELD_ENTRENCHMENT_TECH_ID);
  const opponentPrepared = opponentEntrenched ? 1 - Math.exp(-Math.max(0, weeksEngaged) / 2.2) : 0;
  const ownPrepared = ownEntrenched ? 1 - Math.exp(-Math.max(0, weeksEngaged) / 2.2) : 0;
  const openExposure = terrain === 'plains' ? 1 : terrain === 'hills' ? 0.82 : terrain === 'wetland' ? 0.78 : terrain === 'forest' ? 0.58 : 0.62;
  const adaptation = modernAdaptation(state);
  const legacy = Math.max(state.legacyAssaultInertia, legacyDoctrineCommitment(region));
  state.legacyAssaultInertia = Math.max(state.legacyAssaultInertia, legacy);

  let combatMultiplier = 1;
  let casualtyMultiplier = 1;
  let defensiveMultiplier = 1;
  let obsoleteExperiencePenalty = 0;

  if (role === 'attacker' && opponentMg) {
    const defensiveFireWall = clamp(0.42 + opponentPrepared * 0.38 + opponentState.defensiveFireDiscipline * 0.20);
    // Negative transfer: experienced organisations committed to old assault
    // methods can initially do worse than greener, less doctrinally rigid ones.
    obsoleteExperiencePenalty = clamp(legacy * (1 - adaptation) * defensiveFireWall * openExposure * 0.46, 0, 0.38);
    const adaptedAttack = adaptation * (0.11 + state.suppression * 0.07 + state.artilleryCoordination * 0.07);
    combatMultiplier = clamp(1 - obsoleteExperiencePenalty + adaptedAttack, 0.58, 1.28);
    casualtyMultiplier = clamp(1 + defensiveFireWall * openExposure * (0.48 - adaptation * 0.35), 0.78, 1.62);
  }

  if (role === 'defender' && ownMg) {
    const preparation = clamp(0.55 + ownPrepared * 0.28 + state.defensiveFireDiscipline * 0.17);
    defensiveMultiplier = 1 + preparation * (0.40 + state.defensiveFireDiscipline * 0.18);
    // Defenders benefit quickly from learning range cards, interlocking fields
    // of fire and ammunition discipline; attackers require harder doctrinal change.
    combatMultiplier *= 1 + state.defensiveFireDiscipline * 0.12;
  }

  return {
    combatMultiplier,
    casualtyMultiplier,
    defensiveMultiplier,
    obsoleteExperiencePenalty,
    adaptation,
    legacyAssaultInertia: legacy,
    machineGunExposure: state.machineGunExposure,
    doctrinalShock: state.doctrinalShock,
    preparedDefence: role === 'defender' ? ownPrepared : opponentPrepared,
    ownPreparedDefence: ownPrepared,
    opponentPreparedDefence: opponentPrepared,
  };
}

export function recordModernCombatLessons(region, opponent, {
  role = 'attacker', casualtyShare = 0, intensity = 0, weeksEngaged = 0, currentTick = 0,
} = {}) {
  const state = ensureModernTactics(region);
  const opponentMg = has(opponent, MACHINE_GUN_TECH_ID);
  const ownMg = has(region, MACHINE_GUN_TECH_ID);
  const losses = clamp(casualtyShare);
  const battleIntensity = clamp(intensity / 0.06);
  const institution = institutionLearningCapacity(region);

  state.legacyAssaultInertia = Math.max(state.legacyAssaultInertia, legacyDoctrineCommitment(region));
  if (opponentMg) {
    const exposureGain = 0.018 + battleIntensity * 0.024 + losses * 0.12;
    state.machineGunExposure = clamp(state.machineGunExposure + exposureGain * (1 - state.machineGunExposure * 0.55));
    state.doctrinalShock = clamp(Math.max(state.doctrinalShock, state.legacyAssaultInertia * (1 - modernAdaptation(state))) + losses * 0.16);
  }

  if (role === 'attacker' && opponentMg) {
    const pain = clamp(0.35 + losses * 3.2 + battleIntensity * 0.45);
    const learning = (0.006 + pain * 0.017) * (0.62 + institution * 0.75);
    state.dispersion = clamp(state.dispersion + learning * 1.15 * (1 - state.dispersion));
    state.fireAndMovement = clamp(state.fireAndMovement + learning * 0.90 * (1 - state.fireAndMovement));
    state.suppression = clamp(state.suppression + learning * 0.65 * (1 - state.suppression));
    if (has(region, QUICK_FIRE_ARTILLERY_TECH_ID)) state.artilleryCoordination = clamp(state.artilleryCoordination + learning * 0.78 * (1 - state.artilleryCoordination));
    state.juniorInitiative = clamp(state.juniorInitiative + learning * institution * 0.62 * (1 - state.juniorInitiative));
    state.failedAssaultMemory = clamp(state.failedAssaultMemory + losses * 0.45 + battleIntensity * 0.02);
  }

  if (role === 'defender' && ownMg) {
    const learning = (0.008 + battleIntensity * 0.011 + losses * 0.025) * (0.72 + institution * 0.45);
    state.defensiveFireDiscipline = clamp(state.defensiveFireDiscipline + learning * (1 - state.defensiveFireDiscipline));
    state.suppression = clamp(state.suppression + learning * 0.32 * (1 - state.suppression));
  }

  const adaptation = modernAdaptation(state);
  state.doctrinalShock = clamp(state.doctrinalShock * (1 - adaptation * 0.08));
  // Old institutions are sticky, but repeated proof that they fail eventually
  // strips authority from them. This is deliberately much slower than learning
  // a single battlefield trick.
  if (opponentMg && role === 'attacker') state.legacyAssaultInertia = clamp(state.legacyAssaultInertia - (0.002 + losses * 0.025) * (0.45 + institution));
  state.lessonsCaptured = clamp(state.lessonsCaptured + battleIntensity * institution * 0.012 + losses * institution * 0.025);
  state.lastCombatTick = currentTick;
  return state;
}

export function tickModernTactics(regions, elapsedDays = 7) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (years <= 0) return [];
  for (const region of regions || []) {
    const state = ensureModernTactics(region);
    const institution = institutionLearningCapacity(region);
    const adaptation = modernAdaptation(state);
    // Peacetime study can codify battlefield lessons, but cannot invent the
    // tactical revolution from nothing. Armies must first encounter the problem
    // directly or learn it from a military institution already carrying lessons.
    if (state.machineGunExposure > 0.08 || state.lessonsCaptured > 0.05) {
      const study = years * (0.010 + institution * 0.025) * clamp(state.machineGunExposure + state.lessonsCaptured);
      state.dispersion = clamp(state.dispersion + study * 0.9 * (1 - state.dispersion));
      state.fireAndMovement = clamp(state.fireAndMovement + study * 0.65 * (1 - state.fireAndMovement));
      state.juniorInitiative = clamp(state.juniorInitiative + study * institution * 0.50 * (1 - state.juniorInitiative));
      if (has(region, QUICK_FIRE_ARTILLERY_TECH_ID)) state.artilleryCoordination = clamp(state.artilleryCoordination + study * 0.58 * (1 - state.artilleryCoordination));
    }
    state.doctrinalShock = clamp(state.doctrinalShock - years * (0.015 + adaptation * 0.045));
  }
  return [];
}

export function modernTacticsSummary(region) {
  const state = ensureModernTactics(region);
  return { ...state, adaptation: modernAdaptation(state), institutionalLearning: institutionLearningCapacity(region) };
}
