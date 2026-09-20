import assert from 'node:assert/strict';
import { launchSatellite, SATELLITE_ROLES } from '../js/technology/orbitalSatellites.js';
import { satelliteNavigationCapability, syncSatelliteNavigationServices, SATELLITE_NAVIGATION_TECH_IDS } from '../js/technology/satelliteNavigation.js';
import { droneControlAssessment, DRONE_TYPES } from '../js/military/drones.js';
import { SPACE_TECH_IDS } from '../js/technology/spaceRace.js';

function region(id='a'){
  return {
    id,name:id,population:1_500_000,treasury:20_000,polityId:`p_${id}`,
    governance:{sovereignPolityId:`p_${id}`},neighbors:[],stockpile:{steel:2000,petrol:2000,aviation_fuel:500},
    unlockedTechIds:new Set([SPACE_TECH_IDS.ORBITAL_SYSTEMS]),
    industrialPlants:{componentCapability:{electronics:.9,radio_navigation:.9,radar_set:.9}},
    industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:1000}},
    structuralTransformation:{capability:{manufacture:.9}},
    spaceProgramme:{completedMilestones:['first_satellite'],projects:{},history:[],totalSpent:0,prestigeEarned:0},
    orbitalSupport:{navigation:0,groundControlCondition:1,droneBeyondLineOfSightControl:.8},
  };
}

{
  const r=region('blocked');
  const blocked=launchSatellite([r],SATELLITE_ROLES.NAVIGATION,1);
  assert.equal(blocked.launched,false);
  assert.equal(blocked.reason,'technology_not_ready');
}

{
  const r=region('nav');
  for(const id of Object.values(SATELLITE_NAVIGATION_TECH_IDS))r.unlockedTechIds.add(id);
  r.orbitalProgramme={satellites:[],lastLaunchTick:null,totalLaunches:0,totalFailures:0,groundControlCondition:1,launchInfrastructureCondition:1};
  for(let i=0;i<12;i++)r.orbitalProgramme.satellites.push({id:`nav_${i}`,role:'navigation',operational:true,condition:1,serviceFraction:1});
  r.orbitalSupport.navigation=.95;
  const strong=satelliteNavigationCapability(r);
  assert.ok(strong.coverage>.65);
  assert.ok(strong.precisionStrike>.45);
  syncSatelliteNavigationServices([r]);
  assert.ok(r.civilianNavigationTransport.freightRoutingEfficiency>1);
  assert.ok(r.civilianNavigationTransport.civilAviationRoutingEfficiency>1);

  r.orbitalSupport.navigation=.08;
  delete r.satelliteNavigation;
  const jammed=satelliteNavigationCapability(r);
  assert.ok(jammed.signalQuality<strong.signalQuality);
  assert.ok(jammed.precisionStrike<strong.precisionStrike);
}

{
  const r=region('drone');
  for(const id of Object.values(SATELLITE_NAVIGATION_TECH_IDS))r.unlockedTechIds.add(id);
  r.orbitalProgramme={satellites:Array.from({length:16},(_,i)=>({id:`dnav_${i}`,role:'navigation',operational:true,condition:1,serviceFraction:1}))};
  r.orbitalSupport.navigation=.98;
  syncSatelliteNavigationServices([r]);
  const target=region('target');target.id='far';
  const drone={id:'d1',type:DRONE_TYPES.STRIKE_UAV,status:'serviceable'};
  const withNav=droneControlAssessment(r,target,drone,new Map([[r.id,r],[target.id,target]]));
  const noNav=region('plain');noNav.orbitalSupport={droneBeyondLineOfSightControl:.8,navigation:0,groundControlCondition:1};
  const withoutNav=droneControlAssessment(noNav,target,drone,new Map([[noNav.id,noNav],[target.id,target]]));
  assert.equal(withNav.mode,'satellite');
  assert.ok(withNav.quality>withoutNav.quality);
}

console.log('satellite navigation regressions passed');
