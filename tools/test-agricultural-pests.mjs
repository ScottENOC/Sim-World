import assert from 'node:assert/strict';
import { tickAgriculturalPests } from '../js/economy/agriculturalPests.js';
import { tickWeather } from '../js/world/weather.js';

function region(id,mix){return {id,centroid:[10,35],areaSqKm:1000,neighbors:[],recentTradePartners:new Set(),agriculturalLand:{cultivatedHa:18000},foodDiversity:{productionMix:mix},weather:{index:.7,yieldMultiplier:1,condition:'wet'},climate:{},marketDemand:{staple_grains:40,pulses:30,fruit_vegetables:30},tradeEconomy:{weeklyImportsByResource:{}},report:{}};}
const mono=region('mono',{staple_grains:.82,pulses:.06,fruit_vegetables:.06,animal_foods:.06});
const diverse=region('diverse',{staple_grains:.28,pulses:.24,fruit_vegetables:.24,animal_foods:.24});
mono.agriculturalPests={outbreakSeverity:.72};diverse.agriculturalPests={outbreakSeverity:.72};
tickAgriculturalPests([mono,diverse],7,()=>1);
assert.ok(mono.agriculturalPests.monocultureRisk>diverse.agriculturalPests.monocultureRisk);
assert.ok(mono.agriculturalPests.yieldMultiplier<diverse.agriculturalPests.yieldMultiplier);
assert.ok(mono.agriculturalPests.categoryYieldMultiplier.staple_grains<mono.agriculturalPests.categoryYieldMultiplier.animal_foods);

const source=region('source',{staple_grains:.5,pulses:.2,fruit_vegetables:.2,animal_foods:.1});
const neighbour=region('neighbour',{staple_grains:.5,pulses:.2,fruit_vegetables:.2,animal_foods:.1});
source.agriculturalPests={outbreakSeverity:.8};source.neighbors=['neighbour'];neighbour.neighbors=['source'];
tickAgriculturalPests([source,neighbour],7,()=>1);
assert.ok(neighbour.agriculturalPests.externalExposure>.4,'nearby outbreaks should spread risk');

const traded=region('traded',{staple_grains:.4,pulses:.2,fruit_vegetables:.2,animal_foods:.2});
traded.tradeEconomy.weeklyImportsByResource={staple_grains:500,pulses:200,fruit_vegetables:300};traded.recentTradePartners=new Set(['a','b','c','d']);
tickAgriculturalPests(traded,30,()=>1);
assert.ok(traded.agriculturalPests.externalExposure>.15,'food trade should create introduction pressure');

const persistent=region('persistent',{staple_grains:.6,pulses:.15,fruit_vegetables:.15,animal_foods:.1});
persistent.agriculturalPests={outbreakSeverity:.75};
tickAgriculturalPests(persistent,90,()=>1);const afterQuarter=persistent.agriculturalPests.outbreakSeverity;
assert.ok(afterQuarter>.5);tickAgriculturalPests(persistent,365*5,()=>1);assert.ok(persistent.agriculturalPests.outbreakSeverity<afterQuarter);

const weatherRegion=region('weather',{staple_grains:.7,pulses:.1,fruit_vegetables:.1,animal_foods:.1});
weatherRegion.agriculturalPests={outbreakSeverity:.8};
tickWeather([weatherRegion],100,()=>.5,7);
assert.ok(weatherRegion.weather.pestYieldMultiplier<1);
assert.ok(weatherRegion.weather.yieldMultiplier<weatherRegion.weather.weatherOnlyYieldMultiplier);
console.log('agricultural pest regression passed');
