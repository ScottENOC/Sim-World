import assert from 'node:assert/strict';
import { tickRoadVehicles } from '../js/economy/roadVehicles.js';
import { electricityDemand } from '../js/economy/electricity.js';

function baseRegion() {
  return {
    id: 'test-region',
    population: 100_000,
    treasury: 10_000,
    unlockedTechIds: new Set(['industrial_electrification']),
    electricity: { householdService: 0.9, industrialService: 0.9 },
    industrialSupply: { capability: { precision_machining: 0.8 } },
    structuralTransformation: { capability: { manufacture: 0.8 } },
    popularWellbeing: { prosperity: 0.7 },
    stockpile: {
      steel: 10_000, copper: 10_000, electronic_components: 10_000,
      petrol: 10_000, lithium_ion_cells: 0,
    },
  };
}

{
  const region = baseRegion();
  const beforePetrol = region.stockpile.petrol;
  const state = tickRoadVehicles(region, 365.2425);
  assert.ok(state.ice > 0, 'industrial societies should be able to build ordinary road vehicles');
  assert.equal(state.electric, 0, 'BEVs must not appear without lithium-ion capability/components');
  assert.ok(region.stockpile.petrol < beforePetrol, 'ICE fleet should consume actual petrol');
  assert.equal(state.electricityLoad, 0, 'ICE-only fleet should not create EV charging load');
}

{
  const region = baseRegion();
  region.unlockedTechIds.add('lithium_ion_batteries');
  region.stockpile.lithium_ion_cells = 1_000;
  const beforeCells = region.stockpile.lithium_ion_cells;
  const beforePetrol = region.stockpile.petrol;
  const state = tickRoadVehicles(region, 365.2425);
  assert.ok(state.electric > 0, 'lithium-ion cells and an electrified industrial base should permit BEVs');
  assert.ok(region.stockpile.lithium_ion_cells < beforeCells, 'BEV production must consume real battery cells');
  assert.ok(state.electricityLoad > 0, 'operating BEVs must create real grid charging demand');
  assert.ok(state.evShare > 0.5, 'mature battery-rich region should be able to electrify most new road vehicles');
  assert.ok(region.stockpile.petrol > beforePetrol - state.targetFleet * 0.42, 'BEV adoption should avoid petrol that an equivalent ICE fleet would consume');
  assert.equal(region.stockpile.hydrogen ?? 0, 0, 'passenger BEVs must not consume hydrogen');
  const demand = electricityDemand(region, 365.2425);
  assert.equal(demand.roadVehicleDemand, state.electricityLoad, 'EV charging must enter ordinary electricity demand');
}

{
  const region = baseRegion();
  region.unlockedTechIds.add('lithium_ion_batteries');
  region.stockpile.lithium_ion_cells = 1_000;
  region.electricity.householdService = 0;
  const beforeCells = region.stockpile.lithium_ion_cells;
  const state = tickRoadVehicles(region, 365.2425);
  assert.equal(state.electric, 0, 'BEVs must not be manufactured without usable household grid access');
  assert.equal(state.lastEvBuilt, 0, 'zero grid service must hard-gate new BEV production');
  assert.equal(region.stockpile.lithium_ion_cells, beforeCells, 'grid-gated BEV production must not consume battery cells');
  assert.ok(state.ice > 0, 'lack of charging access should not prevent ordinary vehicle production');
}

{
  const region = baseRegion();
  region.unlockedTechIds.add('lithium_ion_batteries');
  region.stockpile.lithium_ion_cells = 0.1;
  const state = tickRoadVehicles(region, 365.2425);
  assert.ok(state.electric < state.ice, 'battery-cell scarcity should constrain BEV production rather than conjuring batteries');
}

{
  const region = baseRegion();
  region.unlockedTechIds.add('lithium_ion_batteries');
  region.stockpile.lithium_ion_cells = 1_000;
  region.electricity.householdService = 0.12;
  const state = tickRoadVehicles(region, 365.2425);
  assert.ok(state.chargingService < 0.1, 'a very weak grid should make most BEVs operationally unavailable');
  assert.ok(state.transportService < 1, 'weak charging infrastructure should have a real mobility consequence');
}

console.log('Electric road vehicle regression passed.');
