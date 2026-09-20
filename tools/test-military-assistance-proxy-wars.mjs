import assert from 'node:assert/strict';
import {
  AID_VISIBILITY, ASSISTANCE_TYPES, activeProxyConflicts, aidAbsorptionCapacity,
  createMilitaryAssistanceProgramme, dispatchMilitaryAid, ensureMilitaryAssistanceState,
  estimateMilitaryAssistance, npcProxyAidDecision, proxyConflictAssessment, tickMilitaryAssistance,
} from '../js/diplomacy/militaryAssistance.js';
import { createEquipmentDesign, ensureEquipmentCatalogue, EQUIPMENT_FAMILIES } from '../js/military/equipmentGenerations.js';

function region(id, polityId, overrides={}) {
  return {
    id, name:id, population:100000, treasury:500, isCoastal:false, adjacentSeaIds:[], neighbors:[],
    governance:{sovereignPolityId:polityId, administrativeControl:.65}, relations:new Map(),
    stockpile:{food:2000,steel:500,firearms:1200,small_arms_ammunition:9000,artillery_shells:800,diesel:1000,motor_vehicle:200},
    massEducation:{literacy:.65}, industrialSupply:{capability:{precision_machining:.65}}, structuralTransformation:{capability:{manufacture:.6}},
    army:{personnel:5000,professionalism:.55}, construction:{projects:[],completed:{},assets:[],workersReserved:0}, unlockedTechIds:new Set(),
    ...overrides,
  };
}
function polity(id, capitalRegionId) { return {id, capitalRegionId, administration:{legitimacy:.6}}; }
function link(a,b){a.neighbors.push(b.id);b.neighbors.push(a.id);}
function setAttitude(from,to,value){from.relations.set(to.id,{attitude:value,lastCause:'test',lastChangedTick:0});}

const donorR=region('donor-cap','donor');
const recipientR=region('recipient-cap','recipient',{treasury:50,massEducation:{literacy:.18},industrialSupply:{capability:{precision_machining:.12}},structuralTransformation:{capability:{manufacture:.12}},army:{personnel:3500,professionalism:.15}});
const opponentR=region('opponent-cap','opponent');
const patronBR=region('patron-b-cap','patron-b');
link(donorR,recipientR);link(recipientR,opponentR);link(opponentR,patronBR);
for(const a of [donorR,recipientR,opponentR,patronBR]) for(const b of [donorR,recipientR,opponentR,patronBR]) if(a!==b) setAttitude(a,b,0);
setAttitude(donorR,recipientR,.75);setAttitude(donorR,opponentR,-.7);setAttitude(patronBR,opponentR,.75);setAttitude(patronBR,recipientR,-.7);
const donor=polity('donor',donorR.id),recipient=polity('recipient',recipientR.id),opponent=polity('opponent',opponentR.id),patronB=polity('patron-b',patronBR.id);
const regions=[donorR,recipientR,opponentR,patronBR],polities=[donor,recipient,opponent,patronB];

const donorCat=ensureEquipmentCatalogue(donorR);
const tank=createEquipmentDesign(donorR,EQUIPMENT_FAMILIES.TANK,{mobility:.72,protection:.76,firepower:.8,reliability:.7,fireControlPotential:.55,computationalPower:.3,integration:.5},{tick:1});
donorCat.inventoryByDesign[tank.id]=100;

assert(aidAbsorptionCapacity(recipientR,'equipment',.8)<aidAbsorptionCapacity(donorR,'equipment',.8),'weak institutions should absorb sophisticated equipment less effectively');
const programme=createMilitaryAssistanceProgramme(donor,recipient,regions,10,{type:ASSISTANCE_TYPES.MILITARY_MATERIEL,visibility:AID_VISIBILITY.DENIABLE});
assert(programme.created && programme.programme.type===ASSISTANCE_TYPES.MILITARY_MATERIEL);
const treasuryBefore=donorR.treasury,ammoBefore=donorR.stockpile.small_arms_ammunition;
const dispatch=dispatchMilitaryAid(donor,recipient,regions,10,{programmeId:programme.programme.id,funds:40,stockpile:{small_arms_ammunition:1000,diesel:120},equipment:[{designId:tank.id,quantity:30}],training:.55,logistics:.25},()=>0);
assert(dispatch.dispatched,'aid shipment should dispatch over a valid route');
assert.equal(donorR.treasury,treasuryBefore-40,'financial aid should leave donor treasury when committed');
assert.equal(donorR.stockpile.small_arms_ammunition,ammoBefore-1000,'physical military supplies should leave donor stockpiles');
assert.equal(donorCat.inventoryByDesign[tank.id],70,'Mark-specific equipment should leave donor inventory');
assert.equal(recipientR.stockpile.small_arms_ammunition,9000,'aid should not teleport to the recipient before arrival');
assert(dispatch.shipment.arrivalTick>10,'physical aid should have travel time');

tickMilitaryAssistance(polities,regions,dispatch.shipment.arrivalTick-1,7,()=>.99,{playerPolityId:'player'});
assert.equal(recipientR.stockpile.small_arms_ammunition,9000,'shipment should remain in transit before arrival');
tickMilitaryAssistance(polities,regions,dispatch.shipment.arrivalTick,7,()=>.99,{playerPolityId:'player'});
assert(recipientR.stockpile.small_arms_ammunition>9000,'delivered aid should enter recipient stocks');
const imported=ensureEquipmentCatalogue(recipientR).designs.find(d=>d.foreignOriginalId===tank.id);
assert(imported && imported.donorPolityId===donor.id && imported.reason==='foreign_military_assistance','imported Marks should retain donor provenance');
assert(ensureEquipmentCatalogue(recipientR).inventoryByDesign[imported.id]>0,'imported equipment should become recipient inventory');
const readiness=recipientR.militaryAssistanceReadiness.byDesign[imported.id];
assert(readiness.usableFraction<.75,'low-capacity recipient should not instantly use sophisticated foreign equipment at full effectiveness');
assert(ensureMilitaryAssistanceState(recipient).dependencies[donor.id].total>0,'sustained foreign materiel/training should create patron dependency');
const usableBefore=readiness.usableFraction;
tickMilitaryAssistance(polities,regions,dispatch.shipment.arrivalTick+52,365.2425,()=>.99,{playerPolityId:'player'});
assert(readiness.usableFraction>usableBefore,'training and experience should gradually improve foreign-equipment absorption');

const covertEstimate=estimateMilitaryAssistance(opponentR,donor,recipient);
assert(covertEstimate.confidence<1,'deniable aid should not be perfectly observable by default');
const publicProgramme=createMilitaryAssistanceProgramme(patronB,opponent,regions,60,{type:ASSISTANCE_TYPES.MILITARY_MATERIEL,visibility:AID_VISIBILITY.PUBLIC});
assert(publicProgramme.created);
assert.equal(estimateMilitaryAssistance(recipientR,patronB,opponent).confidence,1,'public military aid should be fully observable');

recipient.regimeConflict={status:'active',type:'civil_war',incumbentPolityId:recipient.id,revolutionaryPolityId:opponent.id};
opponent.regimeConflict={...recipient.regimeConflict};
const conflicts=activeProxyConflicts(polities);
assert(conflicts.some(c=>c.sides.includes(recipient.id)&&c.sides.includes(opponent.id)),'active regime wars should be recognised as proxy-war candidates');
const proxy=proxyConflictAssessment(polities).find(c=>c.sides.includes(recipient.id)&&c.sides.includes(opponent.id));
assert(proxy && proxy.patrons[recipient.id].some(p=>p.donorPolityId===donor.id) && proxy.patrons[opponent.id].some(p=>p.donorPolityId===patronB.id),'opposing patrons should be associated with the side they support');
assert(proxy.escalation>0,'opposing foreign patrons should create proxy escalation pressure without automatically creating direct war');

recipient.regimeConflict=null;opponent.regimeConflict=null;
recipient.succession={crisis:{escalated:true,resolved:false,continuityResolved:false,claimantPolityId:opponent.id}};
assert(activeProxyConflicts(polities).some(c=>c.kind==='succession_civil_war'),'succession civil wars should also admit foreign patrons');

const nuclearDecision=npcProxyAidDecision(donor,recipient,opponent,regions,{directWarNuclearRisk:.95});
assert(nuclearDecision.support && nuclearDecision.preferredType===ASSISTANCE_TYPES.MILITARY_MATERIEL,'high direct-war nuclear risk should make indirect materiel support attractive');
assert.equal(nuclearDecision.visibility,AID_VISIBILITY.DENIABLE,'nuclear-rival proxy support should tend toward deniable aid');

const scarce=region('scarce-cap','scarce',{stockpile:{firearms:3},treasury:0});const scarcePolity=polity('scarce',scarce.id);link(scarce,recipientR);regions.push(scarce);
const limited=dispatchMilitaryAid(scarcePolity,recipient,regions,100,{type:ASSISTANCE_TYPES.MILITARY_MATERIEL,stockpile:{firearms:100}},()=>0);
assert(limited.dispatched && limited.shipment.cargo.stockpile.firearms===3,'aid cannot transfer more physical stock than the donor actually possesses');

console.log('military assistance, Lend-Lease transfers, absorption, deniability and proxy-war regressions passed');
