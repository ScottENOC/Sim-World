import assert from 'node:assert/strict';
import { tickAgriculturalPollinators, pollinatorCategoryYieldMultiplier, pollinatorAggregateYieldMultiplier } from '../js/economy/agriculturalPollinators.js';

function region(){return {
  id:'pollinator-test',areaSqKm:1000,population:10000,landQuality:1,
  terrain:{plains:.5,hills:.1,mountains:.05,forest:.25,wetland:.1},
  agriculturalLand:{totalLandHa:100000,availableArableHa:55000,cultivatedHa:30000,forestHa:25000,otherHa:39000,urbanHa:1000},
  foodDiversity:{productionMix:{staple_grains:.45,pulses:.20,fruit_vegetables:.25,animal_foods:.10}},
  agriculturalPesticides:{ecologicalPressure:0,toxicityPressure:0},weather:{index:0},climate:{temperatureAnomalyC:0},
};}

const healthy=region();
tickAgriculturalPollinators(healthy,365);
assert.ok(healthy.agriculturalPollinators.wildHealth>.65,'healthy mixed habitat should sustain pollinators');
assert.equal(pollinatorCategoryYieldMultiplier(healthy,'staple_grains')<=1,true);
assert.equal(pollinatorAggregateYieldMultiplier(healthy)<=1,true,'pollinators must not create yield above historical baseline');

const stressed=region();
stressed.agriculturalLand.forestHa=1000;stressed.agriculturalLand.otherHa=3000;stressed.agriculturalLand.cultivatedHa=54000;
stressed.foodDiversity.productionMix={staple_grains:.88,pulses:.05,fruit_vegetables:.05,animal_foods:.02};
stressed.agriculturalPesticides={ecologicalPressure:.45,toxicityPressure:.55};
for(let i=0;i<6;i++)tickAgriculturalPollinators(stressed,365);
assert.ok(stressed.agriculturalPollinators.wildHealth<healthy.agriculturalPollinators.wildHealth*.65,'habitat loss and pesticide toxicity should materially reduce wild pollinators');
const grain=pollinatorCategoryYieldMultiplier(stressed,'staple_grains');
const pulses=pollinatorCategoryYieldMultiplier(stressed,'pulses');
const produce=pollinatorCategoryYieldMultiplier(stressed,'fruit_vegetables');
assert.ok(produce<pulses&&pulses<grain,'pollinator-dependent produce should be hit harder than pulses and staple grains');
assert.ok(grain>.95,'staple grains should remain largely independent of animal pollination');
assert.ok(produce<.75,'severe pollinator decline should materially hurt dependent horticulture');
assert.ok(pollinatorAggregateYieldMultiplier(stressed)<1,'pollinator collapse should reduce aggregate farm yield according to crop mix');

const recovering=stressed;
recovering.agriculturalPesticides={ecologicalPressure:0,toxicityPressure:0};
recovering.agriculturalLand.forestHa=30000;recovering.agriculturalLand.otherHa=35000;recovering.agriculturalLand.cultivatedHa=22000;
recovering.foodDiversity.productionMix={staple_grains:.38,pulses:.25,fruit_vegetables:.27,animal_foods:.10};
const before=recovering.agriculturalPollinators.wildHealth;
for(let i=0;i<8;i++)tickAgriculturalPollinators(recovering,365);
assert.ok(recovering.agriculturalPollinators.wildHealth>before,'pollinator populations should recover when habitat and chemical stress improve');

console.log('agricultural pollinators regression: ok');
