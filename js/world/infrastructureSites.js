// Durable spatial representation for completed construction assets.
// The construction asset remains the authoritative simulation object; this
// module gives it a stable site/corridor in the shared spatial graph and writes
// the chosen coordinate back to the asset so save/load preserves the place.

const COASTAL = new Set(['harbour','shipyard','naval_base','coastal_fortifications','lighthouse','dry_dock']);
const EXTRACTION = new Set(['state_quarry','deep_mine','mine_drainage']);
const URBAN = new Set([
  'wells_cisterns','settlement_walls','urban_drainage','public_granary','royal_arsenal','drill_ground',
  'market_customs','mint','administrative_centre','great_temple','ceremonial_complex','monumental_statue','monumental_tomb'
]);
const LINEAR = new Set(['road_network','irrigation','aqueduct','canal','relay_stations']);

function hash01(text='') {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function point(site) {
  return site && Number.isFinite(site.lon) && Number.isFinite(site.lat) ? [site.lon, site.lat] : null;
}

function choose(list, key) {
  if (!list.length) return null;
  return list[Math.floor(hash01(key) * list.length) % list.length];
}

function blend(a, b, f) {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

function infrastructureName(typeId) {
  return String(typeId || 'infrastructure').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function siteType(typeId) {
  if (['harbour','shipyard','naval_base','dry_dock'].includes(typeId)) return typeId;
  if (['state_quarry','deep_mine','mine_drainage'].includes(typeId)) return 'industrial_site';
  if (['hill_fort','coastal_fortifications','settlement_walls','watchtowers'].includes(typeId)) return 'fortification';
  if (['great_temple','ceremonial_complex','monumental_statue','monumental_tomb'].includes(typeId)) return typeId;
  return 'infrastructure';
}

function candidatePoints(graph, region) {
  const index = graph.regionIndex?.get(region.id);
  const anchors = [...(index?.anchorIds || [])].map(id => graph.anchors.get(id)).map(point).filter(Boolean);
  const principal = point(graph.sites.get(`${region.id}:principal`)) || region.centroid || [0,0];
  const coast = point(graph.anchors.get(`coast:${region.id}`));
  const mines = [...(index?.siteIds || [])].map(id => graph.sites.get(id)).filter(s => s?.type === 'mine').map(point).filter(Boolean);
  const rivers = [];
  for (const id of index?.corridorIds || []) {
    const c = graph.corridors.get(id);
    if (c?.type === 'river') for (const seg of c.regionSegments || []) if (seg.regionId === region.id) rivers.push(seg.from, seg.to);
    if (c?.type === 'land_route' && c.anchorId) {
      const p = point(graph.anchors.get(c.anchorId)); if (p) anchors.push(p);
    }
  }
  return { anchors, principal, coast, mines, rivers };
}

function chooseAssetPoint(graph, region, asset, candidates) {
  if (asset.location && Number.isFinite(asset.location.lon) && Number.isFinite(asset.location.lat)) {
    return [asset.location.lon, asset.location.lat];
  }
  const key = `${region.id}:${asset.id || asset.typeId}`;
  const centroid = region.centroid || candidates.principal;
  if (COASTAL.has(asset.typeId) && candidates.coast) {
    // Harbour-family assets share the coast but do not sit on top of one another.
    return blend(candidates.coast, candidates.principal, 0.035 + hash01(`${key}:coast`) * 0.11);
  }
  if (EXTRACTION.has(asset.typeId) && candidates.mines.length) {
    const mine = choose(candidates.mines, `${key}:mine`);
    return blend(mine, centroid, 0.025 + hash01(`${key}:mine-offset`) * 0.07);
  }
  if (URBAN.has(asset.typeId)) {
    const pull = choose(candidates.anchors.length ? candidates.anchors : [centroid], `${key}:urban`);
    return blend(candidates.principal, pull, 0.055 + hash01(`${key}:urban-offset`) * 0.13);
  }
  const pulls = [...candidates.anchors, ...candidates.rivers];
  const pull = choose(pulls.length ? pulls : [candidates.principal], `${key}:rural`);
  return blend(centroid, pull, 0.22 + hash01(`${key}:rural-offset`) * 0.34);
}

function upsertAssetSite(graph, region, asset, location) {
  const id = asset.spatialSiteId || `${region.id}:asset:${asset.id || asset.typeId}`;
  const existing = graph.sites.get(id) || { id, persistent:true };
  Object.assign(existing, {
    type: siteType(asset.typeId),
    infrastructureType: asset.typeId,
    name: asset.name || infrastructureName(asset.typeId),
    lon: location[0], lat: location[1], regionId: region.id,
    constructionAssetId: asset.id || null,
    condition: asset.condition ?? 1,
    scale: asset.scale || 1,
    dedicatedReligionId: asset.dedicatedReligionId || null,
  });
  graph.sites.set(id, existing);
  graph.regionIndex.get(region.id)?.siteIds.add(id);
  asset.location = { lon:location[0], lat:location[1] };
  asset.spatialSiteId = id;
  return existing;
}

function upsertLinearAsset(graph, region, asset, candidates) {
  const id = asset.spatialCorridorId || `${region.id}:asset-corridor:${asset.id || asset.typeId}`;
  let points;
  if (Array.isArray(asset.spatialPoints) && asset.spatialPoints.length >= 2) points = asset.spatialPoints.map(p => [...p]);
  else {
    const endpoints = [...candidates.anchors, ...candidates.rivers];
    const a = choose(endpoints.length ? endpoints : [candidates.principal], `${id}:a`);
    let b = choose(endpoints.length ? endpoints : [region.centroid || candidates.principal], `${id}:b`);
    if (a && b && a[0] === b[0] && a[1] === b[1]) b = candidates.principal;
    if (asset.typeId === 'aqueduct') points = [a || candidates.principal, candidates.principal];
    else if (asset.typeId === 'canal' && candidates.rivers.length) points = [choose(candidates.rivers, `${id}:river`) || a, candidates.principal];
    else points = [candidates.principal, a || region.centroid || candidates.principal, b || candidates.principal];
    asset.spatialPoints = points.map(p => [...p]);
  }
  const existing = graph.corridors.get(id) || { id, persistent:true };
  Object.assign(existing, {
    type:'infrastructure_route', infrastructureType:asset.typeId, regionIds:[region.id], points,
    name:asset.name || infrastructureName(asset.typeId), condition:asset.condition ?? 1, scale:asset.scale || 1,
    quality:Math.max(0, Math.min(1, asset.condition ?? 1)), constructionAssetId:asset.id || null,
  });
  graph.corridors.set(id, existing);
  graph.regionIndex.get(region.id)?.corridorIds.add(id);
  asset.spatialCorridorId = id;
  return existing;
}

export function syncInfrastructureSpatialSites(graph, region) {
  if (!graph?.regionIndex?.has(region?.id)) return { sites:[], corridors:[] };
  const assets = region.construction?.assets || [];
  const candidates = candidatePoints(graph, region);
  const sites = [], corridors = [];
  for (const asset of assets) {
    if (!asset?.typeId) continue;
    if (LINEAR.has(asset.typeId)) {
      corridors.push(upsertLinearAsset(graph, region, asset, candidates));
      continue;
    }
    sites.push(upsertAssetSite(graph, region, asset, chooseAssetPoint(graph, region, asset, candidates)));
  }
  return { sites, corridors };
}
