import assert from 'node:assert/strict';
import {
  AIR_ASSAULT_TECH_ID,
  ATTACK_HELICOPTER_TECH_ID,
  HELICOPTER_MISSIONS,
  HELICOPTER_ROLES,
  ROTARY_WING_FLIGHT_TECH_ID,
  assignHelicopterMission,
  authoriseHelicopterGeneration,
  buildHelicopter,
  helicopterDesignImprovement,
  helicopterSummary,
  tickHelicopterBreakthroughs,
  tickHelicopters,
} from '../js/military/helicopters.js';
import { tickAviation } from '../js/military/aviation.js';

function makeRegion(id='home') {
  return {
    id,
    population: 2_000_000,
    unlockedTechIds: new Set(['powered_flight','military_aviation','aircraft_armament',ROTARY_WING_FLIGHT_TECH_ID,AIR_ASSAULT_TECH_ID,ATTACK_HELICOPTER_TECH_ID]),
    neighbors: [], tradePartnerIds: [], recentTradePartners: new Map(),
    industrialSupply: { capability: { precision_machining:.82, steelmaking:.82 }, inventory: { machine_components: 500 } },
    industrialPlants: {
      componentCapability: { aircraft_engine:.78, transmission:.76, airframe:.72, radio_navigation:.68, optics:.70, aircraft_weapon:.72, electronics:.65 },
      productExperience: {},
    },
    structuralTransformation: { capability: { manufacture:.82 } },
    electricity: { industrialService:.78 },
    stockpile: { steel:500, aviation_fuel:500, wood:500, textiles:500 },
    treasury: 5000, wallet: 0,
    construction: { assets: [] },
    aviation: { aircraft: [], flightExperience: 250, lastBreakthroughs: [], civilianDemand: 0 },
  };
}

const home = makeRegion('home');
const target = makeRegion('target');
target.unlockedTechIds = new Set();
target.industrialPlants.componentCapability = {};

const transport = buildHelicopter(home,{role:HELICOPTER_ROLES.TRANSPORT,tick:100});
assert.ok(transport,'transport helicopter should build without an airfield once rotary-wing industry exists');
assert.equal(transport.baseType,'field_site','helicopters should support field basing rather than require a runway');
assert.ok(transport.designStats.troopLift>0,'transport design should expose troop lift');
assert.equal(transport.designStats.antiArmour,0,'transport helicopter should not behave like an attack helicopter');

let assigned = assignHelicopterMission(home,transport.id,HELICOPTER_MISSIONS.AIR_ASSAULT,target.id);
assert.equal(assigned.assigned,true,'transport helicopter should accept an air-assault mission');
const beforeOps = home.aviation.rotorcraft.operationalExperience;
let events = tickHelicopters([home,target],101,7,()=>.99);
assert.ok(events.some(e=>e.type==='helicopter_air_assault'),'air assault should create a battlefield event');
assert.ok(target.rotaryWingEffects.troopLift>0,'air assault should create tactical troop-lift effect');
assert.ok(home.aviation.rotorcraft.operationalExperience>beforeOps,'operations should create learn-by-doing experience');

const attack = buildHelicopter(home,{role:HELICOPTER_ROLES.ATTACK,tick:102});
assert.ok(attack,'attack helicopter should build after the dedicated breakthrough');
assert.ok(attack.designStats.firepower>transport.designStats.firepower,'attack design should trade troop lift for battlefield firepower');
assert.ok(attack.designStats.antiArmour>0,'attack design should expose anti-armour battlefield effect');
assigned = assignHelicopterMission(home,attack.id,HELICOPTER_MISSIONS.CLOSE_SUPPORT,target.id);
assert.equal(assigned.assigned,true,'attack helicopter should accept close-support mission');
const infrastructureBefore = target.warDamage?.infrastructureDamage || 0;
events = tickHelicopters([home,target],103,7,()=>.99);
assert.ok(events.some(e=>e.type==='helicopter_close_support'),'close support should create a battlefield event');
assert.ok((target.warDamage?.combatEquipmentAttrition||0)>0,'attack helicopters should attrit battlefield equipment');
assert.equal(target.warDamage?.infrastructureDamage||0,infrastructureBefore,'attack helicopters should not default to fixed-wing strategic infrastructure bombing');

for(let i=0;i<55;i++){
  assignHelicopterMission(home,transport.id,HELICOPTER_MISSIONS.RAPID_REDEPLOYMENT,target.id);
  tickHelicopters([home,target],110+i,7,()=>.99);
}
const improvement = helicopterDesignImprovement(home,HELICOPTER_ROLES.TRANSPORT);
assert.ok(improvement>0,'learning by doing should improve the available helicopter design frontier');
const next = authoriseHelicopterGeneration(home,HELICOPTER_ROLES.TRANSPORT,{tick:200,authorisedBy:'regression'});
assert.equal(next.authorised,true,'sufficient learning should allow a new helicopter generation');
assert.ok(next.design.sequence>transport.designSequence,'new generation should advance the standard design sequence');

const summary = helicopterSummary(home);
assert.equal(summary.transport,1);
assert.equal(summary.attack,1);
assert.ok(summary.componentExperience.rotorSystem>0,'rotor-system experience should be tracked independently');
assert.ok(summary.componentExperience.fieldMaintenance>0,'field-maintenance experience should improve through use');

const discovery = makeRegion('discovery');
discovery.unlockedTechIds = new Set(['powered_flight','military_aviation','aircraft_armament']);
discovery.aviation.flightExperience = 500;
let breakthroughs = tickHelicopterBreakthroughs([discovery],300,()=>0,365.2425);
assert.ok(breakthroughs.some(e=>e.techId===ROTARY_WING_FLIGHT_TECH_ID),'rotary-wing flight should emerge from powered-flight and component capability');
discovery.aviation.rotorcraft.operationalExperience = 20;
breakthroughs = tickHelicopterBreakthroughs([discovery],301,()=>0,365.2425);
assert.ok(breakthroughs.some(e=>e.techId===AIR_ASSAULT_TECH_ID),'operating helicopters should unlock air-assault doctrine');
discovery.aviation.rotorcraft.operationalExperience = 50;
breakthroughs = tickHelicopterBreakthroughs([discovery],302,()=>0,365.2425);
assert.ok(breakthroughs.some(e=>e.techId===ATTACK_HELICOPTER_TECH_ID),'weapons integration plus operating experience should unlock dedicated attack helicopters');

const runtime = makeRegion('runtime');
const runtimeTarget = makeRegion('runtime-target');
runtimeTarget.unlockedTechIds = new Set();
const runtimeHelo = buildHelicopter(runtime,{role:HELICOPTER_ROLES.TRANSPORT,tick:400});
assignHelicopterMission(runtime,runtimeHelo.id,HELICOPTER_MISSIONS.RAPID_REDEPLOYMENT,runtimeTarget.id);
const runtimeEvents = tickAviation([runtime,runtimeTarget],401,7,()=>.99,{agreements:[]});
assert.equal(runtimeEvents.filter(e=>e.type==='helicopter_rapid_redeployment').length,1,'normal aviation runtime should tick helicopter missions once');

console.log('helicopter regression checks passed');
