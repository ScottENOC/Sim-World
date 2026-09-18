from pathlib import Path

# Modern FX valuation: metal regimes stay specie-anchored; modern regimes respond to inflation, rates, credibility and reserve use.
p=Path('js/economy/forex.js'); t=p.read_text()
start=t.index('export function currencyCommodityValue(currency) {')
end=t.index('export function moneyChangerCapability(region) {')
new="""export function currencyCommodityValue(currency) {
  const c = activeCurrency(currency);
  if (!c) return 1;
  const fineness = clamp(c.fineness ?? 1, 0.15, 1);
  const trust = clamp(c.trust ?? 0);
  const regime = c.regime || 'silver_standard';
  const metallic = ['silver_standard', 'gold_standard', 'bimetallic_standard'].includes(regime);
  let ownValue;
  if (metallic) {
    ownValue = fineness * (0.72 + trust * 0.28);
  } else {
    const inflation = clamp(Math.abs(c.inflation || 0), 0, 0.6);
    const policyRate = clamp(c.policyRate || 0, 0, 0.5);
    const reserveUse = clamp(c.reserveCurrencyScore || 0);
    const reserveCoverage = clamp(c.reserveCoverage || 0, 0, 2) / 2;
    const convertibility = regime === 'convertible_notes' ? reserveCoverage * 0.16 : 0;
    ownValue = Math.max(0.05,
      (0.42 + trust * 0.34 + reserveUse * 0.18 + convertibility) *
      (1 - inflation * 0.72) *
      (1 + Math.min(0.12, policyRate * 0.32))
    );
  }
  if (c.peg?.anchorCurrencyId && Number.isFinite(c.peg.anchorCommodityValue) && Number.isFinite(c.peg.targetRate)) {
    const credibility = clamp(c.peg.credibility ?? 0);
    const peggedValue = Math.max(0.001, c.peg.anchorCommodityValue * c.peg.targetRate);
    return ownValue * (1 - credibility) + peggedValue * credibility;
  }
  return ownValue;
}

"""
t=t[:start]+new+t[end:]
p.write_text(t)

# Extend international money with constrained foreign-currency sovereign debt helpers.
p=Path('js/economy/internationalMoney.js'); t=p.read_text()
marker='export function tickInternationalMonetarySystem(polities,regions,agreements=[],elapsedDays=30,currentTick=0){'
if 'export function preferredForeignBorrowingCurrency' not in t:
    helpers="""
export function preferredForeignBorrowingCurrency(region){
  const ownId=region?.currencyUse?.id;
  let best=null,bestScore=-Infinity;
  for(const [id,holdingRaw] of Object.entries(region?.foreignCurrencyReserves||{})){
    if(id===ownId)continue;
    const holding=Math.max(0,Number(holdingRaw)||0);if(holding<=0.01)continue;
    const c=region?.currencyContacts?.[id];if(!c?.active)continue;
    const score=clamp(c.reserveCurrencyScore||0)*0.48+clamp(c.trust||0)*0.3+
      clamp(Math.log1p(region?.settlementCurrencyUse?.[id]||0)/8)*0.17-
      clamp(Math.abs(c.inflation||0),0,0.5)*0.35+Math.min(0.05,Math.log1p(holding)*0.01);
    if(score>bestScore){best={currency:c,holding,score};bestScore=score;}
  }
  return best;
}

export function foreignDebtLocalValue(region){
  const f=region?.militaryFinance;if(!f?.foreignDebtCurrencyId||!(f.foreignCurrencyDebtPrincipal>0))return 0;
  const foreign=region?.currencyContacts?.[f.foreignDebtCurrencyId];const own=region?.currencyUse;
  if(!foreign?.active||!own?.active)return Math.max(0,f.foreignDebtLastLocalValue||0);
  const fx=currencyCommodityValue(foreign)/Math.max(0.001,currencyCommodityValue(own));
  return Math.max(0,f.foreignCurrencyDebtPrincipal*fx);
}

export function revalueForeignCurrencyDebt(region){
  const f=region?.militaryFinance;if(!f)return {delta:0,localValue:0};
  const previous=Math.max(0,f.foreignDebtLastLocalValue||0);
  const localValue=foreignDebtLocalValue(region);
  const delta=localValue-previous;
  if(Math.abs(delta)>1e-9)f.publicDebt=Math.max(0,(f.publicDebt||0)+delta);
  f.foreignDebtLastLocalValue=localValue;
  return {delta,localValue};
}

export function borrowInForeignCurrency(region,localAmount,stateCredit=0){
  const f=region?.militaryFinance;if(!f||!(localAmount>0))return {localAmount:0,reason:'invalid'};
  const candidate=preferredForeignBorrowingCurrency(region);if(!candidate||candidate.score<0.45)return {localAmount:0,reason:'no_liquid_reserve_currency'};
  const conditions=region.monetaryConditions||{};
  const stress=clamp(Math.max(0,(conditions.inflation||0)-0.04)*3.5+Math.max(0,0.58-(conditions.currencyCredibility||0.5))*1.6);
  const share=clamp(stress*0.7,0,0.7);if(share<0.05)return {localAmount:0,reason:'domestic_currency_adequate'};
  const foreign=candidate.currency,own=region.currencyUse;
  const fx=currencyCommodityValue(foreign)/Math.max(0.001,currencyCommodityValue(own));
  const local=Math.max(0,localAmount*share);const principal=local/Math.max(0.001,fx);
  if(f.foreignDebtCurrencyId&&f.foreignDebtCurrencyId!==foreign.id)return {localAmount:0,reason:'existing_foreign_debt_currency'};
  f.foreignDebtCurrencyId=foreign.id;f.foreignCurrencyDebtPrincipal=Math.max(0,f.foreignCurrencyDebtPrincipal||0)+principal;
  f.foreignDebtLastLocalValue=Math.max(0,f.foreignDebtLastLocalValue||0)+local;
  f.foreignDebtInterestRate=clamp((foreign.policyRate||0.03)+0.012+(1-clamp(stateCredit))*0.065,0.01,0.45);
  return {localAmount:local,principal,currencyId:foreign.id,fx,interestRate:f.foreignDebtInterestRate};
}

"""
    t=t.replace(marker,helpers+marker)
p.write_text(t)

# State finance: revalue FX debt weekly, service it at its foreign rate, and use it selectively when domestic money is weak.
p=Path('js/economy/stateFinance.js'); t=p.read_text()
imp="import { borrowInForeignCurrency, revalueForeignCurrencyDebt } from './internationalMoney.js?v=20260918-intmoney2';\n"
if imp not in t:t=t.replace("import { currencyFiscalModifiers } from './currency.js?v=20260912-currency3';\n", "import { currencyFiscalModifiers } from './currency.js?v=20260912-currency3';\n"+imp)
old="""    const stateCredit = Math.max(0, Math.min(1, region.medievalCommerce?.finance?.stateCredit || 0));
    const annualRevenue = Math.max(0, finance.revenueEma) * 52;
    const debtBurden = finance.publicDebt / Math.max(1, annualRevenue);
    const annualInterestRate = Math.max(0.001, region.monetaryConditions?.sovereignRate ?? (0.025 + (1 - stateCredit) * 0.09 + Math.min(0.18, debtBurden * 0.025)));
    const interestDue = finance.publicDebt * annualInterestRate / 52 * weekScale;
"""
new="""    const stateCredit = Math.max(0, Math.min(1, region.medievalCommerce?.finance?.stateCredit || 0));
    const fxDebt = revalueForeignCurrencyDebt(region);
    const annualRevenue = Math.max(0, finance.revenueEma) * 52;
    const debtBurden = finance.publicDebt / Math.max(1, annualRevenue);
    const annualInterestRate = Math.max(0.001, region.monetaryConditions?.sovereignRate ?? (0.025 + (1 - stateCredit) * 0.09 + Math.min(0.18, debtBurden * 0.025)));
    const domesticDebt = Math.max(0, finance.publicDebt - fxDebt.localValue);
    const foreignRate = Math.max(0, finance.foreignDebtInterestRate || 0);
    const interestDue = (domesticDebt * annualInterestRate + fxDebt.localValue * foreignRate) / 52 * weekScale;
"""
if old in t:t=t.replace(old,new)
old2="""      finance.publicDebt += borrowing; finance.borrowedThisWeek = borrowing; region.treasury += borrowing;
"""
new2="""      const foreignBorrowing = borrowInForeignCurrency(region, borrowing, stateCredit);
      finance.publicDebt += borrowing; finance.borrowedThisWeek = borrowing; region.treasury += borrowing;
      finance.borrowedForeignThisWeek = foreignBorrowing.localAmount || 0;
"""
if old2 in t:t=t.replace(old2,new2)
if 'foreignCurrencyDebtPrincipal: 0' not in t:
    t=t.replace('stateCapacity: 1, publicDebt: 0, weeklyInterestDue: 0, weeklyInterestPaid: 0, borrowedThisWeek: 0, sovereignCreditLimit: 0,', 'stateCapacity: 1, publicDebt: 0, weeklyInterestDue: 0, weeklyInterestPaid: 0, borrowedThisWeek: 0, sovereignCreditLimit: 0,\n    foreignCurrencyDebtPrincipal: 0, foreignDebtLastLocalValue: 0, foreignDebtInterestRate: 0, borrowedForeignThisWeek: 0,')
if 'foreignDebtLocalValue: fxDebt.localValue' not in t:
    t=t.replace('interestDue: finance.weeklyInterestDue, interestPaid: finance.weeklyInterestPaid,', 'interestDue: finance.weeklyInterestDue, interestPaid: finance.weeklyInterestPaid,\n      foreignDebtCurrencyId: finance.foreignDebtCurrencyId || null, foreignDebtPrincipal: finance.foreignCurrencyDebtPrincipal || 0, foreignDebtLocalValue: fxDebt.localValue, borrowedForeignThisWeek: finance.borrowedForeignThisWeek || 0,')
p.write_text(t)

# Wire quarterly international monetary review into the live simulation and player events.
p=Path('js/main.js'); t=p.read_text()
imp="import { tickInternationalMonetarySystem } from './economy/internationalMoney.js?v=20260918-intmoney2';\n"
anchor="import { tickStateFinance } from './economy/stateFinance.js?v=20260912-currency2';\n"
if imp not in t:t=t.replace(anchor,anchor+imp)
call="    const internationalMonetaryEvents = profiler.measure('International money', () => tickInternationalMonetarySystem(polities, regions, agreements, time.elapsedDays, calendarWeek));\n"
anchor2="    const polityEvents = profiler.measure('Polities', () => tickPolities(polities, regions, calendarWeek, time.elapsedDays, { agreements }));\n"
if call not in t:t=t.replace(anchor2,anchor2+call)
if '...internationalMonetaryEvents.filter' not in t:
    t=t.replace("      ...polityEvents.filter((event) => event.regionId === playerRegionId),", "      ...polityEvents.filter((event) => event.regionId === playerRegionId),\n      ...internationalMonetaryEvents.filter((event) => event.polityId === activePlayerPolityId || event.anchorPolityId === activePlayerPolityId || event.members?.includes?.(activePlayerPolityId)),")
p.write_text(t)
print('international reserve currency integration applied')
