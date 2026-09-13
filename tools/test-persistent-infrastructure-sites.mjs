import assert from 'node:assert/strict';
import { buildWorldSpatialGraph, syncRegionSpatialSites, spatialFeaturesForRegion } from '../js/world/spatialGraph.js';
import { ensureSubregionalControl } from '../js/military/subregionalControl.js';

function square(x0,y0,x1,y1){
  return {type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]}};
}

const region={
  id:'portland',name:'Portland',centroid:[0.5,0.5],feature:square(0,0,1,1),neighbors:['inland'],adjacentSeaIds:['sea:test'],isCoastal:true,
  population:30000,urbanisation:{urbanPopulation:9000},governance:{sovereignPolityId:'polity-a'},tradePartnerIds:new Set(),
  deposits:{stone:{tiers:[{remainingStock:10000}]},copper:{tiers:[{remainingStock:5000}]}},
  construction:{assets:[
    {id:'road-1',typeId:'road_network',condition:0.85,scale:1},
    {id:'harbour-1',typeId:'harbour',condition:0.9,scale:1},
    {id:'granary-1',typeId:'public_granary',condition:0.7,scale:1},
    {id:'quarry-1',typeId:'state_quarry',condition:0.8,scale:1},
    {id:'tomb-1',typeId:'monumental_tomb',condition:0.65,scale:1.4},
  ]},
  settlements:{version:2,principalId:'portland:principal',nextTownOrdinal:1,places:[{id:'portland:principal',name:'Portland',kind:'city',isPrincipal:true,status:'active',population:9000}]},
};
const inland={
  id:'inland',name:'Inland',centroid:[1.5,0.5],feature:square(1,0,2,1),neighbors:['portland'],adjacentSeaIds:[],isCoastal:false,
  population:10000,urbanisation:{urbanPopulation:1000},governance:{sovereignPolityId:'polity-b'},deposits:{},construction:{assets:[]},
  settlements:{version:2,principalId:'inland:principal',nextTownOrdinal:1,places:[{id:'inland:principal',name:'Inland',kind:'town',isPrincipal:true,status:'active',population:1000}]},
};
const sea={id:'sea:test',name:'Test Sea',centroid:[0.5,-0.5]};

const graph=buildWorldSpatialGraph([region,inland],[sea],{riverSourceIds:[],seed:'infra-test'});
const control=ensureSubregionalControl(region);
syncRegionSpatialSites(graph,region,control.places);
let features=spatialFeaturesForRegion(graph,region.id);

const harbour=region.construction.assets.find(a=>a.id==='harbour-1');
const granary=region.construction.assets.find(a=>a.id==='granary-1');
const quarry=region.construction.assets.find(a=>a.id==='quarry-1');
const tomb=region.construction.assets.find(a=>a.id==='tomb-1');
const road=region.construction.assets.find(a=>a.id==='road-1');
for(const asset of [harbour,granary,quarry,tomb]){
  assert(asset.spatialSiteId,'point infrastructure should receive a persistent site id');
  assert(Number.isFinite(asset.location?.lon)&&Number.isFinite(asset.location?.lat),'point infrastructure should receive persistent coordinates');
  assert(graph.sites.has(asset.spatialSiteId),'asset site should exist in shared spatial graph');
}
assert(road.spatialCorridorId,'linear infrastructure should receive a persistent corridor id');
assert(Array.isArray(road.spatialPoints)&&road.spatialPoints.length>=2,'linear infrastructure should persist its path');
assert(graph.corridors.has(road.spatialCorridorId));
assert.equal(graph.sites.get(tomb.spatialSiteId).type,'monumental_tomb','monuments should use construction asset site rather than a duplicate visual marker');
assert(!features.sites.some(s=>String(s.id).startsWith('portland:monument:')),'legacy duplicate monument sites should not be created');

const before=new Map([harbour,granary,quarry,tomb].map(a=>[a.id,[a.location.lon,a.location.lat]]));
const roadBefore=road.spatialPoints.map(p=>[...p]);
region.governance.sovereignPolityId='polity-conqueror';
harbour.condition=0.45; road.condition=0.4;
syncRegionSpatialSites(graph,region,ensureSubregionalControl(region).places);
for(const asset of [harbour,granary,quarry,tomb]) assert.deepEqual([asset.location.lon,asset.location.lat],before.get(asset.id),'conquest and condition changes must not move built infrastructure');
assert.deepEqual(road.spatialPoints,roadBefore,'linear infrastructure path must remain stable');
assert.equal(graph.sites.get(harbour.spatialSiteId).condition,0.45,'site metadata should track live asset condition');
assert.equal(graph.corridors.get(road.spatialCorridorId).quality,0.4,'corridor quality should track live asset condition');

features=spatialFeaturesForRegion(graph,region.id);
assert(features.corridors.some(c=>c.type==='infrastructure_route'&&c.infrastructureType==='road_network'));
assert(features.sites.some(s=>s.infrastructureType==='public_granary'));
console.log('persistent infrastructure spatial regressions passed');
