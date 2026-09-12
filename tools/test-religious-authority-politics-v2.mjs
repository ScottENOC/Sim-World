import assert from 'node:assert/strict';
import {
  ensureAuthorityPolitics, ensurePolityReligiousPolitics, recogniseRuler, sanctionRuler,
  settleReligiousAppointments, callReligiousCouncil, tickMedievalReligiousPolitics,
} from '../js/society/medievalReligiousPolitics.js';

function polity(id, legitimacy=.55) {
  return { id, name:id, capitalRegionId:`${id}-r`, administration:{ legitimacy, officialdom:.65, accounting:.6, communications:.6, recordKeeping:.7 }, institutionalPaths:{ bureaucraticService:.6 } };
}
function region(id, polityId, religionId, share=.7) {
  return { id, name:id, population:10000, polityId, governance:{ sovereignPolityId:polityId }, religion:{ shares:{[religionId]:share}, unrest:0 }, treasury:500,
    militaryFinance:{ weeklyTaxRevenue:8, revenueEma:8 }, subregionalControl:{ places:[] } };
}

const religion = { id:'faith', familyId:'family', authority:.65 };
const rivalReligion = { id:'faith-rival', familyId:'family', authority:.55 };
const a = polity('a',.5), b = polity('b',.5);
const ra = region('a-r','a','faith',.8), rb = region('b-r','b','faith',.05);
const authority = { id:'auth', religionId:'faith', seatRegionId:'a-r', seatPlaceId:'seat', treasury:200, prestige:.7, diplomaticInfluence:.75,
  influenceByPolity:{a:.8,b:.35}, active:true };
ra.subregionalControl.places.push({ id:'seat', controllerActorId:'auth' });
const rivalAuthority = { id:'auth2', religionId:'faith-rival', seatRegionId:'b-r', seatPlaceId:'seat2', treasury:100, prestige:.6, diplomaticInfluence:.5,
  influenceByPolity:{a:.4,b:.4}, active:true };
rb.subregionalControl.places.push({ id:'seat2', controllerActorId:'auth2' });
const world = { religions:[religion,rivalReligion], authorities:[authority,rivalAuthority] };
const regions=[ra,rb], polities=[a,b];

ensureAuthorityPolitics(authority); ensurePolityReligiousPolitics(a);
const before = a.administration.legitimacy;
assert.equal(recogniseRuler(authority,a,regions).changed,true);
assert(a.administration.legitimacy > before);
assert(authority.politics.recognisedRulers.has('a'));
assert.equal(sanctionRuler(authority,a,regions).changed,true);
assert(authority.politics.sanctionedPolities.has('a'));
assert(!authority.politics.recognisedRulers.has('a'));

assert.equal(settleReligiousAppointments(authority,a,'shared').mode,'shared');
assert.equal(authority.politics.appointmentSettlements.a,'shared');

authority.politics.doctrinalDisputes.push({id:'d1',active:true,severity:.5});
const council = callReligiousCouncil(authority,religion,regions,100,{forceOutcome:true});
assert.equal(council.success,true);
assert.equal(authority.politics.doctrinalDisputes[0].active,false);

const war = { id:'w1', active:true, participants:[
  {actorId:'a',sideId:'a',stances:{b:'hostile'}}, {actorId:'b',sideId:'b',stances:{a:'hostile'}},
]};
const treasuryBefore = authority.treasury;
tickMedievalReligiousPolitics(regions,world,polities,200,365.2425,()=>0.99,{activeWars:[war],playerPolityId:'a'});
assert(authority.politics.propertyByPolity.a > 0,'religious property should accumulate where followers and influence exist');
assert(authority.treasury >= treasuryBefore - 1,'authority finances should persist and receive institutional income');
assert(authority.politics.rivalAuthorityIds.has('auth2'),'same-family authorities should recognise rivalry where influence overlaps');

// Occupying the seat must not delete the authority. Prolonged occupation creates an administrative refuge if one exists.
ra.subregionalControl.places[0].controllerActorId='b';
const refuge = region('refuge','a','faith',.75); refuge.population=15000; regions.push(refuge);
let occupationEvents=[];
for (let i=0;i<4;i++) occupationEvents.push(...tickMedievalReligiousPolitics(regions,world,polities,300+i*52,365.2425,()=>0.99,{activeWars:[],playerPolityId:'a'}));
assert.equal(authority.active,true);
assert.equal(authority.politics.seatOccupation.occupied,true);
assert(authority.politics.seatOccupation.administrativeRefugeRegionId,'prolonged occupation should relocate working administration');
assert(occupationEvents.some(e=>e.type==='religious_seat_occupied'));
assert(occupationEvents.some(e=>e.type==='religious_authority_relocated'));

// With a forced low RNG and an external-faith enemy, an authority can endorse an existing war; it never creates war ex nihilo.
authority.politics.lastWarCallTick=-Infinity;
authority.influenceByPolity.a=.9;
const warEvents = tickMedievalReligiousPolitics(regions,world,polities,1000,365.2425,()=>0,{activeWars:[war],playerPolityId:'a'});
assert(warEvents.some(e=>e.type==='religious_war_call' || e.type==='religious_peace_call'));

console.log('religious authority politics v2 regression passed');
