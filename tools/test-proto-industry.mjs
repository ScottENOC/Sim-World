import assert from 'node:assert/strict';
import { tickProtoIndustry, ensureProtoIndustryState, WATER_POWER_TECH_ID, COAL_HEAT_TECH_ID, DEEP_MINING_TECH_ID, STEAM_PUMPING_TECH_ID } from '../js/economy/protoIndustry.js';

function region(id='r1') {
  return {
    id, name:id, population:50000, wallet:100,
    unlockedTechIds:new Set(['water_management','shaft_mining','mine_drainage']),
    deposits:{ ironOre:{}, coal:{} }, stockpile:{ coal:20 },
    hydrology:{ managedFlow:50, riverId:'river' }, weather:{ windExposure:0.6 },
    medievalSociety:{ urban:{ guilds:0.8 } },
    learningByDoing:{ smithing:{experience:300000}, mining:{experience:400000} },
    corporateCapital:{ financialDepth:0.8, creditorTrust:0.9, investibleWealth:20, firms:[
      {id:`${id}:mfg`, status:'active', sector:'manufacture', capitalIndex:10},
      {id:`${id}:mine`, status:'active', sector:'mining', capitalIndex:10},
    ]},
    tradeEconomy:{ exportIncomeEma:20 },
  };
}

// Suitable, capital-rich regions privately invest once technologies exist.
const a=region();
a.unlockedTechIds.add(WATER_POWER_TECH_ID);
tickProtoIndustry([a],100,365,()=>0);
assert.ok(a.protoIndustry.assets.length>0,'private capital should create productive assets');
assert.ok(a.protoIndustry.privateCapitalCommitted>0);
assert.equal(a.governmentIndustry, undefined,'proto-industry must not create a government build queue');
assert.ok(a.productionModifiers.protoIndustry>=1);

// Coal knowledge is not magic: no local coal means no independent coal-heat breakthrough.
const b=region('b');
delete b.deposits.coal; b.stockpile.coal=0;
tickProtoIndustry([b],100,365,()=>0);
assert.equal(b.unlockedTechIds.has(COAL_HEAT_TECH_ID),false);

// Early steam pumping requires a technological stack and remains a mining technology, not railways.
const c=region('c');
c.unlockedTechIds.add(WATER_POWER_TECH_ID);
c.unlockedTechIds.add('improved_power_transmission');
c.unlockedTechIds.add(COAL_HEAT_TECH_ID);
c.unlockedTechIds.add(DEEP_MINING_TECH_ID);
tickProtoIndustry([c],100,3650,()=>0);
assert.equal(c.unlockedTechIds.has(STEAM_PUMPING_TECH_ID),true);
assert.equal(c.unlockedTechIds.has('railways'),false);
assert.equal(c.unlockedTechIds.has('assembly_line'),false);

// Assets age and produce mechanical/productive capacity rather than direct state bonuses.
ensureProtoIndustryState(c);
tickProtoIndustry([c],101,365,()=>1);
assert.ok(c.protoIndustry.mechanicalPowerIndex>=0);
assert.ok(c.protoIndustry.productivityIndex>=0);

console.log('proto-industry tests passed');
