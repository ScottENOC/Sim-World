import assert from 'node:assert/strict';
import { initialiseHydrology, tickHydrology } from '../js/world/hydrology.js';
import { ensureWaterResources, prepareRegionalWaterDemand, finaliseRegionalWaterBalance } from '../js/world/waterResources.js';
import { electricityDemand } from '../js/economy/electricity.js';

function region(id,{population=100000,cultivatedHa=50000,rainfall=1,modern=true}={}){
  return {id,name:id,areaSqKm:12000,population,centroid:[0,35],terrain:{plains:.65,hills:.15,mountains:.05,forest:.1,wetland:.05},climate:{rainfallMultiplier:rainfall,evaporationMultiplier:1},weather:{yieldMultiplier:rainfall,electricityService:1},agriculturalLand:{totalLandHa:1200000,cultivatedHa,availableArableHa:700000,cultivationShare:.7},construction:{assets:[{typeId:'wells_cisterns',condition:1},{typeId:'irrigation',condition:1}]},unlockedTechIds:new Set(modern?['water_management','hydraulic_engineering','electrical_generation','industrial_electrification']:[]),industrialPlants:{factoryCapacity:35},industrialSupply:{capability:{steelmaking:.4,precision_machining:.45}},electricity:{industrialService:.9,generated:20,delivered:18,demand:20},corporateCapital:{firms:[]},controlledEnvironmentAgriculture:{greenhouseHa:10,hydroponicHa:4},report:{farming:{workers:20000}},hydrology:{groundwater:{storage:1,rechargeMultiplier:1}},waterPolicy:{surfaceWithdrawalIntensity:.5,targetReservoirFill:.55,targetDownstreamFlow:.82,operatingPriority:'balanced'}};
}
function graph(){const river={id:'river-1',type:'river',regionIds:['up','down'],regionSegments:[{regionId:'up'},{regionId:'down'}],navigation:{naturalCapacity:.8,flowVariability:0}};return {corridors:new Map([[river.id,river]])};}

const lowUp=region('up',{population:2000,cultivatedHa:1000});const lowDown=region('down',{population:2000,cultivatedHa:1000});const lowGraph=graph();initialiseHydrology(lowGraph,[lowUp,lowDown]);tickHydrology(lowGraph,[lowUp,lowDown],120,30);const lowDownstreamInflow=lowDown.hydrology.report.surfaceInflow;
const highUp=region('up',{population:5000000,cultivatedHa:350000,rainfall:.7});const highDown=region('down',{population:2000,cultivatedHa:1000});const highGraph=graph();initialiseHydrology(highGraph,[highUp,highDown]);tickHydrology(highGraph,[highUp,highDown],120,30);
assert.ok(highUp.hydrology.report.surfaceWithdrawal>lowUp.hydrology.report.surfaceWithdrawal,'modern demand should increase physical surface-water abstraction');
assert.ok(highDown.hydrology.report.surfaceInflow<lowDownstreamInflow,'large upstream withdrawals should reduce water reaching downstream regions');
assert.ok(highUp.waterResources.totalSupply<=highUp.waterResources.totalDemand+1e-9,'water allocation cannot create supply beyond demand');

const dry=region('dry',{population:4500000,cultivatedHa:300000,rainfall:.12});dry.hydrology.riverIds=[];const empty={corridors:new Map()};initialiseHydrology(empty,[dry]);ensureWaterResources(dry);const initialLevel=dry.waterResources.groundwaterLevel;let firstPumpLoad=0;for(let y=0;y<10;y++){tickHydrology(empty,[dry],y*365,365);if(y===0)firstPumpLoad=dry.waterResources.pumpingElectricityLoad;}
assert.ok(dry.waterResources.groundwaterWithdrawal>0,'modern pumping should use groundwater when surface water is unavailable');
assert.ok(dry.waterResources.groundwaterLevel<initialLevel-.05,'persistent arid pumping should draw down the aquifer');
assert.ok(dry.waterResources.unsustainableGroundwaterWithdrawal>0,'withdrawals above recharge should be reported as unsustainable');
assert.ok(dry.waterResources.pumpingElectricityLoad>firstPumpLoad,'a falling water table should increase pumping energy cost');
const power=electricityDemand(dry,7);assert.ok(power.waterPumpingDemand>0&&power.industrialDemand>=power.waterPumpingDemand,'groundwater pumping must appear as real electricity demand');

const depleted=dry.waterResources.groundwaterLevel;dry.population=0;dry.agriculturalLand.cultivatedHa=0;dry.industrialPlants.factoryCapacity=0;dry.industrialSupply.capability={};dry.controlledEnvironmentAgriculture={greenhouseHa:0,hydroponicHa:0};dry.climate.rainfallMultiplier=2;dry.weather.yieldMultiplier=1.5;for(let y=0;y<6;y++)tickHydrology(empty,[dry],4000+y*365,365);assert.ok(dry.waterResources.groundwaterLevel>depleted,'aquifers should recharge when withdrawals cease and recharge conditions improve');

const accounting=region('accounting',{population:1000000,cultivatedHa:100000,rainfall:.5});accounting.hydrology.riverIds=[];prepareRegionalWaterDemand(accounting,365);accounting.hydrology.report={surfaceWithdrawal:.05};const before=ensureWaterResources(accounting).groundwaterStorage;finaliseRegionalWaterBalance(accounting,365);const after=accounting.waterResources.groundwaterStorage;assert.ok(after<=accounting.waterResources.groundwaterCapacity,'groundwater storage must stay within physical capacity');assert.ok(after<=before+accounting.waterResources.groundwaterRecharge+1e-9,'groundwater cannot increase beyond recharge after pumping');

console.log('modern water quantity regression passed');
