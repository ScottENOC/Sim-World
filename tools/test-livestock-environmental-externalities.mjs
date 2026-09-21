import assert from 'node:assert/strict';
import { tickLivestockAgriculture } from '../js/economy/livestockAgriculture.js';
import { prepareRegionalWaterDemand, finaliseRegionalWaterBalance } from '../js/world/waterResources.js';
import { initialiseHydrology, tickHydrology } from '../js/world/hydrology.js';
import { tickClimateChange } from '../js/world/climateChange.js';

function region(id='r1'){
  return {
    id,population:250000,centroid:[0,35],terrain:{plains:.6,hills:.2,forest:.1,wetland:.05},landQuality:1,
    agriculturalLand:{totalLandHa:180000,cultivatedHa:90000},foodDiversity:{productionMix:{animal_foods:.28}},
    unlockedTechIds:new Set(['water_management','hydraulic_engineering','electrical_generation','industrial_electrification','germ_theory','vaccination']),
    electricity:{industrialService:.85,generated:100},agriculturalMachinery:{tractorCoverage:.7,combineCoverage:.5},precisionAgriculture:{adoption:.5},
    cropBreeding:{capability:.6},cropBiotechnology:{platformMaturity:.45},educationLevel:.7,governance:{administrativeControl:.7},
    stockpile:{staple_grains:100},construction:{assets:[{typeId:'wells_cisterns',condition:1},{typeId:'irrigation',condition:1}]},
    hydrology:{riverIds:['river'],report:{surfaceWithdrawal:10}},waterPolicy:{agriculturalRunoffControl:0},report:{farming:{workers:60000}},treasury:100,wallet:100,
  };
}

// Livestock is a real water-allocation category and receives supply when available.
const watered=region('watered');
tickLivestockAgriculture(watered,7);
prepareRegionalWaterDemand(watered,7);
assert.ok(watered.waterResources.demand.livestock>0,'livestock should create explicit regional water demand');
watered.hydrology.report={surfaceWithdrawal:watered.waterResources.totalDemand};
finaliseRegionalWaterBalance(watered,7);
assert.ok(watered.waterResources.allocation.livestock>0,'livestock should receive an explicit water allocation');
assert.ok(watered.waterResources.livestockSatisfaction>.95,'adequate supply should satisfy livestock water demand');

// Previous-period water shortage suppresses subsequent livestock performance.
const dry=region('dry');
tickLivestockAgriculture(dry,7);
dry.livestockAgriculture.waterDemand=10;
prepareRegionalWaterDemand(dry,7);
dry.hydrology.report={surfaceWithdrawal:0};
dry.waterResources.groundwaterStorage=0;
finaliseRegionalWaterBalance(dry,7);
const beforeDry=dry.livestockAgriculture.outputMultiplier;
tickLivestockAgriculture(dry,7);
assert.ok(dry.livestockAgriculture.waterSatisfaction<.2,'water shortage should carry into livestock water satisfaction');
assert.ok(dry.livestockAgriculture.outputMultiplier<beforeDry,'water shortage should reduce later livestock output');

function riverGraph(){return {corridors:new Map([['river',{id:'river',type:'river',regionIds:['r1'],regionSegments:[{regionId:'r1'}],strength:1,navigation:{naturalCapacity:1,flowVariability:0}}]])};}
function pollutionRegion(control=0){const r=region('r1');r.livestockAgriculture={manureNutrientLoad:2,waterDemand:0};r.waterPolicy.agriculturalRunoffControl=control;r.population=0;r.report.farming.workers=0;return r;}

const polluted=pollutionRegion(0),pollutedGraph=riverGraph();initialiseHydrology(pollutedGraph,[polluted]);tickHydrology(pollutedGraph,[polluted],100,30);
const dirtySegment=pollutedGraph.corridors.get('river').hydrology.segments.r1;
assert.ok(dirtySegment.concentration.nutrients>0,'livestock manure should enter river nutrient loading');
assert.ok(dirtySegment.eutrophicationRisk>0,'livestock nutrient loading should create eutrophication risk');

const controlled=pollutionRegion(1),controlledGraph=riverGraph();initialiseHydrology(controlledGraph,[controlled]);tickHydrology(controlledGraph,[controlled],100,30);
const controlledSegment=controlledGraph.corridors.get('river').hydrology.segments.r1;
assert.ok(controlledSegment.eutrophicationRisk<dirtySegment.eutrophicationRisk*.35,'agricultural runoff controls should materially reduce manure eutrophication');

function climateRegion(id,methane){return {id,centroid:[0,35],population:100000,unlockedTechIds:new Set(),forest:{currentStock:0},livestockAgriculture:{methaneEmissions:methane},treasury:0,wallet:0};}
const methaneWorld=[climateRegion('methane',10)],controlWorld=[climateRegion('control',0)];
for(let month=0;month<360;month++){tickClimateChange(methaneWorld,month,30,()=>1);tickClimateChange(controlWorld,month,30,()=>1);}
assert.ok(methaneWorld[0]._worldClimate.methaneBurdenIndex>0,'livestock methane should accumulate in the atmospheric methane burden');
assert.ok(methaneWorld[0]._worldClimate.temperatureAnomalyC>controlWorld[0]._worldClimate.temperatureAnomalyC+.01,'sustained livestock methane should add measurable warming');
assert.ok(methaneWorld[0]._worldClimate.lastFlux.methane>0,'climate reporting should expose livestock methane flux');

console.log('livestock environmental externalities: ok');
