import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildWorldSpatialGraph } from '../js/world/spatialGraph.js';

const geo=JSON.parse(fs.readFileSync(new URL('../data/world/regions.geo.json',import.meta.url),'utf8'));
const meta=JSON.parse(fs.readFileSync(new URL('../data/world/regions.meta.json',import.meta.url),'utf8')).regions;
const seaMeta=JSON.parse(fs.readFileSync(new URL('../data/world/seaRegions.meta.json',import.meta.url),'utf8')).seaRegions;
const metaById=new Map(meta.map(x=>[x.id,x]));
const coastal=new Map();
for(const s of seaMeta)for(const id of s.adjacentLand||[]){if(!coastal.has(id))coastal.set(id,[]);coastal.get(id).push(s.id);}
const regions=geo.features.map(f=>{const m=metaById.get(f.properties.id);return {id:m.id,name:m.name,centroid:m.centroid,neighbors:m.neighbors,feature:f,
  isCoastal:coastal.has(m.id),adjacentSeaIds:coastal.get(m.id)||[],population:10000,landQuality:.6,terrain:{plains:.6,forest:.2,wetland:.05},construction:{assets:[]},tradeEconomy:{}};});
const seas=seaMeta.map(s=>({id:s.id,name:s.name,centroid:s.centroid||[0,0],adjacentLand:s.adjacentLand||[]}));
const start=performance.now();
const graph=buildWorldSpatialGraph(regions,seas);
const ms=performance.now()-start;
assert.equal(graph.regionIndex.size,regions.length);
assert.ok(graph.anchors.size>0);
assert.ok([...graph.corridors.values()].some(c=>c.type==='land_route'));
for(const river of [...graph.corridors.values()].filter(c=>c.type==='river')){
  for(let i=1;i<river.regionSegments.length;i++)assert.deepEqual(river.regionSegments[i-1].to,river.regionSegments[i].from,`${river.id} discontinuity`);
}
// Startup generation should be a one-off, but still needs to be comfortable on a phone.
assert.ok(ms<5000,`world spatial skeleton took ${ms.toFixed(0)}ms`);
console.log(`real map spatial skeleton: ${regions.length} regions, ${graph.anchors.size} anchors, ${graph.corridors.size} corridors, ${ms.toFixed(1)}ms`);
