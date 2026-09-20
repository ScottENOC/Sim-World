import assert from 'node:assert/strict';
import { DIET_FOOD_IDS, regionalFoodProductionMix, tickFoodDiversity } from '../js/economy/foodDiversity.js';
import { localPrice, TRADABLE_RESOURCES } from '../js/economy/prices.js';

function region(id,centroid,terrain){return {id,name:id,centroid,terrain,areaSqKm:1000,landQuality:1,isCoastal:false,population:10000,agriculturalLand:{cultivatedHa:6000},stockpile:{food:50000},marketDemand:{},report:{}};}
const plains=region('Plains',[10,45],{plains:.85,hills:.05,forest:.05,wetland:.05});
const warm=region('Warm Coast',[25,18],{plains:.3,hills:.2,forest:.2,wetland:.3});warm.isCoastal=true;
const a=regionalFoodProductionMix(plains),b=regionalFoodProductionMix(warm);
assert.ok(a.staple_grains>b.staple_grains,'broad temperate plains should specialise more heavily in staple grains');
assert.ok(b.fruit_vegetables>a.fruit_vegetables,'warm/wet regions should specialise more in produce');
assert.ok(DIET_FOOD_IDS.every(id=>TRADABLE_RESOURCES.includes(id)),'dietary food categories must be ordinary merchant trade opportunities');

tickFoodDiversity(plains,7);tickFoodDiversity(warm,7);
assert.ok((plains.stockpile.staple_grains||0)>(warm.stockpile.staple_grains||0),'grain-specialist should retain a larger grain surplus');
assert.ok((warm.stockpile.fruit_vegetables||0)>(plains.stockpile.fruit_vegetables||0),'produce-specialist should retain a larger produce surplus');
assert.ok(localPrice(warm,'staple_grains')>localPrice(plains,'staple_grains'),'grain should be worth more in the grain-poor region');
assert.ok(localPrice(plains,'fruit_vegetables')>localPrice(warm,'fruit_vegetables'),'produce should be worth more in the produce-poor region');

const mono=region('Mono',[10,45],{plains:1});mono.agriculturalLand.cultivatedHa=1000;mono.stockpile={food:50000,staple_grains:1000};tickFoodDiversity(mono,7);
assert.ok(plains.foodDiversity.diversityIndex>mono.foodDiversity.diversityIndex,'access to a broader diet should improve dietary diversity');
assert.ok(plains.foodDiversity.healthSupport>mono.foodDiversity.healthSupport,'dietary diversity should expose a modest positive health input');
console.log('food diversity regression passed');
