import assert from 'node:assert/strict';
import { CHEMICAL_PEST_CONTROL_TECH_ID, SYNTHETIC_PESTICIDES_TECH_ID, ensureAgriculturalPesticides, tickAgriculturalPesticides, pesticideBreakthroughChances } from '../js/economy/agriculturalPesticides.js';
import { PETROLEUM_CRACKING_TECH_ID } from '../js/technology/petroleum.js';

function region(){return {id:'r',population:100000,unlockedTechIds:new Set([CHEMICAL_PEST_CONTROL_TECH_ID,SYNTHETIC_PESTICIDES_TECH_ID,PETROLEUM_CRACKING_TECH_ID]),agriculturalLand:{cultivatedHa:15000},agriculturalPests:{outbreakSeverity:{staple_grains:.8,pulses:.45,fruit_vegetables:.65},monocultureRisk:.55},foodDiversity:{productionMix:{staple_grains:.55,pulses:.15,fruit_vegetables:.2,animal_foods:.1}},structuralTransformation:{capability:{manufacture:.8}},industrialSupply:{capability:{precision_machining:.7}},industrialPlants:{factoryCapacity:70},stockpile:{petrol:1000,sulfur:1000,copper:1000,pesticide:1000,synthetic_pesticide:0},neighbors:[],tradePartnerIds:[],report:{}};}

const r=region();
const beforePetrol=r.stockpile.petrol;
tickAgriculturalPesticides(r,365);
const s=ensureAgriculturalPesticides(r);
assert.ok(s.lastSyntheticProduced>0,'synthetic pesticide should be produced');
assert.ok(r.stockpile.petrol<beforePetrol,'synthetic pesticide manufacture should consume petroleum feedstock');
assert.ok(s.lastSyntheticApplied>0,'synthetic pesticide should be used during a severe outbreak');
assert.ok(s.controlByCategory.staple_grains>.3,'synthetic pesticide should provide strong crop protection');
assert.ok(s.syntheticResistance>0,'synthetic pesticide use should select for resistance');
assert.ok(s.residueLoad>0&&s.toxicityPressure>0,'synthetic pesticide use should create persistent ecological/toxicity pressure');

const weak=region();weak.unlockedTechIds.delete(SYNTHETIC_PESTICIDES_TECH_ID);tickAgriculturalPesticides(weak,365);const mineral=ensureAgriculturalPesticides(weak).controlByCategory.staple_grains;
assert.ok(s.controlByCategory.staple_grains>mineral,'synthetic pesticides should suppress severe outbreaks more strongly than first-generation mineral treatments');

const noCracking=region();noCracking.unlockedTechIds.delete(PETROLEUM_CRACKING_TECH_ID);tickAgriculturalPesticides(noCracking,365);assert.equal(ensureAgriculturalPesticides(noCracking).lastSyntheticProduced,0,'petroleum cracking should gate synthetic pesticide production');

const discovery=region();discovery.unlockedTechIds.delete(SYNTHETIC_PESTICIDES_TECH_ID);ensureAgriculturalPesticides(discovery).resistance=.75;const chances=pesticideBreakthroughChances(discovery,new Map([[discovery.id,discovery]]));assert.ok(chances.synthetic>0,'industrial petrochemical regions facing resistance should be able to discover synthetic pesticides');

console.log('synthetic pesticide regression passed');
