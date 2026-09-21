import assert from 'node:assert/strict';
import { ORBIT_BANDS, ensureOrbitalEnvironment, setOrbitalDebrisPolicy, tickOrbitalDebris } from '../js/technology/orbitalDebris.js';

const noCollision=()=>1;
function region(id,satellites=[]){return{id,population:1_000_000,orbitalProgramme:{satellites},report:{}};}
function sat(id,overrides={}){return{id,role:'scientific',architecture:'single_satellite',serviceFraction:1,operational:true,condition:1,remainingLifeDays:100,designLifeDays:100,ownerPolityId:'p',...overrides};}

{
  const r=region('vleo',[sat('v',{architecture:'proliferated_leo',operational:false,remainingLifeDays:0,stationKeepingFuelYears:0})]);
  tickOrbitalDebris([r],1,noCollision,7);
  const b=r.orbitalEnvironment.bands[ORBIT_BANDS.VLEO];
  assert.ok(b.disposedThisTick>0.99,'VLEO constellation satellites should essentially self-clear at end of life');
  assert.ok(b.debris<0.02,'routine VLEO retirement should create negligible persistent debris');
}

{
  const high=sat('geo',{role:'communications',operational:false,remainingLifeDays:0,stationKeepingFuelYears:50});
  const r=region('geo',[high]);setOrbitalDebrisPolicy(r,{tracking:.8,trafficCoordination:.8,reserveDisposalFuelYears:5,endOfLifeDisposal:true});
  tickOrbitalDebris([r],2,noCollision,7);
  const b=r.orbitalEnvironment.bands[ORBIT_BANDS.GEO];
  assert.ok(b.disposedThisTick>.8,'high-orbit satellite with ample station-keeping reserve should perform controlled disposal');
  assert.equal(high.disposalOutcome,'controlled_deorbit');
  assert.ok(high.stationKeepingFuelYears<46,'controlled disposal should deliberately spend roughly the reserved final five years of station-keeping fuel');
}

{
  const abandoned=sat('abandoned',{role:'communications',operational:false,remainingLifeDays:0,stationKeepingFuelYears:50});
  const r=region('abandon',[abandoned]);setOrbitalDebrisPolicy(r,{endOfLifeDisposal:false});
  tickOrbitalDebris([r],3,noCollision,7);
  assert.ok(r.orbitalEnvironment.bands[ORBIT_BANDS.GEO].dead>.95,'without disposal policy high-orbit spacecraft should remain as long-lived derelicts');
}

{
  const peaceful=region('peace',Array.from({length:12},(_,i)=>sat(`p${i}`,{role:'weather',remainingLifeDays:1000,designLifeDays:1000})));
  tickOrbitalDebris([peaceful],4,noCollision,7);
  const baseline=peaceful.orbitalEnvironment.annualCascadeRisk;
  const warSat=sat('war',{role:'scientific',orbitBand:ORBIT_BANDS.HIGH_LEO,operational:false,remainingLifeDays:800,destroyedBy:{actorId:'enemy',attackType:'kinetic_asat',tick:4}});
  const war=region('war',[warSat]);
  tickOrbitalDebris([war],4,noCollision,7);
  const b=war.orbitalEnvironment.bands[ORBIT_BANDS.HIGH_LEO];
  assert.ok(b.debris>50,'kinetic destruction should create a large uncontrolled fragment cloud');
  assert.ok(war.orbitalEnvironment.annualCascadeRisk>baseline,'destructive space combat should sharply worsen cascade risk');
  assert.equal(warSat.disposalOutcome,'destroyed_uncontrolled');
}

{
  const low=region('low');const high=region('high');
  ensureOrbitalEnvironment(low).bands[ORBIT_BANDS.VLEO].debris=100;
  ensureOrbitalEnvironment(high).bands[ORBIT_BANDS.GEO].debris=100;
  tickOrbitalDebris([low,high],5,noCollision,3652.425);
  assert.ok(low.orbitalEnvironment.bands[ORBIT_BANDS.VLEO].debris<high.orbitalEnvironment.bands[ORBIT_BANDS.GEO].debris*.08,'low-orbit debris should naturally clear far faster than high-orbit debris');
}

console.log('Orbital debris regressions passed');
