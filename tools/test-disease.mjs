import assert from 'node:assert/strict';
import { ensureDiseaseState, PATHOGENS, quarantineTradeFriction, setQuarantinePolicy, tickDisease } from '../js/society/disease.js';

function region(id, neighbors = []) {
  return {
    id,
    neighbors,
    population: 100000,
    areaSqKm: 1000,
    stability: 1,
    demographics: { children: 25000, workingAge: 65000, elderly: 10000 },
    tradeEconomy: { routeHabits: {} },
  };
}

const a = region('a', ['b']);
const b = region('b', ['a']);
ensureDiseaseState(a).pathogens.smallpox.prevalence = 0.08;
ensureDiseaseState(a).pathogens.smallpox.resistance = 0.4;
ensureDiseaseState(a).pathogens.plague.resistance = 0.02;
const plagueBefore = ensureDiseaseState(a).pathogens.plague.resistance;
tickDisease([a, b], 30, () => 0.5);
assert.ok(ensureDiseaseState(b).pathogens.smallpox.prevalence > 0, 'smallpox should spread across land contact');
assert.equal(ensureDiseaseState(a).pathogens.plague.resistance, plagueBefore * Math.pow(0.5, (30 / 365.2425) / PATHOGENS.plague.resistanceHalfLifeYears), 'smallpox exposure must not confer plague resistance');

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
