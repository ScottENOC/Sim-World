import assert from 'node:assert/strict';
import { launchSatellite, orbitalSupport, SATELLITE_ROLES, SATELLITE_USE, tickOrbitalSatellites } from '../js/technology/orbitalSatellites.js';
import { SPACE_TECH_IDS } from '../js/technology/spaceRace.js';
import { TELEPHONE_TECH_ID, tickLocalCommunications } from '../js/economy/localCommunications.js';
import { RADAR_TECH_ID } from '../js/military/aviation.js';
import { BATTERY_TECH_IDS } from '../js/economy/batteryStorage.js';

function region(id='a'){
  return {
    id,name:id,population:2_000_000,treasury:5000,polityId:`p_${id}`,
    governance:{sovereignPolityId:`p_${id}`},
    stockpile:{steel:500,petrol:500},
    unlockedTechIds:new Set([SPACE_TECH_IDS.ORBITAL_SYSTEMS]),
    spaceProgramme:{completedMilestones:['first_rocket_space','first_satellite'],claimedFirsts:['first_satellite'],projects:{},history:[],totalSpent:0,prestigeEarned:12},
  };
}

{
  const r=region();
  const events=tickOrbitalSatellites([r],100,()=>1,7);
  assert.equal(r.orbitalProgramme.satellites.length,1);
  assert.equal(r.orbitalProgramme.satellites[0].role,SATELLITE_ROLES.SCIENTIFIC);
  assert.equal(r.orbitalProgramme.satellites[0].use,SATELLITE_USE.CIVILIAN);
  assert.equal(r.orbitalProgramme.satellites[0].powerMode,'battery_only');
  assert.ok(events.some(e=>e.type==='satellite_launched'));
  assert.ok(orbitalSupport(r).scienceObservation>0);
}

{
  const r=region('b');
  r.unlockedTechIds.add(TELEPHONE_TECH_ID);
  r.unlockedTechIds.add(RADAR_TECH_ID);
  r.unlockedTechIds.add(BATTERY_TECH_IDS.LEAD_ACID);
  r.unlockedTechIds.add('photovoltaic_generation');
  const treasury=r.treasury,steel=r.stockpile.steel,fuel=r.stockpile.petrol;
  const comm=launchSatellite([r],SATELLITE_ROLES.COMMUNICATIONS,120);
  assert.equal(comm.launched,true);
  assert.equal(comm.satellite.use,SATELLITE_USE.DUAL_USE);
  assert.equal(comm.satellite.powerMode,'solar_rechargeable');
  assert.ok(comm.satellite.designLifeDays>1000);
  assert.equal(r.treasury,treasury-160);
  assert.equal(r.stockpile.steel,steel-6);
  assert.equal(r.stockpile.petrol,fuel-7);
  const support=orbitalSupport(r);
  assert.ok(support.civilianCommunications>0);
  assert.ok(support.militaryCommand>0);
  assert.ok(support.droneBeyondLineOfSightControl>0);

  const recon=launchSatellite([r],SATELLITE_ROLES.RECONNAISSANCE,121);
  assert.equal(recon.launched,true);
  assert.equal(recon.satellite.use,SATELLITE_USE.MILITARY);
  const after=orbitalSupport(r);
  assert.ok(after.militaryReconnaissance>0);
  assert.ok(after.civilianCommunications>0);
}

{
  const r=region('c');
  r.orbitalSupport={civilianCommunications:.7,militaryCommand:.6};
  const state=tickLocalCommunications(r,56);
  assert.equal(state.telephoneCoverage,0);
  assert.ok(state.administrativeCoordination>0);
  assert.ok(state.militaryCoordination>0);
  assert.ok(state.industrialCoordination>0);
}

{
  const r=region('d');
  tickOrbitalSatellites([r],0,()=>1,7);
  const sat=r.orbitalProgramme.satellites[0];
  tickOrbitalSatellites([r],200,()=>1,sat.designLifeDays+1);
  assert.equal(sat.operational,false);
  assert.equal(orbitalSupport(r).operationalSatellites,0);
}

console.log('orbital satellite regressions passed');
