import assert from 'node:assert/strict';
import {
  CHEMICAL_PEST_CONTROL_TECH_ID,
  SYNTHETIC_PESTICIDES_TECH_ID,
  INTEGRATED_PEST_MANAGEMENT_TECH_ID,
  SELECTIVE_PESTICIDES_TECH_ID,
  tickAgriculturalPesticides,
  pesticideControlForCategory,
  pesticideBreakthroughChances,
} from '../js/economy/agriculturalPesticides.js';
import { PETROLEUM_CRACKING_TECH_ID } from '../js/technology/petroleum.js';

function region(extraTech=[]){
  return {
    id:'ipm-test',population:100000,
    unlockedTechIds:new Set([CHEMICAL_PEST_CONTROL_TECH_ID,SYNTHETIC_PESTICIDES_TECH_ID,PETROLEUM_CRACKING_TECH_ID,...extraTech]),
    agriculturalLand:{cultivatedHa:30000,availableArableHa:35000,cultivationShare:.86},
    agriculturalPests:{outbreakSeverity:{staple_grains:.65,pulses:.55,fruit_vegetables:.80},monocultureRisk:.35},
    foodDiversity:{productionMix:{staple_grains:.42,pulses:.23,fruit_vegetables:.35}},
    structuralTransformation:{capability:{manufacture:.78}},
    industrialSupply:{capability:{precision_machining:.70}},
    industrialPlants:{factoryCapacity:50},
    governance:{administrativeControl:.72},education:{literacyRate:.70},
    stockpile:{sulfur:500,copper:300,petrol:1200,pesticide:200,synthetic_pesticide:200,selective_pesticide:200},
    neighbors:[],tradePartnerIds:[],
  };
}

const conventional=region();
tickAgriculturalPesticides(conventional,365);
assert.ok(conventional.agriculturalPesticides.lastSyntheticApplied>0,'severe outbreaks should trigger broad-spectrum synthetic pesticide use');
assert.ok(conventional.agriculturalPesticides.toxicityPressure>0,'broad-spectrum synthetic use should create toxicity pressure');
const conventionalControl=pesticideControlForCategory(conventional,'fruit_vegetables');

const ipm=region([INTEGRATED_PEST_MANAGEMENT_TECH_ID]);
tickAgriculturalPesticides(ipm,365);
assert.ok(ipm.agriculturalPesticides.ipmEffectiveness>0,'IPM should establish a management-based control capability');
assert.ok(ipm.agriculturalPesticides.chemicalDemandReduction>.1,'IPM should reduce chemical treatment demand');
assert.ok(ipm.agriculturalPesticides.lastSyntheticApplied<conventional.agriculturalPesticides.lastSyntheticApplied,'IPM should reduce broad-spectrum chemical use');
assert.ok(pesticideControlForCategory(ipm,'fruit_vegetables')>.25,'IPM plus targeted treatment should still materially control a severe outbreak');

const selective=region([INTEGRATED_PEST_MANAGEMENT_TECH_ID,SELECTIVE_PESTICIDES_TECH_ID]);
tickAgriculturalPesticides(selective,365);
assert.ok(selective.agriculturalPesticides.lastSelectiveApplied>0,'selective chemistry should be preferred when available');
assert.ok(selective.agriculturalPesticides.lastSyntheticApplied<conventional.agriculturalPesticides.lastSyntheticApplied,'selective chemistry should displace broad-spectrum synthetic use at adoption');
assert.ok(selective.agriculturalPesticides.toxicityPressure<conventional.agriculturalPesticides.toxicityPressure,'selective chemistry should impose lower non-target toxicity');
assert.ok(pesticideControlForCategory(selective,'fruit_vegetables')>=Math.min(.55,conventionalControl),'selective chemistry plus IPM should retain strong outbreak control');
for(let i=0;i<3;i++)tickAgriculturalPesticides(selective,365);
assert.ok(selective.agriculturalPesticides.selectiveResistance<selective.agriculturalPesticides.syntheticResistance+.2,'selective pesticide resistance should accumulate more slowly than broad-spectrum resistance pressure');

const producer=region([INTEGRATED_PEST_MANAGEMENT_TECH_ID,SELECTIVE_PESTICIDES_TECH_ID]);
producer.stockpile.selective_pesticide=0;
const petrolBefore=producer.stockpile.petrol;
tickAgriculturalPesticides(producer,365);
assert.ok(producer.agriculturalPesticides.lastSelectiveProduced>0,'selective pesticides should be industrially produced rather than appearing for free');
assert.ok(producer.stockpile.petrol<petrolBefore,'selective pesticide manufacture should consume petrochemical feedstock');

const chances=pesticideBreakthroughChances(region([INTEGRATED_PEST_MANAGEMENT_TECH_ID]),new Map());
assert.ok(chances.selective>0,'industrial regions with IPM and synthetic pesticides should have a non-zero selective-pesticide breakthrough chance');

console.log('integrated pest management and selective pesticides regression: ok');
