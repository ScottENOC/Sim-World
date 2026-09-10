import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { hydrateWorldSpatialGraph } from '../js/world/spatialBaseLoader.js';

const geo=JSON.parse(fs.readFileSync(new URL('../data/world/regions.geo.json',import.meta.url),'utf8'));
const meta=JSON.parse(fs.readFileSync(new URL('../data/world/regions.meta.json',import.meta.url),'utf8')).regions;
const seaMeta=JSON.parse(fs.readFileSync(new URL('../data/world/seaRegions.meta.json',import.meta.url),'utf8')).seaRegions;
const base=JSON.parse(fs.readFileSync(new URL('../data/world/spatial.base.json',import.meta.url),'utf8'));
const metaById=new Map(meta.map(x=>[x.id,x]));
const coastal=new Map();
for(const s of seaMeta)for(const id of s.adjacentLand||[]){if(!coastal.has(id))coastal.set(id,[]);coastal.get(id).push(s.id);}
const regions=geo.features.map(f=>{const m=metaById.get(f.properties.id);return {id:m.id,name:m.name,centroid:m.centroid,neighbors:m.neighbors,feature:f,
  isCoastal:coastal.has(m.id),adjacentSeaIds:coastal.get(m.id)||[],population:10000,landQuality:.6,terrain:{plains:.6,forest:.2,wetland:.05},construction:{assets:[]},tradeEconomy:{},settlements:{principalId:null,places:[]}};});

assert.equal(base.version,1);
assert.ok(base.anchors.length>0,'committed geography contains anchors');
assert.ok(base.rivers.length>0,'committed geography contains river systems');
for(const river of base.rivers){
  for(let i=1;i<river.regionSegments.length;i++)assert.deepEqual(river.regionSegments[i-1].to,river.regionSegments[i].from,`${river.id} discontinuity`);
}
const start=performance.now();
const graph=hydrateWorldSpatialGraph(base,regions);
const ms=performance.now()-start;
assert.equal(graph.regionIndex.size,regions.length);
assert.equal(graph.source,'committed-base');
assert.equal([...graph.corridors.values()].filter(c=>c.type==='river').length,base.rivers.length);
assert.ok([...graph.corridors.values()].some(c=>c.type==='land_route'));
assert.ok(ms<1000,`hydrating committed spatial base took ${ms.toFixed(0)}ms`);
console.log(`committed spatial base: ${regions.length} regions, ${base.anchors.length} anchors, ${base.rivers.length} rivers; runtime hydration ${ms.toFixed(1)}ms`);
