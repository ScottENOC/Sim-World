import assert from 'node:assert/strict';
import {
  ensureLightMetals,
  facilityScaleEconomics,
  tickLightMetals,
  BAYER_ALUMINA_TECH_ID,
  ALUMINIUM_SMELTING_TECH_ID,
  TITANIUM_DIOXIDE_TECH_ID,
  TITANIUM_METAL_TECH_ID,
} from '../js/economy/lightMetals.js';
import { electricityDemand } from '../js/economy/electricity.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';

function modernRegion(id='modern') {
  return {
    id,
    name:id,
    population:1_000_000,
    stockpile:{bauxite:5000,alumina:3000,aluminium:0,titanium_minerals:3000,titanium_dioxide:0,titanium:0,packaged_chips:10},
    resourceDeposits:{bauxite:{depth:.8,remainingFraction:1},titanium_minerals:{depth:.7,remainingFraction:1}},
    unlockedTechIds:new Set(['advanced_factories','industrial_electrification','automobile','jet_propulsion',BAYER_ALUMINA_TECH_ID,ALUMINIUM_SMELTING_TECH_ID,TITANIUM_DIOXIDE_TECH_ID,TITANIUM_METAL_TECH_ID]),
    structuralTransformation:{capability:{manufacture:.85},scaleMultipliers:{manufacture:1.6}},
    industrialSupply:{capability:{precision_machining:.82}},
    massEducation:{literacy:.9},
    electricity:{industrialService:.92,delivered:2500},
    occupations:{miner:12000},
    corporateCapital:{investibleWealth:8000,firms:[{status:'active',sector:'manufacture',capitalIndex:250},{status:'active',sector:'infrastructure',capitalIndex:180}]},
    militaryEquipment:{designs:[{family:'fighter',stats:{propulsion:'jet'}},{family:'bomber',stats:{propulsion:'jet'}}]},
    report:{},
  };
}

assert.ok(TRADE_GOODS.bauxite && TRADE_GOODS.alumina && TRADE_GOODS.aluminium, 'aluminium chain should be tradable');
assert.ok(TRADE_GOODS.titanium_minerals && TRADE_GOODS.titanium_dioxide && TRADE_GOODS.titanium, 'titanium chain should be tradable');
assert.equal(TRADE_GOODS.aluminium.strategic,true,'primary aluminium should be strategically controllable');
assert.equal(TRADE_GOODS.titanium.strategic,true,'titanium metal should be strategic');
assert.equal(Boolean(TRADE_GOODS.titanium_dioxide.strategic),false,'TiO2 should remain an ordinary civilian industrial good');

const small=facilityScaleEconomics('aluminiumSmelter',10);
const efficient=facilityScaleEconomics('aluminiumSmelter',90);
assert.ok(small.unitCapitalCost > efficient.unitCapitalCost*2,'small aluminium smelters should be much more capital-expensive per unit of capacity');
assert.ok(small.scaleEfficiency < efficient.scaleEfficiency,'sub-scale smelters should also have poorer throughput efficiency');
assert.equal(efficient.minEfficientScale,45,'aluminium should have a large minimum efficient scale');

const poor=modernRegion('capital-poor');
poor.corporateCapital={investibleWealth:0,firms:[]};
tickLightMetals(poor,365.2425);
assert.equal(poor.lightMetals.facilities.aluminiumSmelter.capacity,0,'knowledge alone must not conjure a smelter without capital');
assert.equal(poor.lightMetals.lastOutput.aluminium,0,'no smelter means no primary aluminium output');

const rich=modernRegion('capital-rich');
ensureLightMetals(rich);
tickLightMetals(rich,365.2425);
assert.ok(rich.lightMetals.facilities.aluminiumSmelter.capacity>0,'capital-rich industrial regions should be able to build aluminium smelting capacity');
assert.ok(rich.lightMetals.facilities.aluminiumSmelter.capitalInvested>10,'the first smelter should be an expensive capital project');
assert.ok(rich.lightMetals.lastOutput.aluminium>0,'an operating smelter with alumina and electricity should make aluminium');
assert.ok(rich.lightMetals.electricityLoad>0,'primary aluminium should create a major electricity load');
assert.ok(rich.lightMetals.lastOutput.titaniumDioxide>0,'titanium minerals should support a civilian pigment industry');
assert.ok(rich.lightMetals.lastOutput.titanium>0,'advanced industry should be able to make small quantities of titanium metal');
assert.ok(rich.lightMetals.military.aluminiumAvailability>=0,'military material availability should be reported');
assert.ok(rich.lightMetals.civilianBenefits.paintPlasticsPaperSupply>=0,'civilian TiO2 use should be represented');

const before=rich.lightMetals.electricityLoad;
const demand=electricityDemand(rich,7);
assert.ok(before>0 && demand.lightMetalsDemand===before,'smelter demand should feed directly into the electricity system');
assert.ok(demand.industrialDemand>=before,'light metals load must be part of industrial electricity demand');

console.log('Light metals regression passed');
