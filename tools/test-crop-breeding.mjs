import assert from 'node:assert/strict';
import { ensureAgriculturalGenetics } from '../js/economy/agriculturalGenetics.js';
import { breedingClimateRelief, breedingPestProtection, breedingYieldMultiplier, cropBreedingCapability, ensureCropBreeding, setCropBreedingPolicy, tickCropBreeding } from '../js/economy/cropBreeding.js';

function region({literacy=.75,admin=.7,rain=.55,heat=2.5,latitude=52}={}){
  return {id:'r',name:'Region',population:800000,centroid:[0,latitude],climate:{rainfallMultiplier:rain,evaporationMultiplier:1.25,temperatureAnomalyC:heat},publicEducation:{literacy},governance:{administrativeControl:admin},unlockedTechIds:new Set(['writing','mathematics','printing']),construction:{assets:[{typeId:'public_granary',condition:1}]},electricity:{householdService:.7,industrialService:.7},report:{}};
}

const yieldRegion=region();
const genetics=ensureAgriculturalGenetics(yieldRegion);
const initialLive=genetics.liveDiversity.staple_grains;
const initialPreserved=genetics.preservedDiversity.staple_grains;
setCropBreedingPolicy(yieldRegion,{selectionIntensity:.9,focus:{yield:.82,pestResistance:.06,droughtTolerance:.05,heatTolerance:.04,shortSeason:.03}});
for(let y=0;y<80;y++)tickCropBreeding(yieldRegion,365.2425);
const bred=ensureCropBreeding(yieldRegion);
assert.ok(bred.traits.staple_grains.yield>.18,'sustained directional selection should materially improve crop yield traits');
assert.ok(breedingYieldMultiplier(yieldRegion,'staple_grains')>1.025,'yield-focused breeding should increase realised crop productivity');
assert.ok(genetics.liveDiversity.staple_grains<initialLive-.08,'aggressive directional selection should narrow living crop diversity over generations');
assert.equal(genetics.preservedDiversity.staple_grains,initialPreserved,'field selection should not erase germplasm already preserved in seed stores');

const gentle=region();const gentleGenetics=ensureAgriculturalGenetics(gentle);const gentleStart=gentleGenetics.liveDiversity.staple_grains;setCropBreedingPolicy(gentle,{selectionIntensity:.15,focus:{yield:.3,pestResistance:.25,droughtTolerance:.2,heatTolerance:.15,shortSeason:.1}});for(let y=0;y<80;y++)tickCropBreeding(gentle,365.2425);assert.ok(gentleGenetics.liveDiversity.staple_grains>genetics.liveDiversity.staple_grains+.04,'low-intensity diversified selection should retain more living diversity than aggressive narrow breeding');assert.ok(gentleGenetics.liveDiversity.staple_grains<gentleStart,'even traditional selection should exert some directional pressure');

const pestRegion=region();setCropBreedingPolicy(pestRegion,{selectionIntensity:1,focus:{pestResistance:1}});for(let y=0;y<100;y++)tickCropBreeding(pestRegion,365.2425);assert.ok(breedingPestProtection(pestRegion,'staple_grains')>.035,'pest-focused breeding should create meaningful inherited resistance');

const climateRegion=region({rain:.35,heat:3.5});setCropBreedingPolicy(climateRegion,{selectionIntensity:1,focus:{droughtTolerance:.55,heatTolerance:.45}});for(let y=0;y<100;y++)tickCropBreeding(climateRegion,365.2425);assert.ok(breedingClimateRelief(climateRegion,'staple_grains')>.025,'drought and heat selection should buffer severe climate stress');
assert.equal(breedingYieldMultiplier(climateRegion,'animal_foods'),1,'crop breeding must not create livestock yield bonuses');assert.equal(breedingPestProtection(climateRegion,'animal_foods'),0,'crop breeding must not create livestock pest resistance');

const lowKnowledge=region({literacy:.05,admin:.2});lowKnowledge.unlockedTechIds=new Set();ensureAgriculturalGenetics(lowKnowledge);assert.ok(cropBreedingCapability(yieldRegion)>cropBreedingCapability(lowKnowledge)+.15,'record keeping, literacy and administration should accelerate organised breeding without making traditional selection impossible');

console.log('selective crop breeding regression passed');
