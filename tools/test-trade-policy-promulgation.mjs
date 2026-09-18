import assert from 'node:assert/strict';
import { borderTariffQuote, setTradeRestriction, tickTradePolicyCommunications } from '../js/economy/tradePolicy.js?v=test';

function r(id, polity, neighbour){ return { id, name:id, population:1000, wallet:100, treasury:10,
  controllingActorId:polity, governance:{sovereignPolityId:polity}, neighbors:neighbour?[neighbour]:[], adjacentSeaIds:[],
  stockpile:{food:100}, marketDemand:{food:20}, safetyRating:1, construction:{assets:[]}, horseEconomy:{transport:0},
  occupations:{}, relations:new Map(), recentTradePartners:new Map() }; }
function establishTrade(a,b,tick=1){ a.recentTradePartners.set(b.id,tick); b.recentTradePartners.set(a.id,tick); }

const importer=r('a','A','b'), exporter=r('b','B','a'), regions=[importer,exporter];
establishTrade(importer,exporter,9);
const rule=setTradeRestriction(importer,{direction:'import',goods:['food'],allowed:false,enforcement:'communicated'},regions,10);
const notice=rule.notificationTickByActor.B;
assert.ok(notice>=11,'physical neighbour notice should take at least one simulation tick');
assert.equal(borderTariffQuote(exporter,importer,'food',0,{currentTick:10,departureTick:10}).allowed,true);
assert.equal(borderTariffQuote(exporter,importer,'food',0,{currentTick:notice,departureTick:notice}).allowed,false);
assert.equal(borderTariffQuote(exporter,importer,'food',0,{currentTick:notice+5,departureTick:10}).allowed,true,'pre-notice cargo must be grandfathered');

const urgentImporter=r('c','C','d'), urgentExporter=r('d','D','c');
establishTrade(urgentImporter,urgentExporter,19);
setTradeRestriction(urgentImporter,{direction:'import',goods:['food'],allowed:false,enforcement:'immediate'},[urgentImporter,urgentExporter],20);
assert.equal(borderTariffQuote(urgentExporter,urgentImporter,'food',0,{currentTick:20,departureTick:15}).allowed,false,'immediate enforcement reaches cargo already underway');

const tariffImporter=r('e','E','f'), tariffExporter=r('f','F','e');
establishTrade(tariffImporter,tariffExporter,29);
const tariffRule=setTradeRestriction(tariffImporter,{direction:'import',goods:['food'],allowed:true,tariffRate:.25},[tariffImporter,tariffExporter],30);
const tariffNotice=tariffRule.notificationTickByActor.F;
assert.equal(borderTariffQuote(tariffExporter,tariffImporter,'food',100,{currentTick:30,departureTick:30}).importTariff,0);
assert.equal(borderTariffQuote(tariffExporter,tariffImporter,'food',100,{currentTick:tariffNotice,departureTick:tariffNotice}).importTariff,25);
assert.equal(borderTariffQuote(tariffExporter,tariffImporter,'food',100,{currentTick:tariffNotice+4,departureTick:30}).importTariff,0,'pre-notice cargo keeps old tariff');

assert.ok(importer.tradePolicy.pendingNotices.length>0,'foreign diplomatic reaction must wait for notice');
tickTradePolicyCommunications(regions, notice-1);
assert.ok(importer.tradePolicy.pendingNotices.length>0);
tickTradePolicyCommunications(regions, notice);
assert.equal(importer.tradePolicy.pendingNotices.length,0);
console.log('trade policy promulgation regression passed');
