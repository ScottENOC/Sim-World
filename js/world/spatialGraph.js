import { syncInfrastructureSpatialSites } from './infrastructureSites.js?v=20260913-infrastructure1';

// Persistent shared geography for regional zoom and subregional movement.
// Physical/human features are generated from the whole world at once. Rendering
// may be local/on-demand, but neighbouring regions always reference the same
// border, river and route anchors.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function hash01(text = '') {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function pointDistance(a, b) {
  const dx = (a?.[0] || 0) - (b?.[0] || 0);
  const dy = (a?.[1] || 0) - (b?.[1] || 0);
  return Math.hypot(dx, dy);
}

function ringsFor(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates || [];
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).flat();
  return [];
}

function boundaryPoints(region) {
  const points = [];
  for (const ring of ringsFor(region?.feature)) for (const p of ring || []) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) points.push([p[0], p[1]]);
  }
  return points.length ? points : [region?.centroid || [0, 0]];
}

function canonicalPair(a, b) { return String(a) < String(b) ? [a, b] : [b, a]; }
function borderId(a, b) { const [x, y] = canonicalPair(a, b); return `border:${x}|${y}`; }

function sharedBoundaryPoint(a, b) {
  const aa = boundaryPoints(a), bb = boundaryPoints(b);
  const exact = new Map(aa.map((p) => [`${p[0].toFixed(6)},${p[1].toFixed(6)}`, p]));
  const shared = [];
  for (const p of bb) { const hit = exact.get(`${p[0].toFixed(6)},${p[1].toFixed(6)}`); if (hit) shared.push(hit); }
  if (shared.length) {
    return [shared.reduce((s,p)=>s+p[0],0)/shared.length, shared.reduce((s,p)=>s+p[1],0)/shared.length];
  }
  let bestA = aa[0], bestB = bb[0], best = Infinity;
  // Full vertex products are still small for adjacent simplified administrative polygons.
  for (const pa of aa) for (const pb of bb) {
    const d = pointDistance(pa, pb);
    if (d < best) { best = d; bestA = pa; bestB = pb; }
  }
  return [(bestA[0] + bestB[0]) / 2, (bestA[1] + bestB[1]) / 2];
}

function nearestBoundaryPoint(region, target) {
  return boundaryPoints(region).reduce((best, p) => pointDistance(p, target) < pointDistance(best, target) ? p : best);
}

function actorId(region) { return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id; }

function roadSignal(region) {
  const assets = region?.construction?.assets || [];
  const built = assets.filter(a => ['road_network','bridge','ford'].includes(a.typeId) && (a.condition ?? 1) > 0.2).length;
  const trade = Math.log1p(Math.max(0, region?.tradeEconomy?.exportIncomeEma || 0) + Math.max(0, region?.tradeEconomy?.importSpendEma || 0));
  return clamp(0.12 + built * 0.22 + trade * 0.035 + Math.log1p(Math.max(0, region?.population || 0)) * 0.018);
}

function wetnessSignal(region) {
  const t = region?.terrain || {};
  return clamp((t.wetland || 0) * 0.55 + (t.forest || 0) * 0.15 + (region?.landQuality || 0.5) * 0.25 + 0.08);
}

function sitePoint(region, key, pullPoints = []) {
  const c = region?.centroid || [0, 0];
  if (!pullPoints.length) return [...c];
  const p = pullPoints[Math.floor(hash01(`${region.id}:${key}:pull`) * pullPoints.length) % pullPoints.length];
  const f = 0.18 + hash01(`${region.id}:${key}:f`) * 0.34;
  return [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f];
}

function coastPoint(region, seaById) {
  const seas = (region?.adjacentSeaIds || []).map(id => seaById.get(id)).filter(Boolean);
  if (!seas.length) return nearestBoundaryPoint(region, region?.centroid || [0,0]);
  const target = [seas.reduce((s,x)=>s+x.centroid[0],0)/seas.length, seas.reduce((s,x)=>s+x.centroid[1],0)/seas.length];
  return nearestBoundaryPoint(region, target);
}

function coastDistances(regions) {
  const byId = new Map(regions.map(r => [r.id, r]));
  const dist = new Map();
  const q = [];
  for (const r of regions) if (r.isCoastal) { dist.set(r.id, 0); q.push(r.id); }
  while (q.length) {
    const id = q.shift(), d = dist.get(id);
    for (const n of byId.get(id)?.neighbors || []) if (byId.has(n) && !dist.has(n)) { dist.set(n, d + 1); q.push(n); }
  }
  return dist;
}

function chooseDownstream(region, byId, coastDist, used = new Set()) {
  const d = coastDist.get(region.id) ?? Infinity;
  const candidates = (region.neighbors || []).map(id => byId.get(id)).filter(Boolean)
    .filter(n => (coastDist.get(n.id) ?? Infinity) < d && !used.has(n.id));
  if (!candidates.length) return null;
  return candidates.sort((a,b) => {
    const da = coastDist.get(a.id) ?? 999, db = coastDist.get(b.id) ?? 999;
    if (da !== db) return da - db;
    const sa = wetnessSignal(a) + hash01(`${region.id}>${a.id}`) * 0.12;
    const sb = wetnessSignal(b) + hash01(`${region.id}>${b.id}`) * 0.12;
    return sb - sa;
  })[0];
}

function makeRiver(graph, source, byId, coastDist, seaById, index) {
  const path = [source.id], used = new Set(path);
  let current = source;
  while (!current.isCoastal && path.length < 18) {
    const next = chooseDownstream(current, byId, coastDist, used);
    if (!next) break;
    path.push(next.id); used.add(next.id); current = next;
  }
  if (path.length < 2 || !current.isCoastal) return null;
  const points = [{ id:`river:${index}:source`, point:sitePoint(source, `river:${index}:source`, [...graph.regionAnchorPoints(source.id)]), regionIds:[source.id] }];
  for (let i=0; i<path.length-1; i++) {
    const id = borderId(path[i], path[i+1]);
    const a = graph.anchors.get(id);
    if (!a) return null;
    points.push({ id, point:[a.lon,a.lat], regionIds:[path[i],path[i+1]] });
  }
  const mouth = coastPoint(current, seaById);
  points.push({ id:`river:${index}:mouth`, point:mouth, regionIds:[current.id] });
  const regionSegments = [];
  for (let i=0; i<path.length; i++) regionSegments.push({ regionId:path[i], from:points[i].point, to:points[i+1].point, fromId:points[i].id, toId:points[i+1].id });
  return { id:`river:${index}`, type:'river', name:`${source.name} river system`, regionIds:path, points, regionSegments,
    strength:clamp(0.35 + wetnessSignal(source) * 0.5 + path.length * 0.025) };
}

export function buildWorldSpatialGraph(regions = [], seaRegions = [], options = {}) {
  const byId = new Map(regions.map(r => [r.id, r]));
  const seaById = new Map(seaRegions.map(s => [s.id, s]));
  const graph = {
    version: 1, seed: options.seed || 'sim-world-spatial-v1', anchors:new Map(), sites:new Map(), corridors:new Map(), regionIndex:new Map(),
    regionAnchorPoints(regionId) {
      const idx = this.regionIndex.get(regionId); if (!idx) return [];
      return [...idx.anchorIds].map(id => this.anchors.get(id)).filter(Boolean).map(a => [a.lon,a.lat]);
    },
  };
  for (const r of regions) graph.regionIndex.set(r.id, { anchorIds:new Set(), siteIds:new Set(), corridorIds:new Set() });

  // One canonical object per shared border. Both sides reference this exact anchor.
  for (const a of regions) for (const bId of a.neighbors || []) {
    const b = byId.get(bId); if (!b) continue;
    const id = borderId(a.id, b.id); if (graph.anchors.has(id)) continue;
    const p = sharedBoundaryPoint(a,b);
    const [ra,rb] = canonicalPair(a.id,b.id);
    graph.anchors.set(id,{id,type:'border_crossing',lon:p[0],lat:p[1],regionIds:[ra,rb]});
    graph.regionIndex.get(a.id)?.anchorIds.add(id); graph.regionIndex.get(b.id)?.anchorIds.add(id);
  }
  for (const r of regions) if (r.isCoastal) {
    const p=coastPoint(r,seaById), id=`coast:${r.id}`;
    graph.anchors.set(id,{id,type:'coast',lon:p[0],lat:p[1],regionIds:[r.id],seaIds:[...(r.adjacentSeaIds||[])]});
    graph.regionIndex.get(r.id)?.anchorIds.add(id);
  }

  // Principal settlements are world-positioned once. They survive political changes.
  for (const r of regions) {
    const existing = r.settlements?.places?.find(p => p.id === r.settlements?.principalId)?.location;
    const p = existing && Number.isFinite(existing.lon) ? [existing.lon,existing.lat] : sitePoint(r,'principal',graph.regionAnchorPoints(r.id));
    const site={id:`${r.id}:principal`,type:'principal_settlement',name:r.settlements?.places?.find(x=>x.id===r.settlements?.principalId)?.name||r.name,
      lon:p[0],lat:p[1],regionId:r.id,persistent:true,controllerActorId:actorId(r)};
    graph.sites.set(site.id,site); graph.regionIndex.get(r.id)?.siteIds.add(site.id);
  }

  // Every land adjacency has a persistent transport corridor through the SAME border anchor.
  for (const a of regions) for (const bId of a.neighbors || []) {
    const b=byId.get(bId); if(!b || String(a.id)>String(b.id)) continue;
    const anchor=graph.anchors.get(borderId(a.id,b.id)); if(!anchor) continue;
    const sa=graph.sites.get(`${a.id}:principal`), sb=graph.sites.get(`${b.id}:principal`);
    const id=`route:${a.id}|${b.id}`;
    graph.corridors.set(id,{id,type:'land_route',regionIds:[a.id,b.id],anchorId:anchor.id,
      points:[[sa.lon,sa.lat],[anchor.lon,anchor.lat],[sb.lon,sb.lat]], quality:Math.min(roadSignal(a),roadSignal(b))});
    graph.regionIndex.get(a.id)?.corridorIds.add(id); graph.regionIndex.get(b.id)?.corridorIds.add(id);
  }

  const coastDist=coastDistances(regions);
  let sources;
  if (Array.isArray(options.riverSourceIds)) sources=options.riverSourceIds.map(id=>byId.get(id)).filter(Boolean);
  else {
    sources=regions.filter(r => (coastDist.get(r.id) ?? 0)>=2 && hash01(`${graph.seed}:river-source:${r.id}`) < 0.10 + wetnessSignal(r)*0.055)
      .sort((a,b)=>(coastDist.get(b.id)||0)-(coastDist.get(a.id)||0)).slice(0, Math.max(6,Math.min(48,Math.round(regions.length/15))));
  }
  let riverIndex=1;
  for(const source of sources){ const river=makeRiver(graph,source,byId,coastDist,seaById,riverIndex++); if(!river) continue;
    graph.corridors.set(river.id,river); for(const id of river.regionIds) graph.regionIndex.get(id)?.corridorIds.add(river.id); }

  return graph;
}

function addSite(graph, region, place, point, type = place.kind) {
  const existing=graph.sites.get(place.id);
  const site=existing || {id:place.id,persistent:true};
  Object.assign(site,{type,name:place.name,lon:point[0],lat:point[1],regionId:region.id,sourcePlaceId:place.id,
    controllerActorId:place.controllerActorId,garrisonActorId:place.garrisonActorId||null,garrisonPersonnel:place.garrisonPersonnel||0,
    population:Math.max(0,place.population||0),settlementStatus:place.status||place.settlementStatus||null,fame:place.fame||0});
  graph.sites.set(site.id,site); graph.regionIndex.get(region.id)?.siteIds.add(site.id);
  place.location={lon:site.lon,lat:site.lat}; place.spatialSiteId=site.id;
  return site;
}

export function syncRegionSpatialSites(graph, region, places = []) {
  if (!graph?.regionIndex?.has(region?.id)) return [];
  const anchors=graph.regionAnchorPoints(region.id), principal=graph.sites.get(`${region.id}:principal`);
  const used=[];
  const settlementById=new Map((region.settlements?.places||[]).map((settlement)=>[settlement.id,settlement]));
  const mergedPlaces=new Map(settlementById);
  for(const place of places){
    const settlement=mergedPlaces.get(place.id);
    mergedPlaces.set(place.id,settlement?{...place,...settlement,controllerActorId:place.controllerActorId,garrisonActorId:place.garrisonActorId,garrisonPersonnel:place.garrisonPersonnel}:place);
  }
  const pullPoints=[...anchors];
  const idx=graph.regionIndex.get(region.id);
  for(const corridorId of idx?.corridorIds||[]){
    const corridor=graph.corridors.get(corridorId);
    if(corridor?.type==='river') for(const segment of corridor.regionSegments||[]) if(segment.regionId===region.id) pullPoints.push(segment.from,segment.to);
    if(corridor?.type==='land_route'&&corridor.anchorId){const a=graph.anchors.get(corridor.anchorId);if(a)pullPoints.push([a.lon,a.lat]);}
  }
  const coast=graph.anchors.get(`coast:${region.id}`);if(coast)pullPoints.push([coast.lon,coast.lat]);
  for(const place of mergedPlaces.values()){
    let point;
    if(place.location && Number.isFinite(place.location.lon)) point=[place.location.lon,place.location.lat];
    else if(place.isPrincipal||place.id===region.settlements?.principalId) point=[principal.lon,principal.lat];
    else if(place.kind==='port' && graph.anchors.has(`coast:${region.id}`)){const a=graph.anchors.get(`coast:${region.id}`);point=[a.lon,a.lat];}
    else point=sitePoint(region,place.id,pullPoints.length?pullPoints:[[principal.lon,principal.lat]]);
    const displayType=(place.status&&place.status!=='active')?'ruins':place.kind;
    const site=addSite(graph,region,place,point,displayType);used.push(site);
    const settlement=settlementById.get(place.id);
    if(settlement){settlement.location={lon:site.lon,lat:site.lat};settlement.spatialSiteId=site.id;}
    const controlPlace=places.find((candidate)=>candidate.id===place.id);
    if(controlPlace){controlPlace.location={lon:site.lon,lat:site.lat};controlPlace.spatialSiteId=site.id;}
  }
  const settlement=region.settlements?.places?.find(p=>p.id===region.settlements?.principalId);
  if(settlement && principal){settlement.location={lon:principal.lon,lat:principal.lat}; settlement.spatialSiteId=principal.id;}

  // Major extraction and monuments are also canonical sites, not render-time decoration.
  const productive=Object.entries(region.deposits||{}).filter(([k,d])=>k!=='clay' && d?.tiers?.some(t=>(t.remainingStock||0)>0));
  productive.slice(0,4).forEach(([resource],i)=>{
    const id=`${region.id}:deposit:${resource}`; const old=graph.sites.get(id); const point=old?[old.lon,old.lat]:sitePoint(region,id,anchors);
    const site={id,type:'mine',name:`${resource} workings`,resource,lon:point[0],lat:point[1],regionId:region.id,persistent:true};
    graph.sites.set(id,site);graph.regionIndex.get(region.id).siteIds.add(id);used.push(site);
  });
  const infrastructure=syncInfrastructureSpatialSites(graph,region);
  used.push(...infrastructure.sites);
  return used;
}

export function spatialFeaturesForRegion(graph, regionId) {
  const idx=graph?.regionIndex?.get(regionId); if(!idx) return {anchors:[],sites:[],corridors:[]};
  return { anchors:[...idx.anchorIds].map(id=>graph.anchors.get(id)).filter(Boolean),
    sites:[...idx.siteIds].map(id=>graph.sites.get(id)).filter(Boolean),
    corridors:[...idx.corridorIds].map(id=>graph.corridors.get(id)).filter(Boolean) };
}

export function spatialDistance(a,b){return pointDistance([a?.lon,a?.lat],[b?.lon,b?.lat]);}
