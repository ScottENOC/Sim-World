import assert from 'node:assert/strict';
import {
  EW_TECH_IDS, ensureElectronicWarfare, aircraftEwProfile,
  electronicProtectionAgainstAirDefence, conductSeadStrike,
  applyElectronicSuppression, buildAntiRadiationMissile,
} from '../js/military/tacticalElectronicWarfare.js';
import {
  RADAR_GUIDED_SAM_TECH_ID, SURFACE_TO_AIR_MISSILE_TECH_ID,
  ensureGuidedAirDefence, layeredAirDefenceEngagement,
} from '../js/military/guidedAirDefence.js';

function region(id){
  return {
    id,name:id,treasury:10000,population:1_000_000,
    unlockedTechIds:new Set(['radar','military_aviation','guided_missile_guidance',SURFACE_TO_AIR_MISSILE_TECH_ID,RADAR_GUIDED_SAM_TECH_ID,...Object.values(EW_TECH_IDS)]),
    industrialPlants:{componentCapability:{electronics:.9,radio_navigation:.9,radar_set:.9,engine:.9,aircraft_engine:.9}},
    industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:100,electronics:100}},
    structuralTransformation:{capability:{manufacture:.9}},
    computingIndustry:{design:{bestNodeNm:50,complexity:.8},experience:{chip_design:.8,packaging_test:.8,computer_assembly:.8}},
    electricity:{industrialService:.9},stockpile:{steel:100,aviation_fuel:100,industrial_polymers:100},
  };
}

const attacker=region('attacker'),defender=region('defender');
const ew=ensureElectronicWarfare(attacker),ad=ensureGuidedAirDefence(defender);ad.radarSamInventory=20;ad.samInventory=20;
ew.chaffFlares=4;
const profile=aircraftEwProfile(attacker);assert(profile.rwr>.5&&profile.jammer>.4,'advanced aircraft should have useful RWR/ECM');
const protection=electronicProtectionAgainstAirDefence(attacker,{consumeCountermeasure:true});assert.equal(ew.chaffFlares,3,'countermeasure pass should consume a chaff/flare load');assert(protection.radarTrackingPenalty>.2,'EW should materially penalise radar tracking');
const clean=layeredAirDefenceEngagement(defender,{signature:.8,speed:.8,altitude:.8,replacementValue:100,damagePotential:.8},{rng:()=>.99,targetValue:500});
ad.radarSamInventory=20;ad.samInventory=20;
const protectedRun=layeredAirDefenceEngagement(defender,{signature:.8,speed:.8,altitude:.8,replacementValue:100,damagePotential:.8,electronicProtection:protection},{rng:()=>.99,targetValue:500});
assert(protectedRun.radarSam.killChance<clean.radarSam.killChance,'EW should reduce radar-SAM kill probability');
const suppressed=applyElectronicSuppression(attacker,defender,{intensity:1});assert(suppressed.suppression>0,'ECM should create temporary suppression');
ad.radarSamInventory=20;const beforeSuppressed=layeredAirDefenceEngagement(defender,{signature:.8,speed:.8,altitude:.8,replacementValue:100,damagePotential:.8},{rng:()=>.99,targetValue:500});assert(beforeSuppressed.radarSam.sensorFactor<clean.radarSam.sensorFactor,'suppression should reduce radar network effectiveness');
const built=buildAntiRadiationMissile(attacker,{count:2});assert(built.built,'ARM procurement should consume industrial inputs and build inventory');
const beforeRadar=ad.radarCondition;const strike=conductSeadStrike(attacker,defender,{rng:()=>.01,currentTick:12});assert(strike.launched&&strike.hit,'ARM should home on an emitting radar in deterministic success case');assert(ad.radarCondition<beforeRadar,'successful ARM should persistently damage radar condition');
console.log('tactical electronic warfare regression passed');
