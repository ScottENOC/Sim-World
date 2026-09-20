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

function liveCampaigns(world){return world.activeCampaigns||globalThis.__worldsim?.activeCampaigns||[];}
function harvestLiveWars(world,currentTick,created){
  for(const war of world.activeWars||[]){
    if(!war||war.active===false)continue;
    const participants=(war.participants||war.participantPolityIds||[])
      .map((participant)=>typeof participant==='string'?participant:participant?.actorId)
      .filter(Boolean);
    const sideA=war.attackerPolityId||war.attackerActorId||participants[0]||null;
    const sideB=war.defenderPolityId||war.defenderActorId||participants.find((id)=>id!==sideA)||null;
    if(!sideA||!sideB)continue;
    const campaigns=liveCampaigns(world).filter((campaign)=>!campaign.completed&&campaign.warId===war.id);
    const crisis=registerInternationalCrisis(world,{
      key:`war:${war.id}`,type:'war',sourceId:war.id,sideAActorId:sideA,sideBActorId:sideB,
      allegedAggressorActorId:sideA,affectedActorId:sideB,
      severity:clamp(.58+(war.theatres?.length||0)*.06+Math.min(.18,campaigns.length*.03)),
      humanitarianRisk:clamp((war.casualties||0)/100000+campaigns.reduce((sum,campaign)=>sum+(campaign.civilianDeaths||0),0)/100000),
    },currentTick);
    crisis.disputedRegionIds=[...new Set(campaigns.map((campaign)=>campaign.defenderId).filter(Boolean))];
    created.push(crisis);
  }
}

export function harvestInternationalCrisisSignals(world,currentTick=0){
  const created=[];
  // Register wars here before the general crisis tick. The war theatre stores
  // participants as objects, while older crisis code also accepts simple IDs;
  // normalising them here ensures the durable crisis always carries actor IDs.
  harvestLiveWars(world,currentTick,created);
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
      if(signal.disputedRegionIds)crisis.disputedRegionIds=[...signal.disputedRegionIds];
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
