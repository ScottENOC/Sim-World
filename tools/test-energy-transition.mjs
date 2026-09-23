import assert from 'node:assert/strict';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';
import {
  FUEL_ETHANOL_TECH_ID,
  HYDROGEN_POWER_TECH_ID,
  HYDROGEN_TRANSPORT_TECH_ID,
  WATER_ELECTROLYSIS_TECH_ID,
  blendE10,
  consumeHydrogenForPower,
  consumeTransportFuel,
  energyTransitionSummary,
  ensureEnergyTransition,
  hydrogenPowerPotential,
  produceHydrogenFromSurplus,
} from '../js/economy/energyTransition.js';
import { dispatchElectricityPortfolio } from '../js/economy/electricity.js';

function region(extra={}) {
  return {
    id:'test-region', name:'Test Region', population:1_000_000,
    unlockedTechIds:new Set(), stockpile:{steel:10000,copper:10000,hydrogen:0,staple_grains:1000,food:1000,petrol:0,diesel:0,aviation_fuel:0},
    treasury:10000, wallet:0, ...extra,
  };
}

assert.ok(TRADE_GOODS.hydrogen, 'hydrogen should register as a tradable good');
assert.equal(TRADE_GOODS.hydrogen.category, 'gaseous_fuel');

{
  const r=region();
  r.unlockedTechIds.add(WATER_ELECTROLYSIS_TECH_ID);
  const s=ensureEnergyTransition(r); s.assets.electrolysers=10; s.policy.electrolysisSurplusShare=1;
  const result=produceHydrogenFromSurplus(r,100,7);
  assert.ok(result.electricityInput>0&&result.electricityInput<=100, 'electrolysis must consume actual surplus electricity');
  assert.ok(result.storedEnergy<result.electricityInput, 'electrolysis must lose energy');
  assert.ok(r.stockpile.hydrogen>0, 'electrolysis should create stored hydrogen');
}

{
  const r=region({stockpile:{hydrogen:100,steel:0,copper:0}});
  r.unlockedTechIds.add(HYDROGEN_POWER_TECH_ID);
  ensureEnergyTransition(r).assets.hydrogenPower=10;
  const before=r.stockpile.hydrogen;
  const potential=hydrogenPowerPotential(r,7,before);
  assert.ok(potential.outputPotential>0, 'stored hydrogen should provide dispatchable power potential');
  consumeHydrogenForPower(r,potential.outputPotential,potential);
  assert.ok(r.stockpile.hydrogen<before, 'hydrogen generation must consume hydrogen stock');
  const summary=energyTransitionSummary(r);
  assert.ok(summary.hydrogenRoundTripEfficiency>0&&summary.hydrogenRoundTripEfficiency<0.5, 'hydrogen round trip must remain deliberately inefficient');
}

{
  const r=region();
  r.unlockedTechIds.add(FUEL_ETHANOL_TECH_ID);
  r.stockpile.petrol=90;
  const beforeGrain=r.stockpile.staple_grains;
  const result=blendE10(r,90);
  assert.ok(result.ethanolBlended>0, 'E10 should consume farm feedstock and extend petrol');
  assert.ok(result.ethanolBlended<=10.000001, '90 units of fossil petrol may receive at most 10 units ethanol for E10');
  assert.ok(r.stockpile.staple_grains<beforeGrain, 'E10 must consume real farm output');
  assert.equal(r.stockpile.petrol,90+result.ethanolBlended);
}

{
  const r=region({stockpile:{aviation_fuel:4,hydrogen:20}});
  r.unlockedTechIds.add(HYDROGEN_TRANSPORT_TECH_ID);
  ensureEnergyTransition(r).policy.transportHydrogenShare=.5;
  const beforeHydrogen=r.stockpile.hydrogen;
  const result=consumeTransportFuel(r,'aviation_fuel',6);
  assert.equal(result.fulfilled,6, 'hydrogen should be able to cover a transport fuel requirement');
  assert.ok(result.fossilUsed<6, 'hydrogen should displace fossil transport fuel');
  assert.ok(result.hydrogenUsed>0&&r.stockpile.hydrogen<beforeHydrogen, 'hydrogen substitution must consume expensive hydrogen stock');
}

{
  const fossilOnly=dispatchElectricityPortfolio({coal:10,solar:10,wind:0,offshoreWind:0,geothermal:0,nuclear:0,hydro:0,peaking:0},Infinity);
  const diversified=dispatchElectricityPortfolio({coal:10,solar:10,wind:0,offshoreWind:10,geothermal:10,nuclear:0,hydro:0,peaking:0},Infinity);
  assert.ok(diversified.grossPotential>fossilOnly.grossPotential, 'offshore wind and geothermal must contribute real grid generation');
  assert.ok(diversified.variableComplementarity>0, 'offshore wind should participate in renewable complementarity');
}

console.log('energy transition regression: ok');
