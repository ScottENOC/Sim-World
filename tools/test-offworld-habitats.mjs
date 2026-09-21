import assert from 'node:assert/strict';
import { HYDROPONIC_CEA_TECH_ID } from '../js/economy/controlledEnvironmentAgriculture.js';
import { SPACE_TECH_IDS } from '../js/technology/spaceRace.js';
import { OFFWORLD_TECH_IDS, offworldHabitatSummary, spaceExplorationBreakthroughChances, tickOffworldHabitats, tickSpaceExplorationBreakthroughs } from '../js/technology/offworldHabitats.js';

function region(id,polity,{closedLoop=true,rich=true}={}){
  const tech=new Set([
    SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY,SPACE_TECH_IDS.ORBITAL_SYSTEMS,SPACE_TECH_IDS.CREWED_SPACEFLIGHT,SPACE_TECH_IDS.ORBITAL_HABITATION,SPACE_TECH_IDS.LUNAR_OPERATIONS,SPACE_TECH_IDS.MARS_OPERATIONS,
    OFFWORLD_TECH_IDS.LUNAR_NAVIGATION,OFFWORLD_TECH_IDS.LUNAR_LANDING_SYSTEMS,OFFWORLD_TECH_IDS.LUNAR_SURFACE_HABITATION,OFFWORLD_TECH_IDS.INTERPLANETARY_NAVIGATION,OFFWORLD_TECH_IDS.DEEP_SPACE_LIFE_SUPPORT,OFFWORLD_TECH_IDS.MARS_LANDING_SYSTEMS,OFFWORLD_TECH_IDS.MARS_SURFACE_HABITATION,
    HYDROPONIC_CEA_TECH_ID,
  ]);
  if(closedLoop)tech.add(OFFWORLD_TECH_IDS.CLOSED_LOOP_AGRICULTURE);
  return {
    id,name:id,population:5_000_000,treasury:rich?100_000:0,governance:{sovereignPolityId:polity},polityId:polity,
    stockpile:{steel:rich?10_000:0,machine_components:rich?10_000:0,petrol:rich?10_000:0,fertiliser:rich?1_000:0},unlockedTechIds:tech,
    industrialSupply:{capability:{precision_machining:.95}},structuralTransformation:{capability:{manufacture:.95}},industrialPlants:{componentCapability:{electronics:.95,engine:.9}},electricity:{industrialService:.98},
    spaceProgramme:{completedMilestones:['first_human_orbit','first_permanent_space_station','first_human_moon','first_moon_base','first_human_mars','first_mars_base'],claimedFirsts:[],projects:{},history:[],totalSpent:0,prestigeEarned:0},
  };
}

// Later space-race milestones must have a discoverable technology path rather
// than existing only as unreachable data entries.
const pioneer=region('Pioneer','pioneer',{closedLoop:false});
pioneer.unlockedTechIds.delete(SPACE_TECH_IDS.ORBITAL_HABITATION);
pioneer.spaceProgramme.completedMilestones=['first_human_orbit'];
const chances=spaceExplorationBreakthroughChances(pioneer,[pioneer]);
assert.ok(chances[SPACE_TECH_IDS.ORBITAL_HABITATION]>0,'orbital habitation should become discoverable after crewed orbit');
const techEvents=tickSpaceExplorationBreakthroughs([pioneer],10,()=>0,7);
assert.ok(pioneer.unlockedTechIds.has(SPACE_TECH_IDS.ORBITAL_HABITATION));
assert.ok(techEvents.some(e=>e.techId===SPACE_TECH_IDS.ORBITAL_HABITATION));

// Completed permanent-presence milestones create persistent facilities with
// crew, capacity, maintenance and resupply rather than ending at prestige.
const a=region('A','pA');
const events=tickOffworldHabitats([a],100,()=>.5,365.2425);
const summary=offworldHabitatSummary(a);
assert.deepEqual(Object.keys(summary).sort(),['mars','moon','orbital']);
assert.ok(summary.orbital.crew>=1&&summary.moon.crew>=1&&summary.mars.crew>=1);
assert.ok(summary.mars.condition>0);
assert.ok(a.spaceProgramme.habitats.mars.cumulativeResupplyCost>0);
assert.ok(events.some(e=>e.type==='offworld_habitat_established'&&e.habitatId==='mars'));

// Closed-loop hydroponics make pressurised Martian greenhouses viable, but
// remain a habitat-scale system rather than terraforming or total independence.
assert.ok(summary.mars.greenhouseModules>0,'Mars base should invest in greenhouse modules once closed-loop agriculture is available');
assert.ok(summary.mars.foodSelfSufficiency>0,'Martian crops should displace some imported food');
assert.ok(summary.mars.foodSelfSufficiency<=.72+1e-9,'Mars agriculture stays capped below full food independence');
assert.equal(a.spaceProgramme.habitats.mars.terraforming,undefined,'habitats must not introduce a terraforming state');

// Greenhouses reduce the imported resupply/fuel burden compared with an
// otherwise equivalent Mars base without the closed-loop agriculture tech.
const b=region('B','pB',{closedLoop:false});
tickOffworldHabitats([b],100,()=>.5,365.2425);
assert.equal(offworldHabitatSummary(b).mars.foodSelfSufficiency,0);
assert.ok(a.spaceProgramme.habitats.mars.cumulativeFuelUse<b.spaceProgramme.habitats.mars.cumulativeFuelUse);

// A nominally permanent base can deteriorate or shed crew when its home polity
// cannot fund launches and spare parts. Permanent means continuously occupied,
// not magically self-sustaining.
const c=region('C','pC',{closedLoop:false,rich:false});
tickOffworldHabitats([c],100,()=>.5,365.2425);
assert.ok(c.spaceProgramme.habitats.mars.condition<1);
assert.ok(c.spaceProgramme.habitats.mars.resupplyReliability<.4);

console.log('off-world habitat regressions passed');
