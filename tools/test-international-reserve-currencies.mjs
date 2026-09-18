import assert from 'node:assert/strict';
import fs from 'node:fs';
import { currencyCommodityValue } from '../js/economy/forex.js?v=test';
import {
  settlementCurrencyBetween,
  recordInternationalSettlement,
  reserveCurrencyStrength,
  borrowInForeignCurrency,
  revalueForeignCurrencyDebt,
  tickInternationalMonetarySystem,
} from '../js/economy/internationalMoney.js?v=test';

const stable = { active:true, id:'z', trust:.92, regime:'fiat_currency', inflation:.02, policyRate:.035, reserveCurrencyScore:.9, reserveCoverage:.4 };
const weak = { active:true, id:'a', trust:.55, regime:'fiat_currency', inflation:.18, policyRate:.09, reserveCurrencyScore:.1, reserveCoverage:.1 };
assert.ok(currencyCommodityValue(stable) > currencyCommodityValue(weak));

const a = { id:'aR', governance:{sovereignPolityId:'pa'}, currencyUse:{...weak}, currencyContacts:{ z:{...stable}, b:{active:true,id:'b',trust:.7,regime:'fiat_currency',inflation:.04,policyRate:.05,reserveCurrencyScore:.15} }, settlementCurrencyUse:{}, foreignCurrencyReserves:{} };
const b = { id:'bR', governance:{sovereignPolityId:'pb'}, currencyUse:{active:true,id:'b',trust:.7,regime:'fiat_currency',inflation:.04,policyRate:.05,reserveCurrencyScore:.15}, currencyContacts:{ z:{...stable}, a:{...weak} }, settlementCurrencyUse:{}, foreignCurrencyReserves:{} };
assert.equal(settlementCurrencyBetween(a,b).id,'z');
const plan = recordInternationalSettlement(a,b,1000);
assert.equal(plan.reason,'third_currency');
assert.ok(a.foreignCurrencyReserves.z > 0 && b.foreignCurrencyReserves.z > 0);

a.militaryFinance={publicDebt:1000,foreignCurrencyDebtPrincipal:0,foreignDebtLastLocalValue:0};
a.monetaryConditions={inflation:.16,currencyCredibility:.35};
a.foreignCurrencyReserves.z=200;
const borrowed=borrowInForeignCurrency(a,200,0.7);
assert.ok(borrowed.localAmount>0);
a.militaryFinance.publicDebt += borrowed.localAmount;
const before=a.militaryFinance.foreignDebtLastLocalValue;
a.currencyUse={...a.currencyUse,trust:.38,inflation:.28};
const revalued=revalueForeignCurrencyDebt(a);
assert.ok(revalued.localValue>before);
assert.ok(revalued.delta>0);

const pa={id:'pa',capitalRegionId:'aR',currency:{...weak},administration:{accounting:.8,recordKeeping:.8}};
const pz={id:'pz',capitalRegionId:'zR',currency:{...stable},administration:{accounting:.9,recordKeeping:.9}};
const z={id:'zR',governance:{sovereignPolityId:'pz'},currencyUse:{...stable},currencyContacts:{},foreignCurrencyReserves:{},corporateCapital:{financialDepth:.9},tradeEconomy:{weeklyExports:5000},medievalCommerce:{finance:{depositBanking:.9,billsOfExchange:.9,stateCredit:.9}},militaryFinance:{publicDebt:10,revenueEma:100},settlementCurrencyUse:{}};
a.corporateCapital={financialDepth:.2};a.tradeEconomy={weeklyExports:50};a.medievalCommerce={finance:{depositBanking:.7,billsOfExchange:.7,stateCredit:.6}};a.militaryFinance={...a.militaryFinance,revenueEma:20};
pa.monetaryInstitution={regime:'fiat_currency',policyRate:.09,inflation:.18,moneyGrowth:0,reserveCoverage:.1,goldReserves:0,silverReserves:0,noteIssue:1000,centralBankIndependence:.2,currencyCredibility:.4,lastPolicyRate:.09};
pz.monetaryInstitution={regime:'fiat_currency',policyRate:.035,inflation:.02,moneyGrowth:0,reserveCoverage:.4,goldReserves:0,silverReserves:0,noteIssue:2000,centralBankIndependence:.8,currencyCredibility:.9,lastPolicyRate:.035};
const events=tickInternationalMonetarySystem([pa,pz],[a,z],[],30,52);
assert.ok(Array.isArray(events));
assert.ok(pz.monetaryInstitution.reserveCurrencyScore > pa.monetaryInstitution.reserveCurrencyScore);

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert.ok(main.includes('tickInternationalMonetarySystem'));
assert.ok(main.includes("profiler.measure('International money'"));

console.log('international reserve currency regression passed');
