import assert from 'node:assert/strict';
import { MONETARY_REGIMES, ensureMonetaryInstitution, mintSpecieCurrency, printMoney, setCentralBankPolicy, setMonetaryRegime, tickMonetaryModernisation, commercialRiskPremium } from '../js/economy/monetaryModernisation.js';

function region(id='capital') {
  return {
    id, population: 500000, treasury: 1000, wallet: 5000,
    governance:{sovereignPolityId:'p1'}, stockpile:{gold:10,silver:100},
    medievalCommerce:{finance:{depositBanking:.8,billsOfExchange:.8,stateCredit:.8}},
    corporateCapital:{financialDepth:.8,creditorTrust:.8,nonPerformingShare:.05},
    militaryFinance:{publicDebt:100,revenueEma:10,arrearsWeeks:0},
  };
}
const capital=region();
const province=region('province'); province.governance.sovereignPolityId='p1';
const polity={id:'p1',administration:{accounting:.8,recordKeeping:.8},currency:{active:true,trust:.85,monetaryBase:0}};
const m=ensureMonetaryInstitution(polity);
assert.equal(m.regime,MONETARY_REGIMES.SILVER);

const silverBefore=capital.stockpile.silver;
const minted=mintSpecieCurrency(polity,capital,[capital,province],120,{metal:'silver'});
assert.equal(minted.minted,120);
assert.ok(capital.stockpile.silver<silverBefore,'minting must consume actual silver');
assert.equal(polity.currency.monetaryBase,120,'minted specie should create the monetary base');
assert.ok(m.silverReserves>0,'minted silver should become monetary reserves');

const cb=setCentralBankPolicy(polity,capital,{independence:.8,policyRate:.035});
assert.equal(cb.changed,true,'financially developed states should be able to operate a central bank');
const conditions=tickMonetaryModernisation(polity,capital,[capital,province],365);
assert.ok(conditions.sovereignRate>conditions.policyRate,'sovereign borrowing should include a risk premium');
assert.equal(province.monetaryConditions.policyRate,capital.monetaryConditions.policyRate,'monetary conditions should propagate nationally');

const lowRisk={capitalIndex:10,debtIndex:2,solvency:.9};
const highRisk={capitalIndex:10,debtIndex:9,solvency:.35};
assert.ok(commercialRiskPremium(capital,highRisk)>commercialRiskPremium(capital,lowRisk),'riskier firms should pay a higher credit premium');

const convertible=setMonetaryRegime(polity,capital,MONETARY_REGIMES.CONVERTIBLE);
assert.equal(convertible.changed,true,'financially capable states should support convertible notes');
assert.equal(printMoney(polity,capital,100).created,0,'convertible money should not permit fiat money printing');
const fiat=setMonetaryRegime(polity,capital,MONETARY_REGIMES.FIAT);
assert.equal(fiat.changed,true,'high-capacity states should be able to adopt fiat currency');
const treasuryBefore=capital.treasury;
assert.equal(printMoney(polity,capital,100).created,100,'fiat regime should enable money creation');
assert.equal(capital.treasury,treasuryBefore+100,'new money should enter the state treasury');
const inflationBefore=m.inflation;
tickMonetaryModernisation(polity,capital,[capital,province],365);
assert.ok(m.inflation>inflationBefore,'money creation should push inflation upward');

console.log('monetary modernisation regression passed');