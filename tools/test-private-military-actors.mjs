import assert from 'node:assert/strict';
import {
  assignMercenaryContractToCampaign,
  assignPmcMission,
  campaignExternalSupport,
  applyExternalCampaignLosses,
  privateMilitaryActions,
  revokePmcSponsorship,
} from '../js/politics/privateMilitaryActors.js';

const merc = {
  id:'merc1', actorId:'org:merc1', type:'mercenary_company', active:true, militaryCapacity:500,
  memberRegionIds:new Set(), memberPolityIds:new Set(), hostRegionIds:new Set(),
  mercenaryContracts:[{polityId:'p1',regionId:'r1',personnel:300,monthlyCost:3,active:true}], relations:{},
};
const pmc = {
  id:'pmc1', actorId:'org:pmc1', type:'private_military_company', active:true, militaryCapacity:400,
  memberRegionIds:new Set(['r1']), memberPolityIds:new Set(['p1']), hostRegionIds:new Set(['r1']),
  sponsorPolityId:'p1', sponsorDependence:.8,equipmentAccess:.8,deniability:.7,authorisedClients:new Set(['p1']),
  pmcMissions:[],mercenaryContracts:[],relations:{p1:.5},notes:{},
};
const world={nonStateOrganisations:[merc,pmc],nextOrganisationId:3};
assert.equal(assignMercenaryContractToCampaign(world,'merc1','p1',7).changed,true);
assert.equal(assignPmcMission(world,'pmc1','p1','campaign_support',7,{personnel:180,currentTick:1}).changed,true);
const support=campaignExternalSupport({id:7},world);
assert.equal(support.mercenaryPersonnel,300);
assert.equal(support.pmcPersonnel,180);
assert.ok(support.quality>1);
const loss=applyExternalCampaignLosses({id:7},world,.1);
assert.ok(loss>0);
assert.ok(merc.militaryCapacity<500);
assert.ok(pmc.militaryCapacity<400);
const actions=privateMilitaryActions(world,'p1',[{id:7,completed:false}]);
assert.equal(actions.length,2);
assert.equal(actions.find(x=>x.organisation.id==='pmc1').isSponsor,true);
assert.equal(revokePmcSponsorship(world,'pmc1','p1').changed,true);
assert.equal(pmc.sponsorPolityId,null);
assert.ok(pmc.equipmentAccess<.8);
console.log('private military actor regressions passed');
