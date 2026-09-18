import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeTariffs, activeTradeRestrictions, borderTariffQuote, setTradeRestriction, tradePolicyDecision } from '../js/economy/tradePolicy.js?v=test';
import { ensureLabourRelations, tickLabourRelations } from '../js/society/labourRelations.js?v=test';

function region(overrides={}){
  return {
    id:'r',name:'Industrial City',population:5000,stability:.7,wallet:5000,treasury:500,
    governance:{sovereignPolityId:'p'},
    employment:{formalLabourShare:.82,unemploymentRate:.08,hardship:.18,causes:{foodPrices:.15,firmFailures:.12,tradeDisruption:.08}},
    publicEducation:{literacy:.75,technicalHumanCapital:.5},
    urbanisation:{urbanPopulation:3600},
    structuralTransformation:{industrialShare:.58,serviceShare:.18},
    corporateCapital:{financialDepth:.6},
    tradeEconomy:{weeklyImports:600,weeklyExports:500,weeklyImportTariffPaid:0,weeklyTariffRevenue:0,importTariffBurdenEma:0},
    economicRegulation:{labourStandards:.3,workerSafety:.3},
    enterpriseExternalities:{labourHarm:.3},
    socialProtection:{coverage:.2},socialProtectionReport:{coverage:.2},
    warEconomy:{activeCampaigns:0,defendingCampaigns:0,warExhaustion:0,munitionsOutputValue:0},
    stockpile:{steel:100,food:1000}, marketDemand:{steel:50,food:100}, report:{},
    ...overrides,
  };
}

const importer=region({id:'importer'}), exporter=region({id:'exporter',governance:{sovereignPolityId:'q'}});
setTradeRestriction(importer,{direction:'import',goods:['steel'],allowed:true,tariffRate:.25},[exporter],1);
assert.equal(tradePolicyDecision(importer,'import','steel',exporter).tariffRate,.25);
assert.equal(tradePolicyDecision(importer,'import','food',exporter).tariffRate,0);
assert.equal(activeTariffs(importer).length,1);
assert.equal(activeTradeRestrictions(importer).length,0,'a tariff is not an embargo and must not be represented as one');
let quote=borderTariffQuote(exporter,importer,'steel',100);
assert.equal(quote.importTariff,25);
assert.equal(quote.exportTariff,0);
setTradeRestriction(exporter,{direction:'export',goods:['steel'],allowed:true,tariffRate:.1},[importer],2);
quote=borderTariffQuote(exporter,importer,'steel',100);
assert.equal(quote.importTariff,25);
assert.equal(quote.exportTariff,10);
assert.equal(quote.totalTariff,35);
setTradeRestriction(importer,{direction:'import',goods:['steel'],allowed:false},[exporter],3);
assert.equal(borderTariffQuote(exporter,importer,'steel',100).allowed,false,'an embargo must still override tariff settlement');
assert.equal(activeTradeRestrictions(importer).length,1);

const lowTariff=region({id:'low-tariff'}), highTariff=region({id:'high-tariff',tradeEconomy:{weeklyImports:700,weeklyExports:300,weeklyImportTariffPaid:180,weeklyTariffRevenue:180,importTariffBurdenEma:.2}});
for(const r of [lowTariff,highTariff]) ensureLabourRelations(r);
for(let week=1;week<=12;week++){tickLabourRelations(lowTariff,week,7,{isPlayer:true});tickLabourRelations(highTariff,week,7,{isPlayer:true});}
assert.ok(highTariff.labourRelations.grievance>lowTariff.labourRelations.grievance,'sustained tariff costs should add to wage/living-cost grievance');
assert.ok(highTariff.report.labourRelations.causes.tariffCost>0,'tariff cost must be visible in labour diagnostics');

const trade=fs.readFileSync(new URL('../js/economy/trade.js',import.meta.url),'utf8');
const advisor=fs.readFileSync(new URL('../js/ui/advisors.js',import.meta.url),'utf8');
const ai=fs.readFileSync(new URL('../js/ai/nationAi.js',import.meta.url),'utf8');
assert.ok(trade.includes('borderTariffQuote'));
assert.ok(trade.includes('weeklyTariffRevenue'));
assert.ok(trade.includes('weeklyImportTariffPaid'));
assert.ok(trade.includes('importTariffBurdenEma'));
assert.ok(trade.includes('if (!tariffQuote.allowed)') && trade.includes('else {'),'embargoed ventures must not fall through into a sale');
assert.ok(advisor.includes('add-trade-tariff') && advisor.includes('Tariff rate'));
assert.ok(ai.includes('maybeAdjustLabourTariff'),'NPCs should use the same tariff lever under labour pressure');
assert.ok(!fs.readFileSync(new URL('../js/ui/labourRelationsUi.js',import.meta.url),'utf8').includes('labour-protection'));
console.log('tariffs and labour integration regression passed');
