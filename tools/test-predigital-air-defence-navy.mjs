import assert from 'node:assert/strict';
import {
  ANTI_AIRCRAFT_GUN_TECH_ID, ANALOGUE_AA_PREDICTOR_TECH_ID, NAVAL_RADAR_FIRE_CONTROL_TECH_ID, SONAR_TECH_ID,
  antiAircraftDesignFrontier, authoriseAntiAircraftMark, tickAirDefenceIndustry, buildAntiAircraftGun,
  landAirDefenceProfile, airDefenceEngagementRisk, preDigitalNavalSystemsFrontier, navalAirDefenceProfile,
  authoriseNavalSystemsRefit, tickNavalSystemsRefit,
} from '../js/military/preDigitalAirNaval.js';

function region(){return {
  id:'test',treasury:1000,population:500000,unlockedTechIds:new Set(['steelmaking','breech_loading_artillery','quick_firing_artillery','military_aviation',ANTI_AIRCRAFT_GUN_TECH_ID]),
  stockpile:{steel:1000},industrialSupply:{capability:{precision_machining:.75},inventory:{machine_components:1000}},
  industrialPlants:{componentCapability:{gun_system:.78,optics:.72,electronics:.58,radar_set:.65,wheeled_chassis:.62,hull_fabrication:.76,engine:.72,transmission:.68,armour_plate:.70}},
  construction:{assets:[{typeId:'factory',condition:1,scale:1},{typeId:'shipyard',condition:1,scale:1}]},
  corporateInfrastructure:{assets:[]},telephone:{militaryCoordination:.75},massEducation:{literacy:.72},earlyModernMilitary:{naval:{readiness:.72}},
};}

const r=region();
const frontier=antiAircraftDesignFrontier(r);
assert(frontier.rateOfFire>.45&&frontier.traverse>.35,'quick-firing artillery and precision industry should transfer strongly into AA hardware');
assert(frontier.fireControl>.25,'optics/electrical competence should matter to AA fire control');
const mark=authoriseAntiAircraftMark(r,{tick:1,authorisedBy:'test'});assert(mark.authorised,'capable factory should be able to authorise an AA production standard');
assert.equal(buildAntiAircraftGun(r),null,'new Mark should not be producible until tooling completes');
tickAirDefenceIndustry(r,100);
for(let i=0;i<12;i++)assert.ok(buildAntiAircraftGun(r),'tool-ready AA factory should produce persistent guns');
const aa=landAirDefenceProfile(r);assert.equal(aa.total,12);assert(aa.effectiveness>.15,'real AA inventory should create meaningful air-defence effectiveness');
const slow={designStats:{speed:.18,manoeuvrability:.12,radarSignature:.75}},fast={designStats:{speed:.82,manoeuvrability:.75,radarSignature:.38}};
assert(airDefenceEngagementRisk(r,slow)>airDefenceEngagementRisk(r,fast),'faster, more manoeuvrable aircraft should be harder for pre-digital AA to engage');

r.unlockedTechIds.add(ANALOGUE_AA_PREDICTOR_TECH_ID);const predicted=antiAircraftDesignFrontier(r);assert(predicted.fireControl>frontier.fireControl,'analogue predictors should improve AA fire control without computers');
r.unlockedTechIds.add('radar');r.unlockedTechIds.add(NAVAL_RADAR_FIRE_CONTROL_TECH_ID);r.unlockedTechIds.add(SONAR_TECH_ID);
const ship={id:'ship-1',designId:'destroyer',gunCapacity:9,designStats:{tier:9,gunCapacity:9,submersible:false}};
const naval=preDigitalNavalSystemsFrontier(r,ship);
assert(naval.analogueFireControl>.45,'optics/electrical industry should support analogue naval fire control');
assert(naval.radar>.3,'radar-directed naval fire should exist without digital computers');
assert(naval.sonar>.25,'ASDIC/sonar should emerge as a pre-digital naval system');
assert(naval.dualPurposeBattery>.35,'shared AA/gun capability should support dual-purpose naval batteries');
assert(navalAirDefenceProfile(r,ship).effectiveness>.15,'a suitably armed modern ship should derive useful naval AA from the shared industrial base');
const refit=authoriseNavalSystemsRefit(r,ship,{authorisedBy:'test'});assert(refit.authorised,'shipyard should be able to authorise a subsystem refit');
assert.equal(ship.preDigitalSystems,undefined,'authorising a refit must not instantly modernise the ship');
tickNavalSystemsRefit(ship,200);assert(ship.preDigitalSystems?.radar>.3,'completed refit should snapshot the available pre-digital systems');

const sub={id:'sub-1',designId:'submarine',designStats:{tier:9,submersible:true,gunCapacity:0}};
const subFrontier=preDigitalNavalSystemsFrontier(r,sub);assert(subFrontier.submarineStealth>0,'submarine-specific quieting/stealth capability should be modelled');assert(subFrontier.torpedo>.25,'torpedo systems should benefit from shared precision/electrical/propulsion capability');

console.log('pre-digital AA and naval systems regression: ok');
