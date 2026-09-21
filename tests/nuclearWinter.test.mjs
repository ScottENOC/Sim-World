import assert from 'node:assert/strict';
import { nuclearWinterEffects } from '../js/world/nuclearWinter.js';
import { tickWeather } from '../js/world/weather.js';
import { tickLivestockAgriculture } from '../js/economy/livestockAgriculture.js';
import { tickControlledEnvironmentAgriculture, COMMERCIAL_GREENHOUSE_TECH_ID, HYDROPONIC_CEA_TECH_ID } from '../js/economy/controlledEnvironmentAgriculture.js';
import { tickNuclearAftermath } from '../js/military/nuclearExchange.js';

{
  const clear=nuclearWinterEffects({});
  const dark=nuclearWinterEffects({nuclearAftermath:{globalSootShock:.6}});
  assert.equal(clear.outdoorYieldMultiplier,1);
  assert.ok(dark.solarReduction>0&&dark.coolingC<0,'soot should reduce sunlight and cool the climate');
  assert.ok(dark.outdoorYieldMultiplier<.7,'severe soot should materially reduce outdoor yields');
}

{
  const region={id:'farm',centroid:[0,45],neighbors:[],climate:{temperatureAnomalyC:0,rainfallMultiplier:1,evaporationMultiplier:1,extremeWeatherMultiplier:1},nuclearAftermath:{globalSootShock:.6}};
  tickWeather([region],100,()=>.5,7);
  assert.ok(region.weather.yieldMultiplier<.7,'nuclear winter should flow through the normal agricultural weather multiplier');
  assert.match(region.weather.condition,/nuclear winter/);
}

function livestockRegion(soot=0){return {population:100000,terrain:{hills:.3,plains:.5,forest:.1},landQuality:1,unlockedTechIds:new Set(),educationLevel:.5,governance:{administrativeControl:.5},stockpile:{staple_grains:100},nuclearAftermath:{globalSootShock:soot}};}
{
  const normal=livestockRegion(0), winter=livestockRegion(.6);
  tickLivestockAgriculture(normal,7);tickLivestockAgriculture(winter,7);
  assert.ok(winter.livestockAgriculture.nuclearWinterPastureMultiplier<normal.livestockAgriculture.nuclearWinterPastureMultiplier);
  assert.ok(winter.livestockAgriculture.outputMultiplier<normal.livestockAgriculture.outputMultiplier,'pasture losses should reduce livestock output');
}

function ceaRegion(soot=0,power=1){return {population:100000,unlockedTechIds:new Set([COMMERCIAL_GREENHOUSE_TECH_ID,HYDROPONIC_CEA_TECH_ID]),stockpile:{fertiliser:100,steel:0,machine_components:0,food:0,fruit_vegetables:0,pulses:0},electricity:{industrialService:power,delivered:100,demand:100},waterResources:{controlledEnvironmentSatisfaction:1},controlledEnvironmentAgriculture:{greenhouseHa:10,hydroponicHa:10,greenhouseExperience:.5,hydroponicExperience:.5,privateInvestment:0,publicInvestment:0,publicSupportIntensity:0,lastPublicSpend:0,lastPrivateSpend:0,electricityLoad:0,lastFoodOutput:0,lastProduceOutput:0,lastPulseOutput:0,operatingMargin:0,privateViability:0,capitalCostIndex:1,weatherProtection:0,pestProtection:0,waterSaving:0,waterSatisfaction:1,landDisplacement:0},corporateCapital:{financialDepth:0,investibleWealth:0},treasury:0,wallet:0,nuclearAftermath:{globalSootShock:soot},report:{}};}
{
  const normal=ceaRegion(0,1), winter=ceaRegion(.6,1);
  tickControlledEnvironmentAgriculture(normal,365.2425);tickControlledEnvironmentAgriculture(winter,365.2425);
  assert.ok(winter.controlledEnvironmentAgriculture.lastFoodOutput<normal.controlledEnvironmentAgriculture.lastFoodOutput,'controlled environments should not be completely immune to nuclear winter');
  assert.ok(winter.controlledEnvironmentAgriculture.nuclearWinterHydroponicMultiplier>winter.controlledEnvironmentAgriculture.nuclearWinterGreenhouseMultiplier,'powered hydroponics should be more resilient than sunlight-dependent greenhouses');
  assert.ok(winter.controlledEnvironmentAgriculture.nuclearWinterHydroponicMultiplier>.85,'reliable electricity should preserve most hydroponic production');
}

{
  const region={population:1000,demographics:{children:200,workingAge:600,elderly:200},stability:.8,stockpile:{food:500},nuclearAftermath:{fallout:0,sootExposure:.5,globalSootShock:.5,foodSystemShock:.5,infrastructureDamage:.2},report:{}};
  const foodBefore=region.stockpile.food;
  tickNuclearAftermath([region],365.2425);
  assert.equal(region.stockpile.food,foodBefore,'aftermath should not directly delete food reserves; shortages emerge through production and consumption');
}

console.log('nuclearWinter tests passed');
