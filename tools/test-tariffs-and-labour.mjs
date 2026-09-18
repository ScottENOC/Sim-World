import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ensureTradePolicy, setTradeRestriction, tradePolicyDecision } from '../js/economy/tradePolicy.js?v=test';
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
    tradeEconomy:{weeklyImports:600,weeklyExports:500,weeklyTariffPaid:0,tariffBurdenEma:0},
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

const labour=region({id:'labour',tradeEconomy:{weeklyImports:700,weeklyExports:300,weeklyTariffPaid:180,tariffBurdenEma:.18}});
const before=ensureLabourRelations(labour).grievance;
for(let week=1;week<=8;week++) tickLabourRelations(labour,week,7,{isPlayer:true});
assert.ok(labour.labourRelations.grievance>before,'sustained tariff cost pressure should feed labour grievance through living/input costs');
assert.ok(labour.report.labourRelations.causes.tariffCost>0,'tariff cost should be visible in labour diagnostics');

const trade=fs.readFileSync(new URL('../js/economy/trade.js',import.meta.url),'utf8');
assert.ok(trade.includes('tradePolicyDecision'));
assert.ok(trade.includes('weeklyTariffRevenue'));
assert.ok(trade.includes('tariffRate'));
assert.ok(!fs.readFileSync(new URL('../js/ui/labourRelationsUi.js',import.meta.url),'utf8').includes('labour-protection'));
console.log('tariffs and labour integration regression passed');
