import assert from 'node:assert/strict';
import { launchSiteAssessment, bestNationalLaunchSite } from '../js/technology/spaceLaunchGeography.js';
import { SPACE_STRATEGIES, buildHabitatModule, inviteSpacePartner, sendGuestAstronaut, setSpaceProgrammeStrategy, tickOffworldHabitatsWithInfrastructure } from '../js/technology/spaceCooperation.js';

function region(id,polity,lat,{coastal=true,east=true}={}){
  return {id,name:id,population:2_000_000,treasury:10000,centroid:[100,lat],isCoastal:coastal,adjacentSeaDirections:coastal?[{id:'sea',eastward:east}]:[],governance:{sovereignPolityId:polity},polityId:polity,neighbors:[],tradePartnerIds:new Set(),recentTradePartners:new Map(),relations:new Map(),stockpile:{steel:4000,petrol:4000,machine_components:3000,fertiliser:1000},unlockedTechIds:new Set(['hydroponic_controlled_environment','offworld_closed_loop_agriculture']),spaceProgramme:{completedMilestones:['first_permanent_space_station','first_moon_base','first_mars_base'],claimedFirsts:[],projects:{},history:[],totalSpent:0,prestigeEarned:0,habitats:{orbital:{id:'orbital',label:'orbital station',body:'earth orbit',active:true,crew:6,capacity:12,condition:.95,resupplyReliability:.95,lifeSupportReliability:.95,powerCapacityKw:300,powerDemandKw:150,greenhouseModules:0,greenhouseExperience:0,greenhouseReliability:0,foodSelfSufficiency:0,cumulativeResupplyCost:0,cumulativeFuelUse:0,shortageDays:0},mars:{id:'mars',label:'Mars base',body:'mars',active:true,crew:6,capacity:10,condition:.95,resupplyReliability:.95,lifeSupportReliability:.95,powerCapacityKw:700,powerDemandKw:350,greenhouseModules:1,greenhouseExperience:.3,greenhouseReliability:.8,foodSelfSufficiency:.35,cumulativeResupplyCost:0,cumulativeFuelUse:0,shortageDays:0}}}};
}

const equator=region('Equator','pE',1,{coastal:true,east:true});
const highLat=region('HighLat','pE',58,{coastal:true,east:false});
const inland=region('Inland','pE',8,{coastal:false,east:false});
assert.ok(launchSiteAssessment(equator).fuelFactor<launchSiteAssessment(highLat).fuelFactor,'equatorial east-coast launch site should use less fuel');
assert.equal(bestNationalLaunchSite([highLat,equator,inland]).regionId,'Equator');

const host=region('Host','pH',10,{coastal:true,east:true});
const guest=region('Guest','pG',20,{coastal:true,east:false});
host.relations.set(guest.id,{attitude:.25});guest.relations.set(host.id,{attitude:.25});
setSpaceProgrammeStrategy(host,SPACE_STRATEGIES.COOPERATIVE);
setSpaceProgrammeStrategy(guest,SPACE_STRATEGIES.COOPERATIVE);
const partnership=inviteSpacePartner(host,guest,100);
assert.equal(partnership.accepted,true);
assert.ok(host.spaceProgramme.partners.includes('pG'));
assert.equal(host.spaceProgramme.habitats.orbital.name,'International Orbital Station');
assert.ok(guest.relations.get(host.id).attitude>.25,'joint infrastructure should improve relations');
const visit=sendGuestAstronaut(host,guest,101);
assert.equal(visit.accepted,true);
assert.equal(host.spaceProgramme.habitats.orbital.guestCrewByPolity.pG,1);

const beforeCapacity=host.spaceProgramme.habitats.mars.capacity;
const built=buildHabitatModule(host,[host],'mars','habitation',1);
assert.ok(built.built>0);
assert.ok(host.spaceProgramme.habitats.mars.capacity>beforeCapacity);
const isru=buildHabitatModule(host,[host],'mars','isru',1);
assert.ok(isru.built>0);
const localBefore=host.spaceProgramme.habitats.mars.localResources?.water||0;
tickOffworldHabitatsWithInfrastructure([host,guest],200,()=>1,365);
assert.ok(host.spaceProgramme.habitats.mars.localResources.water>localBefore,'Mars ISRU should produce local water');
assert.ok(host.report.spaceInfrastructure.habitats.mars.modules.isru>0);
assert.ok(host.report.spaceInfrastructure.habitats.mars.scienceOutput>=0);

setSpaceProgrammeStrategy(guest,SPACE_STRATEGIES.SECURITY);
const second=inviteSpacePartner(guest,host,300);
assert.equal(second.accepted,false,'security-focused programme should not automatically become cooperative');

console.log('space cooperation and launch geography regressions passed');
