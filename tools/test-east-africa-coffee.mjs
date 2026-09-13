import assert from 'node:assert/strict';
import {
  coffeePractice, commoditySuitability, nativeCoffeeSuitability,
  recordCommodityTrade, tickCoffeeEmergence, tickFoodLuxuries,
} from '../js/economy/foodLuxuries.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';

function region(id, lon, lat, specialResources = {}) {
  return {
    id, name: id, centroid: [lon, lat], neighbors: [], population: 30000,
    wallet: 5000, landQuality: 0.9, specialResources,
    terrain: { hills: 0.7, mountain: 0.45 },
    stockpile: {}, marketDemand: {}, occupations: { general: 15000 },
    recentTradePartners: new Map(),
  };
}

const kaffa = region('kaffa', 36.2, 7.1, { coffeeEcology: 1.5 });
const yemen = region('yemen-highlands', 44.1, 15.2);
const europe = region('europe', 2, 48);

assert(nativeCoffeeSuitability(kaffa) > 0.7, 'southwestern Ethiopian ecology should be a strong native coffee source');
assert(commoditySuitability(yemen, 'coffee') > 0.35, 'Yemeni highlands should support transferred cultivation');
assert.equal(commoditySuitability(europe, 'coffee'), 0, 'coffee should not be cultivable everywhere');

// Ecology is not the commodity: there is no coffee production before the
// beverage/processing practice emerges.
tickFoodLuxuries([kaffa], 365, { simulationYear: 700, rng: () => 0 });
assert.equal(kaffa.foodLuxuries.production.coffee, 0, 'native ecology must not auto-produce coffee in antiquity');
assert.equal(coffeePractice(kaffa).stage, 'unknown');

// Force the stochastic draw low to test the valid emergence path.
tickCoffeeEmergence([kaffa], 1300, 365, () => 0);
assert.notEqual(coffeePractice(kaffa).stage, 'unknown', 'coffee practice should be able to emerge in its native ecology');
tickFoodLuxuries([kaffa], 30, { simulationYear: 1300, rng: () => 1 });
assert(kaffa.foodLuxuries.production.coffee > 0, 'known coffee practice should support production');

// Cargo exposure can carry the practice to another physically suitable highland.
assert(recordCommodityTrade(kaffa, yemen, 'coffee', 20));
assert(coffeePractice(yemen).exposed, 'delivered coffee should expose the destination culture');
tickCoffeeEmergence([kaffa, yemen], 1450, 365, () => 0);
assert.equal(coffeePractice(yemen).stage, 'cultivated', 'exposed suitable highlands should be able to adopt cultivation');

assert(TRADE_GOODS.coffee, 'coffee must be an ordinary high-value merchant cargo after it exists');
console.log('east africa coffee regression: ok');
