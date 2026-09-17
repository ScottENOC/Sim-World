import { tickCorporateCapital } from './corporateCapital.js';
import { createFirmDistressEvent, chooseNpcFirmResolution, resolveFirmDistress } from './bankruptcyResolution.js';
import { resolveForeignAcquisition } from './foreignAcquisitionReview.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

function sovereignId(region){return region?.governance?.sovereignPolityId||region?.polityId||null;}
function territoriesFor(polityId,regions=[]){return regions.filter(r=>sovereignId(r)===polityId);}
function findFirm(region,firmId){return region?.corporateCapital?.firms?.find(f=>f.id===firmId)||null;}
function findBuyerFirm(bid,regions=[]){const r=regions.find(x=>x.id===bid?.buyerRegionId);return r?.corporateCapital?.firms?.find(f=>f.id===bid?.buyerFirmId)||null;}
function reverseImmediateDefaultPenalty(region,firm){
  const s=region?.corporateCapital;if(!s)return;
  const penalty=.08+Math.min(.12,Math.max(0,Number(firm?.debtIndex)||0)*.01);
  s.creditorTrust=clamp((s.creditorTrust??.5)+penalty);
  s.failedFirmPressure=clamp((s.failedFirmPressure||0)*.92);
}
function foreignBidScore(bid,assessment,context={}){
  const fiscalStress=clamp(context.capitalShortage||0);
  const strategicPenalty=bid.strategic?.18:0;
  const value=(bid.bidValue||0)*.35+(bid.recapitalisation||0)*.8;
  return value/Math.max(.1,assessment.capital)-bid.risk*.28+fiscalStress*.2-strategicPenalty;
}
function resolveForeignBid(event,bid,choice,{regions,polities,currentTick=0}){
  const targetRegion=regions.find(r=>r.id===event.regionId);
  const targetPolity=polities.find(p=>p.id===event.polityId);
  const targetFirm=findFirm(targetRegion,event.firmId);
  const buyerPolity=polities.find(p=>p.id===bid.buyerPolityId);
  const buyerFirm=findBuyerFirm(bid,regions);
  const territories=territoriesFor(event.polityId,regions);
  const result=resolveForeignAcquisition({bid,choice,targetRegion,targetPolity,targetFirm,buyerPolity,buyerFirm,territories,currentTick});
  if(result.resolved){
    targetFirm.pendingResolution=false;targetFirm.distressResolvedTick=currentTick;
    for(const other of event.foreignBids||[])if(other.id!==bid.id&&other.status==='pending')other.status='withdrawn';
  }
  return result;
}

export function resolvePlayerFirmDistressEvent(event,choice,{regions=[],polities=[],currentTick=0}={}){
  const region=regions.find(r=>r.id===event.regionId),polity=polities.find(p=>p.id===event.polityId),firm=findFirm(region,event.firmId);
  if(!region||!polity||!firm)return{resolved:false,reason:'firm_unavailable',summary:'The enterprise is no longer available for resolution.'};
  if(String(choice).startsWith('foreign|')){
    const [,bidId,reviewChoice='approve']=String(choice).split('|');
    const bid=(event.foreignBids||[]).find(b=>b.id===bidId);
    if(!bid)return{resolved:false,reason:'bid_unavailable',summary:'That acquisition offer is no longer available.'};
    return resolveForeignBid(event,bid,reviewChoice,{regions,polities,currentTick});
  }
  const result=resolveFirmDistress({region,polity,firm,territories:territoriesFor(polity.id,regions),choice,currentTick});
  if(result.resolved){firm.pendingResolution=false;for(const bid of event.foreignBids||[])if(bid.status==='pending')bid.status='withdrawn';}
  return result;
}

export function tickCorporateCapitalWithDistress(regions,polities,currentTick=0,elapsedDays=30,rng=Math.random,options={}){
  const events=tickCorporateCapital(regions,polities,currentTick,elapsedDays,rng,options),out=[];
  const polityMap=new Map((polities||[]).map(p=>[p.id,p]));
  for(const event of events){
    if(event.type!=='commercial_firm_default'){out.push(event);continue;}
    const region=regions.find(r=>r.id===event.regionId),polity=polityMap.get(event.polityId),firm=findFirm(region,event.firmId);
    if(!region||!polity||!firm){out.push(event);continue;}
    reverseImmediateDefaultPenalty(region,firm);
    firm.status='distressed';firm.pendingResolution=true;firm.distressTick=currentTick;delete firm.defaultTick;
    const territories=territoriesFor(polity.id,regions);
    const distress=createFirmDistressEvent(region,polity,firm,territories,currentTick,{regions,polities,rng});
    distress.form=firm.form;distress.playerRelevant=polity.id===options.playerPolityId;
    if(distress.playerRelevant){out.push(distress);continue;}

    const context={capitalShortage:clamp(1-(polity.capitalFinance?.creditorConfidence??.55)),stateControl:polity.economicOwnership?.stateControl??0};
    const internalChoice=chooseNpcFirmResolution(region,polity,firm,territories,context);
    const bestBid=[...(distress.foreignBids||[])].sort((a,b)=>foreignBidScore(b,distress.assessment,context)-foreignBidScore(a,distress.assessment,context))[0];
    const useForeign=bestBid&&foreignBidScore(bestBid,distress.assessment,context)>.22&&['restructure','insolvency'].includes(internalChoice);
    const result=useForeign
      ? resolveForeignBid(distress,bestBid,bestBid.review?.capacity>=.28?'approve_conditions':'approve',{regions,polities,currentTick})
      : resolveFirmDistress({region,polity,firm,territories,choice:internalChoice,currentTick});
    if(result.resolved)firm.pendingResolution=false;
    out.push({type:'commercial_firm_distress_resolved',regionId:region.id,polityId:polity.id,firmId:firm.id,sector:firm.sector,choice:useForeign?'foreign_acquisition':internalChoice,foreignBid:useForeign?bestBid:null,result,summary:result.summary||'The enterprise distress was resolved.'});
  }
  return out;
}
