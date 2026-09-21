import assert from 'node:assert/strict';
import {
  DRONE_CONTROL, DRONE_MISSIONS, DRONE_TECH_IDS, DRONE_TYPES,
  assignDroneMission, buildDrone, droneControlAssessment, tickDroneBreakthroughs, tickDrones
} from '../js/military/drones.js';
import { BATTERY_TECH_IDS } from '../js/economy/batteryStorage.js';

function region(id,neighbours=[]){
  return {
    id,name:id,neighbors:neighbours,population:1_000_000,treasury:2000,
    stockpile:{steel:200,aviation_fuel:20,advanced_rechargeable_cells:10,lithium_ion_cells:10},
    industrialSupply:{capability:{precision_machining:.82},inventory:{machine_components:100}},
    industrialPlants:{componentCapability:{electronics:.82,radio_navigation:.80,optics:.76}},
    structuralTransformation:{capability:{manufacture:.80}},
    electricity:{service:.8,industrialService:.8},
    unlockedTechIds:new Set(['powered_flight','military_aviation','aerial_bombing','industrial_electrification','rocket_stabilisation']),
  };
}

const a=region('a',['b']),b=region('b',['a','c']),c=region('c',['b','d']),d=region('d',['c']);
for(const tech of Object.values(DRONE_TECH_IDS))a.unlockedTechIds.add(tech);
a.unlockedTechIds.add(BATTERY_TECH_IDS.ADVANCED);
const byId=new Map([a,b,c,d].map(r=>[r.id,r]));

const recon=buildDrone(a,DRONE_TYPES.RECON_UAV);
assert.ok(recon,'recon UAV should build');
let control=droneControlAssessment(a,b,recon,byId);
assert.equal(control.mode,DRONE_CONTROL.LOCAL,'adjacent missions should use local radio');
control=droneControlAssessment(a,c,recon,byId);
assert.equal(control.mode,DRONE_CONTROL.RELAY,'two-hop missions should use radio relay');
control=droneControlAssessment(a,d,recon,byId);
assert.equal(control.available,false,'long-range UAV should fail without satellite or autonomy');

a.orbitalSupport={droneBeyondLineOfSightControl:.72};
control=droneControlAssessment(a,d,recon,byId);
assert.equal(control.mode,DRONE_CONTROL.SATELLITE,'long-range UAV should use satellite control when available');
assignDroneMission(a,recon.id,DRONE_MISSIONS.RECON,'d');
let events=tickDrones([a,b,c,d],100,7,()=>.99);
assert.ok(events.some(e=>e.type==='drone_reconnaissance'&&e.controlMode===DRONE_CONTROL.SATELLITE));
assert.ok(a.droneRecon.d?.confidence>0,'reconnaissance should create persistent intelligence');

const munition=buildDrone(a,DRONE_TYPES.LOITERING_MUNITION);
assert.ok(munition,'loitering munition should build');
assignDroneMission(a,munition.id,DRONE_MISSIONS.ATTACK,'d');
const before=d.warDamage?.infrastructureDamage||0;
events=tickDrones([a,b,c,d],101,7,()=>.99);
assert.ok(events.some(e=>e.type==='drone_strike'&&e.expendable),'one-way attack drone should strike as expendable');
assert.ok((d.warDamage?.infrastructureDamage||0)>before,'one-way attack should cause real war damage');
assert.equal(munition.status,'destroyed','one-way attack drone should be consumed by its mission');

const quad=buildDrone(a,DRONE_TYPES.QUADCOPTER);
assert.ok(quad&&quad.batteryCharge===1,'battery multirotor should have a battery state');
assert.ok(quad.endurance>.35,'existing battery technology should improve multirotor endurance');
assert.ok(a.stockpile.advanced_rechargeable_cells<10,'building a battery drone should consume battery cells');

const developing=region('developing');
developing.unlockedTechIds=new Set(['powered_flight']);
let breakthroughs=tickDroneBreakthroughs([developing],200,()=>0,365);
assert.ok(breakthroughs.some(e=>e.techId===DRONE_TECH_IDS.RADIO_CONTROLLED),'powered flight plus radio/electronics should permit radio-control breakthrough');

console.log('Drone regressions passed');
