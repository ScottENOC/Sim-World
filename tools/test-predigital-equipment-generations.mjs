import assert from 'node:assert/strict';
import { EQUIPMENT_FAMILIES, authoriseEquipmentMark, ensureCurrentArmouredVehicleDesign, ensureCurrentArtilleryDesign, designsFor } from '../js/military/equipmentGenerations.js';
import { SHIP_DESIGNS, ensureCurrentNavalDesign } from '../js/military/fleets.js';
import { ensureIndustrialPlantState, addProductionLine, authoriseProductionMark, tickIndustrialPlants } from '../js/economy/industrialPlant.js';

function industrialRegion(id='r'){
  return {id,name:id,unlockedTechIds:new Set(['steelmaking','breech_loading_artillery','quick_firing_artillery','heavy_howitzers','advanced_factories']),
    construction:{assets:[{id:'factory',typeId:'factory',condition:1,scale:2},{id:'harbour',typeId:'harbour',condition:1,scale:1},{id:'shipyard',typeId:'shipyard',condition:1,scale:1},{id:'naval_base',typeId:'naval_base',condition:1,scale:1}]},
    industrialProduction:{factorySophistication:.7},industrialSupply:{capability:{precision_machining:.2},inventory:{machine_components:10000}},stockpile:{steel:20000,wood:20000,iron:5000,coal:5000,gunpowder:1000},treasury:10000,
    structuralTransformation:{capability:{manufacture:.5}},steelIndustry:{readiness:.6},massEducation:{literacy:.6},artilleryFireControl:{rangeFinding:.3,survey:.3,fireDirection:.2,predictedFire:.1},
    earlyModernMilitary:{naval:{readiness:.4}},militaryPolicy:{navalPriority:'war'},industrialOrders:{},adjacentSeaIds:['sea'],isCoastal:true,navy:{boats:0,advancedBoats:0,personnel:0}};
}
function setComponents(r,q){const s=ensureIndustrialPlantState(r);for(const c of ['engine','transmission','tracked_running_gear','wheeled_chassis','gun_system','armour_plate','optics','hull_fabrication'])s.componentCapability[c]=q;s.componentCapability.electronics=Math.min(.65,q);r.industrialSupply.capability.precision_machining=q;return s;}

// Capability progress moves the frontier; a new physical Mark only exists after an explicit standardisation decision.
const land=industrialRegion('land');
setComponents(land,.12);ensureCurrentArmouredVehicleDesign(land,EQUIPMENT_FAMILIES.TANK);ensureCurrentArmouredVehicleDesign(land,EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN);ensureCurrentArtilleryDesign(land,'field_cannon');ensureCurrentArtilleryDesign(land,'heavy_howitzer');
for(const q of [.34,.56,.78,.98]){
  setComponents(land,q);land.industrialPlants.productExperience.tank=q*.65;land.industrialPlants.productExperience.self_propelled_gun=q*.7;
  const beforeTank=designsFor(land,EQUIPMENT_FAMILIES.TANK).length;
  ensureCurrentArmouredVehicleDesign(land,EQUIPMENT_FAMILIES.TANK);
  assert.equal(designsFor(land,EQUIPMENT_FAMILIES.TANK).length,beforeTank,'frontier progress alone must not silently create a tank Mark');
  authoriseEquipmentMark(land,EQUIPMENT_FAMILIES.TANK,{reason:'test_standardisation'});
  authoriseEquipmentMark(land,EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN,{reason:'test_standardisation'});
  authoriseEquipmentMark(land,EQUIPMENT_FAMILIES.FIELD_ARTILLERY,{kind:'field_cannon',reason:'test_standardisation'});
  authoriseEquipmentMark(land,EQUIPMENT_FAMILIES.HEAVY_ARTILLERY,{kind:'heavy_howitzer',reason:'test_standardisation'});
}
assert(designsFor(land,EQUIPMENT_FAMILIES.TANK).length>=5,'deliberate standardisation should support several tank Marks');
assert(designsFor(land,EQUIPMENT_FAMILIES.SELF_PROPELLED_GUN).length>=5,'SPGs should support several deliberately authorised Marks');
assert(designsFor(land,EQUIPMENT_FAMILIES.FIELD_ARTILLERY).length>=5,'towed artillery should support multiple physical models');
assert(designsFor(land,EQUIPMENT_FAMILIES.HEAVY_ARTILLERY).length>=5,'heavy artillery should support multiple physical models');

// Actual vehicle production is stamped into a design-specific inventory; later authorised Marks do not upgrade earlier output.
const prod=industrialRegion('prod');const ps=setComponents(prod,.25);for(const c of Object.keys(ps.componentInventory))ps.componentInventory[c]=1000;
const tankLine=addProductionLine(prod,{productId:'tank',capacityShare:1});prod.industrialOrders.tank=5;tickIndustrialPlants(prod,7);
const firstIds=Object.keys(prod.militaryEquipment?.inventoryByDesign||{});assert(firstIds.length===1,'tank production should record the physical design delivered');
const firstId=firstIds[0],firstQty=prod.militaryEquipment.inventoryByDesign[firstId];
setComponents(prod,.9);prod.industrialPlants.productExperience.tank=.8;for(const c of Object.keys(ps.componentInventory))ps.componentInventory[c]=1000;
const upgrade=authoriseProductionMark(prod,tankLine.id,{tick:20,authorisedBy:'test'});assert(upgrade.authorised,'factory should be able to authorise the improved tank Mark');
tickIndustrialPlants(prod,upgrade.downtimeWeeks*7+7);for(const c of Object.keys(ps.componentInventory))ps.componentInventory[c]=1000;prod.industrialOrders.tank=5;tickIndustrialPlants(prod,7);
const ids=Object.keys(prod.militaryEquipment.inventoryByDesign);assert(ids.length>=2,'after explicit retooling later production should use a newer tank Mark');
assert.equal(prod.militaryEquipment.inventoryByDesign[firstId],firstQty,'creating a newer tank Mark must not upgrade old inventory');

// Every persistent ship class can acquire several pre-digital Marks when a navy deliberately standardises improved designs.
const navy=industrialRegion('navy');
const shipIds=Object.keys(SHIP_DESIGNS).filter(id=>id!=='advanced_warship');
for(const q of [.08,.32,.56,.80,1]){setComponents(navy,q);navy.earlyModernMilitary.naval.readiness=q;for(const id of shipIds)ensureCurrentNavalDesign(navy,id);}
for(const id of shipIds){const list=navy.navalDesignCatalogue[id]||[];assert(list.length>=3,`${id} should support multiple persistent Marks before digital computing`);assert(list.at(-1).stats.combat>=list[0].stats.combat,`${id} later Marks should not lose the accumulated component frontier`);}
const dread=navy.navalDesignCatalogue.dreadnought;assert(dread.at(-1).name.includes('Mk'),'naval models should expose explicit Mark names');

console.log('pre-digital tank, artillery and naval generation regressions passed');
