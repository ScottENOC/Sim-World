// Runtime loader for immutable physical geography. Procedural fallback rivers
// and shared border/coast anchors live in spatial.base.json; selected real-world
// major river centrelines are committed separately and hydrated once at load.
import { hydrateRealRivers } from './realRivers.js?v=20260910-rivers1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function hash01(text = '') {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function roadSignal(region) {
  const assets = region?.construction?.assets || [];
  const built = assets.filter(a => ['road_network', 'bridge', 'ford'].includes(a.typeId) && (a.condition ?? 1) > 0.2).length;
  const trade = Math.log1p(Math.max(0, region?.tradeEconomy?.exportIncomeEma || 0) + Math.max(0, region?.tradeEconomy?.importSpendEma || 0));
  return clamp(0.12 + built * 0.22 + trade * 0.035 + Math.log1p(Math.max(0, region?.population || 0)) * 0.018);
}

function canonicalPair(a, b) { return String(a) < String(b) ? [a, b] : [b, a]; }
function borderId(a, b) { const [x, y] = canonicalPair(a, b); return `border:${x}|${y}`; }

function sitePoint(region, key, pullPoints = []) {
  const c = region?.centroid || [0, 0];
  if (!pullPoints.length) return [...c];
  const p = pullPoints[Math.floor(hash01(`${region.id}:${key}:pull`) * pullPoints.length) % pullPoints.length];
  const f = 0.18 + hash01(`${region.id}:${key}:f`) * 0.34;
  return [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f];
}

function actorId(region) { return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id; }

export function hydrateWorldSpatialGraph(base, regions = []) {
  if (!base || base.version !== 1 || !Array.isArray(base.anchors) || !Array.isArray(base.rivers)) {
    throw new Error('Invalid or unsupported spatial.base.json');
  }
  const byId = new Map(regions.map(r => [r.id, r]));
  const graph = {
    version: base.version,
    seed: base.seed,
    source: 'committed-base',
    anchors: new Map(),
    sites: new Map(),
    corridors: new Map(),
    regionIndex: new Map(),
    regionAnchorPoints(regionId) {
      const idx = this.regionIndex.get(regionId); if (!idx) return [];
      return [...idx.anchorIds].map(id => this.anchors.get(id)).filter(Boolean).map(a => [a.lon, a.lat]);
    },
  };
  for (const r of regions) graph.regionIndex.set(r.id, { anchorIds: new Set(), siteIds: new Set(), corridorIds: new Set() });

  for (const anchor of base.anchors) {
    graph.anchors.set(anchor.id, { ...anchor });
    for (const id of anchor.regionIds || []) graph.regionIndex.get(id)?.anchorIds.add(anchor.id);
  }
  for (const river of base.rivers) {
    const copy = {
      ...river,
      source: river.source || 'procedural',
      points: (river.points || []).map(p => ({ ...p, point: [...p.point] })),
      regionSegments: (river.regionSegments || []).map(s => ({ ...s, from: [...s.from], to: [...s.to] })),
    };
    graph.corridors.set(copy.id, copy);
    for (const id of copy.regionIds || []) graph.regionIndex.get(id)?.corridorIds.add(copy.id);
  }

  // Human geography is allowed to evolve, but its first spatial anchors use the
  // immutable physical skeleton. Political changes therefore never move rivers,
  // shared crossings, or already-spatialised settlements.
  for (const r of regions) {
    const existing = r.settlements?.places?.find(p => p.id === r.settlements?.principalId)?.location;
    const p = existing && Number.isFinite(existing.lon) ? [existing.lon, existing.lat] : sitePoint(r, 'principal', graph.regionAnchorPoints(r.id));
    const site = {
      id: `${r.id}:principal`, type: 'principal_settlement',
      name: r.settlements?.places?.find(x => x.id === r.settlements?.principalId)?.name || r.name,
      lon: p[0], lat: p[1], regionId: r.id, persistent: true, controllerActorId: actorId(r),
    };
    graph.sites.set(site.id, site); graph.regionIndex.get(r.id)?.siteIds.add(site.id);
  }

  for (const a of regions) for (const bId of a.neighbors || []) {
    const b = byId.get(bId); if (!b || String(a.id) > String(b.id)) continue;
    const anchor = graph.anchors.get(borderId(a.id, b.id)); if (!anchor) continue;
    const sa = graph.sites.get(`${a.id}:principal`), sb = graph.sites.get(`${b.id}:principal`);
    if (!sa || !sb) continue;
    const id = `route:${a.id}|${b.id}`;
    graph.corridors.set(id, {
      id, type: 'land_route', regionIds: [a.id, b.id], anchorId: anchor.id,
      points: [[sa.lon, sa.lat], [anchor.lon, anchor.lat], [sb.lon, sb.lat]],
      quality: Math.min(roadSignal(a), roadSignal(b)),
    });
    graph.regionIndex.get(a.id)?.corridorIds.add(id); graph.regionIndex.get(b.id)?.corridorIds.add(id);
  }
  return graph;
}

export async function loadWorldSpatialGraph(regions = []) {
  const [baseResponse, realRiverResponse] = await Promise.all([
    fetch('data/world/spatial.base.json?v=20260910-spatial1'),
    fetch('data/world/majorRivers.real.json?v=20260910-rivers1'),
  ]);
  if (!baseResponse.ok) throw new Error(`Failed to load immutable world geography (${baseResponse.status})`);
  if (!realRiverResponse.ok) throw new Error(`Failed to load real major rivers (${realRiverResponse.status})`);
  const graph = hydrateWorldSpatialGraph(await baseResponse.json(), regions);
  return hydrateRealRivers(graph, await realRiverResponse.json(), regions);
}
