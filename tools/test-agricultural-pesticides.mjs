import assert from 'node:assert/strict';
import { CHEMICAL_PEST_CONTROL_TECH_ID, ensureAgriculturalPesticides, pesticideBreakthroughChance, tickAgriculturalPesticides } from '../js/economy/agriculturalPesticides.js';
import { ensureAgriculturalPests, tickAgriculturalPests } from '../js/economy/agriculturalPests.js';

function region(id='r'){
  return {
    id,name:id,centroid:[10,35],neighbors:[],tradePartnerIds:[],recentTradePartners:new Map(),areaSqKm:1000,
    population:10000,stockpile:{sulfur:500,copper:300,pesticide:0},unlockedTechIds:new Set(),
    agriculturalLand:{cultivatedHa:15000,availableArableHa:18000,cultivationShare:.83},
    foodDiversity:{productionMix:{staple_grains:.62,pulses:.18,fruit_vegetables:.12,animal_foods:.08}},
    industrialPlants:{factoryCapacity:80},industrialSupply:{capability:{precision_machining:.55}},
    structuralTransformation:{capability:{manufacture:.65}},weather:{index:.5},climate:{temperatureAnomalyC:0},report:{}
  };
}

const locked=region('locked');
ensureAgriculturalPests(locked).outbreakSeverity.staple_grains=.8;
const sulfurBefore=locked.stockpile.sulfur;
tickAgriculturalPesticides(locked,365);
assert.equal(locked.stockpile.pesticide,0,'pesticide must not be produced before the breakthrough');
assert.equal(locked.stockpile.sulfur,sulfurBefore,'locked regions must not consume pesticide inputs');

const treated=region('treated');
treated.unlockedTechIds.add(CHEMICAL_PEST_CONTROL_TECH_ID);
const ps=ensureAgriculturalPests(treated);
ps.pressure.staple_grains=.82;ps.outbreakSeverity.staple_grains=.78;
ps.pressure.pulses=.42;ps.outbreakSeverity.pulses=.35;
ps.pressure.fruit_vegetables=.55;ps.outbreakSeverity.fruit_vegetables=.45;
const sulfur0=treated.stockpile.sulfur,copper0=treated.stockpile.copper;
tickAgriculturalPesticides(treated,365);
assert.ok(treated.agriculturalPesticides.lastProduced>0,'unlocked industrial regions should produce crop-protection chemicals');
assert.ok(treated.agriculturalPesticides.lastApplied>0,'active outbreaks should trigger application');
assert.ok(treated.stockpile.sulfur<sulfur0&&treated.stockpile.copper<copper0,'production should consume sulfur and copper');
assert.ok(treated.agriculturalPesticides.controlByCategory.staple_grains>0,'treatment should create crop-specific control');

const untreated=region('untreated');
const ups=ensureAgriculturalPests(untreated);
ups.pressure.staple_grains=.82;ups.outbreakSeverity.staple_grains=.78;
ups.pressure.pulses=.42;ups.outbreakSeverity.pulses=.35;
ups.pressure.fruit_vegetables=.55;ups.outbreakSeverity.fruit_vegetables=.45;
// Prevent new random outbreaks so the comparison isolates suppression of an existing one.
tickAgriculturalPests([treated],7,()=>1);
tickAgriculturalPests([untreated],7,()=>1);
assert.ok(treated.agriculturalPests.extraYieldLoss.staple_grains<untreated.agriculturalPests.extraYieldLoss.staple_grains,'pesticide treatment should reduce abnormal crop loss');
assert.ok(treated.agriculturalPests.yieldMultiplier>untreated.agriculturalPests.yieldMultiplier,'effective treatment should preserve realised food yield');

const normal=region('normal');
normal.unlockedTechIds.add(CHEMICAL_PEST_CONTROL_TECH_ID);
tickAgriculturalPesticides(normal,30);
tickAgriculturalPests([normal],7,()=>1);
assert.ok(normal.agriculturalPests.yieldMultiplier>.995,'pesticides must not create a yield bonus in a normal pest year');

const resistance=region('resistance');
resistance.unlockedTechIds.add(CHEMICAL_PEST_CONTROL_TECH_ID);
const rs=ensureAgriculturalPests(resistance);
rs.outbreakSeverity.staple_grains=.9;rs.pressure.staple_grains=.9;
for(let i=0;i<8;i++){resistance.stockpile.pesticide+=100;tickAgriculturalPesticides(resistance,180);}
assert.ok(resistance.agriculturalPesticides.resistance>.08,'repeated treatment should build resistance');
assert.ok(resistance.agriculturalPesticides.residueLoad>0,'application should leave persistent environmental residues');

const discovery=region('discovery');
ensureAgriculturalPests(discovery).outbreakSeverity.staple_grains=.9;
const chance=pesticideBreakthroughChance(discovery,new Map([[discovery.id,discovery]]));
assert.ok(chance>0,'industrial regions with mineral inputs and pest pressure should have a non-zero discovery chance');

console.log('agricultural pesticide regression passed');
