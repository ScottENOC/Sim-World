import assert from 'node:assert/strict';
import {
  CARRIER_TECH_IDS,CARRIER_HULL_CLASSES,convertShipToCarrier,carrierAircraftCompatibility,navaliseAircraft,embarkCarrierAircraft,carrierLaunchAssessment,fleetCarrierSummary
} from '../js/military/carrierAviation.js';
import {AIRBORNE_EARLY_WARNING_TECH_ID,buildAirborneEarlyWarningAircraft,airborneEarlyWarningSupport} from '../js/military/airborneEarlyWarning.js';

function region(){return{
  id:'test',name:'Test',treasury:5000,population:1000000,
  unlockedTechIds:new Set(['powered_flight','military_aviation','transport_aircraft','radar','jet_propulsion',AIRBORNE_EARLY_WARNING_TECH_ID,...Object.values(CARRIER_TECH_IDS)]),
  stockpile:{steel:2000},industrialSupply:{capability:{precision_machining:.95},inventory:{machine_components:1500}},
  industrialPlants:{componentCapability:{radar_set:.92,electronics:.92,radio_navigation:.90,aircraft_engine:.88}},
  industrialMarine:{marineEngineering:.90},electricity:{industrialService:.94},aviation:{aircraft:[],flightExperience:500}
};}

const r=region();
const aewBuild=buildAirborneEarlyWarningAircraft(r);assert.equal(aewBuild.built,true,'AEW aircraft should be buildable with mature radar/aviation');
const aew=aewBuild.aircraft;assert.equal(aew.role,'airborne_early_warning');assert(aew.aewSystems.radarRange>.5,'AEW should provide meaningful radar range');
const support=airborneEarlyWarningSupport(r);assert.equal(support.available,true);assert(support.radarCoverage>.4);

const lightShip={id:'ship-light',designId:'steel_warship',condition:1,gunCapacity:16,designStats:{combat:4,gunCapacity:16}};
const light=convertShipToCarrier(r,lightShip,{hullClass:CARRIER_HULL_CLASSES.LIGHT});assert.equal(light.converted,true);assert.equal(lightShip.carrierFacilities.capacity,16);
const nav=navaliseAircraft(r,aew);assert.equal(nav.navalised,true);
const lightCompat=carrierAircraftCompatibility(lightShip,aew);assert.equal(lightCompat.compatible,false,'large AEW aircraft should not fit an early light carrier');

const superShip={id:'ship-super',designId:'dreadnought',condition:1,gunCapacity:30,designStats:{combat:7.2,gunCapacity:30}};
const superConv=convertShipToCarrier(r,superShip,{hullClass:CARRIER_HULL_CLASSES.SUPER});assert.equal(superConv.converted,true);
assert.equal(superShip.carrierFacilities.launchSystem,'electromagnetic_launch');assert.equal(superShip.carrierFacilities.recoverySystem,'advanced_arresting');
const compat=carrierAircraftCompatibility(superShip,aew);assert.equal(compat.compatible,true,'EMALS supercarrier should operate AEW aircraft');
const fleet={id:'fleet-1',ships:[superShip],locationType:'port',portRegionId:r.id};
const embarked=embarkCarrierAircraft(r,aew.id,fleet,superShip.id);assert.equal(embarked.embarked,true);
const launch=carrierLaunchAssessment(r,aew,fleet,superShip);assert.equal(launch.possible,true);assert(launch.sortieReadiness>.34);
const summary=fleetCarrierSummary(r,fleet);assert.equal(summary.capacity,76);assert.equal(summary.embarked,1);
assert((superShip.designStats.combat||0)<7.2,'carrier conversion should sacrifice gunship combat capability');

console.log('carrier aviation regression passed');
