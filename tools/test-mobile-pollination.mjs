import assert from 'node:assert/strict';
import { tickMobilePollination, mobilePollinationCapacity } from '../js/economy/mobilePollination.js';
import { tickAgriculturalPollinators, pollinatorCategoryYieldMultiplier } from '../js/economy/agriculturalPollinators.js';

function baseRegion(id){return {
  id,population:12000,areaSqKm:900,unlockedTechIds:new Set(['automobile']),neighbors:[],tradePartnerIds:[],
  occupations:{farmer:2400},stockpile:{wood:300,petrol:50},
  construction:{projects:[],completed:{},workersReserved:0,lastWeek:null,assets:[{id:`road-${id}`,typeId:'road_network',condition:1,scale:1}]},
  industrialProduction:{motorisationReadiness:.85},industrialSupply:{capability:{automotive_engineering:.8}},
  agriculturalLand:{totalLandHa:90000,availableArableHa:52000,cultivatedHa:36000,forestHa:9000,otherHa:12000,urbanHa:1200},
  foodDiversity:{productionMix:{staple_grains:.25,pulses:.15,fruit_vegetables:.50,animal_foods:.10}},
  agriculturalPesticides:{ecologicalPressure:0,toxicityPressure:0},weather:{index:0},climate:{temperatureAnomalyC:0},
};}

const source=baseRegion('source');
const destination=baseRegion('destination');
source.neighbors=['destination'];destination.neighbors=['source'];
source.agriculturalPollinators={wildHealth:.72,habitatQuality:.7,floralDiversity:.7,pesticideStress:0,weatherStress:0,managedColonies:1200,serviceableManagedColonies:1050,managedHealth:.86,managedService:.65,managedCoverage:.9,managedWorkers:14,hiveMaintenance:.9,transportableColonies:700,mobileDiseasePressure:.35,serviceLevel:.95,aggregateYieldMultiplier:.99,yieldMultiplierByCategory:{staple_grains:.998,pulses:.986,fruit_vegetables:.964,animal_foods:.999}};
destination.agriculturalPollinators={wildHealth:.16,habitatQuality:.18,floralDiversity:.25,pesticideStress:.5,weatherStress:.05,managedColonies:30,serviceableManagedColonies:20,managedHealth:.55,managedService:.05,managedCoverage:.08,managedWorkers:.4,hiveMaintenance:.7,transportableColonies:0,mobileDiseasePressure:0,serviceLevel:.24,aggregateYieldMultiplier:.74,yieldMultiplierByCategory:{staple_grains:.97,pulses:.79,fruit_vegetables:.45,animal_foods:.98}};
const petrolBefore=source.stockpile.petrol;
const movements=tickMobilePollination([source,destination],365);
assert.ok(movements.length>0,'motorised neighbouring regions should be able to move commercial hives');
assert.ok(source.agriculturalPollinators.mobileColoniesExported>0,'source should export transportable colonies');
assert.ok(destination.agriculturalPollinators.mobileColoniesHosted>0,'destination should host imported colonies');
assert.ok(destination.agriculturalPollinators.incomingMobileService>0,'mobile hives should deliver pollination service');
assert.ok(source.stockpile.petrol<petrolBefore,'moving hives should consume motor fuel');
assert.ok(source.agriculturalPollinators.mobileTransportStress>0,'transport should stress moved colonies');
assert.ok(destination.agriculturalPollinators.mobileDiseasePressure>0,'mixing commercial colonies should create disease-spread pressure');
const fruitBefore=.45;
tickAgriculturalPollinators(destination,7);
assert.ok(pollinatorCategoryYieldMultiplier(destination,'fruit_vegetables')>fruitBefore,'hosted commercial colonies should mitigate pollination losses in dependent crops');
assert.ok(pollinatorCategoryYieldMultiplier(destination,'fruit_vegetables')<=1,'mobile pollination must not raise yield above the no-loss baseline');
assert.equal(mobilePollinationCapacity(source).eligible,true,'automobiles plus roads should enable mobile pollination');

const noTruck=baseRegion('no-truck');
noTruck.unlockedTechIds=new Set();
noTruck.neighbors=['destination'];
noTruck.agriculturalPollinators={...source.agriculturalPollinators,transportableColonies:500,serviceableManagedColonies:600,mobileColoniesExported:0};
tickMobilePollination([noTruck,destination],30);
assert.equal(noTruck.agriculturalPollinators.mobileColoniesExported,0,'commercial hive transport should require motorisation technology');

console.log('mobile commercial pollination regression: ok');
