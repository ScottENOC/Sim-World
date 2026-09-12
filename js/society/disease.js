import { DAYS_PER_YEAR } from '../core/simTime.js?v=20260905-time1';

export const PATHOGENS = Object.freeze({
  smallpox: Object.freeze({ id: 'smallpox', label: 'Smallpox', transmission: 0.16, mortality: 0.11, durationDays: 28, resistanceGain: 0.88, resistanceHalfLifeYears: 45, tradeWeight: 0.75 }),
  plague: Object.freeze({ id: 'plague', label: 'Plague', transmission: 0.12, mortality: 0.22, durationDays: 18, resistanceGain: 0.48, resistanceHalfLifeYears: 12, tradeWeight: 0.55 }),
  enteric: Object.freeze({ id: 'enteric', label: 'Enteric disease', transmission: 0.11, mortality: 0.055, durationDays: 20, resistanceGain: 0.38, resistanceHalfLifeYears: 6, tradeWeight: 0.35 }),
  respiratory: Object.freeze({ id: 'respiratory', label: 'Respiratory epidemic', transmission: 0.19, mortality: 0.018, durationDays: 12, resistanceGain: 0.42, resistanceHalfLifeYears: 4, tradeWeight: 0.9 }),
});

const PATHOGEN_IDS = Object.keys(PATHOGENS);
const MAX_PREVALENCE = 0.45;
const MIN_ACTIVE_PREVALENCE = 0.00001;
const RECOGNITION_PREVALENCE = 0.008;
const QUARANTINE_IMPORT_REDUCTION = 0.78;
const QUARANTINE_LOCAL_REDUCTION = 0.28;
const QUARANTINE_MAX_TRADE_FRICTION = 0.32;

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function ensureDiseaseState(region) {
  if (!region.disease || typeof region.disease !== 'object') region.disease = {};
  const state = region.disease;
  if (!state.pathogens || typeof state.pathogens !== 'object' || Array.isArray(state.pathogens)) state.pathogens = {};
  if (!Number.isFinite(state.quarantinePolicy)) state.quarantinePolicy = 0;
  if (!Number.isFinite(state.effectiveQuarantine)) state.effectiveQuarantine = 0;
  for (const id of PATHOGEN_IDS) {
    const current = state.pathogens[id] || {};
    state.pathogens[id] = {
      prevalence: clamp01(current.prevalence),
      resistance: clamp01(current.resistance),
      cumulativeDeaths: Math.max(0, Number(current.cumulativeDeaths) || 0),
      recognised: Boolean(current.recognised),
      lastDeaths: Math.max(0, Number(current.lastDeaths) || 0),
    };
  }
  return state;
}

export function setQuarantinePolicy(region, value) {
  ensureDiseaseState(region).quarantinePolicy = clamp01(value);
  return ensureDiseaseState(region).quarantinePolicy;
}

export function activeDiseaseBurden(region) {
  const state = ensureDiseaseState(region);
  return Math.min(1, PATHOGEN_IDS.reduce((sum, id) => sum + state.pathogens[id].prevalence, 0));
}

export function recognisedDiseaseThreats(region) {
  const state = ensureDiseaseState(region);
  return PATHOGEN_IDS.map((id) => ({ ...PATHOGENS[id], ...state.pathogens[id] })).filter((entry) => entry.recognised || entry.prevalence >= RECOGNITION_PREVALENCE);
}

export function quarantineTradeFriction(region) {
  const state = ensureDiseaseState(region);
  return 1 + clamp01(state.effectiveQuarantine) * QUARANTINE_MAX_TRADE_FRICTION;
}

function reservoirSeed(region, pathogenId) {
  // Stable sparse reservoirs prevent every new game from beginning with a world-wide
  // epidemic while allowing old diseases to exist before long-distance trade connects them.
  const population = Math.max(0, Number(region.population) || 0);
  if (population < 3000) return 0;
  const density = population / Math.max(100, Number(region.areaSqKm) || 10000);
  const urban = clamp01((Number(region.urbanisation) || Number(region.urbanization) || 0) * 2 + density / 150);
  const roll = stableHash(`${region.id}:${pathogenId}:reservoir`) % 1000;
  const threshold = 3 + Math.round(urban * 9);
  return roll < threshold ? 0.0004 + (roll % 4) * 0.00015 : 0;
}

function routeHabitContacts(region, regionsById) {
  const habits = Object.values(region.tradeEconomy?.routeHabits || {});
  const result = [];
  for (const habit of habits.slice(0, 16)) {
    const dest = regionsById.get(habit.destId);
    if (!dest) continue;
    const strength = clamp01((Number(habit.score) || 0) / 8);
    result.push({ region: dest, strength: 0.18 + strength * 0.32 });
  }
  return result;
}

function contactPressure(region, pathogenId, regionsById, snapshot) {
  let pressure = 0;
  for (const neighborId of region.neighbors || []) {
    const n = regionsById.get(neighborId);
    if (!n) continue;
    pressure += (snapshot.get(n.id)?.[pathogenId] || 0) * 0.42;
  }
  for (const contact of routeHabitContacts(region, regionsById)) {
    pressure += (snapshot.get(contact.region.id)?.[pathogenId] || 0) * PATHOGENS[pathogenId].tradeWeight * contact.strength;
  }
  return Math.min(0.35, pressure);
}

function removeDeaths(region, count) {
  if (!(count > 0) || !region.demographics) return;
  const d = region.demographics;
  const total = Math.max(1, (d.children || 0) + (d.workingAge || 0) + (d.elderly || 0));
  const childWeight = (d.children || 0) / total;
  const adultWeight = (d.workingAge || 0) / total;
  const oldWeight = (d.elderly || 0) / total;
  d.children = Math.max(0, (d.children || 0) - count * childWeight);
  d.workingAge = Math.max(0, (d.workingAge || 0) - count * adultWeight);
  d.elderly = Math.max(0, (d.elderly || 0) - count * oldWeight);
  region.population = Math.round(d.children + d.workingAge + d.elderly);
}

export function tickDisease(regions, elapsedDays = 30, rng = Math.random) {
  const days = Math.max(0, Number(elapsedDays) || 0);
  if (!days) return [];
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const snapshot = new Map();
  for (const region of regions) {
    const state = ensureDiseaseState(region);
    const values = {};
    for (const id of PATHOGEN_IDS) {
      if (state.pathogens[id].prevalence <= 0) state.pathogens[id].prevalence = reservoirSeed(region, id);
      values[id] = state.pathogens[id].prevalence;
    }
    snapshot.set(region.id, values);
  }

  const events = [];
  const years = days / DAYS_PER_YEAR;
  for (const region of regions) {
    const state = ensureDiseaseState(region);
    const populationBefore = Math.max(1, Number(region.population) || 1);
    const localBurden = PATHOGEN_IDS.reduce((sum, id) => sum + state.pathogens[id].prevalence, 0);
    const recognisedBurden = PATHOGEN_IDS.reduce((sum, id) => sum + (state.pathogens[id].recognised ? state.pathogens[id].prevalence : 0), 0);
    const desiredQuarantine = recognisedBurden > 0.003 ? state.quarantinePolicy : 0;
    state.effectiveQuarantine += (desiredQuarantine - state.effectiveQuarantine) * Math.min(1, days / 30);

    for (const id of PATHOGEN_IDS) {
      const pathogen = PATHOGENS[id];
      const p = state.pathogens[id];
      const oldPrevalence = clamp01(snapshot.get(region.id)?.[id]);
      const resistance = clamp01(p.resistance);
      const susceptible = Math.max(0, 1 - resistance - oldPrevalence);
      const importPressure = contactPressure(region, id, regionsById, snapshot) * (1 - state.effectiveQuarantine * QUARANTINE_IMPORT_REDUCTION);
      const localPressure = oldPrevalence * (1 - state.effectiveQuarantine * QUARANTINE_LOCAL_REDUCTION);
      const exposure = Math.min(0.6, localPressure + importPressure);
      const newInfections = susceptible * (1 - Math.exp(-pathogen.transmission * exposure * days / 7));
      const resolvingFraction = 1 - Math.exp(-days / pathogen.durationDays);
      const resolving = oldPrevalence * resolvingFraction;
      const deathsShare = resolving * pathogen.mortality;
      const recoveries = Math.max(0, resolving - deathsShare);
      p.prevalence = Math.min(MAX_PREVALENCE, Math.max(0, oldPrevalence + newInfections - resolving));
      if (p.prevalence < MIN_ACTIVE_PREVALENCE) p.prevalence = 0;

      // Resistance is disease-specific. No cross-pathogen immunity is applied.
      const gainedResistance = recoveries * pathogen.resistanceGain;
      p.resistance = clamp01(p.resistance + gainedResistance);
      const halfLife = Math.max(0.1, pathogen.resistanceHalfLifeYears);
      p.resistance *= Math.pow(0.5, years / halfLife);

      const deaths = Math.min(populationBefore * 0.2, populationBefore * deathsShare);
      p.lastDeaths = deaths;
      p.cumulativeDeaths += deaths;
      removeDeaths(region, deaths);

      const newlyRecognised = !p.recognised && (p.prevalence >= RECOGNITION_PREVALENCE || deaths >= Math.max(4, populationBefore * 0.0005));
      if (newlyRecognised) {
        p.recognised = true;
        events.push({ type: 'disease_recognised', regionId: region.id, pathogenId: id, pathogenLabel: pathogen.label, prevalence: p.prevalence, deaths });
      }
      if (oldPrevalence < 0.003 && p.prevalence >= 0.003) {
        events.push({ type: 'disease_outbreak', regionId: region.id, pathogenId: id, pathogenLabel: pathogen.label, prevalence: p.prevalence, deaths });
      }
    }

    if (localBurden > 0.02) region.stability = Math.max(0, (region.stability ?? 1) - Math.min(0.015, localBurden * 0.03 * days / 30));
  }
  return events;
}
