import assert from 'node:assert/strict';
import { ensureDiseaseState, PATHOGENS, quarantineTradeFriction, setQuarantinePolicy, tickDisease } from '../js/society/disease.js';

function region(id, neighbors = [], population = 100000) {
  return {
    id,
    neighbors,
    population,
    areaSqKm: 1000,
    stability: 1,
    demographics: {
      children: population * 0.25,
      workingAge: population * 0.65,
      elderly: population * 0.10,
    },
    tradeEconomy: { routeHabits: {} },
  };
}

const a = region('a', ['b']);
const b = region('b', ['a']);
ensureDiseaseState(a).pathogens.smallpox.prevalence = 0.08;
tickDisease([a, b], 30, () => 0.5);
assert.ok(ensureDiseaseState(b).pathogens.smallpox.prevalence > 0, 'smallpox should spread across land contact');

// Keep this population below the reservoir threshold so the only active disease
// is smallpox. Plague resistance may wane naturally, but it must not increase.
const immune = region('immune-isolation', [], 2000);
ensureDiseaseState(immune).pathogens.smallpox.prevalence = 0.12;
ensureDiseaseState(immune).pathogens.plague.resistance = 0.2;
const plagueBefore = ensureDiseaseState(immune).pathogens.plague.resistance;
tickDisease([immune], 30, () => 0.5);
const expectedWanedPlague = plagueBefore * Math.pow(0.5, (30 / 365.2425) / PATHOGENS.plague.resistanceHalfLifeYears);
assert.ok(Math.abs(ensureDiseaseState(immune).pathogens.plague.resistance - expectedWanedPlague) < 1e-12,
  'smallpox exposure must not confer plague resistance');
assert.ok(ensureDiseaseState(immune).pathogens.smallpox.resistance > 0,
  'smallpox survivors should acquire smallpox-specific resistance');

const c = region('c', ['d']);
const d = region('d', ['c']);
ensureDiseaseState(c).pathogens.respiratory.prevalence = 0.12;
ensureDiseaseState(c).pathogens.respiratory.recognised = true;
setQuarantinePolicy(d, 1);
ensureDiseaseState(d).pathogens.respiratory.recognised = true;
tickDisease([c, d], 30, () => 0.5);
assert.ok(ensureDiseaseState(d).effectiveQuarantine > 0.9, 'recognised outbreak should activate standing quarantine policy');
assert.ok(quarantineTradeFriction(d) > 1, 'active quarantine should impose trade friction');

const e = region('e');
ensureDiseaseState(e).pathogens.enteric.prevalence = 0.2;
const popBefore = e.population;
tickDisease([e], 30, () => 0.5);
assert.ok(e.population < popBefore, 'disease mortality should reduce population');
assert.ok(ensureDiseaseState(e).pathogens.enteric.resistance > 0, 'survivors should acquire disease-specific resistance');

console.log('disease tests passed');
