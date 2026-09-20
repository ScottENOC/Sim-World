import assert from 'node:assert/strict';
import { ensureIndustrialPlantState } from '../js/economy/industrialPlant.js';
import { ensureAgriculturalLand, updateCultivatedLand } from '../js/economy/agriculturalLand.js';
import { draughtFarmMultiplier } from '../js/economy/horses.js';
import { agriculturalWaterProfile } from '../js/economy/agriculturalWater.js';
import {
  AGRICULTURAL_MACHINE_RECIPES, TRACTOR_TECH_ID, COMBINE_TECH_ID,
  agriculturalMachineCapability, tickAgriculturalMachinery,
} from '../js/economy/agriculturalMachinery.js';

function region(){
  return {
    id:'farm-test',name:'Farm Test',areaSqKm:200,landQuality:1,
    terrain:{plains:.8,hills:.1,mountains:.02,forest:.06,wetland:.02},
    forest:{currentStock:10,K:20},horseEconomy:{draft:20,pastureFraction:0},
    urbanisation:{urbanShare:.05},population:10000,demographics:{workingAge:5500},occupations:{farmer:2000},
    unlockedTechIds:new Set([TRACTOR_TECH_ID,COMBINE_TECH_ID]),
    construction:{assets:[{typeId:'factory',condition:1,scale:1}],completed:{}},corporateInfrastructure:{assets:[]},
    industrialProduction:{factorySophistication:.4},industrialSupply:{capability:{precision_machining:.6},inventory:{machine_components:1000}},
    stockpile:{steel:1000,petrol:1000,diesel:1000,horses:0},industrialOrders:{},report:{},treasury:100,wallet:100,
  };
}

assert.ok(AGRICULTURAL_MACHINE_RECIPES.tractor.engine>0,'tractor must use a separately manufactured engine');
assert.ok(AGRICULTURAL_MACHINE_RECIPES.tractor.transmission>0,'tractor must use a transmission');
assert.ok(AGRICULTURAL_MACHINE_RECIPES.tractor.wheeled_chassis>0,'tractor must use a chassis');
assert.ok(AGRICULTURAL_MACHINE_RECIPES.combine_harvester.engine>0,'combine must use the shared engine industry');

const r=region();ensureAgriculturalLand(r);const plant=ensureIndustrialPlantState(r);
const weak=agriculturalMachineCapability(r,'tractor');
plant.componentCapability.engine=.82;plant.componentCapability.transmission=.76;plant.componentCapability.wheeled_chassis=.72;plant.componentCapability.hull_fabrication=.66;
const experienced=agriculturalMachineCapability(r,'tractor');
assert.ok(experienced>weak+.4,'shared automotive component know-how should transfer strongly to tractor capability');

// Steel and generic machine parts alone cannot create a tractor.
tickAgriculturalMachinery(r,365.2425);
assert.equal(r.agriculturalMachinery.lastTractorsBuilt,0,'tractors cannot be conjured directly from steel');
assert.ok(r.industrialOrders['component:engine']>0,'tractor demand should create an engine order');
assert.ok(plant.lines.some(l=>l.productId==='component:engine'),'tractor demand should create a real engine production line');

// Supplying the actual automotive components permits assembly.
for(const key of ['engine','transmission','wheeled_chassis','hull_fabrication'])plant.componentInventory[key]=100;
tickAgriculturalMachinery(r,365.2425);
assert.ok(r.agriculturalMachinery.lastTractorsBuilt>0,'component availability should permit tractor assembly');
assert.ok(r.agriculturalMachinery.tractors>0,'built tractors should become durable farm capital');

// Mechanisation must reduce labour requirements rather than create land.
r.agriculturalMachinery.tractorCoverage=1;r.agriculturalMachinery.combineCoverage=1;r.agriculturalMachinery.landWorkMultiplier=6.75;
const unmechanised={...r,agriculturalMachinery:{tractorCoverage:0,landWorkMultiplier:1},horseEconomy:{draft:0,pastureFraction:0}};
assert.ok(draughtFarmMultiplier(r,100)>draughtFarmMultiplier(unmechanised,100)*5,'tractors should strongly raise hectares workable per farmer');
const landA={...r,agriculturalLand:{...r.agriculturalLand}};updateCultivatedLand(landA,{farmers:100,labourMultiplier:1});
const baseCultivated=landA.agriculturalLand.cultivatedHa;
const landB={...r,agriculturalLand:{...r.agriculturalLand}};updateCultivatedLand(landB,{farmers:100,labourMultiplier:6});
assert.ok(landB.agriculturalLand.cultivatedHa>baseCultivated,'machinery should let the same farmers cultivate more hectares');
assert.ok(landB.agriculturalLand.cultivatedHa<=landB.agriculturalLand.availableArableHa,'machinery must not create land');

const noCombine=agriculturalWaterProfile({...r,agriculturalMachinery:{harvestRetention:1}},{weatherMultiplier:1});
const combine=agriculturalWaterProfile({...r,agriculturalMachinery:{harvestRetention:1.075}},{weatherMultiplier:1});
assert.ok(combine.yieldMultiplier>noCombine.yieldMultiplier,'combines should reduce realised harvest losses');
assert.ok(combine.yieldMultiplier/noCombine.yieldMultiplier<1.09,'combine harvest benefit should remain modest rather than acting like fertiliser');

const starved=region();ensureAgriculturalLand(starved);const sp=ensureIndustrialPlantState(starved);for(const key of ['engine','transmission','wheeled_chassis','hull_fabrication'])sp.componentInventory[key]=100;starved.stockpile.petrol=0;starved.stockpile.diesel=0;
tickAgriculturalMachinery(starved,365.2425);
assert.ok(starved.agriculturalMachinery.fuelSatisfaction<.01,'a fuel-starved machinery fleet should lose serviceability');
assert.ok(starved.agriculturalMachinery.serviceableTractors<starved.agriculturalMachinery.tractors*.8,'fuel shortage should materially reduce usable tractors');

console.log('agricultural machinery regression passed');
