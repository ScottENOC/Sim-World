import assert from 'node:assert/strict';
import {
  DIRECTED_ENERGY_TECH_IDS, buildGroundLaserDefence, directedEnergyPlatformCapability,
  engageLaserDefence, fitAircraftLaser, fitShipLaser, fitVehicleLaser,
  tickDirectedEnergyBreakthroughs, tickDirectedEnergyDefence
} from '../js/military/directedEnergy.js';
import { BATTERY_TECH_IDS } from '../js/economy/batteryStorage.js';

const r={
  id:'laser-state',treasury:5000,stockpile:{steel:500},
  unlockedTechIds:new Set(['surface_to_air_missiles','jet_propulsion',BATTERY_TECH_IDS.LITHIUM_ION]),
  industrialSupply:{capability:{precision_machining:.92},inventory:{machine_components:400}},
  industrialPlants:{componentCapability:{electronics:.94,radar_set:.90,radio_navigation:.90}},
  structuralTransformation:{capability:{manufacture:.90}},
  electricity:{service:.9,industrialService:.9},
  guidedAirDefence:{gunEngagements:50,samShots:30,samKills:20},
};

for(let i=0;i<5;i++)tickDirectedEnergyBreakthroughs([r],i,()=>0,365);
for(const id of Object.values(DIRECTED_ENERGY_TECH_IDS))assert.ok(r.unlockedTechIds.has(id),`expected breakthrough ${id}`);

const built=buildGroundLaserDefence(r,{count:1});
assert.equal(built.built,true,'mature laser state should be able to build fixed/ship-scale defensive laser');
const chargeBefore=r.directedEnergyDefence.capacitorCharge;
tickDirectedEnergyDefence(r,7);
assert.ok(r.directedEnergyDefence.capacitorCharge>=chargeBefore,'grid power should recharge laser energy reserve');

const slowDrone={signature:.2,speed:.15,altitude:.12,replacementValue:2,damagePotential:.2};
const shot=engageLaserDefence(r,slowDrone,{rng:()=>0});
assert.equal(shot.engaged,true);
assert.equal(shot.killed,true);
assert.ok(shot.cashPerEngagement<1,'laser shot should be cheap compared with missile interceptors');

const ship={tier:10,designStats:{tier:10}};
assert.equal(fitShipLaser(r,ship).fitted,true,'large modern warship should accept first-generation bulky laser');
assert.equal(ship.directedEnergyDefence.platform,'ship');

const tank={stats:{onboardPower:.7,integration:.6}};
assert.equal(fitVehicleLaser(r,tank).fitted,true,'vehicle laser requires later compact systems and sufficient onboard power');
assert.equal(tank.stats.directedEnergyDefence.platform,'vehicle');

const jet={stats:{onboardPower:.72,reliability:.78}};
assert.equal(fitAircraftLaser(r,jet).fitted,true,'airborne laser should require final miniaturisation breakthrough and capable aircraft');
assert.equal(jet.stats.directedEnergyDefence.platform,'aircraft');

assert.equal(directedEnergyPlatformCapability(r,'ship').available,true);
assert.ok(directedEnergyPlatformCapability(r,'aircraft').powerBurden>directedEnergyPlatformCapability(r,'vehicle').powerBurden,'airborne laser integration should remain power constrained');

console.log('Directed energy regressions passed');
