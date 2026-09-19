import assert from 'node:assert/strict';
import { serviceProvisioningInPort,tickProvisioningAtSea,shouldReturnForProvisioning } from '../js/military/oceanicProvisioning.js';
import { ensureEnvironmentalHealthState,tickLeadWaterHealth,CFC_REFRIGERATION_TECH_ID,MECHANICAL_REFRIGERATION_TECH_ID,FOOD_CANNING_TECH_ID,CFC_OZONE_HARM_TECH_ID,ALTERNATIVE_REFRIGERANTS_TECH_ID,recordRefrigerationUse,knownLeadWaterRisk,LEAD_WATER_RISK_TECH_ID,LEAD_FREE_WATER_TECH_ID } from '../js/technology/foodPreservationEnvironmentalHealth.js';
import { tickWorldOzoneLayer,ozoneDiplomaticSignal,tickOzoneDiplomacy } from '../js/world/ozoneLayer.js';

const region=(id)=>({id,name:id,unlockedTechIds:new Set(),neighbors:[],tradePartnerIds:[],relations:new Map(),publicEducation:{literacy:.8},publicHealth:{publicHealthAdministration:.7},industrialSupply:{capability:{precision_machining:.8}},electricity:{industrialService:.8},governance:{administrativeControl:.7},construction:{assets:[{typeId:'aqueduct',condition:1}]},stockpile:{food:1000,salt:50}});

const old=region('old'),fleet={id:1,mission:'patrol',ships:[{designId:'frigate'}],provisioning:{}};
serviceProvisioningInPort(fleet,old,old,1,100);
const oldWeeks=fleet.provisioning.preservedWeeksRemaining;

const canned=region('canned'); canned.unlockedTechIds.add(FOOD_CANNING_TECH_ID);
const cannedFleet={id:2,mission:'patrol',ships:[{designId:'frigate'}],provisioning:{}};
serviceProvisioningInPort(cannedFleet,canned,canned,1,100);
assert(cannedFleet.provisioning.preservedWeeksRemaining>oldWeeks,'canning should extend preserved provision endurance');
for(let i=0;i<10;i++)tickProvisioningAtSea(cannedFleet,canned,1);
assert(cannedFleet.provisioning.freshProvisionQuality<.2,'canning must not preserve fresh vitamin-rich food by itself');

const cold=region('cold'); [FOOD_CANNING_TECH_ID,MECHANICAL_REFRIGERATION_TECH_ID,CFC_REFRIGERATION_TECH_ID].forEach(t=>cold.unlockedTechIds.add(t));
const coldFleet={id:3,mission:'patrol',ships:[{designId:'steam_frigate'}],provisioning:{}};
serviceProvisioningInPort(coldFleet,cold,cold,1,100);
for(let i=0;i<10;i++)tickProvisioningAtSea(coldFleet,cold,1);
assert(coldFleet.provisioning.freshProvisionQuality>cannedFleet.provisioning.freshProvisionQuality,'powered refrigeration should preserve fresh food better');
assert(ensureEnvironmentalHealthState(cold).cfcUse>0,'CFC refrigeration should record use');

const regions=[cold,canned];
for(let i=0;i<520;i++){recordRefrigerationUse(cold,10,1);tickWorldOzoneLayer(regions,7);}
assert(regions[0].worldEnvironment.ozoneLayer.ozoneIndex<1,'sustained CFC use should deplete ozone');
const depleted=regions[0].worldEnvironment.ozoneLayer.ozoneIndex;
cold.unlockedTechIds.add(CFC_OZONE_HARM_TECH_ID);cold.unlockedTechIds.add(ALTERNATIVE_REFRIGERANTS_TECH_ID);
for(let i=0;i<5200;i++)tickWorldOzoneLayer(regions,7);
assert(regions[0].worldEnvironment.ozoneLayer.ozoneIndex>depleted,'ozone should recover slowly after emissions stop');
assert(ozoneDiplomaticSignal(cold,regions).solutionLeadership>0,'alternative refrigerants should create solution leadership');

const observer=region('observer'); observer.unlockedTechIds.add(CFC_OZONE_HARM_TECH_ID);observer.relations.set(cold.id,{attitude:0}); cold.relations.set(observer.id,{attitude:0});regions.push(observer);
const before=observer.relations.get(cold.id).attitude;tickOzoneDiplomacy(regions,999,365);assert.notEqual(observer.relations.get(cold.id).attitude,before,'known ozone behaviour should affect diplomacy');

const lead=region('lead');tickLeadWaterHealth(lead,52);assert(ensureEnvironmentalHealthState(lead).leadWaterShare>0,'piped water may adopt lead before harm is understood');assert.equal(knownLeadWaterRisk(lead),null,'lead risk should remain hidden before discovery');
lead.unlockedTechIds.add(LEAD_WATER_RISK_TECH_ID);assert(knownLeadWaterRisk(lead),'lead risk should become visible after discovery');const share=lead.environmentalHealth.leadWaterShare;lead.unlockedTechIds.add(LEAD_FREE_WATER_TECH_ID);for(let i=0;i<52;i++)tickLeadWaterHealth(lead,1);assert(lead.environmentalHealth.leadWaterShare<share,'lead-free systems should drive replacement');

assert.equal(shouldReturnForProvisioning(coldFleet),false,'refrigerated and canned fleets should not immediately return for provisions');
console.log('preservation/environmental health regression passed');
