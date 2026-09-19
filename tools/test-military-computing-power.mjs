import assert from 'node:assert/strict';
import { armouredVehicleDesignFrontier, aircraftDesignFrontier, EQUIPMENT_FAMILIES } from '../js/military/equipmentGenerations.js';
import { computationalCapability, portableDieselGeneratorFrontier, installFieldDieselGenerators, tickFieldPower } from '../js/military/militaryElectronics.js';

function region(id='r'){
  return {id,unlockedTechIds:new Set(['steelmaking','electrical_generation','industrial_electrification','petroleum_refining','radar']),stockpile:{diesel:10,copper:10,electronic_components:10,industrial_polymers:10,packaged_chips:10},industrialSupply:{capability:{precision_machining:.82},inventory:{machine_components:20}},electricity:{industrialService:.8,reliability:.9},industrialPlants:{componentCapability:{engine:.82,transmission:.8,tracked_running_gear:.82,gun_system:.82,armour_plate:.78,optics:.80,electronics:.82,hull_fabrication:.8,aircraft_engine:.82,airframe:.78,wing_design:.8,aircraft_weapon:.76,radio_navigation:.75,radar_set:.72},productExperience:{tank:.65,fighter:.62}},computingIndustry:{design:{bestNodeNm:10000,complexity:.05},experience:{chip_design:0,packaging_test:0,computer_assembly:0}}};
}

const analogue=region('analogue');
const earlyTank=armouredVehicleDesignFrontier(analogue,EQUIPMENT_FAMILIES.TANK);
assert.equal(earlyTank.electronicCapabilities.computerisedFireControl,false,'electrical/electronic competence alone must not create digital fire control');
assert.ok(earlyTank.onboardPower>.3,'a mature engine/electrical industry should support meaningful onboard power');

const digital=region('digital');
digital.computingIndustry.design={bestNodeNm:45,complexity:.78};
digital.computingIndustry.experience={chip_design:.72,packaging_test:.65,computer_assembly:.60};
assert(computationalCapability(digital)>.4,'mature sub-100 nm design and production knowledge should create useful embedded compute');
const digitalTank=armouredVehicleDesignFrontier(digital,EQUIPMENT_FAMILIES.TANK);
assert.equal(digitalTank.electronicCapabilities.stabilisedGun,true,'powered controls should support gun stabilisation');
assert.equal(digitalTank.electronicCapabilities.crossCountryStabilisation,true,'sufficient compute plus onboard power should support effective cross-country stabilisation');
assert(digitalTank.movingFireEffectiveness>earlyTank.movingFireEffectiveness,'digital stabilisation should improve mobile fire effectiveness');
assert((digitalTank.systemInputs.packaged_chips||0)>0,'digitally capable tank designs should require packaged chips');

const fighter=aircraftDesignFrontier(digital,EQUIPMENT_FAMILIES.FIGHTER);
assert.equal(fighter.electronicCapabilities.digitalRadarProcessing,true,'airborne radar processing should require compute and onboard power');
assert((fighter.systemInputs.electronic_components||0)>0,'advanced aircraft should consume electronics components');

const base={id:'forward-base'};
const generator=portableDieselGeneratorFrontier(digital);
assert(generator.available,'industrial army should be able to manufacture portable diesel generators');
const built=installFieldDieselGenerators(base,digital,2);
assert.equal(built.installed,2,'portable generators should consume real industrial components and be installed persistently');
const dieselBefore=digital.stockpile.diesel;
const powered=tickFieldPower(base,digital,{requestedLoad:.8,gridAvailable:true,gridTrusted:false,weeks:1});
assert.equal(powered.status,'generator_powered','an enemy/captured grid must not substitute for a trusted supply connection');
assert(digital.stockpile.diesel<dieselBefore,'field generation must burn the army diesel pool');
const remaining=digital.stockpile.diesel;digital.stockpile.diesel=0;
const failed=tickFieldPower(base,digital,{requestedLoad:.8,gridAvailable:false,gridTrusted:false,weeks:1});
assert(failed.reliability<powered.reliability,'base electrical reliability should collapse when generator fuel is exhausted');
digital.stockpile.diesel=remaining;
const trusted=tickFieldPower(base,digital,{requestedLoad:.8,gridAvailable:true,gridTrusted:true,weeks:1});
assert.equal(trusted.status,'trusted_grid','a deliberately secured/reconnected grid should displace generator load');

console.log('military computing, onboard electrical power and diesel field generator regressions: ok');
