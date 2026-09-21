import assert from 'node:assert/strict';
import { tickAgriculturalPests } from '../js/economy/agriculturalPests.js';
import { ensureFoodDiversity, tickFoodDiversity } from '../js/economy/foodDiversity.js';

function region(id){return {id,centroid:[10,35],areaSqKm:1000,landQuality:1,population:10000,weather:{index:0,condition:'normal'},climate:{temperatureAnomalyC:0},agriculturalLand:{cultivatedHa:20000},stockpile:{food:50000},marketDemand:{},tradeEconomy:{weeklyImportsByResource:{}},recentTradePartners:new Set(),report:{}};}

const diversified=region('diverse');
diversified.foodDiversity={productionMix:{staple_grains:.28,pulses:.24,fruit_vegetables:.24,animal_foods:.24},availability:{},consumption:{},shortage:{}};
const mono=region('mono');
mono.foodDiversity={productionMix:{staple_grains:.72,pulses:.08,fruit_vegetables:.08,animal_foods:.12},availability:{},consumption:{},shortage:{}};
tickAgriculturalPests(diversified,365,()=>0);
tickAgriculturalPests(mono,365,()=>0);
assert.ok(mono.agriculturalPests.monocultureRisk>diversified.agriculturalPests.monocultureRisk,'monoculture must increase pest risk');
assert.ok(mono.agriculturalPests.outbreakSeverity>=diversified.agriculturalPests.outbreakSeverity,'monoculture should not make a forced outbreak milder');
assert.ok(mono.agriculturalPests.yieldMultiplier<diversified.agriculturalPests.yieldMultiplier,'monoculture should suffer greater abnormal yield loss');

const traded=region('traded');
traded.foodDiversity={productionMix:{staple_grains:.35,pulses:.25,fruit_vegetables:.2,animal_foods:.2},availability:{},consumption:{},shortage:{}};
traded.marketDemand={staple_grains:50,pulses:30,fruit_vegetables:30};
traded.tradeEconomy.weeklyImportsByResource={staple_grains:500,pulses:200,fruit_vegetables:300};
traded.recentTradePartners=new Set(['a','b','c','d']);
tickAgriculturalPests(traded,30,()=>1);
assert.ok(traded.agriculturalPests.externalExposure>.25,'food imports and trade partners should create pest-introduction exposure');

const wet=region('wet');
wet.weather.index=1.4;
wet.foodDiversity={productionMix:{staple_grains:.35,pulses:.25,fruit_vegetables:.25,animal_foods:.15},availability:{},consumption:{},shortage:{}};
tickAgriculturalPests(wet,30,()=>1);
assert.ok(wet.agriculturalPests.weatherRisk>0.4,'warm wet weather should materially raise pest/disease risk');

const harvest=region('harvest');
ensureFoodDiversity(harvest);
harvest.agriculturalPests={baselinePressure:.18,currentPressure:.7,outbreakSeverity:.75,cropDiseasePressure:.5,pestDiversity:.4,yieldMultiplier:.7,categoryYieldMultiplier:{}};
tickFoodDiversity(harvest,7,()=>1);
assert.ok(harvest.agriculturalPests.yieldMultiplier<1,'an existing outbreak should persist into the next harvest');
assert.ok(harvest.agriculturalPests.categoryYieldMultiplier.staple_grains<1,'outbreaks should reduce staple output');
assert.ok(harvest.agriculturalPests.categoryYieldMultiplier.fruit_vegetables<1,'outbreaks should reduce horticultural output');

const normal=region('normal');
ensureFoodDiversity(normal);
tickAgriculturalPests(normal,7,()=>1);
assert.ok(normal.agriculturalPests.yieldMultiplier>0.99,'ordinary baseline pest pressure should remain baked into baseline yield');
console.log('agricultural pest regression passed');
