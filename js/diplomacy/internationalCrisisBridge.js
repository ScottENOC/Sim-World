import { registerInternationalCrisis } from './internationalCrises.js?v=20260920-intl-crisis1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||r?.id||null;

export function recordInternationalCrisisSignal(region, signal={}){
  if(!region)return null;
  region.internationalCrisisSignals||=[];
  const entry={...signal,id:signal.id||`crisis-signal-${region.id}-${region.internationalCrisisSignals.length+1}`,regionId:region.id,consumed:false};
  region.internationalCrisisSignals.push(entry);
  return entry;
}

export function harvestInternationalCrisisSignals(world,currentTick=0){
  const created=[];
  for(const region of world.regions||[]){
    for(const signal of region.internationalCrisisSignals||[]){
      if(signal.consumed)continue;
      const crisis=registerInternationalCrisis(world,{
        key:`signal:${signal.id}`,type:signal.type||'international_crisis',sourceId:signal.id,
        sideAActorId:signal.sideAActorId||actorId(region),sideBActorId:signal.sideBActorId||signal.targetActorId||null,
        allegedAggressorActorId:signal.allegedAggressorActorId||signal.sideAActorId||actorId(region),affectedActorId:signal.affectedActorId||signal.sideBActorId||signal.targetActorId||null,
        title:signal.title||null,severity:clamp(signal.severity??.5),evidence:clamp(signal.evidence??.75),
        nuclearRisk:clamp(signal.nuclearRisk||0),humanitarianRisk:clamp(signal.humanitarianRisk||0),
      },currentTick);
      signal.consumed=true; signal.crisisId=crisis.id; created.push(crisis);
    }
  }
  for(const target of world.polities||[]){
    for(const operation of Object.values(target.foreignPoliticalIntervention?.operations||{})){
      if(!operation?.detected||!operation.sponsorPolityId)continue;
      const key=`foreign-intervention:${target.id}:${operation.sponsorPolityId}:${operation.mode||'operation'}`;
      const crisis=registerInternationalCrisis(world,{key,type:operation.mode==='coup'?'foreign_backed_coup':'foreign_intervention',sourceId:key,
        sideAActorId:operation.sponsorPolityId,sideBActorId:target.id,allegedAggressorActorId:operation.sponsorPolityId,affectedActorId:target.id,
        severity:clamp(.38+(operation.network||0)*.20+(operation.materialSupport||0)*.18+(operation.eliteContacts||0)*.18),evidence:clamp(.58+(operation.exposure||0)*.36)},currentTick);
      created.push(crisis);
    }
  }
  return created;
}
