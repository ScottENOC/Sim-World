import assert from 'node:assert/strict';
import { conductSpaceAttack, SPACE_ATTACK_TYPES, SPACE_WARFARE_TECH_IDS } from '../js/military/spaceWarfare.js';
import { harvestInternationalCrisisSignals } from '../js/diplomacy/internationalCrisisBridge.js';
import { applySpaceCrisisResponse, SPACE_CRISIS_RESPONSES } from '../js/diplomacy/spaceCrisisResponses.js';
import { orbitalSupport, tickOrbitalSatellites } from '../js/technology/orbitalSatellites.js';

function region(id,actor){
  return {id,name:id,population:100000,treasury:1000,governance:{sovereignPolityId:actor},unlockedTechIds:new Set(['orbital_spaceflight_systems','spaceflight_rocketry','radar','telephone_networks','strategic_missile_systems']),stockpile:{steel:1000,petrol:1000},industrialPlants:{componentCapability:{electronics:.9,radio_navigation:.9,radar_set:.9}},industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:100}},electricity:{industrialService:.9},spaceProgramme:{completedMilestones:['first_satellite'],claimedFirsts:[],projects:{},history:[],totalSpent:0,prestigeEarned:0},relations:new Map()};
}
function sat(id,actor,role='communications'){return{id,role,use:role==='reconnaissance'?'military':'dual_use',ownerPolityId:actor,operational:true,condition:1,designLifeDays:3000,remainingLifeDays:3000};}

const a=region('a-cap','A'),b=region('b-cap','B');
a.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK);
b.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK);
b.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.OPTICAL_DAZZLING);
b.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.KINETIC_ASAT);
a.orbitalProgramme={satellites:[sat('sat-a','A')],lastLaunchTick:0,totalLaunches:1,totalFailures:0,groundControlCondition:1,launchInfrastructureCondition:1};
b.orbitalProgramme={satellites:[sat('sat-b','B')],lastLaunchTick:0,totalLaunches:1,totalFailures:0,groundControlCondition:1,launchInfrastructureCondition:1};
const world={regions:[a,b],polities:[{id:'A',capitalRegionId:a.id},{id:'B',capitalRegionId:b.id}],internationalCrises:[],nextInternationalCrisisId:1};

tickOrbitalSatellites(world.regions,1,()=>1,7);
const before=orbitalSupport(b).droneBeyondLineOfSightControl;
const attack=conductSpaceAttack(world.regions,'A','B',SPACE_ATTACK_TYPES.JAM,{currentTick:2,rng:()=>0});
assert.equal(attack.attacked,true);assert.equal(attack.success,true);assert.ok(attack.crisisSignalId);
const made=harvestInternationalCrisisSignals(world,2,()=>1);
const crisis=made.find(c=>c.type==='space_attack');assert.ok(crisis);assert.equal(crisis.spaceIncident.attackType,SPACE_ATTACK_TYPES.JAM);assert.equal(crisis.sideAActorId,'A');assert.equal(crisis.sideBActorId,'B');

// Jamming feeds through the existing satellite support path.
const { tickSpaceWarfare }=await import('../js/military/spaceWarfare.js');
tickSpaceWarfare(world.regions,2,()=>1,1);
assert.ok(orbitalSupport(b).droneBeyondLineOfSightControl<before);

// A reciprocal response uses the same physical space-attack system and emits a follow-on signal.
const response=applySpaceCrisisResponse(crisis,world,3,SPACE_CRISIS_RESPONSES.RECIPROCAL_JAM,{rng:()=>0});
assert.equal(response.applied,true);assert.equal(response.attack.attacked,true);assert.ok(b.internationalCrisisSignals.some(s=>s.type==='space_attack'&&!s.consumed));

// Ground strikes damage real launch/control state and immediately reduce orbital service after synchronisation.
const kineticCrisis={id:'k1',type:'space_attack',status:'active',sideAActorId:'A',sideBActorId:'B',allegedAggressorActorId:'A',affectedActorId:'B',severity:.85,evidence:.98,nuclearRisk:.12,restraint:0,mediation:0,pressureB:0,createdTick:1,history:[],spaceIncident:{attackType:SPACE_ATTACK_TYPES.KINETIC,success:true,priorIncidents:2}};
const ground=applySpaceCrisisResponse(kineticCrisis,world,4,SPACE_CRISIS_RESPONSES.GROUND_STRIKE,{rng:()=>0});
assert.equal(ground.applied,true);assert.equal(ground.groundStrike.struck,true);assert.ok(a.orbitalProgramme.groundControlCondition<1);assert.ok(a.orbitalProgramme.launchInfrastructureCondition<1);
tickOrbitalSatellites(world.regions,5,()=>1,0);
assert.ok(orbitalSupport(a).groundControlCondition<1);
assert.ok(orbitalSupport(a).droneBeyondLineOfSightControl<before);

console.log('space crisis escalation regression passed');
