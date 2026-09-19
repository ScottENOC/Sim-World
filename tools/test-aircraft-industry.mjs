import assert from 'node:assert/strict';
import {
  EQUIPMENT_FAMILIES, aircraftDesignFrontier, authoriseEquipmentMark, ensureCurrentAircraftDesign,
} from '../js/military/equipmentGenerations.js';
import {
  PRODUCT_RECIPES, addProductionLine, ensureIndustrialPlantState, productionSimilarity, retoolProductionLine,
} from '../js/economy/industrialPlant.js';

function region(id='test'){
  return {
    id,
    unlockedTechIds:new Set(['steelmaking','powered_flight','military_aviation']),
    treasury:1000,
    wallet:0,
    stockpile:{steel:1000,wood:1000,textiles:1000},
    industrialSupply:{capability:{precision_machining:.65,steelmaking:.7},inventory:{machine_components:1000}},
    structuralTransformation:{capability:{manufacture:.7}},
    electricity:{industrialService:.7},
    construction:{assets:[{typeId:'factory',condition:1,scale:1}]},
    industrialPlants:{lines:[],componentInventory:{},componentCapability:{},productExperience:{},nextLineId:1},
  };
}

// Tank production should create a very reusable base for SPGs, not require a greenfield industry.
assert.ok(productionSimilarity('tank','self_propelled_gun')>.60,'tank/SPG recipes should substantially overlap');
assert.ok(productionSimilarity('tank','self_propelled_gun')>productionSimilarity('tank','fighter'),'tank-to-SPG should be much easier than tank-to-fighter retooling');
const armourRegion=region('armour');
const plant=ensureIndustrialPlantState(armourRegion);plant.productExperience.tank=.80;
const line=addProductionLine(armourRegion,{productId:'tank'});
retoolProductionLine(armourRegion,line.id,'self_propelled_gun');
assert.ok(line.retoolWeeksRemaining<10,'tank line should retool to SPG in substantially less than a greenfield conversion');
assert.ok(plant.productExperience.self_propelled_gun>.25,'related product integration experience should transfer into SPGs');

for(const key of ['aircraft_engine','airframe','wing_design','aircraft_weapon','radio_navigation','radar_set']){
  assert.ok(key in PRODUCT_RECIPES.fighter.components||key in PRODUCT_RECIPES.bomber.components,`aircraft industry should expose ${key}`);
}

const air=region('air');
Object.assign(air.industrialPlants.componentCapability,{aircraft_engine:.35,airframe:.40,wing_design:.38,aircraft_weapon:.32,radio_navigation:.25,radar_set:.30,optics:.30,electronics:.25});
let fighter=aircraftDesignFrontier(air,EQUIPMENT_FAMILIES.FIGHTER);
let bomber=aircraftDesignFrontier(air,EQUIPMENT_FAMILIES.BOMBER);
assert.ok(bomber.payload>fighter.payload,'bomber configuration should trade toward payload');
assert.ok(fighter.manoeuvrability>bomber.manoeuvrability,'fighter configuration should trade toward manoeuvrability');
assert.equal(fighter.radarCapability,0,'radar hardware should not become useful airborne radar before radar knowledge');

const lowPayload=fighter.payload;
Object.assign(air.industrialPlants.componentCapability,{aircraft_engine:.82,airframe:.78,wing_design:.84,aircraft_weapon:.68,radio_navigation:.62,radar_set:.58});
fighter=aircraftDesignFrontier(air,EQUIPMENT_FAMILIES.FIGHTER);
assert.ok(fighter.payload>lowPayload,'payload should emerge from improved engine/lift/structure rather than a standalone payload stat');
assert.ok(fighter.speed>.5,'strong engine and wing capability should produce a materially faster aircraft frontier');

air.unlockedTechIds.add('radar');
const radarFighter=aircraftDesignFrontier(air,EQUIPMENT_FAMILIES.FIGHTER);
assert.ok(radarFighter.radarCapability>.4,'radar knowledge plus radar-set industry should produce detection capability');
assert.ok(radarFighter.radarSignature<.7,'radar-aware designers should have bounded pre-digital signature reduction');

air.unlockedTechIds.add('jet_propulsion');
const jetFighter=aircraftDesignFrontier(air,EQUIPMENT_FAMILIES.FIGHTER);
assert.equal(jetFighter.propulsion,'jet');
assert.ok(jetFighter.speed>radarFighter.speed,'jet propulsion should move the speed frontier');

// Capability growth does not silently create a new Mark.
const first=ensureCurrentAircraftDesign(air,EQUIPMENT_FAMILIES.FIGHTER,10);
air.industrialPlants.componentCapability.aircraft_weapon=.95;
const stillFirst=ensureCurrentAircraftDesign(air,EQUIPMENT_FAMILIES.FIGHTER,20);
assert.equal(stillFirst.id,first.id,'frontier improvement alone must not mint a new aircraft Mark');
const second=authoriseEquipmentMark(air,EQUIPMENT_FAMILIES.FIGHTER,{tick:20,authorisedBy:'test'});
assert.equal(second.sequence,2,'explicit authorisation should create Mk II');
assert.ok(second.stats.weapons>first.stats.weapons,'new Mark should snapshot the improved component frontier');

console.log('aircraft industry regression: ok');
