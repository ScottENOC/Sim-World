import assert from 'node:assert/strict';
import { ensureAgriculturalPests, pestYieldMultiplier, tickAgriculturalPests } from '../js/economy/agriculturalPests.js';
import { tickFoodDiversity } from '../js/economy/foodDiversity.js';

function region(id, mix) {
  return {
    id, centroid:[10,42], terrain:{plains:.7,hills:.1,forest:.1,wetland:.1}, landQuality:1,
    population:10000, agriculturalLand:{cultivatedHa:9000}, weather:{index:0,yieldMultiplier:1},
    climate:{temperatureAnomalyC:0}, neighbors:[], tradePartnerIds:[], recentTradePartners:new Map(),
    foodDiversity:{productionMix:{...mix}}, stockpile:{food:50000}, marketDemand:{}, report:{},
  };
}

const diverse=region('diverse',{staple_grains:.34,pulses:.28,fruit_vegetables:.25,animal_foods:.13});
const mono=region('mono',{staple_grains:.78,pulses:.08,fruit_vegetables:.06,animal_foods:.08});
ensureAgriculturalPests(diverse); ensureAgriculturalPests(mono);
assert.equal(pestYieldMultiplier(diverse),1,'ordinary baseline pest pressure must remain baked into historical yields');

tickAgriculturalPests([diverse,mono],365.2425,()=>0);
assert.ok(mono.agriculturalPests.monocultureRisk>diverse.agriculturalPests.monocultureRisk,'monoculture should create more ecological outbreak risk');
assert.ok(mono.agriculturalPests.extraYieldLoss.staple_grains>0,'forced outbreak should create an abnormal grain loss');
assert.ok(pestYieldMultiplier(mono)<1,'abnormal outbreaks should reduce generic farm yield');

const categoryVictim=region('category',{staple_grains:.75,pulses:.1,fruit_vegetables:.08,animal_foods:.07});
categoryVictim.agriculturalPests={extraYieldLoss:{staple_grains:.4,pulses:0,fruit_vegetables:0,animal_foods:0},yieldMultiplier:.7};
tickFoodDiversity(categoryVictim,7);
assert.ok(categoryVictim.foodDiversity.pestMultiplier.staple_grains<categoryVictim.foodDiversity.pestMultiplier.pulses,'crop-specific outbreaks should hit the affected dietary basket rather than all foods equally');

const source=region('source',{staple_grains:.65,pulses:.12,fruit_vegetables:.12,animal_foods:.11});
const target=region('target',{staple_grains:.5,pulses:.18,fruit_vegetables:.18,animal_foods:.14});
source.agriculturalPests=ensureAgriculturalPests(source);
source.agriculturalPests.pressure.staple_grains=.9;
target.recentTradePartners=new Map([['source',{lastTick:1}]]);
const before=ensureAgriculturalPests(target).pressure.staple_grains;
tickAgriculturalPests([source,target],365.2425,()=>1);
assert.ok(target.agriculturalPests.introductionRisk.staple_grains>0,'trade contact with an outbreak source should create pest-introduction risk');
assert.ok(target.agriculturalPests.pressure.staple_grains>before,'imported pest pressure should be able to spread along established trade contacts');

const recovering=region('recovering',{staple_grains:.4,pulses:.25,fruit_vegetables:.22,animal_foods:.13});
recovering.agriculturalPests=ensureAgriculturalPests(recovering);
recovering.agriculturalPests.pressure.staple_grains=.8;
const highLoss=recovering.agriculturalPests.pressure.staple_grains;
tickAgriculturalPests([recovering],365.2425,()=>1);
assert.ok(recovering.agriculturalPests.pressure.staple_grains<highLoss,'outbreak pressure should decay back toward its endemic baseline when conditions do not renew it');

console.log('agricultural pest regression passed');
