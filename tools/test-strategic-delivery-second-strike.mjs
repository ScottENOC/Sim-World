import assert from 'node:assert/strict';
import { ensureNuclearWeaponState } from '../js/military/nuclearWeaponisation.js';
import { nuclearTriadReadiness } from '../js/diplomacy/nuclearDeterrence.js';
import {
  STRATEGIC_BOMBER_DELIVERY_TECH_ID,STRATEGIC_MISSILE_TECH_ID,HARDENED_STRATEGIC_BASING_TECH_ID,MOBILE_STRATEGIC_BASING_TECH_ID,
  NAVAL_NUCLEAR_PROPULSION_TECH_ID,STRATEGIC_MISSILE_SUBMARINE_TECH_ID,STRATEGIC_EARLY_WARNING_TECH_ID,SECURE_STRATEGIC_COMMAND_TECH_ID,
  ensureStrategicDelivery,setStrategicDeliveryPolicy,buildLandStrategicLauncher,commissionStrategicSubmarine,setStrategicSubmarinePatrol,
  strategicForceReadiness,secondStrikeAssessment,tickStrategicDeliveryBreakthroughs
} from '../js/military/strategicDelivery.js';

function region(){return {
  id:'alpha',name:'Alpha',population:2_000_000,treasury:2000,
  unlockedTechIds:new Set(['aerial_bombing','aerial_refuelling','transport_aircraft','rocket_launcher_systems','reactor_engineering','submarine','radar','telephone']),
  stockpile:{steel:1000,reactor_fuel:4,aviation_fuel:100,strategic_uranium_material:2,separated_plutonium:0},
  construction:{assets:[{id:'dock-1',typeId:'large_drydock',condition:1,scale:1}]},
  industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:500}},
  industrialPlants:{componentCapability:{electronics:.82,radio_navigation:.8,engine:.85}},
  structuralTransformation:{capability:{manufacture:.9}},massEducation:{literacy:.9},governance:{administrativeControl:.9,administration:{recordKeeping:.9}},
  nuclearPower:{operationsExperience:.7,fuelCycleExperience:.7},earlyModernMilitary:{naval:{readiness:.8}},
  aviation:{flightExperience:800,aircraft:[
    {id:'bomber-1',ownerType:'military',role:'bomber',status:'serviceable',condition:1,fuel:1,crewAssignment:{pilots:1,pilotExperience:.8,aircrew:4,aircrewExperience:.8}},
    {id:'tanker-1',ownerType:'military',role:'tanker',status:'serviceable',condition:1,fuel:1,crewAssignment:{pilots:2,pilotExperience:.8,aircrew:2,aircrewExperience:.8}}
  ]}
};}

const r=region();
const nw=ensureNuclearWeaponState(r);nw.prototypeCount=1;nw.validationConfidence=.9;nw.tests=[{completed:true,publiclyDeclared:true,detected:true}];

const discoveries=tickStrategicDeliveryBreakthroughs([r],100,()=>0,365.2425);
assert(discoveries.length>=6,'mature industrial state should discover the strategic-delivery chain with deterministic breakthrough rolls');
for(const tech of [STRATEGIC_BOMBER_DELIVERY_TECH_ID,STRATEGIC_MISSILE_TECH_ID,HARDENED_STRATEGIC_BASING_TECH_ID,MOBILE_STRATEGIC_BASING_TECH_ID,NAVAL_NUCLEAR_PROPULSION_TECH_ID,STRATEGIC_MISSILE_SUBMARINE_TECH_ID,STRATEGIC_EARLY_WARNING_TECH_ID,SECURE_STRATEGIC_COMMAND_TECH_ID])assert(r.unlockedTechIds.has(tech),`expected ${tech}`);

setStrategicDeliveryPolicy(r,{bomberAlert:.55,bomberDispersal:.65,landDispersal:.75});
let force=strategicForceReadiness(r);
assert.equal(force.air.available,true,'strategic bombers should create an air leg');
assert.equal(force.land.available,false,'technology without deployed land launchers is not a land leg');
assert.equal(force.sea.available,false,'ordinary submarines are not a sea-based strategic leg');

assert.equal(buildLandStrategicLauncher(r,{mobile:false}).built,true);
const fixed=strategicForceReadiness(r).land;
assert.equal(buildLandStrategicLauncher(r,{mobile:true}).built,true);
const mixed=strategicForceReadiness(r).land;
assert(mixed.survivability>fixed.survivability,'mobile/dispersed basing should improve land-force survivability');

const fleet={id:'fleet-1',ownerRegionId:r.id,ships:[{id:'sub-1',designId:'submarine',status:'serviceable',condition:1}]};
let triad=nuclearTriadReadiness(r,{fleets:[fleet]});
assert.equal(triad.sea.available,false,'an ordinary submarine must not count as an SSBN');
const commissioned=commissionStrategicSubmarine(r,fleet,'sub-1');
assert.equal(commissioned.commissioned,true,'large drydock, reactor fuel and mature tech should permit strategic submarine commissioning');
assert.equal(commissioned.ship.propulsion,'nuclear');
assert.equal(setStrategicSubmarinePatrol(r,fleet,'sub-1',true).assigned,true);

triad=nuclearTriadReadiness(r,{fleets:[fleet]});
assert.equal(triad.air.available,true);
assert.equal(triad.land.available,true);
assert.equal(triad.sea.available,true);
assert.equal(triad.fullTriad,true,'three deployed delivery legs should form a triad');
assert(triad.survivableLegs>=1,'a triad should report survivable legs separately from mere availability');

const s=ensureStrategicDelivery(r);s.command.warningExperience=.8;s.command.commandExperience=.8;s.land.readiness=.85;s.sea.readiness=.85;
const assessment=secondStrikeAssessment(r,{fleets:[fleet]});
assert(assessment.retaliationConfidence>.55,'dispersed forces, patrol submarine, warning and resilient command should support retaliation');
assert(assessment.firstStrikeVulnerability<.45,'survivable force structure should reduce first-strike vulnerability');
assert.equal(assessment.credibleSecondStrike,true);

console.log('strategic delivery and second-strike regression passed');
