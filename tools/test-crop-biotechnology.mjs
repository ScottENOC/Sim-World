import assert from 'node:assert/strict';
import { ensureAgriculturalGenetics } from '../js/economy/agriculturalGenetics.js';
import { ensureCropBreeding } from '../js/economy/cropBreeding.js';
import { ensureCropBiotechnology, cropBiotechnologyCapability, tickCropBiotechnology, biotechnologyPestProtection, biotechnologyClimateRelief, biotechnologyNutritionMultiplier } from '../js/economy/cropBiotechnology.js';

function modernRegion(){
  const r={id:'bio',population:2_000_000,centroid:[0,35],terrain:{plains:.7,hills:.2,forest:.1},landQuality:1.1,unlockedTechIds:new Set(['writing','mathematics','printing','industrial_electrification']),electricity:{industrialService:.95,householdService:.9},publicEducation:{literacy:.92},governance:{administrativeControl:.85},militaryFinance:{stateCapacity:.85},medicalProgress:{researchCapability:.9},industrialSupply:{capability:{precision_machining:.9}},computingIndustry:{capacity:{chip_design:18,wafer_fab:18,computer_assembly:24},experience:{chip_design:.8,wafer_fab:.75}},stockpile:{computers:40,electronic_components:60},agriculturalLand:{cultivationShare:.7,cultivatedHa:300000},climate:{rainfallMultiplier:.65,evaporationMultiplier:1.3,temperatureAnomalyC:2.5},construction:{assets:[{typeId:'public_granary',condition:1},{typeId:'cold_storage',condition:1}]}};
  const g=ensureAgriculturalGenetics(r);for(const c of ['staple_grains','pulses','fruit_vegetables']){g.liveDiversity[c]=.72;g.preservedDiversity[c]=.8;g.seedReserve[c]=.75;}g.aggregateDiversity=.72;g.aggregateReserve=.75;g.seedBankCapability=.8;
  const b=ensureCropBreeding(r);b.capability=.7;b.selectionIntensity=.45;
  return r;
}

const old={id:'old',population:500000,electricity:{industrialService:.05},publicEducation:{literacy:.15},industrialSupply:{capability:{precision_machining:.05}},computingIndustry:{capacity:{},experience:{}},stockpile:{},agriculturalLand:{cultivationShare:.7,cultivatedHa:100000},construction:{assets:[]},unlockedTechIds:new Set(['writing'])};
assert.equal(cropBiotechnologyCapability(old),0,'premodern economies must not obtain crop biotechnology');

const r=modernRegion();
assert.ok(cropBiotechnologyCapability(r)>.55,'modern scientific economy should have biotechnology capability');
const before=ensureAgriculturalGenetics(r).liveDiversity.staple_grains;
const s=ensureCropBiotechnology(r);s.investment=1;s.platformMaturity=.72;for(const c of ['staple_grains','pulses','fruit_vegetables']){s.adoptionByCategory[c]=.65;s.traits[c]={pestResistance:.65,droughtTolerance:.62,heatTolerance:.6,biofortification:.55,yieldStability:.5};}
tickCropBiotechnology(r,365.2425);
assert.ok(r.cropBiotechnology.aggregateAdoption>.5,'GM adoption should persist in a capable modern system');
assert.ok(biotechnologyPestProtection(r,'staple_grains')>.08,'engineered pest resistance should materially protect crops');
assert.ok(biotechnologyClimateRelief(r,'staple_grains')>.04,'engineered climate traits should reduce drought/heat losses');
assert.ok(biotechnologyNutritionMultiplier(r,'staple_grains')>1.02,'biofortification should improve nutritional value');
assert.ok(ensureAgriculturalGenetics(r).liveDiversity.staple_grains<before,'high adoption should impose a field-diversity cost');
assert.ok(r.cropBiotechnology.seedDependence>0,'commercial biotechnology should create some seed dependence');
assert.ok(r.cropBiotechnology.localSeedAutonomy<1,'seed dependence should reduce local autonomy');
assert.ok(r.cropBiotechnology.electricityLoad>0,'modern biotechnology should consume electricity');
console.log('crop biotechnology regression: ok');
