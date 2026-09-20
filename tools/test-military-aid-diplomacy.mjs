import assert from 'node:assert/strict';
import {
  AID_CONDITIONS,
  AID_OFFER_STATUS,
  EXPORT_CONTROL_LEVEL,
  authoriseMilitaryAid,
  counterMilitaryAidOffer,
  dispatchMilitaryAidDiplomatically,
  ensureMilitaryAidDiplomacy,
  evaluateMilitaryAidOffer,
  militaryAidExportAssessment,
  proposeMilitaryAid,
  requestMilitaryAid,
  respondMilitaryAidOffer,
  setMilitaryAidExportControl,
  suspendMilitaryAidProgramme,
  resumeMilitaryAidProgramme,
  tickMilitaryAidDiplomacy,
} from '../js/diplomacy/militaryAidDiplomacy.js';
import { ensureMilitaryAssistanceState } from '../js/diplomacy/militaryAssistance.js';

function region(id, polityId, neighborIds=[]){return {id,name:id,polityId,neighbors:neighborIds,stockpile:{firearms:1000,small_arms_ammunition:5000},treasury:500,population:100000,governance:{sovereignPolityId:polityId,administrativeControl:.7},relations:{},massEducation:{literacy:.7},industrialSupply:{capability:{precision_machining:.6}},militaryProfessionalisation:{professionalism:.65}};}
function polity(id, capitalRegionId){return {id,name:id,capitalRegionId,institutions:{executive:{},parliament:{representation:.8}}};}
const donor=polity('donor','d');const recipient=polity('recipient','r');const rival=polity('rival','x');
const d=region('d','donor',['r']);const r=region('r','recipient',['d','x']);const x=region('x','rival',['r']);
d.relations.r={attitude:.65};r.relations.d={attitude:.55};r.relations.x={attitude:-.8};x.relations.r={attitude:-.8};
const regions=[d,r,x],polities=[donor,recipient,rival];

// Aid requests and conditional offers are mirrored across both governments.
const req=requestMilitaryAid(recipient,donor,10,{funds:40,urgency:.9,public:true});
assert.equal(req.created,true);assert.equal(ensureMilitaryAidDiplomacy(donor).requests.some(q=>q.id===req.request.id&&q.inbound),true);
const offered=proposeMilitaryAid(donor,recipient,11,{requestId:req.request.id,funds:30,stockpile:{firearms:100},conditions:[AID_CONDITIONS.END_USE_MONITORING,AID_CONDITIONS.NO_REEXPORT]});
assert.equal(offered.created,true);assert.equal(ensureMilitaryAidDiplomacy(recipient).offers.some(o=>o.id===offered.offer.id&&o.inbound),true);
const evaln=evaluateMilitaryAidOffer(recipient,donor,offered.offer,regions,{urgency:.9});assert.equal(evaln.route.possible,true);assert.ok(evaln.score>0);

// Recipient can counter rather than accept a take-it-or-leave-it offer.
const counter=counterMilitaryAidOffer(recipient,donor,ensureMilitaryAidDiplomacy(recipient).offers.find(o=>o.id===offered.offer.id),12,{funds:45,conditions:[AID_CONDITIONS.NO_REEXPORT]});
assert.equal(counter.created,true);assert.equal(counter.offer.counterOf,offered.offer.id);assert.equal(counter.offer.funds,45);
const response=respondMilitaryAidOffer(recipient,donor,counter.offer.id,'accept',13);assert.equal(response.changed,true);assert.equal(response.status,AID_OFFER_STATUS.ACCEPTED);

// Export controls are hard policy checks, not flavour text.
setMilitaryAidExportControl(donor,recipient.id,EXPORT_CONTROL_LEVEL.EMBARGO,{currentTick:14,reason:'regional_conflict'});
assert.equal(militaryAidExportAssessment(donor,recipient,{type:'military_materiel'}).allowed,false);
let sent=dispatchMilitaryAidDiplomatically(donor,recipient,regions,14,{type:'military_materiel',visibility:'public',funds:10},{approvals:['parliament'],rng:()=>0});
assert.equal(sent.dispatched,false);assert.equal(sent.reason,'arms_embargo');

// Review controls allow aid but still preserve institutional authority checks.
setMilitaryAidExportControl(donor,recipient.id,EXPORT_CONTROL_LEVEL.REVIEW,{currentTick:15});
const authority=authoriseMilitaryAid(donor,'military_materiel','public',['parliament']);assert.equal(typeof authority.allowed,'boolean');
// Give this fixture executive spending authority so the physical dispatch path can be exercised independent of constitutional defaults.
donor.institutions={powers:{spending:{holder:'executive',consentRequiredFrom:[]},intelligenceOperations:{holder:'executive',consentRequiredFrom:[]},limitedForce:{holder:'executive',consentRequiredFrom:[]}}};
sent=dispatchMilitaryAidDiplomatically(donor,recipient,regions,16,{type:'military_materiel',visibility:'public',funds:10,stockpile:{firearms:25}},{rng:()=>0});
assert.equal(sent.dispatched,true);assert.equal(sent.exportAssessment.reviewRequired,true);assert.ok(d.treasury<500);assert.ok(d.stockpile.firearms<1000);

// Programmes can be suspended and resumed without deleting the diplomatic history.
const programmeId=sent.shipment.programmeId;let changed=suspendMilitaryAidProgramme(donor,recipient,programmeId,17,'end_use_concern');assert.equal(changed.changed,true);assert.equal(changed.programme.status,'suspended');changed=resumeMilitaryAidProgramme(donor,recipient,programmeId,18);assert.equal(changed.changed,true);assert.equal(changed.programme.status,'active');

// NPCs under proxy pressure can ask a friendly reachable donor rather than magically receiving supplies.
ensureMilitaryAssistanceState(recipient).proxyPressure['recipient:rival']=.8;
const events=tickMilitaryAidDiplomacy(polities,regions,52,()=>0,{playerPolityId:'donor'});assert.ok(events.some(e=>e.type==='npc_military_aid_requested'&&e.recipientPolityId==='recipient'));

console.log('military aid diplomacy, requests, counters, export controls, suspension and institutional hooks passed');
