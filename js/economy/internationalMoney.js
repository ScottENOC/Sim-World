import { attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { chooseCurrencyForTerritories } from './currency.js?v=20260912-currency3';
import { currencyCommodityValue, medievalFxQuote } from './forex.js?v=20260912-forex1';
import { ensureMonetaryInstitution, monetaryReadiness, MONETARY_REGIMES } from './monetaryModernisation.js?v=20260918-money1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const REVIEW_WEEKS=13;
const UNION_TYPES=new Set(['military_support','joint_operation','war_commitment','defence_pact']);

function stableFraction(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0)/4294967295;}
function capitalFor(polity,regionsById){return regionsById.get(polity?.capitalRegionId)||null;}
function territories(polity,regions){return regions.filter(r=>r.governance?.sovereignPolityId===polity.id);}
function isPlayerPolity(polity){return globalThis.__worldsim?.activePlayerPolityId===polity?.id;}
function knownCurrencyHere(region,currencyId){return region?.currencyUse?.id===currencyId||Boolean(region?.currencyContacts?.[currencyId]);}
function tradeConnected(a,b){return Boolean(a?.recentTradePartners?.has?.(b?.id)||b?.recentTradePartners?.has?.(a?.id)||a?.currencyContacts?.[b?.currencyUse?.id]||b?.currencyContacts?.[a?.currencyUse?.id]);}

export function ensureInternationalMonetaryState(polity){
  const m=ensureMonetaryInstitution(polity);
  if(!m.foreignReserves||typeof m.foreignReserves!=='object'||Array.isArray(m.foreignReserves))m.foreignReserves={};
  if(!m.peg||typeof m.peg!=='object')m.peg=null;
  if(!m.currencyUnion||typeof m.currencyUnion!=='object')m.currencyUnion=null;
  if(!Number.isFinite(m.reserveCurrencyScore))m.reserveCurrencyScore=0;
  if(!Number.isFinite(m.lastInternationalReviewTick))m.lastInternationalReviewTick=-Infinity;
  return m;
}

export function reserveCurrencyStrength(polity,capital,foreignHoldings=0){
  const m=ensureInternationalMonetaryState(polity);
  const currency=polity?.currency||{};
  const financialDepth=clamp(capital?.corporateCapital?.financialDepth||0);
  const tradeScale=clamp(Math.log1p(Math.max(0,capital?.tradeEconomy?.weeklyExports||0))/8);
  const network=clamp(Math.log1p(Math.max(0,foreignHoldings))/10);
  const priceStability=clamp(1-Math.abs(m.inflation||0)*3);
  const convertibility=(m.regime===MONETARY_REGIMES.GOLD||m.regime===MONETARY_REGIMES.SILVER||m.regime===MONETARY_REGIMES.BIMETALLIC||m.regime===MONETARY_REGIMES.CONVERTIBLE)?1:0.7;
  return clamp((currency.trust||0)*0.24+priceStability*0.2+financialDepth*0.2+tradeScale*0.16+network*0.14+convertibility*0.06);
}

function candidateCurrencies(regionA,regionB){
  const map=new Map();
  const add=c=>{if(c?.active&&c.id)map.set(c.id,c);};
  add(regionA?.currencyUse);add(regionB?.currencyUse);
  for(const c of Object.values(regionA?.currencyContacts||{}))if(knownCurrencyHere(regionB,c?.id))add(c);
  for(const c of Object.values(regionB?.currencyContacts||{}))if(knownCurrencyHere(regionA,c?.id))add(c);
  return [...map.values()];
}

function currencySettlementScore(currency,regionA,regionB){
  const trust=clamp(currency?.trust||0);
  const inflation=clamp(Math.abs(currency?.inflation||0),0,0.5);
  const reserveScore=clamp(currency?.reserveCurrencyScore||0);
  const useA=clamp(Math.log1p(regionA?.settlementCurrencyUse?.[currency.id]||0)/8);
  const useB=clamp(Math.log1p(regionB?.settlementCurrencyUse?.[currency.id]||0)/8);
  const familiar=(knownCurrencyHere(regionA,currency.id)?0.04:0)+(knownCurrencyHere(regionB,currency.id)?0.04:0);
  return trust*0.34+(1-inflation*2)*0.18+reserveScore*0.34+(useA+useB)*0.05+familiar;
}

export function settlementCurrencyBetween(regionA,regionB){
  const candidates=candidateCurrencies(regionA,regionB);
  if(!candidates.length)return null;
  candidates.sort((a,b)=>currencySettlementScore(b,regionA,regionB)-currencySettlementScore(a,regionA,regionB));
  return candidates[0]||null;
}

function bestQuoteSpread(regionA,regionB,from,to){
  if(!from?.active||!to?.active||from.id===to.id)return 0;
  const qa=medievalFxQuote(regionA,from,to),qb=medievalFxQuote(regionB,from,to);
  return Math.min(qa.available?qa.spread:0.2,qb.available?qb.spread:0.2);
}

export function internationalSettlementPlan(regionA,regionB){
  const a=regionA?.currencyUse,b=regionB?.currencyUse;
  if(!a?.active||!b?.active)return {currency:null,friction:1,reason:'barter_or_single_currency'};
  if(a.id===b.id)return {currency:a,friction:Math.max(0.86,0.86+(1-clamp(a.trust))*0.34),reason:'shared_currency'};
  const settlement=settlementCurrencyBetween(regionA,regionB)||a;
  const spreadA=bestQuoteSpread(regionA,regionB,a,settlement);
  const spreadB=bestQuoteSpread(regionA,regionB,b,settlement);
  const liquidity=clamp(settlement.reserveCurrencyScore||0);
  const acceptance=Math.max(0.94,1.02-Math.max(clamp(a.trust),clamp(b.trust))*0.08);
  const conversionCost=(spreadA+spreadB)*(0.75-liquidity*0.3);
  return {currency:settlement,friction:clamp(acceptance+conversionCost,0.9,1.35),reason:settlement.id===a.id||settlement.id===b.id?'endpoint_currency':'third_currency',spreadA,spreadB};
}

export function recordInternationalSettlement(regionA,regionB,value){
  const plan=internationalSettlementPlan(regionA,regionB);
  if(!plan.currency?.id||value<=0)return plan;
  const id=plan.currency.id;
  regionA.settlementCurrencyUse ||= {};regionB.settlementCurrencyUse ||= {};
  regionA.settlementCurrencyUse[id]=(regionA.settlementCurrencyUse[id]||0)+value;
  regionB.settlementCurrencyUse[id]=(regionB.settlementCurrencyUse[id]||0)+value;
  const reserveIncrement=value*(0.01+clamp(plan.currency.reserveCurrencyScore||0)*0.025);
  for(const region of [regionA,regionB]){
    if(region.currencyUse?.id===id)continue;
    region.foreignCurrencyReserves ||= {};
    region.foreignCurrencyReserves[id]=(region.foreignCurrencyReserves[id]||0)+reserveIncrement;
  }
  return plan;
}

export function adoptCurrencyPeg(polity,anchorPolity,regions,{band=0.02,currentTick=0}={}){
  const m=ensureInternationalMonetaryState(polity),anchorM=ensureInternationalMonetaryState(anchorPolity);
  const own=polity?.currency,anchor=anchorPolity?.currency;
  if(!own?.active||!anchor?.active||own.id===anchor.id)return {changed:false,reason:'invalid_anchor'};
  if(m.currencyUnion)return {changed:false,reason:'currency_union_member'};
  const regionsById=new Map(regions.map(r=>[r.id,r]));
  const capital=capitalFor(polity,regionsById);
  if(monetaryReadiness(polity,capital)<0.45)return {changed:false,reason:'insufficient_financial_capacity'};
  if((anchor.trust||0)<0.62||Math.abs(anchorM.inflation||0)>0.08)return {changed:false,reason:'anchor_not_stable'};
  const targetRate=currencyCommodityValue(own)/Math.max(0.0001,currencyCommodityValue(anchor));
  const holdings=territories(polity,regions).reduce((s,r)=>s+Math.max(0,r.foreignCurrencyReserves?.[anchor.id]||0),0);
  const reserveRatio=holdings/Math.max(1,m.noteIssue||own.monetaryBase||1);
  m.peg={anchorCurrencyId:anchor.id,anchorPolityId:anchorPolity.id,targetRate,band:clamp(band,0.002,0.15),credibility:clamp(0.35+reserveRatio*1.5),adoptedTick:currentTick};
  own.peg={...m.peg,anchorCommodityValue:currencyCommodityValue(anchor)};
  return {changed:true,peg:m.peg};
}

export function breakCurrencyPeg(polity){
  const m=ensureInternationalMonetaryState(polity);
  if(!m.peg)return {changed:false,reason:'no_peg'};
  m.peg=null;if(polity.currency)polity.currency.peg=null;
  return {changed:true};
}

function allianceAgreement(agreements,aCapital,bCapital){
  return agreements.find(x=>x?.active&&UNION_TYPES.has(x.type)&&((x.fromId===aCapital.id&&x.toId===bCapital.id)||(x.fromId===bCapital.id&&x.toId===aCapital.id)))||null;
}

export function commonCurrencyEligibility(polityA,polityB,regions,agreements=[]){
  const byId=new Map(regions.map(r=>[r.id,r]));
  const a=capitalFor(polityA,byId),b=capitalFor(polityB,byId);
  if(!a||!b||!polityA?.currency?.active||!polityB?.currency?.active)return {eligible:false,reason:'missing_currency_or_capital'};
  const readiness=Math.min(monetaryReadiness(polityA,a),monetaryReadiness(polityB,b));
  if(readiness<0.72)return {eligible:false,reason:'insufficient_financial_integration',readiness};
  const mutual=Math.min(attitudeToward(a,b.id),attitudeToward(b,a.id));
  const agreement=allianceAgreement(agreements,a,b);
  if(!agreement&&mutual<0.82)return {eligible:false,reason:'insufficient_alliance_depth',mutual};
  if(!tradeConnected(a,b))return {eligible:false,reason:'insufficient_economic_integration'};
  const inflationGap=Math.abs((ensureMonetaryInstitution(polityA).inflation||0)-(ensureMonetaryInstitution(polityB).inflation||0));
  if(inflationGap>0.07)return {eligible:false,reason:'inflation_divergence',inflationGap};
  return {eligible:true,readiness,mutual,agreementType:agreement?.type||'deep_alignment'};
}

export function formCurrencyUnion(memberPolityIds,polities,regions,agreements=[],currentTick=0,{name=null}={}){
  const members=memberPolityIds.map(id=>polities.find(p=>p.id===id)).filter(Boolean);
  if(members.length<2)return {changed:false,reason:'too_few_members'};
  for(let i=1;i<members.length;i++){
    const check=commonCurrencyEligibility(members[0],members[i],regions,agreements);
    if(!check.eligible)return {changed:false,reason:check.reason,memberId:members[i].id,check};
  }
  const ids=members.map(p=>p.id).sort();
  const unionId=`currency_union_${ids.join('_')}`;
  const unionName=name||`${members.map(p=>p.name.replace(/^Kingdom of /,'')).join('–')} common currency`;
  const avgTrust=members.reduce((s,p)=>s+clamp(p.currency?.trust||0.5),0)/members.length;
  const avgRate=members.reduce((s,p)=>s+ensureMonetaryInstitution(p).policyRate,0)/members.length;
  const avgIndependence=members.reduce((s,p)=>s+ensureMonetaryInstitution(p).centralBankIndependence,0)/members.length;
  for(const p of members){
    const m=ensureInternationalMonetaryState(p);
    m.currencyUnion={id:unionId,name:unionName,members:ids,formedTick:currentTick};
    m.peg=null;m.regime=MONETARY_REGIMES.FIAT;m.policyRate=avgRate;m.centralBankIndependence=Math.max(0.55,avgIndependence);
    p.currency.id=unionId;p.currency.name=unionName;p.currency.issuerPolityId=`union:${unionId}`;p.currency.fineness=1;p.currency.trust=avgTrust;p.currency.regime=MONETARY_REGIMES.FIAT;p.currency.peg=null;
    chooseCurrencyForTerritories(p,regions,currentTick);
  }
  return {changed:true,unionId,name:unionName,members:ids};
}

function syncCurrencyUnions(polities,regions){
  const groups=new Map();
  for(const p of polities){const u=ensureInternationalMonetaryState(p).currencyUnion;if(u?.id){if(!groups.has(u.id))groups.set(u.id,[]);groups.get(u.id).push(p);}}
  for(const [id,members] of groups){
    if(members.length<2)continue;
    const avgInflation=members.reduce((s,p)=>s+ensureMonetaryInstitution(p).inflation,0)/members.length;
    const avgDebtStress=members.reduce((s,p)=>{const c=regions.find(r=>r.id===p.capitalRegionId);return s+clamp((c?.militaryFinance?.publicDebt||0)/Math.max(1,(c?.militaryFinance?.revenueEma||0)*52*4));},0)/members.length;
    const rate=clamp(0.02+avgInflation*0.75+avgDebtStress*0.02,0.005,0.25);
    const trust=members.reduce((s,p)=>s+ensureMonetaryInstitution(p).currencyCredibility,0)/members.length;
    for(const p of members){const m=ensureMonetaryInstitution(p);m.policyRate=rate;p.currency.policyRate=rate;p.currency.inflation=avgInflation;p.currency.trust=clamp(trust);p.currency.reserveCurrencyScore=Math.max(p.currency.reserveCurrencyScore||0,0.5);}
  }
}


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

export function tickInternationalMonetarySystem(polities,regions,agreements=[],elapsedDays=30,currentTick=0){
  if(!polities?.length)return [];
  const due=polities.some(p=>currentTick-(ensureInternationalMonetaryState(p).lastInternationalReviewTick||-Infinity)>=REVIEW_WEEKS);
  if(!due)return [];
  const byRegion=new Map(regions.map(r=>[r.id,r]));
  const holdings=new Map();
  for(const r of regions)for(const [id,v] of Object.entries(r.foreignCurrencyReserves||{}))holdings.set(id,(holdings.get(id)||0)+Math.max(0,Number(v)||0));
  const byCurrency=new Map();
  for(const p of polities){
    const m=ensureInternationalMonetaryState(p),capital=capitalFor(p,byRegion);
    m.foreignReserves={};for(const r of territories(p,regions))for(const [id,v] of Object.entries(r.foreignCurrencyReserves||{}))m.foreignReserves[id]=(m.foreignReserves[id]||0)+Math.max(0,Number(v)||0);
    m.reserveCurrencyScore=reserveCurrencyStrength(p,capital,holdings.get(p.currency?.id)||0);
    if(p.currency?.active){p.currency.reserveCurrencyScore=m.reserveCurrencyScore;byCurrency.set(p.currency.id,p);}
    m.lastInternationalReviewTick=currentTick;
  }

  const events=[];
  for(const p of polities){
    const m=ensureInternationalMonetaryState(p),capital=capitalFor(p,byRegion);
    if(m.currencyUnion)continue;
    if(m.peg){
      const anchor=byCurrency.get(m.peg.anchorCurrencyId),anchorM=anchor&&ensureInternationalMonetaryState(anchor);
      if(!anchor){events.push({type:'currency_peg_broken',polityId:p.id,reason:'anchor_missing'});breakCurrencyPeg(p);continue;}
      const reserves=Math.max(0,m.foreignReserves[m.peg.anchorCurrencyId]||0),reserveRatio=reserves/Math.max(1,m.noteIssue||p.currency?.monetaryBase||1);
      const inflationGap=Math.max(0,(m.inflation||0)-(anchorM.inflation||0));
      const defence=Math.min(reserves,inflationGap*Math.max(1,m.noteIssue||1)*0.02*Math.max(0.1,elapsedDays/30));
      if(defence>0){m.foreignReserves[m.peg.anchorCurrencyId]=reserves-defence;let remaining=defence;for(const r of territories(p,regions)){const x=Math.min(remaining,r.foreignCurrencyReserves?.[m.peg.anchorCurrencyId]||0);if(x>0){r.foreignCurrencyReserves[m.peg.anchorCurrencyId]-=x;remaining-=x;}if(remaining<=0)break;}}
      m.peg.credibility=clamp(m.peg.credibility+(reserveRatio-0.08)*0.08-inflationGap*0.25);
      m.policyRate+=((anchorM.policyRate+Math.min(0.08,inflationGap*0.5))-m.policyRate)*0.35;
      m.inflation+=(anchorM.inflation-m.inflation)*0.08*m.peg.credibility;
      p.currency.peg={...m.peg,anchorCommodityValue:currencyCommodityValue(anchor.currency)};
      if(m.peg.credibility<0.12){events.push({type:'currency_peg_broken',polityId:p.id,reason:'reserves_exhausted'});breakCurrencyPeg(p);}
      continue;
    }
    if((m.inflation||0)>=0.12&&monetaryReadiness(p,capital)>=0.5){
      const known=new Set();for(const r of territories(p,regions))for(const id of Object.keys(r.currencyContacts||{}))known.add(id);
      const anchors=[...byCurrency.values()].filter(x=>x.id!==p.id&&known.has(x.currency?.id)&&ensureInternationalMonetaryState(x).reserveCurrencyScore>=0.55&&Math.abs(ensureInternationalMonetaryState(x).inflation||0)<=0.05).sort((a,b)=>ensureInternationalMonetaryState(b).reserveCurrencyScore-ensureInternationalMonetaryState(a).reserveCurrencyScore);
      if(anchors[0]){const adopted=adoptCurrencyPeg(p,anchors[0],regions,{currentTick});if(adopted.changed)events.push({type:'currency_peg_adopted',polityId:p.id,anchorPolityId:anchors[0].id,anchorCurrencyId:anchors[0].currency.id});}
    }
  }

  // Currency unions are considered only across existing close-security agreements: O(agreements), not O(polities²).
  const polityByCapital=new Map(polities.map(p=>[p.capitalRegionId,p]));
  const year=Math.floor(currentTick/52);
  for(const agreement of agreements||[]){
    if(!agreement?.active||!UNION_TYPES.has(agreement.type))continue;
    const a=polityByCapital.get(agreement.fromId),b=polityByCapital.get(agreement.toId);
    if(!a||!b||a.id===b.id||isPlayerPolity(a)||isPlayerPolity(b)||ensureInternationalMonetaryState(a).currencyUnion||ensureInternationalMonetaryState(b).currencyUnion)continue;
    const check=commonCurrencyEligibility(a,b,regions,agreements);
    if(check.eligible&&stableFraction(`${a.id}:${b.id}:currency-union:${year}`)<0.08){const formed=formCurrencyUnion([a.id,b.id],polities,regions,agreements,currentTick);if(formed.changed)events.push({type:'currency_union_formed',unionId:formed.unionId,members:formed.members,name:formed.name});}
  }
  syncCurrencyUnions(polities,regions);

  // Refresh current domestic snapshots with modern international fields.
  for(const p of polities)for(const r of territories(p,regions))if(r.currencyUse?.id===p.currency?.id){r.currencyUse={...r.currencyUse,reserveCurrencyScore:p.currency.reserveCurrencyScore||0,peg:p.currency.peg||null,regime:p.currency.regime,inflation:p.currency.inflation,policyRate:p.currency.policyRate};}
  return events;
}
