import assert from 'node:assert/strict';
import { tickIndustrialWarEconomy, warTradeDisruptionMultiplier } from '../js/economy/industrialWarEconomy.js';
import { tickStateFinance } from '../js/economy/stateFinance.js';
import { modernInfantryProfile, modernArtilleryProfile } from '../js/military/modernLandWarfare.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';

function region(id='r1') {
  return {
    id, name:id, population:100_000, stability:0.9, safetyRating:0.9,
    unlockedTechIds:new Set(['gunpowder','rifling','steelmaking','military_drill','breech_loading_rifles','magazine_rifles','machine_guns','breech_loading_artillery','quick_firing_artillery','smokeless_powder']),
    stockpile:{ gunpowder:500, steel:500, iron:500, small_arms_ammunition:0, artillery_shells:0, food:10000 },
    marketDemand:{}, treasury:20, wallet:10000,
    army:{personnel:1000,away:1000}, navy:{personnel:0}, emergencyMilitiaPersonnel:500,
    horseEconomy:{war:0}, report:{farming:{food:1000},gathering:{food:0},shoreFishing:{food:0},boatFishing:{food:0}},
    tradeEconomy:{weeklyExports:100,weeklyImports:50},
    militaryFinance:{revenueEma:20,stateCapacity:1,readiness:1,publicDebt:0},
    medievalCommerce:{finance:{stateCredit:0.8}},
    firearms:{readiness:0.9,riflingReadiness:0.9,combatExperience:0.4,totalBuilt:1000},
    steelIndustry:{readiness:0.9},
    earlyModernMilitary:{artillery:{inventory:Array.from({length:8},()=>({kind:'field_cannon',condition:1,metal:'steel'})),away:[]}},
    industrialSupply:{capability:{steelmaking:0.9,precision_machining:0.9,locomotive_engineering:0,rail_vehicle_manufacture:0,railway_engineering:0},outputCapacity:{},inventory:{},exposure:{}},
    structuralTransformation:{capability:{manufacture:0.8},scaleMultipliers:{manufacture:1}}, corporateCapital:{firms:[]},
    construction:{projects:[],completed:{},workersReserved:0,lastWeek:null,assets:[{id:'telegraph',typeId:'telegraph_network',condition:0.5,scale:1}]},
    warDamage:{infrastructureDamage:0.3}, conflictPressure:0.4,
  };
}

assert.ok(TRADE_GOODS.small_arms_ammunition?.strategic, 'small-arms ammunition should be a strategic trade good');
assert.ok(TRADE_GOODS.artillery_shells?.strategic, 'artillery shells should be a strategic trade good');

const r=region();
const treasuryBeforeMunitions=r.treasury;
const walletBeforeMunitions=r.wallet;
const campaign={attackerId:r.id,defenderId:'enemy',completed:false,lastWeek:{attackerLosses:120}};
tickIndustrialWarEconomy([r],[campaign],7);
assert.ok(r.stockpile.small_arms_ammunition>0,'industrial state should manufacture small-arms ammunition');
assert.ok(r.stockpile.artillery_shells>0,'industrial state should manufacture artillery shells');
assert.ok(r.treasury<treasuryBeforeMunitions,'munitions production should consume public procurement cash');
assert.ok(r.wallet>walletBeforeMunitions,'domestic munitions spending should return cash to the domestic economy');
assert.ok(r.report.warEconomy.munitionsSpending>0,'war economy report should expose munitions spending');
assert.ok(r.warEconomy.weeklyLogisticsCost>0,'deployed force should create logistics cost');
assert.ok(r.warEconomy.warExhaustion>0,'active war should accumulate exhaustion');
assert.ok(r.warEconomy.reconstructionNeed>0,'damaged infrastructure should create reconstruction need');
r.construction.assets[0].condition=1; r.warDamage.infrastructureDamage=999;
tickIndustrialWarEconomy([r],[],7);
assert.equal(r.warEconomy.reconstructionNeed,0,'historical bombardment totals should not make reconstruction need permanent after repairs');
tickIndustrialWarEconomy([r],[campaign],7);
assert.ok(warTradeDisruptionMultiplier(r)<1,'war disruption should reduce trade reliability');

const ammoBefore=r.stockpile.small_arms_ammunition;
const infantry=modernInfantryProfile(r,1000,{suppliedShare:1},{consumeSupplies:true,logisticsSupply:1});
assert.ok(infantry.ammunitionUsed>0,'modern infantry should consume manufactured ammunition');
assert.ok(r.stockpile.small_arms_ammunition<ammoBefore,'small-arms ammunition stock should fall in combat');

const shellsBefore=r.stockpile.artillery_shells;
const artillery=modernArtilleryProfile(r,{suppliedFraction:1,guns:8},{consumeSupplies:true,logisticsSupply:1});
assert.ok(artillery.shellsUsed>0,'modern artillery should consume manufactured shells');
assert.ok(r.stockpile.artillery_shells<shellsBefore,'artillery shell stock should fall in combat');

// State finance must charge deployed regulars and militia, and capable states may borrow to cover the wartime bill.
r.treasury=0;
r.wallet=10000;
r.warEconomy.activeCampaigns=1;
r.warEconomy.weeklyLogisticsCost=4;
tickStateFinance([r],7);
assert.equal(r.report.stateFinance.deployedPersonnel,1000,'deployed troops must remain on payroll');
assert.equal(r.report.stateFinance.militiaPersonnel,500,'mobilised militia must be costed');
assert.ok(r.report.stateFinance.payrollDue>4,'payroll should include regulars, deployed troops, militia and logistics');
assert.ok(r.militaryFinance.borrowedThisWeek>0,'high-credit state should borrow when wartime cash is insufficient');
assert.ok(r.militaryFinance.publicDebt>0,'wartime borrowing should create persistent public debt');

// Weak-credit states cannot magically fund the same war and should fall into arrears/readiness pressure.
const weak=region('weak');
weak.medievalCommerce.finance.stateCredit=0.05;
weak.militaryFinance.revenueEma=0;
weak.treasury=0;
weak.wallet=100;
weak.warEconomy={activeCampaigns:1,weeklyLogisticsCost:4};
tickStateFinance([weak],7);
assert.equal(weak.militaryFinance.borrowedThisWeek,0,'weak-credit state should not access modern sovereign borrowing');
assert.ok(weak.militaryFinance.payRatio<1,'unfunded war should create military pay shortfall');

console.log('industrial war economics regression passed');
