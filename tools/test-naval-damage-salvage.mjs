import assert from 'node:assert/strict';
import { initialiseShipDamage, applyShipHit, shipPropulsionMultiplier, shipCombatMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from '../js/military/navalDamage.js';

function warship(id='warship'){
  return initialiseShipDamage({id,designId:'test_warship',condition:1,gunCapacity:12,propulsion:'steam',designStats:{tier:8,propulsion:'steam',gunCapacity:12,combat:4,speed:1.7,damageControl:.35,radarFireControl:.5,sonar:.35}});
}
function tug(id='tug'){
  return initialiseShipDamage({id,designId:'fleet_tug',condition:1,gunCapacity:1,propulsion:'steam',designStats:{tier:6,propulsion:'steam',gunCapacity:1,combat:.18,speed:1.5,salvageCapacity:1,towPower:1}});
}

const propulsionHit=warship('propulsion-hit');
applyShipHit(propulsionHit,.35,{rng:()=>0});
assert(propulsionHit.subsystems.propulsion.health<1,'a hit should be able to damage propulsion separately from the hull');
assert(shipPropulsionMultiplier(propulsionHit)<1,'propulsion damage should reduce speed without requiring the ship to sink');
assert(propulsionHit.condition>0,'a machinery hit should leave a damaged but extant hull');

const weaponsHit=warship('weapons-hit');
const seq=[.9,.30,.9,.9,.9];let i=0;applyShipHit(weaponsHit,.42,{rng:()=>seq[i++]??.9});
assert(weaponsHit.subsystems.primary_weapons.health<1,'the hit resolver should be able to knock out main armament');
assert(shipCombatMultiplier(weaponsHit)<1,'subsystem damage should reduce fighting effectiveness independently of hull condition');

const crippled=warship('crippled');
crippled.condition=.11;crippled.subsystems.propulsion.health=.05;crippled.damageState.flooding=.82;crippled.damageState.sinking=true;crippled.damageState.disabled=true;
const fleetWithoutTug={ships:[warship('escort')]};
assert.equal(attemptFleetSalvage(fleetWithoutTug,crippled,{rng:()=>0}).recovered,false,'a fleet without salvage capacity should not magically recover a cripple');

const recoverable=warship('recoverable');
recoverable.condition=.11;recoverable.subsystems.propulsion.health=.05;recoverable.damageState.flooding=.82;recoverable.damageState.sinking=true;recoverable.damageState.disabled=true;
const fleetWithTug={ships:[warship('escort2'),tug()]};
const recovery=attemptFleetSalvage(fleetWithTug,recoverable,{rng:()=>0,hostilePressure:.2});
assert(recovery.recovered,'a capable fleet tug should be able to stabilise and recover some crippled ships');
assert(recoverable.damageState.underTow,'a recovered cripple should remain under tow rather than becoming combat-ready');
fleetWithTug.ships.push(recoverable);
assert(fleetTowSpeedMultiplier(fleetWithTug)<1,'towing a cripple should slow the fleet');

const beforeRepair=recoverable.subsystems.propulsion.health;
repairShipDamage(recoverable,.35,{dockyard:false});
assert(recoverable.subsystems.propulsion.health>beforeRepair,'at-sea/harbour repair should restore some subsystem function');
assert(recoverable.subsystems.propulsion.health<=.45,'severely damaged machinery should not be fully rebuilt without a dockyard');
repairShipDamage(recoverable,.8,{dockyard:true});
assert(recoverable.subsystems.propulsion.health>.8,'dockyard repair should be capable of rebuilding heavily damaged machinery');
assert(!recoverable.damageState.underTow,'a properly repaired ship should leave tow status');

console.log('naval subsystem damage, dockyard repair and salvage/tug regressions passed');
