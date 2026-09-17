import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';
import { overlandInfrastructureMultiplier } from '../economy/construction.js?v=20260917-telegraph1';
import { horseTransportMultiplier } from '../economy/horses.js?v=20260904-policy1';
import { railwayConnection } from '../economy/railways.js?v=20260917-message-routing1';
import { hasOperationalTelegraph, telegraphRouteBetween } from './telegraph.js?v=20260917-telegraph1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const MAX_LAND_VISITS=420;
const MAX_LAND_HOPS=26;
const COASTAL_CANDIDATES=4;

function landEdge(a,b){
  if(hasOperationalTelegraph(a)&&hasOperationalTelegraph(b)){
    const route=telegraphRouteBetween(a,b,new Map([[a.id,a],[b.id,b]]));
    if(route) return {mode:'telegraph',days:route.days,lineCondition:route.lineCondition};
  }
  const rail=railwayConnection(a,b);
  if(rail){
    const cap=Math.max(.02,Number(rail.effectiveCapacity)||0);
    const km=Math.max(1,Number(rail.lengthKm)||100);
    return {mode:'rail',days:Math.max(.18,km/(180+cap*220)),lineId:rail.lineId,effectiveCapacity:cap};
  }
  const infra=Math.max(1,(overlandInfrastructureMultiplier(a)+overlandInfrastructureMultiplier(b))/2);
  const horses=Math.max(1,(horseTransportMultiplier(a)+horseTransportMultiplier(b))/2);
  return {mode:'horse',days:Math.max(.7,4/(infra*horses))};
}

function dijkstra(origin,regionsById,{targetId=null,maxVisits=MAX_LAND_VISITS,maxHops=MAX_LAND_HOPS}={}){
  const best=new Map([[origin.id,{days:0,hops:0,prev:null,edge:null}]]);
  const open=[{id:origin.id,days:0,hops:0}];
  let visits=0;
  while(open.length&&visits++<maxVisits){
    open.sort((a,b)=>a.days-b.days);
    const current=open.shift();
    const known=best.get(current.id);
    if(!known||current.days>known.days+1e-9)continue;
    if(targetId&&current.id===targetId)break;
    if(current.hops>=maxHops)continue;
    const here=regionsById.get(current.id); if(!here)continue;
    for(const nextId of here.neighbors||[]){
      const next=regionsById.get(nextId); if(!next)continue;
      const edge=landEdge(here,next);
      const days=current.days+edge.days;
      const prior=best.get(nextId);
      if(prior&&prior.days<=days)continue;
      best.set(nextId,{days,hops:current.hops+1,prev:current.id,edge});
      open.push({id:nextId,days,hops:current.hops+1});
    }
  }
  return best;
}

function pathFrom(best,targetId){
  if(!best.has(targetId))return null;
  const steps=[]; let id=targetId;
  while(true){
    const node=best.get(id); if(!node)return null;
    steps.push({id,edge:node.edge});
    if(!node.prev)break; id=node.prev;
  }
  steps.reverse();
  const legs=[];
  for(let i=1;i<steps.length;i++){
    const fromId=steps[i-1].id,toId=steps[i].id,edge=steps[i].edge;
    const prev=legs[legs.length-1];
    if(prev&&prev.mode===edge.mode){
      prev.toRegionId=toId; prev.regionIds.push(toId); prev.days+=edge.days;
      if(edge.lineId){prev.lineIds ||= []; if(!prev.lineIds.includes(edge.lineId))prev.lineIds.push(edge.lineId);}
      if(edge.lineCondition!==undefined)prev.lineCondition=Math.min(prev.lineCondition??1,edge.lineCondition);
    } else {
      legs.push({mode:edge.mode,fromRegionId:fromId,toRegionId:toId,regionIds:[fromId,toId],days:edge.days,
        ...(edge.lineId?{lineIds:[edge.lineId]}:{}),...(edge.lineCondition!==undefined?{lineCondition:edge.lineCondition}:{})});
    }
  }
  return {legs,days:best.get(targetId).days,regionIds:steps.map(s=>s.id)};
}

function nearestCoasts(best,regionsById,limit=COASTAL_CANDIDATES){
  return [...best.entries()].filter(([id])=>Boolean(regionsById.get(id)?.adjacentSeaIds?.length))
    .sort((a,b)=>a[1].days-b[1].days).slice(0,limit).map(([id,node])=>({id,days:node.days}));
}

function reverseLandRoute(target,coastId,regionsById){
  const best=dijkstra(target,regionsById,{targetId:coastId});
  const route=pathFrom(best,coastId); if(!route)return null;
  const legs=route.legs.reverse().map(leg=>({...leg,fromRegionId:leg.toRegionId,toRegionId:leg.fromRegionId,regionIds:[...leg.regionIds].reverse()}));
  return {legs,days:route.days,regionIds:[...route.regionIds].reverse()};
}

function seaLeg(from,to){
  const sea=maritimeRouteBetween(from,to); if(!sea)return null;
  return {mode:'sea',fromRegionId:from.id,toRegionId:to.id,seaIds:sea.seaIds,passageIds:sea.passageIds||[],
    days:Math.max(3,sea.seaIds.length*3+(sea.physicalFriction||0)*8)};
}

function summarise(legs){
  const regionIds=[]; const seaIds=[];
  for(const leg of legs){for(const id of leg.regionIds||[])if(regionIds[regionIds.length-1]!==id)regionIds.push(id); for(const id of leg.seaIds||[])seaIds.push(id);}
  const modes=[...new Set(legs.map(l=>l.mode))];
  return {mode:legs.length===1?legs[0].mode:'multimodal',legs,days:legs.reduce((s,l)=>s+l.days,0),regionIds,seaIds,modes};
}

export function messageRouteBetween(origin,target,regionsById){
  if(!origin||!target)return null;
  if(origin.id===target.id)return {mode:'resident',legs:[],days:0,regionIds:[origin.id],seaIds:[],modes:['resident']};
  const fromBest=dijkstra(origin,regionsById,{targetId:target.id});
  const direct=pathFrom(fromBest,target.id);
  let winner=direct?summarise(direct.legs):null;

  // Sea transfers are bounded: only the four fastest reachable coasts at each end are considered.
  // This permits horse/rail/telegraph -> ship -> horse/rail/telegraph without global all-pairs maritime work.
  const allFrom=dijkstra(origin,regionsById);
  const allTo=dijkstra(target,regionsById);
  const fromCoasts=nearestCoasts(allFrom,regionsById);
  const toCoasts=nearestCoasts(allTo,regionsById);
  for(const a of fromCoasts)for(const b of toCoasts){
    if(a.id===b.id)continue;
    const ar=regionsById.get(a.id),br=regionsById.get(b.id); const sea=seaLeg(ar,br); if(!sea)continue;
    const left=pathFrom(allFrom,a.id); const right=reverseLandRoute(target,b.id,regionsById); if(!left||!right)continue;
    const candidate=summarise([...left.legs,sea,...right.legs]);
    if(!winner||candidate.days<winner.days)winner=candidate;
  }
  return winner;
}

export function messageRouteDeliveryTicks(route){
  if(!route)return Infinity;
  const physical=(route.legs||[]).some(l=>l.mode!=='telegraph');
  if(!physical)return 0;
  return Math.max(1,Math.ceil(Math.max(0,route.days||0)/7));
}

export function routeUsesPhysicalCourier(route){return (route?.legs||[]).some(l=>['horse','rail','sea'].includes(l.mode));}
