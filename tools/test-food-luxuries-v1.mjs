import assert from 'node:assert/strict';
import { applyFoodPreservation, commodityFamiliarity, commoditySuitability, recordCommodityTrade, tickFoodLuxuries } from '../js/economy/foodLuxuries.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';

function region(id, lon, lat, neighbours = []) {
  return {
    id, name: id, centroid: [lon, lat], neighbors: neighbours,
    population: 20000, wallet: 3000, landQuality: 0.8,
    terrain: { hills: 0.4, mountain: 0.2 },
    stockpile: { salt: 100, food: 10000 }, marketDemand: {},
    occupations: { general: 10000 },
  };
}

const kerala = region('west-coast-india', 76.5, 10.5, ['inland']);
const inland = region('inland', 84, 22, ['west-coast-india']);
const southChina = region('south-china-highland', 105, 27);
const europe = region('western-europe', 2, 48);

assert(commoditySuitability(kerala, 'pepper') > 0.5, 'pepper should have a strong geographic source in southwest India');
assert.equal(commoditySuitability(europe, 'pepper'), 0, 'pepper should not be producible everywhere');
assert(commoditySuitability(southChina, 'tea') > 0.4, 'tea should have an East Asian geographic source');
assert.equal(commoditySuitability(kerala, 'cloves'), 0, 'clove geography should remain distinct from India');

const preSalt = kerala.stockpile.salt;
const preservation = applyFoodPreservation(kerala, 20000, 7);
assert(preservation.saltCoverage > 0, 'available salt should support food preservation');
assert(preservation.spoilageMultiplier < 0.92, 'salting should reduce storage spoilage');
assert(kerala.stockpile.salt < preSalt, 'food preservation should consume salt');
assert(kerala.marketDemand.salt > 0, 'preservation should create salt demand');

const noSalt = region('no-salt', 10, 45);
noSalt.stockpile.salt = 0;
const basicPreservation = applyFoodPreservation(noSalt, 20000, 7);
assert.equal(basicPreservation.saltCoverage, 0);
assert(basicPreservation.methods.includes('drying') && basicPreservation.methods.includes('smoking'),
  'non-salt preservation should still exist');
assert(basicPreservation.spoilageMultiplier < 1, 'ordinary preservation should help without requiring a magic resource gate');

tickFoodLuxuries([kerala, inland, southChina, europe], 7);
assert((kerala.foodLuxuries?.production?.pepper || 0) > 0, 'suitable regions should produce luxury crops');
assert((southChina.foodLuxuries?.production?.tea || 0) > 0, 'tea source regions should produce tea');
assert.equal(europe.stockpile.pepper || 0, 0, 'unsuitable regions should not spontaneously produce pepper');
assert((kerala.occupations.luxuryProducer || 0) > 0, 'luxury production should use real labour');
assert(kerala.marketDemand.pepper > 0, 'familiar producer cultures should demand their commodity');

const familiarityBefore = commodityFamiliarity(europe, 'pepper');
assert(recordCommodityTrade(kerala, europe, 'pepper', 25), 'successful spice cargo should count as cultural exposure');
const familiarityAfter = commodityFamiliarity(europe, 'pepper');
assert(familiarityAfter > familiarityBefore, 'successful trade should increase destination familiarity');

for (const id of ['salt','pepper','cinnamon','tea','coffee','cloves','nutmeg']) {
  assert(TRADE_GOODS[id], `${id} must be a merchant trade good`);
}

console.log('food luxuries v1 regression: ok');
