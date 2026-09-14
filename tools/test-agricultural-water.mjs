import assert from 'node:assert/strict';
import { agriculturalWaterProfile } from '../js/economy/agriculturalWater.js';

function region(){
  return {
    construction:{assets:[]}, hydrology:{report:{surfaceInflow:0,surfaceWithdrawal:0,managedRelease:0,riverCount:0}},
  };
}
function asset(typeId){return {id:typeId,typeId,condition:1,scale:1};}

{
  const r=region();
  r.construction.assets.push(asset('irrigation'));
  const dry=agriculturalWaterProfile(r,{weatherMultiplier:0.55});
  assert.equal(dry.effectiveIrrigation,0,'irrigation infrastructure without river water gives no irrigation yield bonus');
  assert.equal(dry.groundwaterUsed,0,'surface irrigation does not silently consume groundwater');
}

{
  const r=region();
  r.construction.assets.push(asset('irrigation'));
  r.hydrology.report={surfaceInflow:0.8,surfaceWithdrawal:0.04,managedRelease:0,riverCount:1};
  const wet=agriculturalWaterProfile(r,{weatherMultiplier:0.6});
  assert.ok(wet.effectiveIrrigation>0.45,'adequate river flow activates most irrigation capacity');
  assert.ok(wet.yieldMultiplier>1.1,'working irrigation increases achievable farm yield');
  assert.ok(wet.droughtProtection>1,'working irrigation buffers drought losses');
}

{
  const r=region();
  r.construction.assets.push(asset('irrigation'),asset('canal'));
  r.hydrology.report={surfaceInflow:0.22,surfaceWithdrawal:0.008,managedRelease:0,riverCount:1};
  const scarce=agriculturalWaterProfile(r,{weatherMultiplier:0.55});
  r.hydrology.report={surfaceInflow:0.22,surfaceWithdrawal:0.008,managedRelease:0.06,riverCount:1};
  const released=agriculturalWaterProfile(r,{weatherMultiplier:0.55});
  assert.ok(released.surfaceReliability>scarce.surfaceReliability,'reservoir releases improve irrigation reliability in a dry period');
}

console.log('agricultural water tests passed');
