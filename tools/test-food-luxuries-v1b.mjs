import assert from 'node:assert/strict';
import { applyFoodPreservation, commodityFamiliarity, commoditySuitability, recordCommodityTrade, tickFoodLuxuries } from '../js/economy/foodLuxuries.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';

function region(id, lon, lat, neighbours = []) {
  return { id, name:id, centroid:[lon,lat], neighbors:neighbours, population:20000, wallet:3000,
    landQuality:0.8, terrain:{hills:0.4,mountain:0.2}, stockpile:{salt:100,food:10000},
    marketDemand:{}, occupations:{general:10000} };
}
const source = region('southwest-india',76.5,10.5,['inland']);
const inland = region('inland',84,22,['southwest-india']);
const teaSource = region('south-china-highland',105,27);
const west = region('western-europe',2,48);

assert(commoditySuitability(source,'pepper')>0.5);
assert.equal(commoditySuitability(west,'pepper'),0);
assert(commoditySuitability(teaSource,'tea')>0.4);
assert.equal(commoditySuitability(source,'cloves'),0);

const saltBefore=source.stockpile.salt;
const preservation=applyFoodPreservation(source,20000,7);
assert(preservation.saltCoverage>0);
assert(preservation.spoilageMultiplier<0.92);
assert(source.stockpile.salt<saltBefore);
assert(source.marketDemand.salt>0);

const noSalt=region('no-salt',10,45); noSalt.stockpile.salt=0;
const basic=applyFoodPreservation(noSalt,20000,7);
assert.equal(basic.saltCoverage,0);
assert(basic.methods.includes('drying')&&basic.methods.includes('smoking'));
assert(basic.spoilageMultiplier<1);

tickFoodLuxuries([source,inland,teaSource,west],7);
assert((source.foodLuxuries?.production?.pepper||0)>0);
assert((teaSource.foodLuxuries?.production?.tea||0)>0);
assert.equal(west.foodLuxuries?.production?.pepper||0,0);
assert((source.occupations.luxuryProducer||0)>0);
assert(source.marketDemand.pepper>0);

const before=commodityFamiliarity(west,'pepper');
assert(recordCommodityTrade(source,west,'pepper',25));
assert(commodityFamiliarity(west,'pepper')>before);
for(const id of ['salt','pepper','cinnamon','tea','coffee','cloves','nutmeg']) assert(TRADE_GOODS[id],id);
console.log('food luxuries v1 regression: ok');
