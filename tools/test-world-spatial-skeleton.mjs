import assert from 'node:assert/strict';
import { buildWorldSpatialGraph, spatialFeaturesForRegion, syncRegionSpatialSites } from '../js/world/spatialGraph.js';
import { buildLocalRegionScene } from '../js/ui/localRegionView.js';
import { ensureSubregionalControl } from '../js/military/subregionalControl.js';

function square(id,x0,x1,neighbors=[],coastal=false){
  return {id,name:id,centroid:[(x0+x1)/2,0.5],areaSqKm:100,neighbors,isCoastal:coastal,adjacentSeaIds:coastal?['sea']:[],
    feature:{type:'Feature',properties:{id},geometry:{type:'Polygon',coordinates:[[[x0,0],[x1,0],[x1,1],[x0,1],[x0,0]]]}},
    population:20000,urbanisation:{urbanPopulation:6000},landQuality:.7,terrain:{plains:.7,wetland:.15,forest:.15},forest:{K:100,currentStock:50},
    deposits:{copper:{tiers:[{remainingStock:1000}]}},construction:{assets:[{id:'fort1',typeId:'hill_fort',condition:1}]},
    settlements:{principalId:null,places:[]},governance:{sovereignPolityId:`actor:${id}`},controllingActorId:`actor:${id}`,
    stability:.8,conflictPressure:0,army:{personnel:0,away:0},navy:{personnel:0,boats:0}};
}
const a=square('A',0,1,['B'],false), b=square('B',1,2,['A','C'],false), c=square('C',2,3,['B'],true);
const sea={id:'sea',name:'Sea',centroid:[4,.5],adjacentLand:['C']};
const graph=buildWorldSpatialGraph([a,b,c],[sea],{riverSourceIds:['A'],seed:'test'});

const ab=graph.anchors.get('border:A|B');
assert.ok(ab,'shared border anchor exists');
assert.deepEqual(spatialFeaturesForRegion(graph,'A').anchors.find(x=>x.id===ab.id),spatialFeaturesForRegion(graph,'B').anchors.find(x=>x.id===ab.id),'both regions reference same canonical border anchor');
assert.equal(ab.lon,1); assert.ok(ab.lat>=0&&ab.lat<=1);

const route=graph.corridors.get('route:A|B');
assert.equal(route.anchorId,ab.id);
assert.deepEqual(route.points[1],[ab.lon,ab.lat],'cross-region route passes through canonical shared border coordinate');

const river=[...graph.corridors.values()].find(x=>x.type==='river');
assert.ok(river,'forced inland source creates a river');
assert.deepEqual(river.regionIds,['A','B','C']);
const segA=river.regionSegments.find(x=>x.regionId==='A');
const segB=river.regionSegments.find(x=>x.regionId==='B');
assert.deepEqual(segA.to,segB.from,'river does not jump when crossing a regional boundary');
assert.deepEqual(segA.to,[ab.lon,ab.lat]);
const bc=graph.anchors.get('border:B|C');
const segC=river.regionSegments.find(x=>x.regionId==='C');
assert.deepEqual(segB.to,segC.from); assert.deepEqual(segB.to,[bc.lon,bc.lat]);

const firstPrincipal={...graph.sites.get('B:principal')};
const graphAgain=buildWorldSpatialGraph([a,b,c],[sea],{riverSourceIds:['A'],seed:'test'});
assert.deepEqual(graphAgain.sites.get('B:principal'),firstPrincipal,'world site placement is deterministic and not invented by the renderer');

const control=ensureSubregionalControl(b);
syncRegionSpatialSites(graph,b,control.places);
const city=control.places.find(p=>['city','principal_settlement'].includes(p.kind));
const portlessTown=control.places.find(p=>p.kind==='town');
assert.ok(city?.location && city.spatialSiteId,'strategic control node receives canonical world coordinate');
if(portlessTown) assert.ok(portlessTown.location,'secondary strategic sites are spatialised once');
const before={...city.location};
city.controllerActorId='invader';
syncRegionSpatialSites(graph,b,control.places);
assert.deepEqual(city.location,before,'political occupation does not move the settlement');

const scene1=buildLocalRegionScene(graph,b,{campaigns:[],fleets:[]});
const scene2=buildLocalRegionScene(graph,b,{campaigns:[],fleets:[]});
assert.deepEqual(scene2.sites.map(s=>[s.id,s.lon,s.lat]),scene1.sites.map(s=>[s.id,s.lon,s.lat]),'regional rendering consumes stable shared site coordinates');
const sceneRiver=scene1.corridors.find(x=>x.id===river.id);
assert.deepEqual(sceneRiver.segments[0],[segB.from,segB.to],'local view uses global river segment verbatim');
assert.equal(scene1.sites.find(s=>s.id===city.id).controllerActorId,'invader','local view overlays changing political control onto fixed geography');

console.log('world spatial skeleton regressions passed');
