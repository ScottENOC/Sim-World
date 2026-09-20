import assert from 'node:assert/strict';
import { ensureAgriculturalLand } from '../js/economy/agriculturalLand.js';
import { agriculturalWaterProfile } from '../js/economy/agriculturalWater.js';
import { electricityDemand } from '../js/economy/electricity.js';
import {
  INDUSTRIAL_AMMONIA_TECH_ID,SYNTHETIC_FERTILISER_TECH_ID,
  agriculturalChemistryBreakthroughChances,ensureAgriculturalFertiliser,
  fertiliserAnnualDemand,tickAgriculturalFertiliser,
} from '../js/economy/agriculturalFertiliser.js';

function region(){return {
  id:'fert-test',name:'Fertiliser Test',areaSqKm:200,landQuality:1,
  terrain:{plains:.8,hills:.1,mountains:.02,forest:.06,wetland:.02},forest:{currentStock:10,K:20},
  population:10000,occupations:{farmer:1500},demographics:{workingAge:5500},urbanisation:{urbanShare:.08},
  unlockedTechIds:new Set(['industrial_electrification',INDUSTRIAL_AMMONIA_TECH_ID,SYNTHETIC_FERTILISER_TECH_ID]),
  agriculturalLand:{availableArableHa:10000,cultivatedHa:8000,cultivationShare:.8},
  structuralTransformation:{capability:{manufacture:.75}},industrialSupply:{capability:{precision_machining:.72},inventory:{}},
  industrialPlants:{factoryCapacity:80,componentCapability:{},productExperience:{},lines:[]},electricity:{industrialService:.9},
  stockpile:{natural_gas:500,coal:500,ammonia:0,fertiliser:0},hydrology:{report:{}},weather:{yieldMultiplier:1.05},report:{},
};}

const r=region();
assert.equal(fertiliserAnnualDemand(r),80,'fertiliser demand should scale from cultivated hectares');
const beforeGas=r.stockpile.natural_gas;
tickAgriculturalFertiliser(r,365.2425);
assert.ok(r.agriculturalFertiliser.lastAmmoniaProduced>0,'industrial ammonia should be produced');
assert.ok(r.agriculturalFertiliser.lastFertiliserProduced>0,'ammonia should be converted into fertiliser');
assert.ok(r.stockpile.natural_gas<beforeGas,'natural gas should be consumed as preferred hydrogen/feedstock source');
assert.equal(r.agriculturalFertiliser.feedstockCoal,0,'gas availability should avoid coal fallback');
assert.ok(r.agriculturalFertiliser.yieldMultiplier>1.3,'applied nitrogen should materially raise biological yield');
assert.ok(r.agriculturalFertiliser.yieldMultiplier<1.7,'fertiliser yield response should remain bounded');
assert.ok(r.agriculturalFertiliser.nutrientRunoff>0,'fertiliser application should create nutrient runoff');
assert.ok(r.hydrology.report.agriculturalWaterQualityPenalty>0,'runoff should create a persistent water-quality consequence');

const noFert=region();noFert.unlockedTechIds=new Set();noFert.agriculturalFertiliser={yieldMultiplier:1};
const base=agriculturalWaterProfile(noFert,{weatherMultiplier:1});
const fertilised=agriculturalWaterProfile(r,{weatherMultiplier:1});
assert.ok(fertilised.fertiliserMultiplier>1,'fertiliser should enter the per-hectare yield channel');
assert.ok(fertilised.yieldMultiplier>base.yieldMultiplier,'fertilised land should have higher attainable yield');

const coal=region();coal.stockpile.natural_gas=0;const coalBefore=coal.stockpile.coal;
tickAgriculturalFertiliser(coal,365.2425);
assert.ok(coal.agriculturalFertiliser.feedstockCoal>0,'coal should provide a less efficient fallback feedstock');
assert.ok(coal.stockpile.coal<coalBefore,'coal fallback must consume real coal');

const noPower=region();noPower.electricity.industrialService=0;
tickAgriculturalFertiliser(noPower,365.2425);
assert.ok(noPower.agriculturalFertiliser.lastAmmoniaProduced<r.agriculturalFertiliser.lastAmmoniaProduced*.5,'weak electricity service should strongly constrain ammonia output');

const demandRegion=region();ensureAgriculturalFertiliser(demandRegion);demandRegion.agriculturalFertiliser.electricityLoad=4.5;
assert.ok(electricityDemand(demandRegion,7).fertiliserDemand===4.5,'chemical production load should appear in industrial electricity demand');

const candidate=region();candidate.unlockedTechIds=new Set(['industrial_electrification']);candidate.agriculturalFertiliser={ammoniaExperience:.3};
const c=agriculturalChemistryBreakthroughChances(candidate,new Map([[candidate.id,candidate]]));
assert.ok(c.ammonia>0,'an electrified industrial farming region should have an emergent ammonia breakthrough chance');
assert.equal(c.fertiliser,0,'mass synthetic fertiliser should require industrial ammonia first');

ensureAgriculturalLand(r);
assert.ok(r.agriculturalLand.availableArableHa<=r.agriculturalLand.potentiallyArableHa,'fertiliser must not create additional arable land');
console.log('synthetic fertiliser regression passed');
