import assert from 'node:assert/strict';
import {
  POLYMER_APPLICATIONS,
  consumePolymerUtility,
  previewProductMaterialPlan,
  polymerMaterialOptions,
} from '../js/economy/industrialMaterials.js';
import { ensureComputingIndustryState, setComputingCapacity, produceElectronicComponents } from '../js/economy/computingIndustry.js';
import { createEquipmentDesign, EQUIPMENT_FAMILIES } from '../js/military/equipmentGenerations.js';
import { recycleMilitaryEquipment } from '../js/military/equipmentRecycling.js';
import { ensureCircularEconomy } from '../js/economy/circularEconomy.js';

function region(id='test'){
  return {
    id,name:id,stockpile:{food:100,wood:100,industrial_polymers:0,copper:100,steel:100},
    unlockedTechIds:new Set(['advanced_factories','industrial_ecodesign']),
    structuralTransformation:{capability:{manufacture:.75}},
    industrialProduction:{factorySophistication:.7},
    industrialSupply:{inventory:{},inventoryByDesign:{},capability:{precision_machining:.7}},
    industrialPlants:{lines:[],componentInventory:{},componentCapability:{},productExperience:{},nextLineId:1},
  };
}

{
  const r=region('fallback');
  r.stockpile.food=0;r.stockpile.wood=0;
  const plan=previewProductMaterialPlan(r,'motor_vehicle');
  assert.equal(plan.canProduceWithoutPetrochemicalPlastic,true);
  assert.equal(plan.preferredMaterial,'conventional_substitute');
  assert.ok(plan.massMultiplier>1,'plastic-free conventional fallback should be heavier');
  assert.ok(plan.costMultiplier>1,'plastic-free conventional fallback should be more costly');
}

{
  const r=region('petrochemical');
  r.stockpile.industrial_polymers=100;
  const plan=previewProductMaterialPlan(r,'motor_vehicle');
  assert.equal(plan.preferredMaterial,'petrochemical_polymer');
  assert.ok(plan.costMultiplier<1,'petrochemical plastics should reduce vehicle manufacturing cost');
  assert.ok(plan.performanceMultiplier>1,'petrochemical plastics should modestly improve product performance');
  const before=r.stockpile.industrial_polymers;
  const use=consumePolymerUtility(r,2,{application:POLYMER_APPLICATIONS.VEHICLE});
  assert.ok(use.sourceMix.petrochemical_polymer>0);
  assert.ok(r.stockpile.industrial_polymers<before);
}

{
  const r=region('bio');
  r.circularEconomy={capability:{substitution:.8},plasticSubstitution:.8};
  const opts=polymerMaterialOptions(r,{application:POLYMER_APPLICATIONS.VEHICLE});
  assert.equal(opts.find(o=>o.id==='biopolymer').available,true,'advanced society with biomass should have a bioplastic route');
  const use=consumePolymerUtility(r,2,{application:POLYMER_APPLICATIONS.VEHICLE});
  assert.ok(use.sourceMix.biopolymer>0,'bioplastics should substitute when petrochemical polymer is absent');
}

{
  const r=region('natural-fibre');
  r.stockpile.food=0;
  const use=consumePolymerUtility(r,2,{application:POLYMER_APPLICATIONS.VEHICLE});
  assert.ok(use.sourceMix.natural_fibre_composite>0,'wood/bamboo/cellulose composites should substitute in structural products');
}

{
  const r=region('electronics-without-plastic');
  r.stockpile.food=0;r.stockpile.wood=0;r.stockpile.industrial_polymers=0;
  ensureComputingIndustryState(r);setComputingCapacity(r,'components',10);
  const output=produceElectronicComponents(r,2);
  assert.equal(output,2,'electronics should remain producible without petrochemical polymers');
  assert.ok(r.industrialMaterials.cumulativeConventionalFallback>0,'electronics should record glass/ceramic/rubber/metal fallback');
}

{
  const r=region('recycling');
  const circular=ensureCircularEconomy(r);
  circular.capability={collection:.9,sorting:.9,recovery:.9,ecodesign:.5,urbanMining:.2,closedLoop:.7,substitution:.4};
  const design=createEquipmentDesign(r,EQUIPMENT_FAMILIES.TANK,{structureMaterial:'conventional',systemInputs:{copper:.15}},{tick:1});
  r.militaryEquipment.inventoryByDesign[design.id]=4;
  r.industrialSupply.inventory.tank=4;r.industrialSupply.inventoryByDesign[design.id]=4;
  const result=recycleMilitaryEquipment(r,design.id,2,{condition:.8});
  assert.equal(result.recycled,2);
  assert.equal(r.militaryEquipment.inventoryByDesign[design.id],2);
  assert.equal(r.industrialSupply.inventory.tank,2);
  assert.ok(circular.scrap.steel>0,'recycled tank should yield steel scrap');
  assert.ok(circular.scrap.copper>0,'recycled tank should yield copper scrap');
  assert.ok(result.efficiency<1&&result.efficiency>0,'recovery must include realistic losses');
}

console.log('Industrial material substitution and military recycling regression passed.');
