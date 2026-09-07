import { chariotCoverage, cavalryCoverage } from './chariotry.js?v=20260908-terrain1';

export const TERRAIN_TYPES = Object.freeze(['plains', 'hills', 'mountains', 'forest', 'wetland']);

export const TERRAIN_LABELS = Object.freeze({
  plains: 'open ground',
  hills: 'hilly ground',
  mountains: 'mountainous ground',
  forest: 'wooded ground',
  wetland: 'wet or marshy ground',
});

const CHARIOT_TERRAIN = Object.freeze({ plains: 1.00, hills: 0.65, mountains: 0.12, forest: 0.30, wetland: 0.20 });
const CAVALRY_TERRAIN = Object.freeze({ plains: 1.00, hills: 0.82, mountains: 0.45, forest: 0.60, wetland: 0.50 });
const INFANTRY_TERRAIN = Object.freeze({ plains: 1.00, hills: 1.03, mountains: 0.95, forest: 1.00, wetland: 0.85 });
const DEFENSIVE_GROUND_VALUE = Object.freeze({ plains: -0.08, hills: 0.16, mountains: 0.28, forest: 0.24, wetland: 0.14 });
const ATTACKER_OPEN_GROUND_VALUE = Object.freeze({ plains: 0.10, hills: 0.01, mountains: -0.08, forest: -0.07, wetland: -0.06 });

const WEEKS_PER_YEAR = 365.2425 / 7;
const EXPERIENCE_HALF_LIFE_YEARS = 30;
const EXPERIENCE_HALF_LIFE_WEEKS = EXPERIENCE_HALF_LIFE_YEARS * WEEKS_PER_YEAR;

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

export function ensureMilitaryExperience(region) {
  region.militaryExperience ||= {};
  const state = region.militaryExperience;
  if (!Number.isFinite(state.combat)) state.combat = 0;
  if (!Number.isFinite(state.lastTick)) state.lastTick = 0;
  if (!Number.isFinite(state.engagementWeeks)) state.engagementWeeks = 0;
  return state;
}

function decayExperienceTo(region, currentTick) {
  const state = ensureMilitaryExperience(region);
  const elapsedWeeks = Math.max(0, (Number(currentTick) || 0) - state.lastTick);
  if (elapsedWeeks > 0 && state.combat > 0) {
    state.combat *= Math.pow(0.5, elapsedWeeks / EXPERIENCE_HALF_LIFE_WEEKS);
  }
  state.lastTick = Math.max(state.lastTick, Number(currentTick) || 0);
  return state;
}

export function combatExperience(region, currentTick) {
  return clamp(decayExperienceTo(region, currentTick).combat);
}

export function recordCombatExperience(region, currentTick, { intensity = 0.01, casualtyShare = 0, defender = false } = {}) {
  const state = decayExperienceTo(region, currentTick);
  // Experience is institutional and practical rather than a kill counter. Simply
  // being exposed to an active campaign teaches something; hard fighting teaches
  // more. Defenders get a small extra local-learning benefit from repeatedly
  // operating on their own ground.
  const gain = 0.0018 + clamp(intensity, 0, 0.05) * 0.11 + clamp(casualtyShare, 0, 0.25) * 0.045 + (defender ? 0.00035 : 0);
  state.combat = clamp(state.combat + gain);
  state.engagementWeeks += 1;
  return state.combat;
}

export function currentTerrainMix(region) {
  const source = region?.terrain || {};
  const mix = Object.fromEntries(TERRAIN_TYPES.map((key) => [key, Math.max(0, Number(source[key]) || 0)]));

  // Forest is the one terrain component already changed by simulation. The
  // static map stores its initial area share plus forestPotential. At combat
  // time we cheaply reflect clearing/regrowth without running a terrain system
  // every tick.
  if (region?.forest && Number.isFinite(source.forestPotential) && region.forest.K > 0) {
    const liveForest = clamp(source.forestPotential * clamp(region.forest.currentStock / region.forest.K));
    const delta = liveForest - mix.forest;
    mix.forest = liveForest;
    if (delta < 0) {
      // Cleared woodland becomes mostly open ground, with some underlying hills.
      mix.plains += -delta * 0.72;
      mix.hills += -delta * 0.28;
    } else if (delta > 0) {
      const removable = Math.max(1e-9, mix.plains + mix.hills);
      const fromPlains = delta * mix.plains / removable;
      mix.plains = Math.max(0, mix.plains - fromPlains);
      mix.hills = Math.max(0, mix.hills - (delta - fromPlains));
    }
  }

  const total = TERRAIN_TYPES.reduce((sum, key) => sum + mix[key], 0);
  if (total <= 0) return { plains: 1, hills: 0, mountains: 0, forest: 0, wetland: 0 };
  for (const key of TERRAIN_TYPES) mix[key] /= total;
  return mix;
}

export function forceTerrainProfile(region) {
  const chariotInfluence = clamp(chariotCoverage(region) * 0.32, 0, 0.38);
  const cavalryInfluence = clamp(cavalryCoverage(region) * 0.28, 0, 0.34);
  const mountedTotal = Math.min(0.58, chariotInfluence + cavalryInfluence);
  const scale = chariotInfluence + cavalryInfluence > 0 ? mountedTotal / (chariotInfluence + cavalryInfluence) : 0;
  const chariotWeight = chariotInfluence * scale;
  const cavalryWeight = cavalryInfluence * scale;
  const infantryWeight = 1 - chariotWeight - cavalryWeight;

  return Object.fromEntries(TERRAIN_TYPES.map((terrain) => [terrain,
    infantryWeight * INFANTRY_TERRAIN[terrain] +
    chariotWeight * CHARIOT_TERRAIN[terrain] +
    cavalryWeight * CAVALRY_TERRAIN[terrain]
  ]));
}

export function terrainCombatMultiplier(region, terrain) {
  return forceTerrainProfile(region)[terrain] ?? 1;
}

export function battlefieldWeights({ attacker, defender, currentTick, attackerMobility = 0.5, defenderMobility = 0.5 }) {
  const natural = currentTerrainMix(defender);
  const attackerProfile = forceTerrainProfile(attacker);
  const defenderProfile = forceTerrainProfile(defender);
  const attackerExperience = combatExperience(attacker, currentTick);
  const defenderExperience = combatExperience(defender, currentTick);

  // Defenders begin with a genuine choice advantage: they know the local ground,
  // can wait, prepare positions and ambush. Experience and mobility then let
  // either side improve its ability to force or refuse an engagement.
  const defenderSelection = clamp(0.34 + defenderExperience * 0.36 + clamp(defenderMobility) * 0.18);
  const attackerSelection = clamp(0.10 + attackerExperience * 0.38 + clamp(attackerMobility) * 0.28);

  const raw = {};
  for (const terrain of TERRAIN_TYPES) {
    if (natural[terrain] <= 0) { raw[terrain] = 0; continue; }
    const relative = Math.log(Math.max(0.2, defenderProfile[terrain]) / Math.max(0.2, attackerProfile[terrain]));
    const defenderPreference = relative + DEFENSIVE_GROUND_VALUE[terrain];
    const attackerPreference = -relative + ATTACKER_OPEN_GROUND_VALUE[terrain];
    const steering = defenderSelection * defenderPreference * 2.0 + attackerSelection * attackerPreference * 1.55;
    // Natural availability remains dominant. Choice can strongly bias where a
    // battle happens but cannot create terrain that is not present in the region.
    raw[terrain] = natural[terrain] * Math.exp(clamp(steering, -1.5, 1.5));
  }
  const total = TERRAIN_TYPES.reduce((sum, key) => sum + raw[key], 0) || 1;
  const weights = Object.fromEntries(TERRAIN_TYPES.map((key) => [key, raw[key] / total]));
  return { weights, natural, attackerProfile, defenderProfile, attackerExperience, defenderExperience,
    attackerSelection, defenderSelection };
}

export function chooseBattlefield(options, rng = Math.random) {
  const detail = battlefieldWeights(options);
  let roll = clamp(rng(), 0, 0.999999999);
  let chosen = 'plains';
  for (const terrain of TERRAIN_TYPES) {
    roll -= detail.weights[terrain];
    if (roll <= 0) { chosen = terrain; break; }
  }
  return { terrain: chosen, ...detail };
}
