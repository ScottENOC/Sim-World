import assert from 'node:assert/strict';
import {
  ensureIndustrialPlantState, addProductionLine, retoolProductionLine, tickIndustrialPlants,
  productCapability, strategicIndustrialCapacity,
} from '../js/economy/industrialPlant.js';

function region(){return {
  id:'r',unlockedTechIds:new Set(['steelmaking','automobile','assembly_line_production','advanced_factories']),
  construction:{assets:[{id:'f1',typeId:'factory',condition:1,scale:1}]},
  industrialProduction:{factorySophistication:.7},
  industrialSupply:{capability:{precision_machining:.8},inventory:{machine_components:500}},
  stockpile:{steel:1000},industrialOrders:{},
};}

const r=region();const s=ensureIndustrialPlantState(r);
for(const c of ['engine','transmission','tracked_running_gear','wheeled_chassis','gun_system','armour_plate','optics','electronics','hull_fabrication']){
  const l=addProductionLine(r,{productId:`component:${c}`,capacityShare:.1});r.industrialOrders[l.productId]=200;
}
tickIndustrialPlants(r,70);
assert.ok(s.componentInventory.engine>0,'factories should produce components before final vehicles');

const car=addProductionLine(r,{productId:'motor_vehicle',capacityShare:.45});r.industrialOrders.motor_vehicle=100;
const tankBefore=productCapability(r,'tank');
for(let i=0;i<30;i++){r.industrialOrders.motor_vehicle=100;tickIndustrialPlants(r,7);}
const tankAfterCars=productCapability(r,'tank');
assert.ok(tankAfterCars>tankBefore,'car production should improve shared tank-relevant components');

const spg=addProductionLine(r,{productId:'self_propelled_gun',capacityShare:.55});
for(let i=0;i<30;i++){
  for(const c of ['engine','transmission','tracked_running_gear','gun_system','armour_plate','optics','electronics','hull_fabrication']){
    const line=s.lines.find(x=>x.productId===`component:${c}`);if(line)r.industrialOrders[line.productId]=40;
  }
  r.industrialOrders.self_propelled_gun=20;tickIndustrialPlants(r,7);
}
const tankAfterSpg=productCapability(r,'tank');
assert.ok(tankAfterSpg>tankAfterCars,'SPG production should transfer strongly into tank component capability');
assert.ok((s.productExperience.tank||0)===0,'shared components must not fake tank-specific integration experience');

const weeks=retoolProductionLine(r,car.id,'tank').retoolWeeksRemaining;
assert.ok(weeks>0&&weeks<26,'related vehicle line should be convertible but not instantly');
while(s.lines.find(x=>x.id===car.id).retoolWeeksRemaining>0)tickIndustrialPlants(r,7);
assert.equal(s.lines.find(x=>x.id===car.id).productId,'tank');

r.industrialOrders={};for(let i=0;i<110;i++)tickIndustrialPlants(r,7);
assert.ok(s.lines.some(x=>x.status==='mothballed'||x.productId===null),'unused lines should mothball or close');

const noFactory=region();noFactory.construction.assets=[];
assert.throws(()=>addProductionLine(noFactory,{productId:'motor_vehicle'}),/factory/i,'production line should require a factory');
assert.equal(strategicIndustrialCapacity(noFactory).factoryCapacity,0);
console.log('component industrial base regressions passed');
