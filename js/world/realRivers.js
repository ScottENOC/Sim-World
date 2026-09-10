// Hydrate committed real-world major river centrelines into the spatial graph.
// Region intersection is resolved once at world load; it is not tick work.

function pointInRing(point,ring=[]){
  const [x,y]=point; let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i]||[],[xj,yj]=ring[j]||[];
    if(!Number.isFinite(xi)||!Number.isFinite(yi)||!Number.isFinite(xj)||!Number.isFinite(yj))continue;
    const hit=((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi);
    if(hit)inside=!inside;
  }
  return inside;
}
function pointInGeometry(point,geometry){
  if(!geometry)return false;
  if(geometry.type==='Polygon')return (geometry.coordinates||[]).some(r=>pointInRing(point,r));
  if(geometry.type==='MultiPolygon')return (geometry.coordinates||[]).some(poly=>(poly||[]).some(r=>pointInRing(point,r)));
  return false;
}
function bboxFor(region){
  const pts=[]; const walk=x=>{if(!Array.isArray(x))return;if(typeof x[0]==='number')pts.push(x);else x.forEach(walk);};
  walk(region?.feature?.geometry?.coordinates||[]);
  if(!pts.length){const [x=0,y=0]=region?.centroid||[];return [x,y,x,y];}
  return [Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))];
}
function sqDist(a,b){const dx=(a?.[0]||0)-(b?.[0]||0),dy=(a?.[1]||0)-(b?.[1]||0);return dx*dx+dy*dy;}
function locateRegion(point,index){
  const candidates=index.filter(x=>point[0]>=x.bbox[0]&&point[0]<=x.bbox[2]&&point[1]>=x.bbox[1]&&point[1]<=x.bbox[3]);
  const containing=candidates.find(x=>pointInGeometry(point,x.region.feature.geometry));
  if(containing)return containing.region;
  // Simplified river lines can fall just outside simplified administrative
  // polygons/coasts. Prefer a nearby bbox candidate, then nearest centroid.
  const pool=candidates.length?candidates:index;
  return pool.reduce((best,x)=>!best||sqDist(x.region.centroid,point)<sqDist(best.centroid,point)?x.region:best,null);
}
function interpolate(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
function sampledSegments(points=[]){
  const out=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];
    // At most ~0.2 degrees between classification samples: this is one-time
    // load work and prevents long simplified chords skipping narrow regions.
    const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/0.2));
    for(let s=0;s<steps;s++)out.push([interpolate(a,b,s/steps),interpolate(a,b,(s+1)/steps)]);
  }
  return out;
}

export function hydrateRealRivers(graph,base,regions=[]){
  if(!graph||!Array.isArray(base?.rivers))return graph;
  const index=regions.map(region=>({region,bbox:bboxFor(region)}));
  const realTouched=new Set();
  for(const raw of base.rivers){
    const pieces=[];
    for(const [from,to] of sampledSegments(raw.points||[])){
      const mid=interpolate(from,to,0.5); const region=locateRegion(mid,index); if(!region)continue;
      const prev=pieces[pieces.length-1];
      if(prev?.regionId===region.id && Math.abs(prev.to[0]-from[0])<1e-9 && Math.abs(prev.to[1]-from[1])<1e-9)prev.to=to;
      else pieces.push({regionId:region.id,from,to});
    }
    const regionIds=[...new Set(pieces.map(p=>p.regionId))];
    if(!regionIds.length)continue;
    const river={...raw,type:'river',source:'real-world',regionIds,regionSegments:pieces,
      points:(raw.points||[]).map((point,i)=>({id:`${raw.id}:p${i}`,point:[...point],regionIds:[]}))};
    graph.corridors.set(river.id,river);
    for(const id of regionIds){graph.regionIndex.get(id)?.corridorIds.add(river.id);realTouched.add(id);}
  }
  // Procedural rivers remain useful coverage elsewhere. Where a real major river
  // now exists, remove procedural corridors touching that region to avoid a
  // second fictitious major river being drawn beside it.
  for(const [id,c] of [...graph.corridors]){
    if(c.type!=='river'||c.source==='real-world')continue;
    if((c.regionIds||[]).some(r=>realTouched.has(r))){
      graph.corridors.delete(id);
      for(const r of c.regionIds||[])graph.regionIndex.get(r)?.corridorIds.delete(id);
    }
  }
  return graph;
}
