import assert from 'node:assert/strict';
import {
  EQUIPMENT_FAMILIES,
  MILITARY_MATERIALS,
  militaryMaterialOptions,
  previewEquipmentDesign,
  authoriseEquipmentMark,
} from '../js/military/equipmentGenerations.js';

function modernRegion(){
  return {
    id:'test-region',name:'Test Region',
    unlockedTechIds:new Set(['advanced_factories','industrial_electrification','aerospace_light_alloys','hall_heroult_aluminium','kroll_titanium','jet_propulsion','radar']),
    stockpile:{aluminium:1000,titanium:500,packaged_chips:1000,electronic_components:1000,copper:1000,industrial_polymers:1000},
    industrialSupply:{capability:{precision_machining:.68}},
    structuralTransformation:{capability:{manufacture:.72}},
    massEducation:{literacy:.78},
    industrialPlants:{componentCapability:{aircraft_engine:.69,airframe:.68,wing_design:.70,aircraft_weapon:.66,radio_navigation:.64,radar_set:.58,electronics:.66,engine:.69,transmission:.68,tracked_running_gear:.67,gun_system:.68,armour_plate:.69,optics:.67,hull_fabrication:.70},productExperience:{fighter:.62,bomber:.58,tank:.62,self_propelled_gun:.60}},
  };
}

const region=modernRegion();
const options=militaryMaterialOptions(region,EQUIPMENT_FAMILIES.FIGHTER);
assert.equal(options.find(o=>o.id===MILITARY_MATERIALS.ALUMINIUM)?.available,true);
assert.equal(options.find(o=>o.id===MILITARY_MATERIALS.TITANIUM)?.available,true);

const conventional=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.CONVENTIONAL});
const aluminium=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.ALUMINIUM});
const titanium=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.TITANIUM});
assert.ok(aluminium.speed>conventional.speed,'aluminium should permit higher aircraft speed at the same technological frontier');
assert.ok(aluminium.range>conventional.range,'aluminium should permit more range');
assert.ok(aluminium.payload>conventional.payload,'aluminium should permit more payload');
assert.ok(aluminium.systemInputs.aluminium>0,'aluminium design must physically consume aluminium in production');
assert.ok(titanium.systemInputs.titanium>0,'titanium design must physically consume titanium in production');
assert.ok(titanium.heatTolerance>aluminium.heatTolerance,'titanium-intensive structures should tolerate higher-temperature operation');
assert.ok(titanium.structuralMassMultiplier<aluminium.structuralMassMultiplier,'titanium-intensive design should enable lower structural mass in high-performance use');

const speedDesign=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.ALUMINIUM,priorities:{speed:2.5,range:.5,payload:.5,manoeuvrability:1,reliability:1,firepower:.5}});
const rangeDesign=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.ALUMINIUM,priorities:{speed:.5,range:2.5,payload:.5,manoeuvrability:1,reliability:1,firepower:.5}});
assert.ok(speedDesign.speed>rangeDesign.speed,'player speed priority should materially change the resulting design');
assert.ok(rangeDesign.range>speedDesign.range,'player range priority should materially change the resulting design');

const tankSteel=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.TANK,{material:MILITARY_MATERIALS.CONVENTIONAL});
const tankAl=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.TANK,{material:MILITARY_MATERIALS.ALUMINIUM});
const tankTi=previewEquipmentDesign(region,EQUIPMENT_FAMILIES.TANK,{material:MILITARY_MATERIALS.TITANIUM});
assert.ok(tankAl.mobility>tankSteel.mobility,'aluminium secondary structure should reduce armoured-vehicle mass and improve mobility');
assert.ok(tankAl.protection<tankSteel.protection,'aluminium should not be free armour performance');
assert.ok(tankTi.protection>tankSteel.protection,'selective titanium armour should improve protection');
assert.ok(tankTi.systemInputs.titanium>0,'titanium armour design must consume titanium');

const design=authoriseEquipmentMark(region,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.TITANIUM,priorities:{speed:2,range:1.4,payload:.6,manoeuvrability:1.2,reliability:1,firepower:.8},authorisedBy:'player'});
assert.equal(design.designChoices.material,MILITARY_MATERIALS.TITANIUM);
assert.ok(design.designChoices.priorities.speed>design.designChoices.priorities.payload);
assert.ok(design.stats.systemInputs.titanium>0);

const early=modernRegion();
early.unlockedTechIds.delete('aerospace_light_alloys');
early.unlockedTechIds.delete('kroll_titanium');
const unavailable=militaryMaterialOptions(early,EQUIPMENT_FAMILIES.FIGHTER);
assert.equal(unavailable.find(o=>o.id===MILITARY_MATERIALS.ALUMINIUM)?.available,false);
assert.equal(unavailable.find(o=>o.id===MILITARY_MATERIALS.TITANIUM)?.available,false);
const fallback=previewEquipmentDesign(early,EQUIPMENT_FAMILIES.FIGHTER,{material:MILITARY_MATERIALS.TITANIUM});
assert.equal(fallback.structureMaterial,MILITARY_MATERIALS.CONVENTIONAL,'unavailable material choice should safely fall back to conventional construction');

console.log('Military light-metal design regression passed.');
