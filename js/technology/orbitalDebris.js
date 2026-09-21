const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);

export const ORBIT_BANDS=Object.freeze({VLEO:'vleo',LEO:'leo',HIGH_LEO:'high_leo',MEO:'meo',GEO:'geo'});
const NATURAL_CLEARANCE_YEARS={vleo:1.5,leo:7,high_leo:60,meo:180,geo:1000};
const COLLISION_WEIGHT={vleo:.20,leo:.55,high_leo:1,meo:.78,geo:.52};
const FRAGMENTS_PER_DESTRUCTION={vleo:18,leo:32,high_leo:68,meo:55,geo:42};

function defaultBand(sat){
  if(sat?.orbitBand)return sat.orbitBand;
  if(sat?.architecture==='proliferated_leo')return ORBIT_BANDS.VLEO;
  if(sat?.role==='navigation')return ORBIT_BANDS.MEO;
  if(sat?.role==='communications')return ORBIT_BANDS.GEO;
  if(sat?.role==='reconnaissance'||sat?.role==='weather')return ORBIT_BANDS.LEO;
  return ORBIT_BANDS.HIGH_LEO;
}
function defaultStationKeepingYears(sat,band){
  if(Number.isFinite(sat?.stationKeepingFuelYears))return Math.max(0,sat.stationKeepingFuelYears);
  if(band===ORBIT_BANDS.VLEO||band===ORBIT_BANDS.LEO)return 7;
  if(band===ORBIT_BANDS.HIGH_LEO)return 18;
  if(band===ORBIT_BANDS.MEO)return 35;
  return 55;
}

export function ensureOrbitalEnvironment(region){
  region.orbitalEnvironment||={bands:{},policy:{endOfLifeDisposal:true,reserveDisposalFuelYears:5,trafficCoordination:.35,tracking:.25,activeDebrisRemoval:0},durableControlMargin:0,annualCascadeRisk:0};
  const s=region.orbitalEnvironment;s.bands||={};s.policy||={};
  if(s.policy.endOfLifeDisposal===undefined)s.policy.endOfLifeDisposal=true;
  if(!Number.isFinite(s.policy.reserveDisposalFuelYears))s.policy.reserveDisposalFuelYears=5;
  for(const b of Object.values(ORBIT_BANDS))s.bands[b]||={dead:0,debris:0,retiredThisTick:0,disposedThisTick:0,combatFragmentsThisTick:0,collisionFragmentsThisTick:0};
  return s;
}

export function setOrbitalDebrisPolicy(region,patch={}){const s=ensureOrbitalEnvironment(region);Object.assign(s.policy,patch);s.policy.tracking=clamp(s.policy.tracking);s.policy.trafficCoordination=clamp(s.policy.trafficCoordination);s.policy.activeDebrisRemoval=clamp(s.policy.activeDebrisRemoval);s.policy.reserveDisposalFuelYears=Math.max(0,Number(s.policy.reserveDisposalFuelYears)||0);return s.policy;}

export function configureSatelliteOrbit(sat,{band=null,stationKeepingFuelYears=null,autoDeorbit=null}={}){
  sat.orbitBand=band||defaultBand(sat);
  sat.stationKeepingFuelYears=stationKeepingFuelYears===null?defaultStationKeepingYears(sat,sat.orbitBand):Math.max(0,Number(stationKeepingFuelYears)||0);
  sat.autoDeorbit=autoDeorbit===null?(sat.orbitBand===ORBIT_BANDS.VLEO||sat.orbitBand===ORBIT_BANDS.LEO):Boolean(autoDeorbit);
  sat.disposalFuelReserveYears=Math.min(5,sat.stationKeepingFuelYears);
  return sat;
}

export function recordOrbitalCombat(region,satellite,{fragmentSeverity=1}={}){
  const s=ensureOrbitalEnvironment(region),sat=configureSatelliteOrbit(satellite),b=s.bands[sat.orbitBand];
  if(sat._debrisAccounted)return 0;
  const fragments=FRAGMENTS_PER_DESTRUCTION[sat.orbitBand]*(.65+.7*clamp(fragmentSeverity))*Math.max(.2,Number(sat.serviceFraction)||1);
  b.debris+=fragments;b.combatFragmentsThisTick+=fragments;sat._debrisAccounted=true;sat.disposalOutcome='destroyed_uncontrolled';
  return fragments;
}

function disposalFraction(state,sat){
  const band=sat.orbitBand;
  if(!state.policy.endOfLifeDisposal)return 0;
  if((band===ORBIT_BANDS.VLEO||band===ORBIT_BANDS.LEO)&&sat.autoDeorbit!==false)return .995;
  const reserve=Math.max(0,Number(state.policy.reserveDisposalFuelYears)||0);
  if(nonNegative(sat.stationKeepingFuelYears)>=reserve&&reserve>0)return clamp(.72+state.policy.trafficCoordination*.16+state.policy.tracking*.08);
  return clamp(.18+state.policy.trafficCoordination*.17+state.policy.tracking*.08);
}

function retireSatellite(state,sat){
  if(sat._retirementHandled||sat.destroyedBy)return;
  const band=sat.orbitBand,b=state.bands[band],fraction=disposalFraction(state,sat),disposed=Math.max(.2,Number(sat.serviceFraction)||1)*fraction,abandoned=Math.max(.2,Number(sat.serviceFraction)||1)-disposed;
  b.retiredThisTick+=Math.max(.2,Number(sat.serviceFraction)||1);b.disposedThisTick+=disposed;
  if(band===ORBIT_BANDS.VLEO||band===ORBIT_BANDS.LEO){b.dead+=abandoned*.12;b.debris+=abandoned*.10;sat.disposalOutcome=fraction>.9?'natural_reentry':'partial_reentry';}
  else if(disposed>0){b.dead+=abandoned;sat.stationKeepingFuelYears=Math.max(0,nonNegative(sat.stationKeepingFuelYears)-Math.min(5,nonNegative(sat.stationKeepingFuelYears)));sat.disposalOutcome='controlled_deorbit';}
  else{b.dead+=abandoned;sat.disposalOutcome='abandoned';}
  sat._retirementHandled=true;
}

function clearAndCollide(state,band,active,years,rng,events,currentTick){
  const b=state.bands[band],clearance=1-Math.pow(.5,years/Math.max(.1,NATURAL_CLEARANCE_YEARS[band]));
  b.debris=Math.max(0,b.debris-b.debris*clearance);b.dead=Math.max(0,b.dead-b.dead*clearance*.35);
  const avoidance=clamp(state.policy.tracking*.55+state.policy.trafficCoordination*.45),density=active+b.dead+b.debris*.09;
  const expected=COLLISION_WEIGHT[band]*density*density*1.7e-6*(1-avoidance*.80)*years;
  if(expected>0&&rng()<clamp(expected,0,.22)){
    const fragments=(18+FRAGMENTS_PER_DESTRUCTION[band]*.55)*(1-avoidance*.25);b.debris+=fragments;b.collisionFragmentsThisTick+=fragments;
    events.push({type:'orbital_debris_collision',tick:currentTick,orbitBand:band,fragments});
  }
  const removal=clamp(state.policy.activeDebrisRemoval)*Math.min(b.debris,(3+state.policy.activeDebrisRemoval*40)*years);b.debris-=removal;
}

export function tickOrbitalDebris(regions,currentTick=0,rng=Math.random,elapsedDays=7){
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,events=[];
  let globalHazard=0,globalDebris=0,globalActive=0;
  for(const region of regions||[]){
    const sats=region.orbitalProgramme?.satellites;if(!sats?.length&&!region.orbitalEnvironment)continue;
    const state=ensureOrbitalEnvironment(region);for(const b of Object.values(ORBIT_BANDS)){state.bands[b].retiredThisTick=0;state.bands[b].disposedThisTick=0;state.bands[b].combatFragmentsThisTick=0;state.bands[b].collisionFragmentsThisTick=0;}
    const activeByBand={};
    for(const sat of sats||[]){configureSatelliteOrbit(sat);sat.stationKeepingFuelYears=Math.max(0,nonNegative(sat.stationKeepingFuelYears)-years);if(sat.destroyedBy)recordOrbitalCombat(region,sat,{fragmentSeverity:1});else if(!sat.operational||nonNegative(sat.remainingLifeDays)<=0)retireSatellite(state,sat);else activeByBand[sat.orbitBand]=(activeByBand[sat.orbitBand]||0)+Math.max(.2,Number(sat.serviceFraction)||1);}
    let localHazard=0,localDebris=0,localActive=0;
    for(const band of Object.values(ORBIT_BANDS)){clearAndCollide(state,band,activeByBand[band]||0,years,rng,events,currentTick);const b=state.bands[band];localHazard+=COLLISION_WEIGHT[band]*(b.dead+b.debris*.12);localDebris+=b.debris;localActive+=activeByBand[band]||0;}
    const control=clamp((state.policy.endOfLifeDisposal?1:0)*.25+state.policy.tracking*.23+state.policy.trafficCoordination*.20+state.policy.activeDebrisRemoval*.10+clamp(1-localHazard/160)*.22);
    state.annualCascadeRisk=clamp((localHazard/180)**1.6*(1-control*.60));state.durableControlMargin=clamp(control-state.annualCascadeRisk*.82);
    state.summary={activeSatellites:localActive,debrisObjects:localDebris,hazard:localHazard,annualCascadeRisk:state.annualCascadeRisk,durableControlMargin:state.durableControlMargin};region.report||={};region.report.orbitalDebris={workers:0,...state.summary};
    globalHazard+=localHazard;globalDebris+=localDebris;globalActive+=localActive;
  }
  const density=clamp(globalHazard/55,0,5);for(const region of regions||[]){if(region.orbitalEnvironment)region.orbitalEnvironment.debrisDensity=density;}
  return {events,summary:{activeSatellites:globalActive,debrisObjects:globalDebris,hazard:globalHazard,debrisDensity:density}};
}

export function orbitalDebrisSummary(region){return ensureOrbitalEnvironment(region).summary||{activeSatellites:0,debrisObjects:0,hazard:0,annualCascadeRisk:0,durableControlMargin:0};}
