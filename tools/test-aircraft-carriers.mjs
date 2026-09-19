import assert from 'node:assert/strict';
import { navalDesignClassOptions, previewNavalDesign, desiredWarshipComposition } from '../js/military/fleets.js';
import { buildWarshipClass } from '../js/economy/laborCore.js';
import { embarkAircraftOnCarrier, assignCarrierAircraftMission, carrierAirWingSummary, fleetAviationFuelCapacity, tickCarrierAviation } from '../js/military/carrierAviation.js';

function region(){return {
  id:'carrier-home',name:'Carrier Home',isCoastal:true,population:500000,treasury:5000,controllingActorId:'carrier-home',
  unlockedTechIds:new Set(['marine_steam_engine','screw_propulsion','iron_hull_shipbuilding','steel_hull_shipbuilding','dreadnought_design','military_aviation','naval_aviation','aircraft_carrier','radar','aerospace_light_alloys']),
  construction:{assets:[{typeId:'harbour',condition:1,scale:1},{typeId:'shipyard',condition:1,scale:1},{typeId:'naval_base',condition:1,scale:1},{typeId:'airfield',condition:1,scale:1}]},
  stockpile:{wood:10000,stone:10000,steel:10000,coal:10000,aluminium:2000,aviation_fuel:1000,food:10000},
  industrialSupply:{inventory:{machine_components:10000},capability:{precision_machining:.9,steelmaking:.9}},
  industrialPlants:{componentCapability:{hull_fabrication:.9,gun_system:.7,armour_plate:.75,optics:.8,electronics:.82,engine:.88,transmission:.86,radar_set:.8,naval_fire_control:.7,damage_control:.9}},
  earlyModernMilitary:{naval:{readiness:.85}},navalProcurement:{targets:{},built:{}},navalAviationExperience:180,
  aviation:{flightExperience:300,aircraft:[{id:'air-1',ownerType:'military',ownerActorId:'carrier-home',role:'fighter',baseType:'airfield',homeBaseRegionId:'carrier-home',baseRegionId:'carrier-home',carrierId:null,condition:1,fuel:1,status:'serviceable',mission:'idle',targetRegionId:null,pilotExperience:.5,totalFlights:0,repairNeed:0,designId:'fighter-1',modelName:'Fleet Fighter',designStats:{range:.65,enginePower:.65,reliability:.75,payload:.25,firepower:.55},crew:{pilotReadiness:1}}]},
  neighbors:['target'],adjacentSeaIds:['sea-1'],airRecon:{},warDamage:{infrastructureDamage:0,bombardmentWeeks:0},
};}

const r=region();
const classes=navalDesignClassOptions(r).map(x=>x.id);
assert.ok(classes.includes('aircraft_carrier'),'carrier tech should expose aircraft carrier design');
assert.ok(classes.includes('fleet_oiler'),'carrier era should expose fleet oiler design');

const preview=previewNavalDesign(r,'aircraft_carrier',{superstructure:'aluminium',seawaterSystems:'conventional',priorities:{}});
assert.ok(preview.airCapacity>=18,'carrier design should have a persistent air-group capacity');
assert.ok(preview.sortieRate>0,'carrier design should have sortie-generation capability');
assert.ok(preview.flightDeckRating>0,'carrier Mk should combine industrial components into flight-deck quality');
assert.ok(preview.aviationFuelCapacity>0,'carrier should carry aviation fuel');

const noDock=buildWarshipClass(r,'aircraft_carrier',1,10000);
assert.equal(noDock.built,0,'carrier construction must require a large dry dock');
r.construction.assets.push({typeId:'large_drydock',condition:1,scale:1});
const withDock=buildWarshipClass(r,'aircraft_carrier',1,10000);
assert.ok(withDock.built>0,'large dry dock should permit carrier construction');

const composition=desiredWarshipComposition(r,16);
assert.ok(composition.aircraft_carrier>=1,'late carrier-capable fleet planning should include carriers');
assert.ok(composition.fleet_oiler>=composition.aircraft_carrier,'carrier fleet planning should include at least one oiler per carrier');

const carrier={id:'cv-1',designId:'aircraft_carrier',condition:1,classLabel:'aircraft carrier',modelName:'Carrier Mk I',designStats:{...preview,airCapacity:24,aviationFuelCapacity:90,sortieRate:1,carrierMaintenance:.8,flightDeckRating:.8}};
const oiler={id:'ao-1',designId:'fleet_oiler',condition:1,classLabel:'fleet oiler',designStats:{aviationFuelCapacity:220}};
const fleet={id:'fleet-1',name:'Carrier Fleet',ownerActorId:'carrier-home',ownerRegionId:'carrier-home',homePortRegionId:'carrier-home',locationType:'port',portRegionId:'carrier-home',seaRegionId:null,ships:[carrier,oiler],supply:1,fatigue:0,condition:1,morale:1,aviationFuel:200};
assert.equal(fleetAviationFuelCapacity(fleet),310,'carrier plus oiler should pool large fleet aviation-fuel capacity');
const embarked=embarkAircraftOnCarrier(r,fleet,'air-1','cv-1');
assert.equal(embarked.embarked,true,'existing military aircraft should be deployable aboard a compatible carrier');
assert.equal(r.aviation.aircraft[0].baseType,'carrier');
assert.equal(carrierAirWingSummary([r],fleet).total,1);

fleet.locationType='sea';fleet.portRegionId=null;fleet.seaRegionId='sea-1';
const target={id:'target',name:'Target',controllingActorId:'enemy',neighbors:['carrier-home'],adjacentSeaIds:['sea-1'],warDamage:{infrastructureDamage:0,bombardmentWeeks:0},construction:{assets:[]},unlockedTechIds:new Set(),stockpile:{},aviation:{aircraft:[]}};
const sea={id:'sea-1',name:'Test Sea',adjacentLand:['carrier-home','target']};
const order=assignCarrierAircraftMission(r,fleet,'air-1','attack','target',[r,target],[sea]);
assert.equal(order.assigned,true,'carrier-based aircraft should accept a strike mission against a reachable target');
const fuelBefore=fleet.aviationFuel;
const damageBefore=target.warDamage.infrastructureDamage;
const events=tickCarrierAviation([r,target],[fleet],[sea],100,7,()=>.99);
assert.ok(fleet.aviationFuel<fuelBefore,'carrier sorties should consume embarked fleet aviation fuel');
assert.ok(target.warDamage.infrastructureDamage>damageBefore,'carrier air strike should use the existing air-force asset to affect the target');
assert.ok(events.some(e=>e.type==='carrier_air_strike'));

console.log('Aircraft carrier regressions passed.');
