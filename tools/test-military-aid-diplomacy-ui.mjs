import assert from 'node:assert/strict';
import { militaryAssistancePanelModel } from '../js/ui/militaryAssistanceUi.js';
import {
  AID_OFFER_STATUS,
  EXPORT_CONTROL_LEVEL,
  ensureMilitaryAidDiplomacy,
  proposeMilitaryAid,
  requestMilitaryAid,
  respondMilitaryAidOffer,
  setMilitaryAidExportControl,
  tickMilitaryAidDiplomacy,
} from '../js/diplomacy/militaryAidDiplomacy.js';

function region(id, polityId, neighbours=[]){
  return {id,name:id,neighbors:neighbours,adjacentSeaIds:[],governance:{sovereignPolityId:polityId,administrativeControl:.8},relations:{},stockpile:{firearms:400,small_arms_ammunition:1000},treasury:600,population:100000,militaryEquipment:{designs:[],inventoryByDesign:{},nextDesignSequence:{}},army:{personnel:1000},massEducation:{literacy:.7},industrialSupply:{capability:{precision_machining:.6}},militaryProfessionalisation:{professionalism:.6}};
}
function polity(id, capitalRegionId){
  return {id,name:id,capitalRegionId,institutions:{powers:{spending:{holder:'executive',consentRequiredFrom:[]},intelligenceOperations:{holder:'executive',consentRequiredFrom:[]},limitedForce:{holder:'executive',consentRequiredFrom:[]},economicRegulation:{holder:'executive',consentRequiredFrom:[]}}}};
}

const player=polity('player','p'), ally=polity('ally','a'), client=polity('client','c');
const p=region('p','player',['a','c']),a=region('a','ally',['p']),c=region('c','client',['p']);
p.relations.a={attitude:.7};a.relations.p={attitude:.7};p.relations.c={attitude:.6};c.relations.p={attitude:.6};
const regions=[p,a,c],polities=[player,ally,client];

// The panel exposes bidirectional diplomacy as well as physical assistance.
let model=militaryAssistancePanelModel(player,{regions,polities,visiblePolityIds:['player','ally','client']});
assert.deepEqual(model.recipients.map(x=>x.id).sort(),['ally','client']);
assert.deepEqual(model.donors.map(x=>x.id).sort(),['ally','client']);
assert.equal(model.inboundOffers.length,0);
assert.equal(model.inboundRequests.length,0);

// Export-control state is visible in the model used by the player panel.
setMilitaryAidExportControl(player,client.id,EXPORT_CONTROL_LEVEL.EMBARGO,{currentTick:1});
model=militaryAssistancePanelModel(player,{regions,polities});
assert.equal(model.exportControls.find(x=>x.polityId==='client')?.level,EXPORT_CONTROL_LEVEL.EMBARGO);

// A player request now gets an NPC diplomatic answer instead of becoming a dead record.
const request=requestMilitaryAid(player,ally,2,{type:'military_materiel',funds:80,urgency:.9});
assert.equal(request.created,true);
let events=tickMilitaryAidDiplomacy(polities,regions,3,()=>0,{playerPolityId:'player'});
assert.ok(events.some(e=>e.type==='npc_military_aid_offered'&&e.donorPolityId==='ally'));
model=militaryAssistancePanelModel(player,{regions,polities});
assert.equal(model.inboundOffers.length,1);
const inbound=model.inboundOffers[0];
assert.equal(inbound.requestId,request.request.id);

// Accepting the NPC offer leads to a real physical dispatch on the donor's next review.
let response=respondMilitaryAidOffer(player,ally,inbound.id,'accept',4);
assert.equal(response.changed,true);
assert.equal(response.status,AID_OFFER_STATUS.ACCEPTED);
events=tickMilitaryAidDiplomacy(polities,regions,5,()=>0,{playerPolityId:'player'});
assert.ok(events.some(e=>e.type==='npc_military_aid_dispatched'&&e.donorPolityId==='ally'));
assert.ok(ensureMilitaryAidDiplomacy(ally).offers.find(o=>o.id===inbound.id)?.dispatchedTick!=null);

// Player offers receive NPC acceptance/rejection logic; accepted offers return to the player as dispatchable commitments.
setMilitaryAidExportControl(player,client.id,EXPORT_CONTROL_LEVEL.NONE,{currentTick:6});
const offered=proposeMilitaryAid(player,client,6,{type:'military_materiel',visibility:'public',funds:30});
assert.equal(offered.created,true);
events=tickMilitaryAidDiplomacy(polities,regions,7,()=>0,{playerPolityId:'player'});
assert.ok(events.some(e=>e.type==='npc_military_aid_offer_accepted'&&e.offerId===offered.offer.id));
model=militaryAssistancePanelModel(player,{regions,polities});
assert.ok(model.acceptedOutboundOffers.some(o=>o.id===offered.offer.id));

console.log('military aid diplomacy UI and actionable NPC negotiation regression passed');
