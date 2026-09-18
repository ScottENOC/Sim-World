import assert from 'node:assert/strict';
import { AIR_MISSIONS, POWERED_FLIGHT_TECH_ID, MILITARY_AVIATION_TECH_ID, buildAircraft, assignAircraftMission, tickAviation, airDefenceRisk, reserveAircraftCourier, completeAircraftCourier, aviationSummary } from '../js/military/aviation.js';

function region(id='a'){
  return {id,name:id,population:200000,treasury:500,wallet:5000,neighbors:[],tradePartnerIds:[],recentTradePartners:new Map(),unlockedTechIds:new Set([POWERED_FLIGHT_TECH_ID,MILITARY_AVIATION_TECH_ID,'steelmaking']),
    stockpile:{wood:500,textiles:500,steel:500,aviation_fuel:100},industrialSupply:{capability:{precision_machining:.8,steelmaking:.8},inventory:{machine_components:100}},structuralTransformation:{capability:{manufacture:.8}},electricity:{industrialService:.6},industrialMarine:{marineEngineering:.4,steamEngineering:.5},
    construction:{projects:[],completed:{airfield:1},workersReserved:0,lastWeek:null,assets:[{id:`${id}-airfield`,typeId:'airfield',condition:1,scale:1}]},army:{personnel:2000},earlyModernMilitary:{artillery:{inventory:[]}},telephone:{militaryCoordination:0},aviation:{aircraft:[],flightExperience:0,lastBreakthroughs:[],civilianDemand:0}};
}

const home=region('home'),target=region('target');
const treasuryBefore=home.treasury;
const plane=buildAircraft(home,{ownerType:'military',role:'recon'});
assert.ok(plane,'industrial region with airfield should be able to build an aircraft');
assert.ok(home.treasury<treasuryBefore,'aircraft construction should be expensive rather than free');
assert.equal(aviationSummary(home).military,1,'aircraft should persist in the regional registry');
assert.equal(assignAircraftMission(home,plane.id,AIR_MISSIONS.ATTACK,target.id).assigned,false,'1913 reconnaissance aircraft should not gain attack capability automatically');
assert.equal(assignAircraftMission(home,plane.id,AIR_MISSIONS.SCOUT,target.id).assigned,true,'reconnaissance mission should be available');
const fuelBefore=home.stockpile.aviation_fuel;
const events=tickAviation([home,target],10,7,()=>0.99);
assert.ok(events.some(e=>e.type==='aerial_reconnaissance'),'scouting aircraft should create reconnaissance');
assert.ok(home.stockpile.aviation_fuel<fuelBefore,'missions should physically consume aviation fuel');
assert.ok(home.airRecon?.target,'successful reconnaissance should leave a dated observation');

const defended=region('defended'); defended.unlockedTechIds.add('machine_guns'); defended.unlockedTechIds.add('quick_firing_artillery'); defended.army.personnel=20000;
assert.ok(airDefenceRisk(defended)>airDefenceRisk(target),'regional air defence should materially increase aircraft risk');
plane.mission=AIR_MISSIONS.SCOUT; plane.status='assigned'; plane.targetRegionId=defended.id;
const shot=tickAviation([home,defended],11,7,()=>0);
assert.ok(shot.some(e=>['aircraft_damaged','aircraft_shot_down'].includes(e.type)),'strong air defence should be able to damage or destroy aircraft');
assert.ok(plane.condition<1,'aircraft damage should persist');

// Civil aircraft can be consumed as a real courier asset and relocate to the destination airfield.
const mail=buildAircraft(home,{ownerType:'civilian',role:'mail'});
assert.ok(mail,'civilian aircraft should share the persistent registry');
mail.mission=AIR_MISSIONS.IDLE; mail.status='serviceable';
const airLeg=reserveAircraftCourier(home,target);
assert.ok(airLeg?.aircraftId,'air courier must reserve a specific aircraft');
assert.equal(mail.mission,AIR_MISSIONS.COURIER,'reserved courier aircraft must be unavailable for another mission');
completeAircraftCourier(airLeg,new Map([[home.id,home],[target.id,target]]));
assert.ok(target.aviation.aircraft.some(a=>a.id===mail.id),'aircraft courier should physically arrive at the destination airfield');
assert.equal(mail.mission,AIR_MISSIONS.IDLE,'aircraft becomes available again only after delivery');

console.log('early aviation regression passed');
