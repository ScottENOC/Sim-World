import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialiseHydrology, tickHydrology, ensureRegionalHydrology, setWaterOperatingPriority, setWaterPolicy } from '../js/world/hydrology.js';

function region(id, population=10000) {
  return {
    id, name:id, population, centroid:[0,45], neighbors:[], relations:new Map(),
    governance:{ sovereignPolityId:id }, controllingActorId:id,
    unlockedTechIds:new Set(['water_management','hydraulic_engineering']),
    construction:{ assets:[] }, report:{ farming:{ workers: population*0.45 } },
    weather:{ yieldMultiplier:1 }, climate:{ rainfallMultiplier:1, evaporationMultiplier:1 },
    disease:{ pathogens:{ enteric:{ recognised:true } } },
  };
}
function asset(typeId){ return { typeId, condition:1 }; }
function world() {
  const a=region('upstream',18000), b=region('middle',24000), c=region('downstream',30000);
  a.neighbors=['middle']; b.neighbors=['upstream','downstream']; c.neighbors=['middle'];
  const river={
    id:'river:test',type:'river',name:'Test',regionIds:['upstream','middle','downstream'],
    regionSegments:[{regionId:'upstream'},{regionId:'middle'},{regionId:'downstream'}],
    navigation:{naturalCapacity:0.8,flowVariability:0.35},
  };
  const graph={ corridors:new Map([[river.id,river]]) };
  const regions=[a,b,c]; initialiseHydrology(graph,regions); return {graph,regions,a,b,c,river};
}

{
  const source=fs.readFileSync(new URL('../js/economy/construction.js',import.meta.url),'utf8');
  assert.match(source,/river_weir:/,'small river-control works are ordinary construction projects');
  assert.match(source,/reservoir_dam:/,'major dams are ordinary construction projects');
}

{
  const {graph,regions,a,b,c,river}=world();
  a.construction.assets.push(asset('irrigation'));
  setWaterPolicy(a,{ surfaceWithdrawalIntensity:1 });
  tickHydrology(graph,regions,80,30);
  const s=river.hydrology.segments;
  assert.ok(s.upstream.withdrawal>0,'irrigation withdraws surface water');
  assert.ok(s.middle.outflow>0 && s.downstream.outflow>0,'river continues downstream');
  assert.equal(ensureRegionalHydrology(a).groundwater.storage,1,'surface irrigation does not silently consume groundwater');
}

{
  const {graph,regions,a,b,c,river}=world();
  a.population=250000; a.report.farming.workers=90000;
  a.industrialChemicalDischarge=0.08;
  b.population=2000; b.report.farming.workers=100;
  c.population=2000; c.report.farming.workers=100;
  tickHydrology(graph,regions,120,30);
  const s=river.hydrology.segments;
  assert.ok(s.middle.pollutionLoad.pathogen>0,'upstream sewage travels downstream');
  assert.ok(s.downstream.pollutionLoad.chemicals>0,'industrial pollution travels downstream');
  assert.ok(s.upstream.concentration.pathogen>=s.downstream.concentration.pathogen || s.downstream.outflow>s.upstream.outflow,
    'greater downstream flow provides dilution rather than accumulating concentration without bound');
}

{
  const {graph,regions,a,river}=world();
  a.construction.assets.push(asset('reservoir_dam'));
  setWaterOperatingPriority(a,'irrigation');
  tickHydrology(graph,regions,90,30);
  const first={...river.hydrology.segments.upstream};
  assert.ok(first.stored>=0,'dam exposes persistent storage');
  assert.equal(a.waterPolicy.operatingPriority,'irrigation');
  assert.ok(a.waterPolicy.targetReservoirFill>a.waterPolicy.targetDownstreamFlow,'irrigation priority favours storage over release');
  a.climate.rainfallMultiplier=0.2;
  tickHydrology(graph,regions,270,30);
  const dry={...river.hydrology.segments.upstream};
  assert.ok(Number.isFinite(dry.storageChange),'dam tracks storage/release separately from river volume');
  assert.ok(dry.outflow>=0,'release rule remains physically non-negative');
}

{
  const {graph,regions,a,river}=world();
  a.construction.assets.push(asset('reservoir_dam'));
  setWaterOperatingPriority(a,'hydropower');
  tickHydrology(graph,regions,75,30);
  assert.equal(river.hydrology.segments.upstream.hydropowerPotential,0,'a dam does not generate electricity before relevant technology');
  a.unlockedTechIds.add('electrical_generation');
  tickHydrology(graph,regions,105,30);
  assert.ok(river.hydrology.segments.upstream.hydropowerPotential>=0,'hydropower output is available to a later electricity system without inventing one here');
}

{
  const {graph,regions,a,river}=world();
  tickHydrology(graph,regions,100,30);
  const normal=river.hydrology.segments.upstream.outflow;
  a.climate.rainfallMultiplier=0.55;
  a.climate.evaporationMultiplier=1.5;
  tickHydrology(graph,regions,100,30);
  const climateChanged=river.hydrology.segments.upstream.outflow;
  assert.ok(climateChanged<normal,'future climate rainfall/evaporation hooks change runoff');
}

{
  const {graph,regions,a,b}=world();
  a.population=500000; a.report.farming.workers=180000; a.industrialChemicalDischarge=0.2;
  a.construction.assets.push(asset('irrigation'));
  setWaterPolicy(a,{surfaceWithdrawalIntensity:1});
  b.hydrology={waterImpactAwareness:0.95,groundwater:{storage:1,rechargeMultiplier:1,withdrawal:0},report:{}};
  for(let i=0;i<5;i++) tickHydrology(graph,regions,150+i*30,30);
  const relation=b.relations.get('upstream');
  assert.ok(relation && relation.attitude<0,'aware downstream polity resents attributable upstream harm');
  assert.match(relation.lastCause,/upstream_water_/);
}

console.log('human river engineering tests passed');
