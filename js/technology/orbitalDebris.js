const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);

export const ORBIT_BANDS=Object.freeze({VLEO:'vleo',LEO:'leo',HIGH_LEO:'high_leo',MEO:'meo',GEO:'geo'});
const NATURAL_CLEARANCE_YEARS={vleo:2,leo:8,high_leo:55,meo:180,geo:1000};
const COLLISION_WEIGHT={vleo:.25,leo:.65,high_leo:1,meo:.8,geo:.55};

export function ensureOrbitalEnvironment(region){
  region.orbitalEnvironment||={bands:{},policy:{endOfLifeDisposal:true,reserveDisposalFuelYears:5,trafficCoordination:.35,tracking:.25,activeDebrisRemoval:0},durableControlMargin:0,annualCascadeRisk:0};
  const s=region.orbitalEnvironment;
  s.bands||={};s.policy||={};
  for(const b of Object.values(ORBIT_BANDS))s.bands[b]||={active:0,dead:0,debris:0,retiredThisTick:0,disposedThisTick:0,combatFragmentsThisTick:0};
  return s;
}

export function registerSatellite(region,{band=ORBIT_BANDS.LEO,count=1,designLifeYears=5,stationKeepingFuelYears=10,autoDeorbit=true}={}){
  const s=ensureOrbitalEnvironment(region),shelf=s.bands[band]||s.bands.leo;
  shelf.active+=nonNegative(count);
  shelf._cohorts||=[];
  shelf._cohorts.push({count:nonNegative(count),ageYears:0,designLifeYears:Math.max(.25,Number(designLifeYears)||5),stationKeepingFuelYears:Math.max(0,Number(stationKeepingFuelYears)||0),autoDeorbit:autoDeorbit!==false});
}

export function recordOrbitalCombat(region,{band=ORBIT_BANDS.HIGH_LEO,destroyed=1,fragmentSeverity=1}={}){
  const s=ensureOrbitalEnvironment(region),b=s.bands[band]||s.bands.high_leo;
  const lost=Math.min(nonNegative(b.active),nonNegative(destroyed));
  b.active-=lost;
  const fragments=lost*(18+42*clamp(fragmentSeverity));
  b.debris+=fragments;b.combatFragmentsThisTick+=fragments;
  return fragments;
}

function disposalFraction(state,band,cohort){
  if(!state.policy.endOfLifeDisposal)return 0;
  if((band===ORBIT_BANDS.VLEO||band===ORBIT_BANDS.LEO)&&cohort.autoDeorbit)return .98;
  const reserve=Math.max(0,Number(state.policy.reserveDisposalFuelYears)||0);
  if(cohort.stationKeepingFuelYears>=reserve&&reserve>0)return clamp(.55+state.policy.trafficCoordination*.25+state.policy.tracking*.15);
  return clamp(.12+state.policy.trafficCoordination*.18);
}

function tickBand(state,band,years){
  const b=state.bands[band];b.retiredThisTick=0;b.disposedThisTick=0;b.combatFragmentsThisTick=0;
  const survivors=[];
  for(const c of b._cohorts||[]){c.ageYears+=years;c.stationKeepingFuelYears=Math.max(0,c.stationKeepingFuelYears-years);if(c.ageYears<c.designLifeYears){survivors.push(c);continue;}
    const retiring=c.count;b.active=Math.max(0,b.active-retiring);b.retiredThisTick+=retiring;
    const disposal=retiring*disposalFraction(state,band,c);b.disposedThisTick+=disposal;
    const abandoned=retiring-disposal;
    if(band===ORBIT_BANDS.VLEO||band===ORBIT_BANDS.LEO){b.dead+=abandoned*.22;b.debris+=abandoned*.3;}else b.dead+=abandoned;
  }
  b._cohorts=survivors;
  const clearance=1-Math.pow(.5,years/Math.max(.1,NATURAL_CLEARANCE_YEARS[band]));
  const clearedDebris=b.debris*clearance,clearedDead=b.dead*clearance*.45;
  b.debris=Math.max(0,b.debris-clearedDebris);b.dead=Math.max(0,b.dead-clearedDead);
  const density=b.active+b.dead+b.debris*.08;
  const avoidance=clamp(state.policy.tracking*.55+state.policy.trafficCoordination*.45);
  const collisionRate=COLLISION_WEIGHT[band]*density*density*1e-7*(1-avoidance*.82)*years;
  const collisions=Math.min(b.active+b.dead,collisionRate);
  if(collisions>0){const activeShare=b.active/Math.max(.001,b.active+b.dead);b.active=Math.max(0,b.active-collisions*activeShare);b.dead=Math.max(0,b.dead-collisions*(1-activeShare));b.debris+=collisions*28;}
  const removal=clamp(state.policy.activeDebrisRemoval)*Math.min(b.debris,Math.max(0,4+state.policy.activeDebrisRemoval*36)*years);
  b.debris-=removal;
  return {collisions,removal};
}

export function tickOrbitalDebris(region,elapsedDays=7){
  const s=ensureOrbitalEnvironment(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  let hazard=0,totalDebris=0,totalActive=0;
  for(const band of Object.values(ORBIT_BANDS)){tickBand(s,band,years);const b=s.bands[band];hazard+=COLLISION_WEIGHT[band]*(b.dead+b.debris*.12);totalDebris+=b.debris;totalActive+=b.active;}
  const control=clamp((s.policy.endOfLifeDisposal?1:0)*.22+s.policy.tracking*.24+s.policy.trafficCoordination*.22+s.policy.activeDebrisRemoval*.12+clamp(1-hazard/180)*.20);
  s.annualCascadeRisk=clamp((hazard/220)**1.55*(1-control*.58));
  s.durableControlMargin=clamp(control-s.annualCascadeRisk*.8);
  s.summary={activeSatellites:totalActive,debrisObjects:totalDebris,hazard,annualCascadeRisk:s.annualCascadeRisk,durableControlMargin:s.durableControlMargin};
  region.report||={};region.report.orbitalDebris={workers:0,...s.summary};
  return s.summary;
}

export function orbitalDebrisSummary(region){return ensureOrbitalEnvironment(region).summary||tickOrbitalDebris(region,0);}
