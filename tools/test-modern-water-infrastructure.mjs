import assert from 'node:assert/strict';
import { CONSTRUCTION_TYPES } from '../js/economy/construction.js';
import { prepareUrbanWater, urbanWaterCapabilities, supplementalUrbanWater, finaliseUrbanWater } from '../js/world/urbanWater.js';

function asset(typeId,condition=1){return {id:`${typeId}-1`,typeId,condition,scale:1};}
function region({coastal=true,power=.9,plants=true}={}){
  const assets=[asset('wells_cisterns'),asset('aqueduct'),asset('urban_drainage')];
  if(plants) assets.push(asset('water_treatment_plant'),asset('wastewater_treatment_plant'),asset('water_pumping_station'),asset('bulk_water_pipeline'),asset('desalination_plant'));
  return {id:'city',population:1200000,isCoastal:coastal,construction:{assets},unlockedTechIds:new Set(['water_management','hydraulic_engineering','germ_theory','electrical_generation','industrial_electrification']),electricity:{industrialService:power,householdService:power},settlements:{urbanShare:.75},hydrology:{report:{waterHealthRisk:.8}},waterPolicy:{drinkingWaterTreatment:1,wastewaterTreatment:1,waterReuse:1,desalination:1,demandEfficiency:.8},report:{}};
}

for(const id of ['water_treatment_plant','wastewater_treatment_plant','water_pumping_station','bulk_water_pipeline','desalination_plant']){
  assert.ok(CONSTRUCTION_TYPES[id],`${id} should be a canonical buildable construction type`);
  assert.ok(CONSTRUCTION_TYPES[id].workRequired>0,`${id} should have a real construction cost`);
  assert.ok(CONSTRUCTION_TYPES[id].maintenanceRate>0,`${id} should require maintenance`);
}
assert.equal(CONSTRUCTION_TYPES.desalination_plant.coastal,true,'desalination plants should be coastal construction');

const legacy=region({plants:false});prepareUrbanWater(legacy);const legacyCap=urbanWaterCapabilities(legacy);
assert.ok(legacyCap.potableTreatment<.4,'technology and sewers alone should not provide advanced potable treatment');
assert.ok(legacyCap.wastewaterTreatment<.3,'technology and sewers alone should not provide advanced wastewater treatment');
assert.equal(legacyCap.desalinationCapability,0,'desalination technology and power alone should not create water without a plant');

const modern=region();prepareUrbanWater(modern);const cap=urbanWaterCapabilities(modern);
assert.ok(cap.potableTreatment>.75,'a powered drinking-water treatment plant should provide strong potable treatment');
assert.ok(cap.wastewaterTreatment>.75,'a powered wastewater plant should provide strong wastewater treatment');
assert.ok(cap.distributionCoverage>legacyCap.distributionCoverage,'pumps and bulk pipelines should improve network distribution');
assert.ok(cap.desalinationCapability>.75,'a powered coastal desalination plant should provide desalination capacity');
assert.ok(modern.urbanWater.electricityLoad>0,'pumps and trunk pipelines should create standing electricity demand');

const damaged=region();for(const a of damaged.construction.assets)if(['water_treatment_plant','wastewater_treatment_plant','water_pumping_station','bulk_water_pipeline','desalination_plant'].includes(a.typeId))a.condition=.25;prepareUrbanWater(damaged);const damagedCap=urbanWaterCapabilities(damaged);
assert.ok(damagedCap.potableTreatment<cap.potableTreatment*.7,'damage should materially degrade drinking-water treatment');
assert.ok(damagedCap.wastewaterTreatment<cap.wastewaterTreatment*.7,'damage should materially degrade wastewater treatment');
assert.ok(damagedCap.desalinationCapability<cap.desalinationCapability*.4,'damage should materially degrade desalination output');

const blackout=region({power:0});prepareUrbanWater(blackout);const blackoutCap=urbanWaterCapabilities(blackout);
assert.ok(blackoutCap.desalinationCapability<cap.desalinationCapability*.2,'desalination should collapse during a power outage');
assert.ok(blackoutCap.distributionCoverage<cap.distributionCoverage,'power loss should reduce pumped distribution capability');

const inland=region({coastal:false});prepareUrbanWater(inland);assert.equal(urbanWaterCapabilities(inland).desalinationCapability,0,'inland desalination plants cannot process seawater locally');

const first=supplementalUrbanWater(modern,{households:1,agriculture:1,livestock:0,industry:1,controlledEnvironment:1},7);
assert.ok(first.households>0,'desalination plant output should enter current water supply');
assert.equal(first.agriculture,0,'new wastewater must not be recycled in the same period');
finaliseUrbanWater(modern,{households:1,agriculture:.2,livestock:.1,industry:.6,controlledEnvironment:.1},7);
assert.ok(modern.urbanWater.wastewaterTreated>0,'wastewater plant should treat collected sewage');
assert.ok(modern.urbanWater.recycledStorage>0,'treated sewage should create delayed reclaimed-water storage');
assert.ok(modern.urbanWater.potableQuality>.75,'treatment infrastructure should materially protect drinking-water quality');
prepareUrbanWater(modern);const second=supplementalUrbanWater(modern,{households:0,agriculture:1,livestock:0,industry:1,controlledEnvironment:1},7);
assert.ok(second.agriculture+second.industry+second.controlledEnvironment>0,'reclaimed water should become available in a later period');

console.log('modern water infrastructure regression passed');
