import assert from 'node:assert/strict';
import { tickAgriculturalPests } from '../js/economy/agriculturalPests.js';
import { tickWeather } from '../js/world/weather.js';

function region(id,mix){return {id,centroid:[10,35],areaSqKm:1000,neighbors:[],recentTradePartners:new Set(),agriculturalLand:{cultivatedHa:18000},foodDiversity:{productionMix:mix},weather:{index:.7,yieldMultiplier:1,condition:'wet'},climate:{},report:{}};}
const mono=region('mono',{staple_grains:.82,pulses:.06,fruit_vegetables:.06,animal_foods:.06});
const diverse=region('diverse',{staple_grains:.28,pulses:.24,fruit_vegetables:.24,animal_foods:.24});
mono.agriculturalPests={outbreakSeverity:.72};diverse.agriculturalPests={outbreakSeverity:.72};
tickAgriculturalPests([mono,diverse],7,()=>1);
assert.ok(mono.agriculturalPests.monocultureRisk>diverse.agriculturalPests.monocultureRisk,'crop concentration should raise monoculture risk');
assert.ok(mono.agriculturalPests.yieldMultiplier<diverse.agriculturalPests.yieldMultiplier,'same outbreak should hurt a monoculture more');
assert.ok(mono.agriculturalPests.categoryYieldMultiplier.staple_grains<mono.agriculturalPests.categoryYieldMultiplier.animal_foods,'crop pests should hit the dominant crop basket more than animal foods');

const source=region('source',{staple_grains:.5,pulses:.2,fruit_vegetables:.2,animal_foods:.1});
const neighbour=region('neighbour',{staple_grains:.5,pulses:.2,fruit_vegetables:.2,animal_foods:.1});
source.agriculturalPests={outbreakSeverity:.8};source.neighbors=['neighbour'];neighbour.neighbors=['source'];
tickAgriculturalPests([source,neighbour],7,()=>1);
assert.ok(neighbour.agriculturalPests.externalExposure>.5,'nearby outbreaks should create strong exposure pressure');

const persistent=region('persistent',{staple_grains:.6,pulses:.15,fruit_vegetables:.15,animal_foods:.1});
persistent.agriculturalPests={outbreakSeverity:.75};
tickAgriculturalPests([persistent],90,()=>1);const afterQuarter=persistent.agriculturalPests.outbreakSeverity;
assert.ok(afterQuarter>.5,'bad outbreaks should persist across a season rather than vanish in one tick');
tickAgriculturalPests([persistent],365*5,()=>1);
assert.ok(persistent.agriculturalPests.outbreakSeverity<afterQuarter,'outbreaks should eventually recover without continued shocks');

const weatherRegion=region('weather',{staple_grains:.7,pulses:.1,fruit_vegetables:.1,animal_foods:.1});
weatherRegion.agriculturalPests={outbreakSeverity:.8};
tickWeather([weatherRegion],100,()=>.5,7);
assert.ok(weatherRegion.weather.pestYieldMultiplier<1,'weather tick should expose the pest yield penalty');
assert.ok(weatherRegion.weather.yieldMultiplier<weatherRegion.weather.weatherOnlyYieldMultiplier,'farm weather yield should include abnormal pest loss');
console.log('agricultural pest regression passed');
