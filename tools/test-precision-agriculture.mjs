import assert from 'node:assert/strict';
import { tickPrecisionAgriculture, setPrecisionAgriculturePolicy, precisionAgricultureCapability } from '../js/economy/precisionAgriculture.js';
import { regionalWaterDemand } from '../js/world/waterResources.js';
import { fertiliserAnnualDemand, tickAgriculturalFertiliser } from '../js/economy/agriculturalFertiliser.js';
import { tickAgriculturalPesticides } from '../js/economy/agriculturalPesticides.js';
import { electricityDemand } from '../js/economy/electricity.js';

function farm({digital=true}={}){
  const tech=new Set(['industrial_electrification','electrical_generation','synthetic_nitrogen_fertiliser','industrial_ammonia_synthesis','chemical_pest_control','synthetic_pesticides','integrated_pest_management','selective_pesticides','petroleum_cracking']);
  return {
    id:digital?'digital':'conventional',population:450000,centroid:[0,42],terrain:{plains:.75},weather:{yieldMultiplier:.72},climate:{rainfallMultiplier:.70,evaporationMultiplier:1.12},
    agriculturalLand:{cultivatedHa:180000,availableArableHa:210000,cultivationShare:.86,totalLandHa:300000},
    agriculturalMachinery:{tractorCoverage:.92,combineCoverage:.84},electricity:{industrialService:digital?.95:.05,generated:digital?800:0},
    computingIndustry:{capacity:{computer_assembly:digital?18:0},experience:{chip_design:digital?.65:0}},
    stockpile:{computers:digital?30:0,electronic_components:digital?80:0,fertiliser:1000,pesticide:1000,synthetic_pesticide:1000,selective_pesticide:1000,natural_gas:1000,coal:1000,sulfur:1000,copper:1000,petrol:1000},
    unlockedTechIds:tech,education:{literacyRate:.9},governance:{administrativeControl:.85},industrialPlants:{factoryCapacity:80},industrialSupply:{capability:{precision_machining:.75},inventory:{}},structuralTransformation:{capability:{manufacture:.8}},
    construction:{assets:[{typeId:'irrigation',condition:1},{typeId:'wells_cisterns',condition:1}]},settlements:{urbanShare:.4},hydrology:{riverIds:['r1'],report:{}},
    agriculturalPests:{outbreakSeverity:{staple_grains:.65,pulses:.55,fruit_vegetables:.62},monocultureRisk:.35},foodDiversity:{productionMix:{staple_grains:.5,pulses:.25,fruit_vegetables:.25}},report:{}
  };
}

const conventional=farm({digital:false});
const precision=farm({digital:true});
setPrecisionAgriculturePolicy(precision,{investment:1});
for(let y=0;y<15;y++)tickPrecisionAgriculture(precision,365.2425);
assert.ok(precisionAgricultureCapability(precision)>.55,'electrified mechanised digital farms should support strong precision capability');
assert.ok(precision.precisionAgriculture.adoption>.45,'precision agriculture should diffuse gradually with sustained investment');
assert.ok(precision.precisionAgriculture.irrigationDemandReduction>.10,'precision sensing should materially reduce irrigation demand');
assert.ok(precision.precisionAgriculture.fertiliserDemandReduction>.10,'variable-rate application should materially reduce fertiliser demand');
assert.ok(precision.precisionAgriculture.pesticideDemandReduction>.10,'targeted spraying should materially reduce pesticide demand');
assert.equal(precisionAgricultureCapability(conventional),0,'computers and machinery without reliable electrification should not create precision agriculture');

const conventionalWater=regionalWaterDemand(conventional).agriculture,precisionWater=regionalWaterDemand(precision).agriculture;
assert.ok(precisionWater<conventionalWater*.90,'precision irrigation should lower physical agricultural water demand');
assert.ok(fertiliserAnnualDemand(precision)<fertiliserAnnualDemand(conventional)*.90,'precision application should lower fertiliser required for equivalent coverage');

// Give both farms the same pest pressure and abundant chemicals; the precision
// farm should need less chemical while retaining treatment coverage.
tickAgriculturalPesticides(conventional,365.2425);
tickAgriculturalPesticides(precision,365.2425);
const conventionalApplied=conventional.agriculturalPesticides.lastApplied+conventional.agriculturalPesticides.lastSyntheticApplied+conventional.agriculturalPesticides.lastSelectiveApplied;
const precisionApplied=precision.agriculturalPesticides.lastApplied+precision.agriculturalPesticides.lastSyntheticApplied+precision.agriculturalPesticides.lastSelectiveApplied;
assert.ok(precisionApplied<conventionalApplied*.92,'targeted precision spraying should reduce chemical use');

// Fertiliser runoff should fall from both lower application requirements and
// better placement, not from a hidden yield penalty.
tickAgriculturalFertiliser(conventional,365.2425);
tickAgriculturalFertiliser(precision,365.2425);
assert.ok(precision.agriculturalFertiliser.nutrientRunoff<conventional.agriculturalFertiliser.nutrientRunoff,'precision placement should lower nutrient runoff');
assert.ok(precision.agriculturalFertiliser.yieldMultiplier>=conventional.agriculturalFertiliser.yieldMultiplier-.02,'input savings should preserve fertiliser yield response rather than simply under-applying');

const power=electricityDemand(precision,7);
assert.equal(power.precisionAgricultureDemand,precision.precisionAgriculture.electricityLoad,'precision agriculture electronics must create real grid demand');
console.log('precision agriculture regression passed');
