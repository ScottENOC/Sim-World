import assert from 'node:assert/strict';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';
import {
  CRYOGENIC_ROCKET_PROPELLANT_TECH_ID,
  MARS_PROPELLANT_ISRU_TECH_ID,
  ROCKET_PROPELLANT_GOOD_ID,
  drawMarsPropellantReserve,
  ensureMarsPropellantIsru,
  operateMarsPropellantIsru,
  produceRocketPropellant,
} from '../js/technology/rocketPropellant.js';
import { tickSpaceRace } from '../js/technology/spaceRace.js';

const capableIndustry = {
  precision_machining: 1,
};
const componentCapability = { engine: 1 };

assert.equal(TRADE_GOODS[ROCKET_PROPELLANT_GOOD_ID]?.strategic, true, 'rocket propellant should be an ordinary strategic trade good');

{
  const region = {
    stockpile: { petrol: 20, rocket_propellant: 0 },
    unlockedTechIds: new Set(['strategic_missile_systems']),
    industrialSupply: { capability: capableIndustry },
    industrialPlants: { componentCapability },
    structuralTransformation: { capability: { manufacture: 1 } },
    electricity: { industrialService: 1, exportableSurplus: 0 },
  };
  const result = produceRocketPropellant(region, 10, 7);
  assert(result.conventional > 9.99, 'refinery route should create launch propellant');
  assert(region.stockpile.petrol < 20, 'refinery route must consume real petroleum feedstock');
  assert(region.stockpile.rocket_propellant > 9.99, 'produced propellant must enter physical stock');
}

{
  const region = {
    stockpile: { petrol: 0, hydrogen: 20, rocket_propellant: 0 },
    unlockedTechIds: new Set(['water_electrolysis', CRYOGENIC_ROCKET_PROPELLANT_TECH_ID]),
    industrialSupply: { capability: capableIndustry },
    industrialPlants: { componentCapability },
    structuralTransformation: { capability: { manufacture: 1 } },
    electricity: { industrialService: 1, exportableSurplus: 10 },
  };
  const result = produceRocketPropellant(region, 10, 7);
  assert(result.cryogenic > 9.99, 'electric/cryogenic route should create launch propellant');
  assert(region.stockpile.hydrogen < 20, 'cryogenic route must consume hydrogen matter');
  assert(region.electricity.exportableSurplus < 10, 'cryogenic conditioning must consume spare grid electricity');
}

{
  const mars = { id: 'mars', crew: 6, powerCapacityKw: 500, powerDemandKw: 120 };
  const state = ensureMarsPropellantIsru(mars);
  state.waterIceDeposit = 0;
  const noFeedstock = operateMarsPropellantIsru(mars, { enabled: true, elapsedDays: 7 });
  assert.equal(noFeedstock.produced, 0, 'Mars power alone must never create propellant mass');
  assert.equal(state.rocketPropellantReserve, 0, 'reserve must remain empty without feedstock');

  state.waterIceDeposit = 30;
  const withFeedstock = operateMarsPropellantIsru(mars, { enabled: true, elapsedDays: 7 });
  assert(withFeedstock.produced > 0, 'Mars ISRU should produce propellant when power and water ice are both present');
  assert(state.waterIceDeposit < 30, 'Mars ISRU must consume finite water-ice feedstock');
  const before = state.rocketPropellantReserve;
  const drawn = drawMarsPropellantReserve(mars, before / 2);
  assert(drawn > 0 && state.rocketPropellantReserve < before, 'return/ascent operations must draw down the off-world reserve');
}

{
  const region = {
    id: 'launch-region', name: 'Launch Region', population: 5_000_000, treasury: 10_000,
    stockpile: { steel: 500, petrol: 0, rocket_propellant: 100 },
    unlockedTechIds: new Set(['strategic_missile_systems']),
    industrialSupply: { capability: capableIndustry },
    industrialPlants: { componentCapability },
    structuralTransformation: { capability: { manufacture: 1 } },
    electricity: { industrialService: 1, exportableSurplus: 0 },
  };
  tickSpaceRace([region], 1, () => 0.5, 7);
  assert(region.spaceProgramme.projects.first_rocket_space.propellantSpent > 0, 'space programme should spend rocket propellant');
  assert(region.stockpile.rocket_propellant < 100, 'launch progress must draw down rocket propellant stock');
  assert.equal(region.stockpile.petrol, 0, 'launch itself must not silently fall back to petrol');
}

assert.equal(MARS_PROPELLANT_ISRU_TECH_ID, 'mars_propellant_isru');
console.log('Rocket propellant and Mars ISRU regression passed.');
