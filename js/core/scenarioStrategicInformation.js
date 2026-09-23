const arr=(value)=>Array.isArray(value)?value:[];

function polityForActor(world,actorId){
  const mapped=world?.scenarioActorToPolityId?.[actorId];
  return arr(world?.polities).find(p=>p?.id===actorId||p?.id===mapped||p?.scenarioActorId===actorId)||null;
}

export function applyScenarioStrategicInformation(world,initialState={}){
  let actorsApplied=0,regionsApplied=0;
  for(const actor of arr(initialState.actors)){
    const profile=actor?.strategicInformationEnvironment;
    if(!profile)continue;
    const polity=polityForActor(world,actor.id);
    if(polity){
      polity.strategicInformationEnvironment={...profile};
      polity.informationCalibration=actor.informationCalibration?{...actor.informationCalibration}:undefined;
      actorsApplied++;
    }
    const polityId=polity?.id||world?.scenarioActorToPolityId?.[actor.id]||actor.id;
    for(const region of arr(world?.regions)){
      const sovereign=region?.governance?.sovereignPolityId||region?.polityId||null;
      if(region?.scenarioCountryId!==actor.id&&sovereign!==polityId&&sovereign!==actor.id)continue;
      region.strategicInformationEnvironment={...profile};
      region.informationCalibration=actor.informationCalibration?{...actor.informationCalibration}:undefined;
      regionsApplied++;
    }
  }
  return{actorsApplied,regionsApplied};
}
