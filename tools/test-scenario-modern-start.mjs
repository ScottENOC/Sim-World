import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyModernScenarioBaseline } from '../js/core/scenarioModernStart.js';

const profile = JSON.parse(fs.readFileSync(new URL('../data/scenarios/fractured-2027/modern-start.json', import.meta.url), 'utf8'));
const australia = {
  id: 'au-test', name: 'Australia test region', population: 1000,
  scenarioCountryId: 'australia', governance: { scenarioCountryId: 'australia' },
  unlockedTechIds: new Set(), electricity: {}, treasury: 0, stockpile: {},
  army: { personnel: 0, away: 0 }, targetArmySize: 0,
};
const generic = {
  id: 'generic-test', name: 'Generic modern region', population: 1000,
  scenarioCountryId: 'generic-country', governance: { scenarioCountryId: 'generic-country' },
  unlockedTechIds: new Set(), electricity: {}, treasury: 0, stockpile: {},
  army: { personnel: 0, away: 0 }, targetArmySize: 0,
};
const world = { regions: [australia, generic], scenarioState: { id: 'fractured-2027' } };
const result = applyModernScenarioBaseline(world, profile);

assert.equal(result.applied, true);
assert.equal(result.calibrationOnly, true);
assert.equal(result.regionCount, 2);
assert.equal(australia.population, 24_000);
assert.ok(australia.unlockedTechIds.has('electrical_generation'));
assert.ok(australia.unlockedTechIds.has('lithium_ion_batteries'));
assert.ok(australia.unlockedTechIds.has('battery_multirotor_drones'));
assert.ok(australia.electricity.service >= .9);
assert.ok(australia.structuralTransformation.capability.manufacture >= .8);
assert.ok(australia.industrialPlants.componentCapability.electronics >= .88);
assert.ok(australia.army.personnel > 0);
assert.ok(australia.stockpile.aviation_fuel > 0);
assert.ok(australia.industrialSupply.inventory.machine_components > 0);
assert.ok(australia.orbitalSupport.droneBeyondLineOfSightControl >= .42);
assert.ok(generic.structuralTransformation.capability.manufacture >= .72);

const before = australia.population;
applyModernScenarioBaseline(world, profile);
assert.equal(australia.population, before, 'modern population scaling must be idempotent');

console.log('Scenario modern-start regression passed: contemporary capabilities seed once and remain country-sensitive.');
