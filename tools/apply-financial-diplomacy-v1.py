from pathlib import Path

# Add bond-market pressure to sovereign pricing.
p=Path('js/economy/monetaryModernisation.js'); t=p.read_text()
old="return clamp(0.008 + (1 - credit) * 0.07 + Math.min(0.12, debtBurden * 0.018) + arrears * 0.08 + (1 - credibility) * 0.035, 0.005, 0.35);"
new="return clamp(0.008 + (1 - credit) * 0.07 + Math.min(0.12, debtBurden * 0.018) + arrears * 0.08 + (1 - credibility) * 0.035 + Math.max(0, capital?.militaryFinance?.bondYieldSpread || 0), 0.005, 0.5);"
t=t.replace(old,new)
p.write_text(t)

# Currency settlement policy: explicit diplomacy + relations-derived default.
p=Path('js/economy/internationalMoney.js'); t=p.read_text()
if 'export function setSettlementCurrencyPolicy' not in t:
    insert="""
export function setSettlementCurrencyPolicy(polity,currencyId,stance='neutral'){
  const allowed=new Set(['favour','neutral','avoid','boycott']);
  if(!allowed.has(stance))return {changed:false,reason:'unknown_stance'};
  const m=ensureInternationalMonetaryState(polity);m.settlementCurrencyPolicy ||= {};
  m.settlementCurrencyPolicy[currencyId]=stance;
  return {changed:true,stance};
}

function diplomaticCurrencyPreference(region,currency){
  const explicit=region?.currencyDiplomacyPreferences?.[currency?.id];
  if(Number.isFinite(explicit))return clamp(explicit,-1,1);
  return 0;
}

"""
    marker='function candidateCurrencies(regionA,regionB){'
    t=t.replace(marker,insert+marker)
old="""  const familiar=(knownCurrencyHere(regionA,currency.id)?0.04:0)+(knownCurrencyHere(regionB,currency.id)?0.04:0);
  return trust*0.34+(1-inflation*2)*0.18+reserveScore*0.34+(useA+useB)*0.05+familiar;
"""
new="""  const familiar=(knownCurrencyHere(regionA,currency.id)?0.04:0)+(knownCurrencyHere(regionB,currency.id)?0.04:0);
  const diplomacy=(diplomaticCurrencyPreference(regionA,currency)+diplomaticCurrencyPreference(regionB,currency))/2;
  return trust*0.30+(1-inflation*2)*0.16+reserveScore*0.30+(useA+useB)*0.05+familiar+diplomacy*0.28;
"""
t=t.replace(old,new)
needle="""  const events=[];
  for(const p of polities){
"""
if 'currencyDiplomacyPreferences' not in t[t.index('export function tickInternationalMonetarySystem'):]:
    repl="""  // Currency use is also a diplomatic choice. Explicit policy overrides a relations-derived default.
  for(const p of polities){
    const m=ensureInternationalMonetaryState(p),capital=capitalFor(p,byRegion);if(!capital)continue;
    const policy=m.settlementCurrencyPolicy||{};
    for(const r of territories(p,regions)){
      r.currencyDiplomacyPreferences ||= {};
      for(const [id,issuer] of byCurrency){
        if(id===p.currency?.id){r.currencyDiplomacyPreferences[id]=0.15;continue;}
        const issuerCapital=capitalFor(issuer,byRegion);if(!issuerCapital)continue;
        const stance=policy[id]||'neutral';
        const explicit=stance==='favour'?0.75:stance==='avoid'?-0.55:stance==='boycott'?-1:null;
        const relational=clamp(attitudeToward(capital,issuerCapital.id),-1,1)*0.5;
        r.currencyDiplomacyPreferences[id]=explicit==null?relational:explicit;
      }
    }
  }

  const events=[];
  for(const p of polities){
"""
    t=t.replace(needle,repl)
p.write_text(t)

# Wire bond markets and player relevance into main; expose financial diplomacy API.
p=Path('js/main.js'); t=p.read_text()
imp="import { tickSovereignBondMarkets, setBondPolicy, dumpSovereignBonds } from './economy/sovereignBonds.js?v=20260918-bonds1';\n"
anchor="import { tickInternationalMonetarySystem } from './economy/internationalMoney.js?v=20260918-intmoney2';\n"
if imp not in t:t=t.replace(anchor,anchor+imp)
# extend import to include policy setter
oldimp="import { tickInternationalMonetarySystem } from './economy/internationalMoney.js?v=20260918-intmoney2';"
newimp="import { tickInternationalMonetarySystem, setSettlementCurrencyPolicy } from './economy/internationalMoney.js?v=20260918-intmoney2';"
t=t.replace(oldimp,newimp)
call="    const sovereignBondEvents = profiler.measure('Sovereign bond markets', () => tickSovereignBondMarkets(polities, regions, calendarWeek));\n"
anchor2="    const internationalMonetaryEvents = profiler.measure('International money', () => tickInternationalMonetarySystem(polities, regions, agreements, time.elapsedDays, calendarWeek));\n"
if call not in t:t=t.replace(anchor2,anchor2+call)
if '...sovereignBondEvents.filter' not in t:
    target="      ...internationalMonetaryEvents.filter((event) => event.polityId === activePlayerPolityId || event.anchorPolityId === activePlayerPolityId || event.members?.includes?.(activePlayerPolityId)),"
    repl=target+"\n      ...sovereignBondEvents.filter((event) => event.polityId === activePlayerPolityId || event.issuerPolityId === activePlayerPolityId || event.holderPolityId === activePlayerPolityId),"
    t=t.replace(target,repl)
if 'financialDiplomacyApi:' not in t:
    marker="    aviationApi: { buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary },"
    repl=marker+"\n    financialDiplomacyApi: { setBondPolicy, dumpSovereignBonds, setSettlementCurrencyPolicy },"
    t=t.replace(marker,repl)
p.write_text(t)

print('financial diplomacy integration applied')
