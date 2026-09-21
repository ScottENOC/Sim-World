import { effectiveInfrastructureCount } from './construction.js?v=20260914-water3';
import { agriculturalLandYieldFactor } from './agriculturalLand.js?v=20260921-arable1';
import { fertiliserYieldMultiplier } from './agriculturalFertiliser.js?v=20260921-fertiliser1';
import { pestYieldMultiplier } from './agriculturalPests.js?v=20260921-pests1';
import { pollinatorAggregateYieldMultiplier } from './agriculturalPollinators.js?v=20260921-pollinators1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export function agriculturalWaterProfile(region,{weatherMultiplier=1}={}){
  const irrigation=Math.max(0,effectiveInfrastructureCount(region,'irrigation'));
  const canal=Math.max(0,effectiveInfrastructureCount(region,'canal'));
  const wells=Math.max(0,effectiveInfrastructureCount(region,'wells_cisterns'));
  const hasManagedSurfaceWater=irrigation>0||canal>0;
  const report=region?.hydrology?.report||{},water=region?.waterResources||{};
  const riverCount=Math.max(0,Number(report.riverCount)||0),inflow=Math.max(0,Number(report.surfaceInflow)||0),withdrawal=Math.max(0,Number(report.surfaceWithdrawal)||0),managedRelease=Math.max(0,Number(report.managedRelease)||0),groundwaterUsed=Math.max(0,Number(water.groundwaterWithdrawal)||0),groundwaterLevel=clamp(water.groundwaterLevel??region?.hydrology?.groundwater?.storage??1),irrigationSatisfaction=clamp(water.irrigationSatisfaction??1);

  const flowAvailability=riverCount>0?clamp(inflow/Math.max(.12,riverCount*.65),0,1.35):0;
  const delivered=hasManagedSurfaceWater?clamp((withdrawal+managedRelease*.35)/Math.max(.025,riverCount*.035),0,1):0;
  const infrastructurePotential=clamp(irrigation*.68+canal*.42,0,1);
  const surfaceReliability=hasManagedSurfaceWater?clamp(Math.min(1,flowAvailability)*.55+delivered*.45,0,1):0;
  const groundwaterSupport=wells>0||groundwaterUsed>0?clamp(irrigationSatisfaction*(.35+.65*groundwaterLevel),0,1):0;
  const managedReliability=clamp(Math.max(surfaceReliability,groundwaterSupport*.78)*(.55+.45*irrigationSatisfaction),0,1);
  const effectiveIrrigation=infrastructurePotential*managedReliability;

  const localBuffer=clamp(wells*.18*groundwaterLevel,0,.3);
  const drought=Math.max(0,1-clamp(weatherMultiplier,0,2));
  const droughtProtection=1+drought*clamp(localBuffer+effectiveIrrigation*.5,0,.68);
  const irrigationYieldMultiplier=1+effectiveIrrigation*.30;
  const landYieldFactor=agriculturalLandYieldFactor(region);
  const harvestRetention=Math.max(1,Number(region.agriculturalMachinery?.harvestRetention)||1);
  const fertiliserMultiplier=fertiliserYieldMultiplier(region),pestMultiplier=pestYieldMultiplier(region),pollinatorMultiplier=pollinatorAggregateYieldMultiplier(region);
  const yieldMultiplier=irrigationYieldMultiplier*landYieldFactor*harvestRetention*fertiliserMultiplier*pestMultiplier*pollinatorMultiplier;

  return {riverCount,flowAvailability,surfaceReliability,groundwaterSupport,groundwaterLevel,irrigationSatisfaction,effectiveIrrigation,droughtProtection,yieldMultiplier,irrigationYieldMultiplier,landYieldFactor,harvestRetention,fertiliserMultiplier,pestMultiplier,pollinatorMultiplier,surfaceInflow:inflow,surfaceWithdrawal:withdrawal,groundwaterUsed};
}
