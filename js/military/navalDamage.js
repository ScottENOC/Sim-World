import { shipCrewReadiness, shipTechnicalReadiness, applyShipCrewCasualties } from './qualifiedPersonnel.js?v=20260919-personnel1';
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const NAVAL_SUBSYSTEMS=Object.freeze({
  PROPULSION:'propulsion',STEERING:'steering',PRIMARY_WEAPONS:'primary_weapons',SECONDARY_WEAPONS:'secondary_weapons',
  FIRE_CONTROL:'fire_control',RADAR:'radar',SONAR:'sonar',ELECTRICAL:'electrical',PUMPS:'pumps',DAMAGE_CONTROL:'damage_control',
});

function spec(ship){return ship?.designStats||{};}
function installedSystems(ship){
  const s=spec(ship),tier=Number(s.tier)||0,prop=ship?.propulsion||s.propulsion||'sail',guns=Math.max(0,Number(ship?.gunCapacity??s.gunCapacity)||0);
  return {
    propulsion:true,steering:true,primary_weapons:guns>0||Number(s.combat)>0.4,
    secondary_weapons:guns>=6||Number(s.secondaryBattery)>0.05||Number(s.antiAircraft)>0.05,
    fire_control:tier>=3||Number(s.fireControl)>0.05||Number(s.fireControlQuality)>0.05,
    radar:Number(s.radarFireControl)>0.03||Number(s.radarCapability)>0.03,
    sonar:Number(s.sonar)>0.03||Number(s.sonarCapability)>0.03,
    electrical:['steam','submersible'].includes(prop)||tier>=5,
    pumps:tier>=4||['steam','submersible'].includes(prop),damage_control:tier>=3||Number(s.damageControl)>0.05,
  };
}

export function initialiseShipDamage(ship){
  if(!ship)return ship;
  const installed=installedSystems(ship);ship.subsystems ||= {};
  for(const [id,on] of Object.entries(installed)){
    const current=ship.subsystems[id];
    ship.subsystems[id]={installed:on,health:on?clamp(current?.health??1):0,lastHitTick:current?.lastHitTick??null};
  }
  ship.damageState ||= {flooding:0,fire:0,disabled:false,sinking:false,underTow:false,towingBy:null,hitLog:[]};
  ship.damageState.hitLog ||= [];
  refreshShipDamageStatus(ship);
  return ship;
}

export function refreshShipDamageStatus(ship){
  initialiseDamageContainers(ship);
  const d=ship.damageState,prop=ship.subsystems.propulsion?.health??1,steer=ship.subsystems.steering?.health??1,pumps=ship.subsystems.pumps?.installed?(ship.subsystems.pumps.health??1):1;
  d.sinking=(ship.condition??1)<=0.07||d.flooding>.92||(d.flooding>.72&&pumps<.15);
  d.disabled=!d.sinking&&((ship.condition??1)<.18||prop<.12||steer<.08);
  if(d.sinking)d.disabled=true;
  return d;
}
function initialiseDamageContainers(ship){
  if(!ship.subsystems){const installed=installedSystems(ship);ship.subsystems={};for(const[id,on]of Object.entries(installed))ship.subsystems[id]={installed:on,health:on?1:0,lastHitTick:null};}
  ship.damageState ||= {flooding:0,fire:0,disabled:false,sinking:false,underTow:false,towingBy:null,hitLog:[]};
  ship.damageState.hitLog ||= [];
}

function weightedSystem(ship,rng){
  initialiseDamageContainers(ship);
  const weights=[['propulsion',1.25],['steering',.65],['primary_weapons',1.15],['secondary_weapons',.85],['fire_control',.8],['radar',.45],['sonar',.35],['electrical',.8],['pumps',.6],['damage_control',.55]]
    .filter(([id])=>ship.subsystems[id]?.installed);
  const total=weights.reduce((s,x)=>s+x[1],0);let roll=rng()*Math.max(.001,total);
  for(const [id,w]of weights){roll-=w;if(roll<=0)return id;}return weights.at(-1)?.[0]||'propulsion';
}

export function applyShipHit(ship,amount,{rng=Math.random,tick=null,catastrophic=false}={}){
  initialiseShipDamage(ship);const s=spec(ship),dc=clamp(Number(s.damageControl)||0),raw=clamp(amount,0,1.5);
  const hullLoss=raw*(1-dc*.24)*(catastrophic?1.25:1);ship.condition=clamp((ship.condition??1)-hullLoss,0,1);
  const hits=catastrophic?2:(rng()<clamp(.15+raw*.8)?2:1),damaged=[];
  for(let i=0;i<hits;i++){
    const id=weightedSystem(ship,rng),system=ship.subsystems[id];if(!system)continue;
    const shock=clamp((.18+raw*(.75+-.15+rng()*.3))*(catastrophic?1.28:1),.08,.9);
    system.health=clamp(system.health-shock);system.lastHitTick=tick;damaged.push({id,damage:shock,health:system.health});
  }
  const pumpHealth=ship.subsystems.pumps?.installed?ship.subsystems.pumps.health:1,controlHealth=ship.subsystems.damage_control?.installed?ship.subsystems.damage_control.health:1;
  if(rng()<clamp(raw*.72+(catastrophic?.18:0)))ship.damageState.flooding=clamp(ship.damageState.flooding+raw*(.45+(1-pumpHealth)*.45));
  if(rng()<clamp(raw*.58+(catastrophic?.15:0)))ship.damageState.fire=clamp(ship.damageState.fire+raw*(.42+(1-controlHealth)*.42));
  const crewLost=applyShipCrewCasualties(ship,raw*(catastrophic?1.35:1),{rng});ship.damageState.hitLog.push({tick,amount:raw,catastrophic,damaged,crewLost});if(ship.damageState.hitLog.length>12)ship.damageState.hitLog.splice(0,ship.damageState.hitLog.length-12);
  refreshShipDamageStatus(ship);return {ship,damaged,condition:ship.condition,...ship.damageState};
}

export function tickShipDamageAtSea(ship,weeks=1){
  initialiseShipDamage(ship);const w=Math.max(0,Number(weeks)||0),d=ship.damageState;
  const pumps=ship.subsystems.pumps?.installed?ship.subsystems.pumps.health:1,control=ship.subsystems.damage_control?.installed?ship.subsystems.damage_control.health:1,crew=shipCrewReadiness(ship),technical=shipTechnicalReadiness(ship);
  const floodControl=clamp((.12+pumps*.58+control*.18)*(.62+.22*crew+.16*technical)),fireControl=clamp((.12+control*.62+(ship.subsystems.electrical?.health??1)*.08)*(.62+.22*crew+.16*technical));
  d.flooding=clamp(d.flooding-w*.035*floodControl+w*.018*(1-floodControl));d.fire=clamp(d.fire-w*.05*fireControl+w*.014*(1-fireControl));
  const ongoing=w*(d.flooding*d.flooding*.018+d.fire*d.fire*.014);if(ongoing>0)ship.condition=clamp((ship.condition??1)-ongoing,0,1);
  refreshShipDamageStatus(ship);return d;
}

export function shipPropulsionMultiplier(ship){
  initialiseShipDamage(ship);const prop=ship.subsystems.propulsion?.health??1,steer=ship.subsystems.steering?.health??1;
  if(ship.damageState.sinking)return .02;if(ship.damageState.underTow)return .18;
  return clamp((.08+prop*.68+steer*.24)*(.72+.28*shipTechnicalReadiness(ship)),.05,1);
}
export function shipCombatMultiplier(ship){
  initialiseShipDamage(ship);if(ship.damageState.sinking)return 0;
  const p=ship.subsystems.primary_weapons?.installed?ship.subsystems.primary_weapons.health:1,s=ship.subsystems.secondary_weapons?.installed?ship.subsystems.secondary_weapons.health:1;
  const fc=ship.subsystems.fire_control?.installed?ship.subsystems.fire_control.health:1,e=ship.subsystems.electrical?.installed?ship.subsystems.electrical.health:1;
  const radar=ship.subsystems.radar?.installed?ship.subsystems.radar.health:1;
  const disabled=ship.damageState.disabled?.72:1;
  return clamp((p*.55+s*.15+fc*.20+e*.06+radar*.04)*disabled*(.62+.38*shipCrewReadiness(ship)),.03,1);
}
export function shipSensorMultiplier(ship,type='radar'){
  initialiseShipDamage(ship);const sensor=ship.subsystems[type]?.installed?ship.subsystems[type].health:0,fc=ship.subsystems.fire_control?.installed?ship.subsystems.fire_control.health:1,e=ship.subsystems.electrical?.installed?ship.subsystems.electrical.health:1;
  return clamp(sensor*(.55+fc*.25+e*.20)*(.65+.35*shipCrewReadiness(ship)));
}

export function repairShipDamage(ship,repairAmount,{dockyard=false}={}){
  initialiseShipDamage(ship);const amount=Math.max(0,Number(repairAmount)||0);if(amount<=0)return ship;
  ship.condition=clamp((ship.condition??1)+amount);
  ship.damageState.flooding=clamp(ship.damageState.flooding-amount*(dockyard?2.4:1.1));ship.damageState.fire=clamp(ship.damageState.fire-amount*(dockyard?3:1.5));
  for(const system of Object.values(ship.subsystems)){
    if(!system.installed||system.health>=1)continue;
    const cap=!dockyard&&system.health<.25?.45:1;system.health=Math.min(cap,system.health+amount*(dockyard?1.7:.55));
  }
  if(dockyard&&ship.condition>.32){ship.damageState.underTow=false;ship.damageState.towingBy=null;}
  refreshShipDamageStatus(ship);return ship;
}

export function fleetSalvageCapability(fleet){
  let capacity=0,tugs=[];
  for(const ship of fleet?.ships||[]){
    initialiseShipDamage(ship);const salvage=Math.max(0,Number(spec(ship).salvageCapacity??ship.salvageCapacity)||0);if(salvage<=0||ship.damageState.sinking)continue;
    const effective=salvage*(ship.condition??1)*shipPropulsionMultiplier(ship);if(effective>.03){capacity+=effective;tugs.push({ship,effective});}
  }
  return {capacity,tugs};
}

export function attemptFleetSalvage(fleet,casualty,{rng=Math.random,hostilePressure=.5}={}){
  initialiseShipDamage(casualty);const salvage=fleetSalvageCapability(fleet);if(salvage.capacity<=0)return {recovered:false,reason:'no_salvage_vessel'};
  const damage=1-clamp(casualty.condition??0),difficulty=clamp(.22+damage*.48+hostilePressure*.30+(casualty.damageState.sinking?.18:0));
  const chance=clamp(.08+salvage.capacity*.42-difficulty*.34,.03,.82);
  if(rng()>=chance)return {recovered:false,reason:'salvage_failed',chance};
  const tug=salvage.tugs.sort((a,b)=>b.effective-a.effective)[0]?.ship;casualty.condition=Math.max(.09,casualty.condition??0);casualty.damageState.sinking=false;casualty.damageState.disabled=true;casualty.damageState.underTow=true;casualty.damageState.towingBy=tug?.id||null;
  casualty.damageState.flooding=Math.min(casualty.damageState.flooding,.78);casualty.damageState.fire=Math.min(casualty.damageState.fire,.55);
  return {recovered:true,chance,tugId:tug?.id||null,ship:casualty};
}

export function fleetTowSpeedMultiplier(fleet){
  const towed=(fleet?.ships||[]).filter(s=>s.damageState?.underTow).length;if(!towed)return 1;
  const salvage=fleetSalvageCapability(fleet).capacity;return clamp(.22+salvage*.18/Math.max(1,towed),.18,.62);
}
