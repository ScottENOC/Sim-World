const arr=(value)=>Array.isArray(value)?value:[];

function polityForActor(world,actorId){
  const mapped=world?.scenarioActorToPolityId?.[actorId];
  return arr(world?.polities).find(p=>p?.id===actorId||p?.id===mapped||p?.scenarioActorId===actorId)||null;
}

function cloneBeliefs(actor){
  const ledger={};
  for(const belief of arr(actor?.initialStrategicBeliefs)){
    if(!belief?.targetActorId||!belief?.metric)continue;
    ledger[belief.targetActorId]||={};
    ledger[belief.targetActorId][belief.metric]={
      metric:belief.metric,
      estimate:Number(belief.estimate)||0,
      confidence:Number.isFinite(belief.confidence)?belief.confidence:.5,
      uncertainty:Number.isFinite(belief.uncertainty)?belief.uncertainty:.5,
      asOfTick:Number(belief.asOfTick)||0,
      scenarioSeeded:true,
      note:belief.note||null,
      sources:[{
        sourceType:belief.sourceType||'internal_report',
        confidence:Number.isFinite(belief.confidence)?belief.confidence:.5,
        asOfTick:Number(belief.asOfTick)||0,
        value:Number(belief.estimate)||0,
        scenarioSeeded:true,
      }],
    };
  }
  return ledger;
}

export function applyScenarioStrategicInformation(world,initialState={}){
  let actorsApplied=0,regionsApplied=0,beliefsApplied=0;
  for(const actor of arr(initialState.actors)){
    const profile=actor?.strategicInformationEnvironment;
    const seededBeliefs=cloneBeliefs(actor);
    if(!profile&&!Object.keys(seededBeliefs).length)continue;
    const polity=polityForActor(world,actor.id);
    if(polity){
      if(profile)polity.strategicInformationEnvironment={...profile};
      polity.informationCalibration=actor.informationCalibration?{...actor.informationCalibration}:undefined;
      if(Object.keys(seededBeliefs).length){
        polity.strategicBeliefs=JSON.parse(JSON.stringify(seededBeliefs));
        beliefsApplied+=Object.values(seededBeliefs).reduce((sum,metrics)=>sum+Object.keys(metrics).length,0);
      }
      actorsApplied++;
    }
    const polityId=polity?.id||world?.scenarioActorToPolityId?.[actor.id]||actor.id;
    for(const region of arr(world?.regions)){
      const sovereign=region?.governance?.sovereignPolityId||region?.polityId||null;
      if(region?.scenarioCountryId!==actor.id&&sovereign!==polityId&&sovereign!==actor.id)continue;
      if(profile)region.strategicInformationEnvironment={...profile};
      region.informationCalibration=actor.informationCalibration?{...actor.informationCalibration}:undefined;
      if(Object.keys(seededBeliefs).length)region.strategicBeliefs=JSON.parse(JSON.stringify(seededBeliefs));
      regionsApplied++;
    }
  }
  return{actorsApplied,regionsApplied,beliefsApplied};
}
