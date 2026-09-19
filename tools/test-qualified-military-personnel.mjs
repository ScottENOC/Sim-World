import assert from 'node:assert/strict';
import {
  ensureQualifiedPersonnel, assignAircraftCrew, assignShipCrew, aircraftCrewReadiness, shipCrewReadiness,
  recordAircraftCrewPractice, applyShipCrewCasualties, resolveAircraftCrewLoss, tickAirPersonnel, tickNavalPersonnel,
  qualifiedPersonnelSummary,
} from '../js/military/qualifiedPersonnel.js';

function region(id='r'){
  return {id,population:2_000_000,treasury:100_000,stockpile:{aviation_fuel:10_000},massEducation:{literacy:.72},militaryStrategy:{spendingPriority:.7},construction:{assets:[{typeId:'airfield',condition:1,scale:2},{typeId:'harbour',condition:1,scale:1},{typeId:'shipyard',condition:1,scale:1},{typeId:'naval_base',condition:1,scale:1}]}};
}
function fighter(id='f1'){return{id,ownerType:'military',role:'fighter',condition:1,status:'serviceable',pilotExperience:0};}
function bomber(id='b1'){return{id,ownerType:'military',role:'bomber',condition:1,status:'serviceable',pilotExperience:0};}
function destroyer(id='s1'){return{id,designId:'destroyer',condition:1,designStats:{crew:30},damageState:{hitLog:[]}};}

const r=region();const f=fighter(),b=bomber(),s=destroyer();
// Existing forces are grandfathered into the new personnel ledger rather than becoming mysteriously uncrewed on load.
tickAirPersonnel(r,[f,b],7);tickNavalPersonnel(r,[{ships:[s]}],1);
assert(f.crewAssignment?.pilots===1,'fighter should receive a qualified pilot');
assert(b.crewAssignment?.pilots===1&&b.crewAssignment?.aircrew===4,'bomber should require pilot plus mission crew');
assert(s.crewAssignment?.sailors>0&&s.crewAssignment?.technical>0&&s.crewAssignment?.officers>0,'industrial warship should require sailors, technical specialists and officers');
assert(aircraftCrewReadiness(f)>.7,'fully crewed fighter should be operational');
assert(shipCrewReadiness(s)>.65,'fully crewed destroyer should be operational');

// Experience belongs to the crew, not the airframe capability.
const before=f.crewAssignment.pilotExperience;recordAircraftCrewPractice(f,4);assert(f.crewAssignment.pilotExperience>before,'sorties should build pilot experience');

// New hardware can outrun trained personnel.
const noCrewRegion=region('shortage');ensureQualifiedPersonnel(noCrewRegion).airBootstrapComplete=true;
const fresh=fighter('fresh');assignAircraftCrew(noCrewRegion,fresh);assert.equal(fresh.crewAssignment.pilots,0,'new fighter should not conjure a pilot');assert(aircraftCrewReadiness(fresh)<.2,'uncrewed aircraft should be effectively unavailable');
for(let i=0;i<80;i++)tickAirPersonnel(noCrewRegion,[fresh],7);
assert((fresh.crewAssignment?.pilots||0)>0||qualifiedPersonnelSummary(noCrewRegion,[fresh],[]).pools.pilot.available>0,'training system should eventually create qualified pilots');

// Crew casualties differ from platform damage and reduce effectiveness.
const combatShip=destroyer('combat');assignShipCrew(r,combatShip,{bootstrap:true});const readinessBefore=shipCrewReadiness(combatShip);applyShipCrewCasualties(combatShip,.9,{rng:()=>.99});assert(shipCrewReadiness(combatShip)<readinessBefore,'crew casualties should degrade ship effectiveness even before more hull damage');

// Destroyed aircraft can return surviving trained people to the pool.
const lossRegion=region('loss');const lost=fighter('lost');assignAircraftCrew(lossRegion,lost,{bootstrap:true});recordAircraftCrewPractice(lost,20);const exp=lost.crewAssignment.pilotExperience;lost.condition=.02;const result=resolveAircraftCrewLoss(lossRegion,lost,{rng:()=>0});assert.equal(result.survivors,1,'a pilot can survive loss of the aircraft');const summary=qualifiedPersonnelSummary(lossRegion,[],[]);assert(summary.pools.pilot.available>=1,'surviving pilot should return to the qualified pool');assert(summary.pools.pilot.averageExperience>=exp-.001,'survivor should retain accumulated experience');

console.log('qualified military personnel regression: ok');
