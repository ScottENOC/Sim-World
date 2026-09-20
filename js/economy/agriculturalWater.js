import { effectiveInfrastructureCount } from './construction.js?v=20260914-water3';
import { agriculturalLandYieldFactor } from './agriculturalLand.js?v=20260921-arable1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

// Translate physical water state into an agricultural modifier. Groundwater is
// deliberately excluded until pumping/recharge mechanics exist: surface works
// cannot conjure an infinite aquifer.
export function agriculturalWaterProfile(region,{weatherMultiplier=1}={}){
  const irrigation=Math.max(0,effectiveInfrastructureCount(region,'irrigation'));
  const canal=Math.max(0,effectiveInfrastructureCount(region,'canal'));
  const wells=Math.max(0,effectiveInfrastructureCount(region,'wells_cisterns'));
  const hasManagedSurfaceWater=irrigation>0||canal>0;
  const report=region?.hydrology?.report||{};
  const riverCount=Math.max(0,Number(report.riverCount)||0);
  const inflow=Math.max(0,Number(report.surfaceInflow)||0);
  const withdrawal=Math.max(0,Number(report.surfaceWithdrawal)||0);
  const managedRelease=Math.max(0,Number(report.managedRelease)||0);

  // Relative to a modest per-river reference flow. This is dimensionless and
  // intentionally independent of absolute real-world litres; later climate and
  // river calibration can change flow units without rewriting agriculture.
  const flowAvailability=riverCount>0?clamp(inflow/Math.max(0.12,riverCount*0.65),0,1.35):0;
  const delivered=hasManagedSurfaceWater?clamp((withdrawal+managedRelease*0.35)/Math.max(0.025,riverCount*0.035),0,1):0;
  const infrastructurePotential=clamp(irrigation*0.68+canal*0.42,0,1);
  const surfaceReliability=hasManagedSurfaceWater?clamp(Math.min(1,flowAvailability)*0.55+delivered*0.45,0,1):0;
  const effectiveIrrigation=infrastructurePotential*surfaceReliability;

  // Cisterns/wells provide limited buffering against bad weather but do not
  // substitute for river irrigation or groundwater pumping at regional scale.
  const localBuffer=clamp(wells*0.18,0,0.3);
  const drought=Math.max(0,1-clamp(weatherMultiplier,0,2));
  const droughtProtection=1+drought*clamp(localBuffer+effectiveIrrigation*0.5,0,0.68);
  const irrigationYieldMultiplier=1+effectiveIrrigation*0.30;
  // The farming engine historically multiplied yield by whole regional area.
  // Land accounting converts that coefficient to the physically available
  // arable area while preserving the old calibration for a typical region.
  const landYieldFactor=agriculturalLandYieldFactor(region);
  const yieldMultiplier=irrigationYieldMultiplier*landYieldFactor;

  return {riverCount,flowAvailability,surfaceReliability,effectiveIrrigation,droughtProtection,yieldMultiplier,
    irrigationYieldMultiplier,landYieldFactor,surfaceInflow:inflow,surfaceWithdrawal:withdrawal,groundwaterUsed:0};
}
