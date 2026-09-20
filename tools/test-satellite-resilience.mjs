import assert from 'node:assert/strict';
import { launchSatellite, orbitalSupport, SATELLITE_ROLES } from '../js/technology/orbitalSatellites.js';
import { SATELLITE_RESILIENCE_TECH_IDS, nationalSatelliteResilience } from '../js/technology/satelliteResilience.js';
import { SPACE_TECH_IDS } from '../js/technology/spaceRace.js';
import { TELEPHONE_TECH_ID } from '../js/economy/localCommunications.js';
import { SPACE_ATTACK_TYPES, SPACE_WARFARE_TECH_IDS, spaceAttackAssessment, conductSpaceAttack, tickSpaceWarfare } from '../js/military/spaceWarfare.js';

function region(id,actor){return{id,name:id,population:2_000_000,treasury:10_000,polityId:actor,governance:{sovereignPolityId:actor},stockpile:{steel:1000,petrol:1000},unlockedTechIds:new Set([SPACE_TECH_IDS.ORBITAL_SYSTEMS,TELEPHONE_TECH_ID]),industrialPlants:{componentCapability:{electronics:1,radio_navigation:1,radar_set:1}},industrialSupply:{capability:{precision_machining:1},inventory:{electronics:100}},structuralTransformation:{capability:{manufacture:1}},electricity:{industrialService:1},spaceProgramme:{completedMilestones:['first_rocket_space','first_satellite'],projects:{},history:[]}};}

{
  const attacker=region('attacker','A'),plain=region('plain','B'),hard=region('hard','C');
  attacker.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.ELECTRONIC_ATTACK);
  plain.unlockedTechIds.add(TELEPHONE_TECH_ID);hard.unlockedTechIds.add(TELEPHONE_TECH_ID);
  hard.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.FREQUENCY_AGILE_LINKS);
  const p=launchSatellite([plain],SATELLITE_ROLES.COMMUNICATIONS,1).satellite;
  const h=launchSatellite([hard],SATELLITE_ROLES.COMMUNICATIONS,1).satellite;
  const plainChance=spaceAttackAssessment([attacker,plain], 'A','B',SPACE_ATTACK_TYPES.JAM,p.id).chance;
  const hardChance=spaceAttackAssessment([attacker,hard], 'A','C',SPACE_ATTACK_TYPES.JAM,h.id).chance;
  assert.ok(hardChance<plainChance,'frequency-agile links should reduce jamming success');
}

{
  const attacker=region('attacker2','A2'),target=region('target2','B2');
  attacker.unlockedTechIds.add(SPACE_WARFARE_TECH_IDS.KINETIC_ASAT);
  target.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.MANOEUVRABLE_SPACECRAFT);
  const sat=launchSatellite([target],SATELLITE_ROLES.COMMUNICATIONS,1).satellite;
  const assessment=spaceAttackAssessment([attacker,target],'A2','B2',SPACE_ATTACK_TYPES.KINETIC,sat.id);
  assert.ok(assessment.chance<.84,'manoeuvre reserve should reduce kinetic intercept probability');
}

{
  const r=region('prolif','P');
  for(const id of Object.values(SATELLITE_RESILIENCE_TECH_IDS))r.unlockedTechIds.add(id);
  const a=launchSatellite([r],SATELLITE_ROLES.COMMUNICATIONS,1);
  const b=launchSatellite([r],SATELLITE_ROLES.COMMUNICATIONS,2);
  assert.equal(a.satellite.architecture,'proliferated_leo');
  assert.ok(a.cost.cash<160);
  assert.ok(a.satellite.serviceFraction<1);
  const before=orbitalSupport(r).civilianCommunications;
  a.satellite.jammedFraction=.8;a.satellite.jammedDaysRemaining=30;
  tickSpaceWarfare([r],3,()=>1,7);
  const after=orbitalSupport(r).civilianCommunications;
  assert.ok(after>0,'jamming one node must not erase a proliferated constellation');
  assert.ok(after<before,'jamming one node should still degrade service');
  assert.ok(nationalSatelliteResilience([r]).rapidReplacement>0);
  assert.ok(b.satellite.serviceFraction<1);
}

{
  const r=region('redundant','R');
  r.unlockedTechIds.add(SATELLITE_RESILIENCE_TECH_IDS.REDUNDANT_GROUND_CONTROL);
  r.satelliteResilience={groundStations:3,mobileGroundStations:1,replacementReserve:0,lessons:0};
  launchSatellite([r],SATELLITE_ROLES.COMMUNICATIONS,1);
  r.orbitalProgramme.groundControlCondition=.2;
  launchSatellite([r],SATELLITE_ROLES.COMMUNICATIONS,2);
  const support=orbitalSupport(r);
  assert.ok(support.groundControlCondition>.2,'redundant ground stations should preserve control after site damage');
}

console.log('satellite resilience regressions passed');
