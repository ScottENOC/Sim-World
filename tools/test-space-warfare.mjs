import assert from 'node:assert/strict';
import { conductSpaceAttack, fitOrbitalWeapon, SPACE_ATTACK_TYPES, SPACE_WARFARE_TECH_IDS, tickSpaceWarfare } from '../js/military/spaceWarfare.js';

function region(id,actor){return{
  id,name:id,polityId:actor,treasury:5000,stockpile:{steel:100},
  unlockedTechIds:new Set(['orbital_spaceflight_systems','radar','strategic_missile_systems','high_energy_laser_weapon_research','shipborne_high_energy_laser',...Object.values(SPACE_WARFARE_TECH_IDS)]),
  industrialPlants:{componentCapability:{electronics:.95,radio_navigation:.94,radar_set:.92}},industrialSupply:{capability:{precision_machining:.92}},electricity:{industrialService:.94},
  spaceProgramme:{completedMilestones:['first_rocket_space','first_satellite','first_human_space'],history:[]},
  orbitalSupport:{scienceObservation:.4,weatherObservation:.4,civilianCommunications:.8,militaryReconnaissance:.75,militaryCommand:.7,remoteControl:.8,navigation:.5,droneBeyondLineOfSightControl:.8,operationalSatellites:2},
};}

const attacker=region('attacker','A'),target=region('target','B');
target.orbitalProgramme={totalLaunches:4,satellites:[
 {id:'sat_comm',role:'communications',use:'dual_use',condition:1,operational:true,designLifeDays:1000,remainingLifeDays:900},
 {id:'sat_recon',role:'reconnaissance',use:'military',condition:1,operational:true,designLifeDays:1000,remainingLifeDays:900},
]};
attacker.orbitalProgramme={totalLaunches:5,satellites:[{id:'sat_weapon',role:'reconnaissance',use:'military',condition:1,operational:true,designLifeDays:1000,remainingLifeDays:900}]};
const regions=[attacker,target];

const beforeDrone=target.orbitalSupport.droneBeyondLineOfSightControl;
const jam=conductSpaceAttack(regions,'A','B',SPACE_ATTACK_TYPES.JAM,{targetSatelliteId:'sat_comm',currentTick:100,rng:()=>0});
assert.equal(jam.attacked,true);assert.equal(jam.success,true);assert.equal(target.orbitalProgramme.satellites[0].jammedFraction,.72);
tickSpaceWarfare(regions,101,()=>1,7);
assert.ok(target.orbitalSupport.droneBeyondLineOfSightControl<beforeDrone,'communications jamming should reduce satellite-backed drone control');
assert.ok(target.orbitalSupport.militaryReconnaissance>.5,'communications jamming should not erase reconnaissance capability');

const fitted=fitOrbitalWeapon(attacker,attacker.orbitalProgramme.satellites[0],SPACE_ATTACK_TYPES.DAZZLE);
assert.equal(fitted.fitted,true);assert.ok(attacker.orbitalProgramme.satellites[0].weaponSystems.includes(SPACE_ATTACK_TYPES.DAZZLE));

const dazzle=conductSpaceAttack(regions,'A','B',SPACE_ATTACK_TYPES.DAZZLE,{targetSatelliteId:'sat_recon',currentTick:110,rng:()=>0});
assert.equal(dazzle.success,true);assert.ok(target.orbitalProgramme.satellites[1].dazzledDaysRemaining>0);

const kinetic=conductSpaceAttack(regions,'A','B',SPACE_ATTACK_TYPES.KINETIC,{targetSatelliteId:'sat_recon',currentTick:120,rng:()=>0});
assert.equal(kinetic.success,true);assert.equal(target.orbitalProgramme.satellites[1].operational,false);assert.ok(kinetic.debrisDensity>0,'kinetic ASAT should create debris');
assert.ok(regions.every(r=>(r.orbitalEnvironment?.debrisDensity||0)>0),'debris environment should be shared globally');

console.log('space warfare regressions passed');
