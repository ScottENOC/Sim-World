import assert from 'node:assert/strict';
import { industrialProductionBreakthroughChances, TRACTOR_TECH_ID, COMBINE_TECH_ID } from '../js/technology/industrialProduction.js';

function baseRegion(){
  return {id:'r',neighbors:[],tradePartnerIds:new Set(),recentTradePartners:new Map(),population:100000,demographics:{workingAge:55000},occupations:{farmer:18000},
    unlockedTechIds:new Set(['petroleum_refining','automobile']),construction:{assets:[{typeId:'factory',condition:1,scale:1}]},corporateInfrastructure:{assets:[]},
    industrialProduction:{factorySophistication:.5,standardisationExperience:.6},industrialSupply:{capability:{precision_machining:.7,locomotive_engineering:.5}},
    industrialPlants:{lines:[],componentInventory:{},componentCapability:{engine:.7,transmission:.65,wheeled_chassis:.6},productExperience:{motor_vehicle:.55},nextLineId:1},
    corporateCapital:{financialDepth:.6},electricity:{industrialCoverage:.7},governance:{administrativeControl:.6},agriculturalLand:{availableArableHa:700000},agriculturalMachinery:{tractorExperience:.5}};
}
const r=baseRegion(),byId=new Map([[r.id,r]]);const c=industrialProductionBreakthroughChances(r,byId);
assert.ok(c.tractor>0,'automotive component capability plus farm demand should permit a tractor breakthrough');
r.unlockedTechIds.add(TRACTOR_TECH_ID);const c2=industrialProductionBreakthroughChances(r,byId);
assert.ok(c2.combine>0,'tractor experience plus stronger industry should permit combine development');
r.unlockedTechIds.add(COMBINE_TECH_ID);const c3=industrialProductionBreakthroughChances(r,byId);
assert.equal(c3.combine,0,'known combine technology should not rediscover itself');
console.log('agricultural machinery technology regression passed');
