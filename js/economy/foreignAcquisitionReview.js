import { investmentAccess } from './economicOwnership.js';
import { ensureInvestmentPolicy, foreignMarketAccess, investmentRisk } from './infrastructureInvestment.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const average=(xs)=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;

function polityTerritories(polity,regions=[]){return regions.filter(r=>(r.governance?.sovereignPolityId||r.polityId)===polity?.id);}
function reviewCapacity(polity,territories=[]){
  const a=polity?.administration||{};
  const law=average(territories.map(r=>clamp(r?.corporateCapital?.corporateLaw||0)));
  const finance=average(territories.map(r=>clamp(r?.corporateCapital?.financialDepth||0)));
  return clamp(clamp(a.officialdom||0)*.26+clamp(a.recordKeeping||0)*.24+clamp(a.accounting||0)*.2+clamp(a.delegation||0)*.08+law*.12+finance*.1);
}

export function foreignAcquisitionReviewMode(polity,territories=[]){
  const capacity=reviewCapacity(polity,territories);
  if(capacity>=.62)return{mode:'standing_review_board',capacity,label:'Foreign investment review board'};
  if(capacity>=.28)return{mode:'government_review',capacity,label:'Government review'};
  return{mode:'ad_hoc_ruler_review',capacity,label:'Ruler/council decision'};
}

export function eligibleAcquisitionBuyers({targetRegion,targetPolity,targetFirm,regions=[],polities=[]}){
  const buyers=[];
  for(const region of regions){
    const buyerPolity=polities.find(p=>p.id===(region.governance?.sovereignPolityId||region.polityId));
    if(!buyerPolity||buyerPolity.id===targetPolity?.id)continue;
    for(const firm of region.corporateCapital?.firms||[]){
      if(firm.status!=='active')continue;
      if(firm.sector!==targetFirm.sector&&firm.sector!=='infrastructure')continue;
      const capital=Math.max(0,Number(firm.capitalIndex)||0);
      if(capital<Math.max(.08,(targetFirm.capitalIndex||0)*.18))continue;
      const access=investmentAccess(targetPolity,targetFirm.sector,{foreign:true,proposedForeignShare:1,proposedStateShare:0});
      if(!access.allowed)continue;
      const strategic=['mining','shipping','rail','power_generation','power_grid','water','telecommunications','finance','infrastructure'].includes(targetFirm.sector);
      if(!foreignMarketAccess({hostPolity:targetPolity,investorPolity:buyerPolity,strategic,relation:0,atWar:false,partner:false}))continue;
      buyers.push({region,buyerPolity,firm,capital,strategic,access});
    }
  }
  return buyers.sort((a,b)=>b.capital-a.capital);
}

export function generateForeignAcquisitionBids({targetRegion,targetPolity,targetFirm,regions=[],polities=[],rng=Math.random,currentTick=0,maxBids=3}){
  const out=[];
  const targetCapital=Math.max(.05,Number(targetFirm.capitalIndex)||0);
  const solvency=clamp(targetFirm.solvency||0);
  for(const buyer of eligibleAcquisitionBuyers({targetRegion,targetPolity,targetFirm,regions,polities})){
    const hostTerritories=polityTerritories(targetPolity,regions);
    const risk=investmentRisk({hostPolity:targetPolity,civilDisorder:clamp(1-solvency)*.25,assetDamageRate:clamp(targetRegion.enterpriseExternalities?.maintenanceRisk||0)});
    const capacityRatio=buyer.capital/Math.max(.05,targetCapital);
    const attractiveness=clamp(.18+Math.min(.55,capacityRatio*.12)+(1-solvency)*.16-risk*.38);
    if((rng?.()??Math.random())>attractiveness)continue;
    const distressDiscount=clamp(.3+(1-solvency)*.35,.3,.7);
    const bidValue=Math.max(.02,targetCapital*(1-distressDiscount)*(0.85+(rng?.()??Math.random())*.3));
    const recapitalisation=Math.max(.01,targetCapital*(.08+.18*clamp(capacityRatio/3)));
    const id=`${targetFirm.id}:foreign-bid:${buyer.buyerPolity.id}:${currentTick}`;
    out.push({id,buyerPolityId:buyer.buyerPolity.id,buyerFirmId:buyer.firm.id,buyerRegionId:buyer.region.id,targetFirmId:targetFirm.id,targetRegionId:targetRegion.id,sector:targetFirm.sector,bidValue,recapitalisation,assumedDebtShare:clamp(.15+.35*solvency),strategic:buyer.strategic,risk,status:'pending',createdTick:currentTick,review:foreignAcquisitionReviewMode(targetPolity,hostTerritories)});
    if(out.length>=maxBids)break;
  }
  return out;
}

export function acquisitionReviewOptions(bid,targetPolity,territories=[]){
  const mode=foreignAcquisitionReviewMode(targetPolity,territories);
  const strategic=!!bid?.strategic;
  return [
    {id:'approve',label:'Approve acquisition',available:true},
    {id:'approve_conditions',label:'Approve with operating conditions',available:mode.capacity>=.28},
    {id:'require_state_stake',label:'Require a government minority stake',available:mode.capacity>=.36},
    {id:'reject',label:'Reject acquisition',available:true},
  ].map(o=>({...o,strategic,reviewMode:mode.mode}));
}

export function resolveForeignAcquisition({bid,choice,targetRegion,targetPolity,targetFirm,buyerPolity,buyerFirm,territories=[],currentTick=0}){
  if(!bid||bid.status!=='pending'||!targetFirm||!buyerFirm)return{resolved:false,reason:'bid_unavailable'};
  const option=acquisitionReviewOptions(bid,targetPolity,territories).find(o=>o.id===choice);
  if(!option?.available)return{resolved:false,reason:'review_option_unavailable'};
  if(choice==='reject'){
    bid.status='rejected';bid.resolvedTick=currentTick;
    return{resolved:true,approved:false,bid,summary:`The government rejected the foreign acquisition offer.`};
  }
  const buyerCash=Math.max(0,Number(buyerFirm.capitalIndex)||0);
  const totalCommitment=bid.bidValue+bid.recapitalisation;
  if(buyerCash<totalCommitment*.08)return{resolved:false,reason:'buyer_finance_failed'};
  const debt=Math.max(0,Number(targetFirm.debtIndex)||0);
  const creditorPayment=Math.min(debt,bid.bidValue*.8);
  targetFirm.debtIndex=Math.max(0,debt-creditorPayment);
  targetFirm.capitalIndex=Math.max(.02,(targetFirm.capitalIndex||0)+bid.recapitalisation);
  targetFirm.equityIndex=Math.max(.01,(targetFirm.equityIndex||0)+bid.recapitalisation);
  targetFirm.solvency=clamp(Math.max(.4,(targetFirm.solvency||0)+.38));
  targetFirm.status='active';
  targetFirm.foreignOwner=true;
  targetFirm.ownerPolityId=buyerPolity?.id||bid.buyerPolityId;
  targetFirm.parentFirmId=buyerFirm.id;
  targetFirm.stateStake=choice==='require_state_stake'?Math.max(.2,Number(targetFirm.stateStake)||0):Number(targetFirm.stateStake)||0;
  targetFirm.acquisitionConditions=choice==='approve_conditions'?{maintenanceFloor:.55,serviceFloor:.5,rehabilitationFloor:.45}:null;
  buyerFirm.capitalIndex=Math.max(.01,buyerCash-totalCommitment*.08);
  bid.status='approved';bid.resolvedTick=currentTick;bid.reviewChoice=choice;
  return{resolved:true,approved:true,bid,creditorPayment,stateStake:targetFirm.stateStake,summary:`A foreign buyer acquired the distressed ${targetFirm.sector.replaceAll('_',' ')} enterprise for ${bid.bidValue.toFixed(2)} and committed ${bid.recapitalisation.toFixed(2)} of new capital.`};
}
