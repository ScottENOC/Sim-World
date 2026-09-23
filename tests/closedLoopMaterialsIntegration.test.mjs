import assert from 'node:assert/strict';
import { electricityDemand } from '../js/economy/electricity.js?v=20260923-closed-loop1';
import { ensureCircularEconomy, tickCircularEconomy } from '../js/economy/circularEconomy.js?v=20260923-closed-loop1';

function region() {
  return {
    id: 'closed-loop-integration', name: 'Closed Loop Integration', population: 1_000_000,
    stockpile: { copper: 0, tin: 0, iron: 0, steel: 0 },
    unlockedTechIds: new Set(['advanced_factories','industrial_electrification']),
    structuralTransformation: { capability: { manufacture: .9 } },
    massEducation: { literacy: .9 },
    electricity: { industrialService: .9 },
    industrialSupply: { capability: {} }, corporateCapital: { firms: [] },
    deposits: { ironOre: { tiers: [{ initialStock: 1000, remainingStock: 100 }] } },
    construction: { assets: [{ id: 'water-plant-1', typeId: 'water_treatment_plant', scale: 1, condition: 1 }] },
    report: {},
  };
}

{
  const r = region();
  tickCircularEconomy(r, 7);
  const before = r.circularEconomy.inUse.steel;
  r.construction.assets[0].condition = .5;
  tickCircularEconomy(r, 7);
  assert(r.circularEconomy.inUse.steel < before, 'damage should retire embodied infrastructure steel from the in-use stock');
  assert(r.circularEconomy.scrap.steel + r.circularEconomy.landfill.steel > 0, 'damaged infrastructure metal should become salvage or recoverable legacy waste');
}

{
  const r = region();
  const s = ensureCircularEconomy(r);
  s.electricityLoad = 42;
  const demand = electricityDemand(r, 7);
  assert.equal(demand.circularEconomyDemand, 42, 'recycling and urban mining should appear as explicit industrial electricity demand');
  assert(demand.industrialDemand >= 42, 'circular-economy processing must compete for real grid capacity');
}

console.log('closed-loop material integration regressions passed');
