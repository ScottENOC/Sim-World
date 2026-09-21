import assert from 'node:assert/strict';
import { ensureRegionalHydrology, initialiseHydrology, setWaterPolicy, tickHydrology } from '../js/world/hydrology.js';
import { finaliseUrbanWater, prepareUrbanWater, supplementalUrbanWater, urbanWaterCapabilities, wastewaterPollutionMultiplier } from '../js/world/urbanWater.js';
import { ensureWaterResources, prepareRegionalWaterDemand, finaliseRegionalWaterBalance } from '../js/world/waterResources.js';
import { electricityDemand } from '../js/economy/electricity.js';

function region({modern=true,coastal=true,power=.9}={}){
  const unlocked=new Set(['water_management','hydraulic_engineering']);
  if(modern) for(const id of ['germ_theory','electrical_generation','industrial_electrification']) unlocked.add(id);
  const assets=[{typeId:'wells_cisterns',condition:1},{typeId:'aqueduct',condition:1},{typeId:'urban_drainage',condition:1}];
  if(modern) assets.push({typeId:'water_treatment_plant',condition:1},{typeId:'wastewater_treatment_plant',condition:1},{typeId:'water_pumping_station',condition:1},{typeId:'bulk_water_pipeline',condition:1},{typeId:'desalination_plant',condition:1});
  return {id:'city',name:'City',population:1500000,areaSqKm:3500,isCoastal:coastal,centroid:[0,35],terrain:{plains:.7,wetland:.08,forest:.08,mountains:.03},climate:{rainfallMultiplier:.55,evaporationMultiplier:1.15},weather:{yieldMultiplier:.6},agriculturalLand:{totalLandHa:350000,cultivatedHa:85000,cultivationShare:.7},construction:{assets},unlockedTechIds:unlocked,electricity:{industrialService:power,householdService:power,generated:100},industrialPlants:{factoryCapacity:45},industrialSupply:{capability:{steelmaking:.5,precision_machining:.5}},corporateCapital:{firms:[]},controlledEnvironmentAgriculture:{greenhouseHa:8,hydroponicHa:4},report:{farming:{workers:12000}},hydrology:{groundwater:{storage:1,rechargeMultiplier:1},riverIds:[],report:{surfaceWithdrawal:0,waterHealthRisk:.7}},waterPolicy:{}};
}

const ancient=region({modern:false});ensureRegionalHydrology(ancient);prepareUrbanWater(ancient);const ancientCapabilities=urbanWaterCapabilities(ancient);
assert.ok(ancientCapabilities.distributionCoverage>0,'aqueducts and sewers should provide historical distribution infrastructure');
assert.equal(ancientCapabilities.desalinationCapability,0,'ancient hydraulic works must not unlock modern desalination');
assert.ok(ancientCapabilities.wastewaterTreatment<.25,'sewers alone should not imply modern wastewater treatment');

const modern=region();ensureRegionalHydrology(modern);setWaterPolicy(modern,{drinkingWaterTreatment:1,wastewaterTreatment:1,waterReuse:1,desalination:1,demandEfficiency:1});prepareUrbanWater(modern);const capabilities=urbanWaterCapabilities(modern);
assert.ok(capabilities.potableTreatment>.7,'germ theory plus a powered treatment plant should enable strong potable treatment');
assert.ok(capabilities.wastewaterTreatment>.7,'a powered wastewater plant should support high wastewater treatment');
assert.ok(capabilities.desalinationCapability>.7,'a powered coastal desalination plant should provide desalination capacity');
assert.ok(modern.urbanWater.demandEfficiency>.2,'modern networks and conservation policy should reduce demand');

const firstSupplement=supplementalUrbanWater(modern,{households:1,agriculture:1,livestock:0,industry:1,controlledEnvironment:1},7);
assert.equal(firstSupplement.agriculture+firstSupplement.industry+firstSupplement.controlledEnvironment,0,'new wastewater cannot be recycled before it has been generated and treated');
assert.ok(firstSupplement.households>0,'desalination may supply current-period coastal household demand');
finaliseUrbanWater(modern,{households:1,agriculture:.4,livestock:.1,industry:.7,controlledEnvironment:.1},7);
assert.ok(modern.urbanWater.wastewaterTreated>0,'modern system should treat collected wastewater');
assert.ok(modern.urbanWater.recycledStorage>0,'treated wastewater should create a reusable reserve for a later period');
assert.ok(wastewaterPollutionMultiplier(modern)<.5,'effective wastewater treatment should materially reduce sewage pollution');
assert.ok(modern.urbanWater.potableQuality>.7,'potable treatment should substantially mitigate dirty source water');

prepareUrbanWater(modern);const secondSupplement=supplementalUrbanWater(modern,{households:0,agriculture:1,livestock:0,industry:1,controlledEnvironment:1},7);
assert.ok(secondSupplement.agriculture+secondSupplement.industry+secondSupplement.controlledEnvironment>0,'stored reclaimed water should be available in a later period');

const inland=region({coastal:false});ensureRegionalHydrology(inland);setWaterPolicy(inland,{desalination:1});prepareUrbanWater(inland);assert.equal(urbanWaterCapabilities(inland).desalinationCapability,0,'inland regions cannot desalinate seawater locally');

const integrated=region();ensureRegionalHydrology(integrated);setWaterPolicy(integrated,{wastewaterTreatment:1,waterReuse:1,desalination:1,demandEfficiency:.8});ensureWaterResources(integrated);prepareRegionalWaterDemand(integrated);integrated.hydrology.report={surfaceWithdrawal:0,waterHealthRisk:.6};finaliseRegionalWaterBalance(integrated,30);
assert.ok(integrated.waterResources.totalSupply<=integrated.waterResources.totalDemand+1e-9,'urban water sources must not allocate above total demand');
assert.ok(integrated.urbanWater.desalinatedSupply>0,'desalination should enter the real regional water balance when conventional supply is short');
assert.ok(integrated.urbanWater.electricityLoad>0,'treatment, reuse or desalination must consume electricity');
const demand=electricityDemand(integrated,7);assert.equal(demand.urbanWaterDemand,integrated.urbanWater.electricityLoad,'urban water electricity load must reach the power system');

const upstream=region({modern:false,coastal:false,power:0});upstream.id='up';upstream.name='Up';upstream.population=7000000;upstream.agriculturalLand.cultivatedHa=300000;upstream.industrialChemicalDischarge=.4;upstream.construction.assets.push({typeId:'irrigation',condition:1});
const downstream=region({modern:false,coastal:false,power:0});downstream.id='down';downstream.name='Down';downstream.population=250000;downstream.industrialChemicalDischarge=.1;
const river={id:'river',type:'river',regionIds:['up','down'],regionSegments:[{regionId:'up'},{regionId:'down'}],navigation:{naturalCapacity:.7,flowVariability:0}};const graph={corridors:new Map([[river.id,river]])};initialiseHydrology(graph,[upstream,downstream]);
for(let year=0;year<4;year++)tickHydrology(graph,[upstream,downstream],year*365,365);
assert.ok(upstream.hydrology.ecologicalHealth<.98,'chronic abstraction and pollution should degrade river ecological condition');
const degraded=upstream.hydrology.ecologicalHealth;upstream.population=0;upstream.agriculturalLand.cultivatedHa=0;upstream.industrialChemicalDischarge=0;upstream.waterPolicy.surfaceWithdrawalIntensity=0;upstream.climate.rainfallMultiplier=1.4;upstream.weather.yieldMultiplier=1.2;
for(let year=0;year<8;year++)tickHydrology(graph,[upstream,downstream],2000+year*365,365);
assert.ok(upstream.hydrology.ecologicalHealth>degraded,'river ecology should recover gradually after flow and pollution pressures ease');

console.log('modern urban water regression passed');
