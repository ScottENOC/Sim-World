import { attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { tickBankingPanics } from './bankingPanic.js?v=20260918-bankpanic1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const YEAR_WEEKS=52;

function capitalFor(polity,byId){return byId.get(polity?.capitalRegionId)||null;}
export function ensureSovereignBondMarket(polity){
  polity.sovereignBondMarket ||= {};
  const m=polity.sovereignBondMarket;
  if(!Number.isFinite(m.outstandingFace))m.outstandingFace=0;
  if(!Number.isFinite(m.lastBondedDebt))m.lastBondedDebt=0;
  if(!Number.isFinite(m.price))m.price=1;
  if(!Number.isFinite(m.yieldSpread))m.yieldSpread=0;
  if(!Number.isFinite(m.netForeignFlow))m.netForeignFlow=0;
  if(!Number.isFinite(m.lastAnnualReportTick))m.lastAnnualReportTick=-Infinity;
  if(!Number.isFinite(m.lastEmergencyTick))m.lastEmergencyTick=-Infinity;
  return m;
}
export function ensureBondHoldings(region){
  region.sovereignBondHoldings ||= {};
  return region.sovereignBondHoldings;
}
export function setBondPolicy(region,issuerPolityId,stance='neutral'){
  const allowed=new Set(['accumulate','neutral','avoid','dump']);
  if(!allowed.has(stance))return {changed:false,reason:'unknown_stance'};
  region.sovereignBondPolicy ||= {};
  region.sovereignBondPolicy[issuerPolityId]=stance;
  return {changed:true,stance};
}
function foreignHolderScore(holder,issuerCapital){
  const attitude=attitudeToward(holder,issuerCapital.id);
  const trade=holder.recentTradePartners?.has?.(issuerCapital.id)?0.18:0;
  const finance=clamp(holder.corporateCapital?.financialDepth||0)*0.24;
  const wealth=clamp(Math.log1p(Math.max(0,holder.wallet||0)+Math.max(0,holder.treasury||0))/12)*0.18;
  return clamp(0.34+attitude*0.28+trade+finance+wealth,0,1.4);
}
function allocateNewIssue(polity,capital,regions,politiesByCapital,amount){
  if(!(amount>0))return;
  const market=ensureSovereignBondMarket(polity);
  market.outstandingFace+=amount;market.lastBondedDebt+=amount;
  const domestic=ensureBondHoldings(capital);
  const foreignCandidates=[];
  for(const r of regions){
    if(r.id===capital.id)continue;
    const holderPolity=politiesByCapital.get(r.id);
    if(!holderPolity)continue;
    const score=foreignHolderScore(r,capital);
    if(score>=0.58)foreignCandidates.push({r,score});
  }
  foreignCandidates.sort((a,b)=>b.score-a.score);
  let foreignPool=amount*Math.min(0.45,foreignCandidates.reduce((s,x)=>s+Math.max(0,x.score-0.55),0)*0.08);
  for(const {r,score} of foreignCandidates.slice(0,5)){
    if(foreignPool<=0)break;
    const share=Math.min(foreignPool,amount*0.12*clamp(score));
    const h=ensureBondHoldings(r);h[polity.id]=(h[polity.id]||0)+share;foreignPool-=share;
  }
  const allocatedForeign=amount*Math.min(0.45,foreignCandidates.reduce((s,x)=>s+Math.max(0,x.score-0.55),0)*0.08)-foreignPool;
  domestic[polity.id]=(domestic[polity.id]||0)+Math.max(0,amount-allocatedForeign);
}
export function dumpSovereignBonds(holder,issuerPolity,issuerCapital,fraction=1,currentTick=0,{reason='policy'}={}){
  const holdings=ensureBondHoldings(holder);const face=Math.max(0,holdings[issuerPolity.id]||0);
  if(face<=0)return {soldFace:0,reason:'no_holdings'};
  const market=ensureSovereignBondMarket(issuerPolity);
  const desired=face*clamp(fraction);
  const domesticAbsorption=Math.max(0,issuerCapital.wallet||0)*0.22;
  const soldFace=Math.min(desired,domesticAbsorption/Math.max(0.05,market.price));
  if(soldFace<=0)return {soldFace:0,reason:'no_market_liquidity'};
  const proceeds=soldFace*market.price;
  holdings[issuerPolity.id]=Math.max(0,face-soldFace);
  issuerCapital.wallet=Math.max(0,(issuerCapital.wallet||0)-proceeds);
  holder.wallet=(holder.wallet||0)+proceeds;
  ensureBondHoldings(issuerCapital)[issuerPolity.id]=(ensureBondHoldings(issuerCapital)[issuerPolity.id]||0)+soldFace;
  const scale=soldFace/Math.max(1,market.outstandingFace);
  market.netForeignFlow-=soldFace;
  market.price=clamp(market.price-scale*1.8,0.35,1.05);
  market.yieldSpread=clamp(market.yieldSpread+scale*0.42,0,0.35);
  market.lastDump={holderRegionId:holder.id,soldFace,shareOutstanding:scale,currentTick,reason};
  return {soldFace,proceeds,shareOutstanding:scale,price:market.price,yieldSpread:market.yieldSpread};
}
export function bondMarketSpread(polity){return ensureSovereignBondMarket(polity).yieldSpread;}

export function tickSovereignBondMarkets(polities,regions,currentTick=0){
  const byId=new Map(regions.map(r=>[r.id,r]));
  const byCapital=new Map(polities.map(p=>[p.capitalRegionId,p]));
  const events=[];
  for(const issuer of polities){
    const capital=capitalFor(issuer,byId);if(!capital)continue;
    const market=ensureSovereignBondMarket(issuer);
    const publicDebt=Math.max(0,capital.militaryFinance?.publicDebt||0);
    const newDebt=Math.max(0,publicDebt-market.lastBondedDebt);
    if(newDebt>0.01)allocateNewIssue(issuer,capital,regions,byCapital,newDebt);
    market.price+=(1-market.price)*0.12;
    market.yieldSpread*=0.88;
    market.netForeignFlow*=0.8;
    capital.militaryFinance ||= {};
    capital.militaryFinance.bondYieldSpread=market.yieldSpread;
  }
  for(const holder of regions){
    const holderPolity=byCapital.get(holder.id);if(!holderPolity)continue;
    for(const [issuerId,faceRaw] of Object.entries(ensureBondHoldings(holder))){
      const face=Math.max(0,Number(faceRaw)||0);if(face<=0)continue;
      const issuer=polities.find(p=>p.id===issuerId);const issuerCapital=issuer&&capitalFor(issuer,byId);
      if(!issuer||!issuerCapital||issuer.id===holderPolity.id)continue;
      const explicit=holder.sovereignBondPolicy?.[issuerId]||'neutral';
      const attitude=attitudeToward(holder,issuerCapital.id);
      let fraction=0,reason=null;
      if(explicit==='dump'){fraction=0.6;reason='deliberate_dump';}
      else if(explicit==='avoid'){fraction=0.14;reason='policy_avoidance';}
      else if(attitude<=-0.7){fraction=0.28;reason='hostile_relations';}
      else if(attitude<=-0.45){fraction=0.1;reason='diplomatic_displeasure';}
      if(fraction<=0)continue;
      const sold=dumpSovereignBonds(holder,issuer,issuerCapital,fraction,currentTick,{reason});
      if(sold.soldFace<=0)continue;
      const abnormal=sold.shareOutstanding>=0.02 || sold.soldFace>=Math.max(25,face*0.25);
      if(abnormal){
        events.push({type:'sovereign_bond_dump',issuerPolityId:issuer.id,holderPolityId:holderPolity.id,holderRegionId:holder.id,issuerRegionId:issuerCapital.id,soldFace:sold.soldFace,shareOutstanding:sold.shareOutstanding,bondPrice:sold.price,yieldSpread:sold.yieldSpread,reason,emergency:true,title:'Emergency finance session: foreign bond sell-off',message:`${holder.name||holder.id} sold a large block of our sovereign bonds. Bond prices fell and refinancing costs rose.`});
        ensureSovereignBondMarket(issuer).lastEmergencyTick=currentTick;
      }
    }
  }
  events.push(...tickBankingPanics(polities,regions,currentTick));
  if(currentTick%YEAR_WEEKS===0){
    for(const p of polities){
      const capital=capitalFor(p,byId);if(!capital)continue;
      const market=ensureSovereignBondMarket(p);
      if(currentTick-market.lastAnnualReportTick<YEAR_WEEKS)continue;
      market.lastAnnualReportTick=currentTick;
      let foreignHeld=0;
      for(const r of regions)if(r.id!==capital.id)foreignHeld+=Math.max(0,r.sovereignBondHoldings?.[p.id]||0);
      events.push({type:'annual_bond_market_report',polityId:p.id,issuerPolityId:p.id,issuerRegionId:capital.id,outstandingFace:market.outstandingFace,foreignHeld,bondPrice:market.price,yieldSpread:market.yieldSpread,netForeignFlow:market.netForeignFlow,annual:true,title:'Annual sovereign bond market report',message:`Outstanding bonds ${market.outstandingFace.toFixed(0)}; foreign holdings ${foreignHeld.toFixed(0)}; market price ${market.price.toFixed(2)}; spread ${(market.yieldSpread*100).toFixed(1)}%.`});
    }
  }
  return events;
}
