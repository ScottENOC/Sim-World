import assert from 'node:assert/strict';
import {
  adoptCurrencyPeg,
  commonCurrencyEligibility,
  formCurrencyUnion,
  internationalSettlementPlan,
  recordInternationalSettlement,
  tickInternationalMonetarySystem,
} from '../js/economy/internationalMoney.js?v=test';
import { ensureMonetaryInstitution } from '../js/economy/monetaryModernisation.js?v=test';

function region(id, polityId, currency) {
  return {
    id, name:id, population:100000,
    governance:{sovereignPolityId:polityId},
    currencyUse:{...currency,active:true}, currencyContacts:{},
    relations:new Map(), recentTradePartners:new Map(),
    tradeEconomy:{weeklyExports:500}, corporateCapital:{financialDepth:0.85},
    medievalCommerce:{finance:{depositBanking:0.85,billsOfExchange:0.8,stateCredit:0.8}},
    foreignCurrencyReserves:{}, settlementCurrencyUse:{},
    militaryFinance:{publicDebt:100,revenueEma:20,arrearsWeeks:0},
  };
}
function polity(id, capitalId, currencyId, name=id) {
  const p={id,name,capitalRegionId:capitalId,kingdomSinceTick:0,administration:{accounting:0.9,recordKeeping:0.9,legitimacy:0.8},currency:{active:true,id:currencyId,name:`${name} currency`,issuerPolityId:id,trust:0.86,fineness:1,monetaryBase:1000,policyRate:0.04,inflation:0.02,reserveCurrencyScore:0}};
  const m=ensureMonetaryInstitution(p);m.regime='fiat_currency';m.policyRate=0.04;m.inflation=0.02;m.currencyCredibility=0.85;m.centralBankIndependence=0.75;m.noteIssue=1000;
  return p;
}

const aP=polity('pa','a','ca','Alpha');
const bP=polity('pb','b','cb','Beta');
const zP=polity('pz','z','cz','Zeta');
const a=region('a','pa',aP.currency),b=region('b','pb',bP.currency),z=region('z','pz',zP.currency);
const regions=[a,b,z],polities=[aP,bP,zP];

// A liquid, trusted third currency can become the settlement currency for A-B trade.
zP.currency.reserveCurrencyScore=0.95;zP.currency.inflation=0.01;zP.currency.trust=0.96;
const zSnapshot={...zP.currency,active:true};
a.currencyContacts.cz=zSnapshot;b.currencyContacts.cz=zSnapshot;
a.currencyUse.trust=0.55;b.currencyUse.trust=0.52;
let plan=internationalSettlementPlan(a,b);
assert.equal(plan.reason,'third_currency');
assert.equal(plan.currency.id,'cz');
recordInternationalSettlement(a,b,1000);
assert.ok((a.foreignCurrencyReserves.cz||0)>0);
assert.ok((b.foreignCurrencyReserves.cz||0)>0);

// A high-inflation currency can peg to a stable, credible reserve currency.
const am=ensureMonetaryInstitution(aP),bm=ensureMonetaryInstitution(bP),zm=ensureMonetaryInstitution(zP);
am.inflation=0.18;zm.inflation=0.015;zP.currency.trust=0.95;
a.foreignCurrencyReserves.cz=250;
const peg=adoptCurrencyPeg(aP,zP,regions,{currentTick:100});
assert.equal(peg.changed,true);
assert.equal(am.peg.anchorCurrencyId,'cz');
assert.ok(am.peg.credibility>0.35);

// Deeply aligned, financially mature trading allies can create a shared currency,
// but only after their macro conditions have converged enough to make that credible.
am.inflation=0.03;bm.inflation=0.04;
a.relations.set('b',{attitude:0.9});b.relations.set('a',{attitude:0.91});
a.recentTradePartners.set('b',100);b.recentTradePartners.set('a',100);
const agreement={active:true,type:'military_support',fromId:'a',toId:'b'};
const check=commonCurrencyEligibility(aP,bP,regions,[agreement]);
assert.equal(check.eligible,true);
const union=formCurrencyUnion(['pa','pb'],polities,regions,[agreement],120,{name:'Test Union'});
assert.equal(union.changed,true);
assert.equal(aP.currency.id,bP.currency.id);
assert.equal(aP.currency.name,'Test Union');
assert.equal(ensureMonetaryInstitution(aP).regime,'fiat_currency');
assert.equal(ensureMonetaryInstitution(bP).regime,'fiat_currency');

// Union members share one policy rate after the international review.
ensureMonetaryInstitution(aP).inflation=0.03;ensureMonetaryInstitution(bP).inflation=0.05;
ensureMonetaryInstitution(aP).policyRate=0.01;ensureMonetaryInstitution(bP).policyRate=0.12;
tickInternationalMonetarySystem(polities,regions,[agreement],30,140);
assert.equal(ensureMonetaryInstitution(aP).policyRate,ensureMonetaryInstitution(bP).policyRate);

// Reserve-currency strength is scalar and network-driven rather than an all-pairs FX matrix.
assert.ok(ensureMonetaryInstitution(zP).reserveCurrencyScore>=0);

console.log('international monetary system regressions passed');
