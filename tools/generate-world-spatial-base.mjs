#!/usr/bin/env node
import fs from 'node:fs';
import { buildWorldSpatialGraph } from '../js/world/spatialGraph.js';

const root=new URL('../',import.meta.url);
const read=(p)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const geo=read('data/world/regions.geo.json');
const meta=read('data/world/regions.meta.json').regions;
const seaMeta=read('data/world/seaRegions.meta.json').seaRegions;
const terrain=read('data/world/terrain.initial.json');
const resources=read('data/world/resources.initial.json');
const metaById=new Map(meta.map(x=>[x.id,x]));
const coastal=new Map();
for(const s of seaMeta)for(const id of s.adjacentLand||[]){if(!coastal.has(id))coastal.set(id,[]);coastal.get(id).push(s.id);}
const regions=geo.features.map(f=>{const m=metaById.get(f.properties.id),res=resources[m.id]||{};return {
  id:m.id,name:m.name,centroid:m.centroid,neighbors:m.neighbors,feature:f,isCoastal:coastal.has(m.id),adjacentSeaIds:coastal.get(m.id)||[],
  population:0,landQuality:res.landQuality??.5,terrain:terrain[m.id]||{},construction:{assets:[]},tradeEconomy:{},settlements:{principalId:null,places:[]},
};});
const seas=seaMeta.map(s=>({id:s.id,name:s.name,centroid:s.centroid||[0,0],adjacentLand:s.adjacentLand||[]}));
const graph=buildWorldSpatialGraph(regions,seas,{seed:'sim-world-spatial-v1'});
const serialiseMap=(map)=>[...map.values()];
// Only immutable geography belongs here. Human infrastructure is overlaid at runtime.
const output={
  version:1,
  seed:graph.seed,
  generatedFrom:'regions.geo.json + regions.meta.json + seaRegions.meta.json + terrain.initial.json + resources.initial.json',
  anchors:serialiseMap(graph.anchors),
  rivers:serialiseMap(graph.corridors).filter(x=>x.type==='river'),
};
fs.writeFileSync(new URL('data/world/spatial.base.json',root),JSON.stringify(output));
console.log(`wrote spatial.base.json: ${output.anchors.length} anchors, ${output.rivers.length} river systems`);
