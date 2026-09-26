import fs from 'node:fs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function idOfFeature(feature) {
  return String(feature?.id ?? feature?.properties?.id ?? feature?.properties?.regionId ?? feature?.properties?.region_id ?? feature?.properties?.name ?? '');
}

function flattenCoordinates(value, out = []) {
  if (!Array.isArray(value)) return out;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    out.push([Number(value[0]), Number(value[1])]);
    return out;
  }
  for (const child of value) flattenCoordinates(child, out);
  return out;
}

function bbox(feature) {
  const pts = flattenCoordinates(feature?.geometry?.coordinates);
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY].map((n) => Number(n.toFixed(4)));
}

function rings(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInFeature(point, feature) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates;
    return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(([outer, ...holes]) => pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));
  }
  return false;
}

function segmentKey(a, b) {
  const norm = ([x, y]) => `${Number(x).toFixed(5)},${Number(y).toFixed(5)}`;
  const aa = norm(a), bb = norm(b);
  return aa < bb ? `${aa}|${bb}` : `${bb}|${aa}`;
}

function segmentLengthKm(a, b) {
  const rad = Math.PI / 180;
  const lat = ((a[1] + b[1]) / 2) * rad;
  const dx = (b[0] - a[0]) * 111.32 * Math.cos(lat);
  const dy = (b[1] - a[1]) * 110.57;
  return Math.hypot(dx, dy);
}

function featureSegments(feature) {
  const segs = new Map();
  for (const ring of rings(feature)) {
    for (let i = 1; i < ring.length; i++) {
      segs.set(segmentKey(ring[i - 1], ring[i]), [ring[i - 1], ring[i]]);
    }
  }
  return segs;
}

function sharedExactBorderKm(a, b) {
  const aa = featureSegments(a);
  const bb = featureSegments(b);
  let km = 0;
  let count = 0;
  for (const [key, [p, q]] of aa) {
    if (!bb.has(key)) continue;
    km += segmentLengthKm(p, q);
    count += 1;
  }
  return { km: Number(km.toFixed(2)), exactSegments: count };
}

function regionName(meta) {
  return String(meta?.name ?? meta?.displayName ?? meta?.label ?? meta?.id ?? '');
}

function loadMap(label, base) {
  const metaDoc = readJson(`${base}/regions.meta.json`);
  const geoDoc = readJson(`${base}/regions.geo.json`);
  const metas = Array.isArray(metaDoc) ? metaDoc : (metaDoc.regions || []);
  const features = geoDoc.features || [];
  const metaById = new Map(metas.map((r) => [String(r.id), r]));
  const featureById = new Map(features.map((f) => [idOfFeature(f), f]));
  return { label, metas, features, metaById, featureById };
}

function audit(map) {
  console.log(`\n=== ${map.label} ===`);
  console.log(`regions meta=${map.metas.length}, geo=${map.features.length}`);

  const interesting = /(crime|ukrain|finland|ostrob|fennoscand|shield|turku|oulu)/i;
  const named = map.metas.filter((m) => interesting.test(`${m.id} ${regionName(m)}`));
  console.log('Named matches:');
  for (const m of named) {
    const f = map.featureById.get(String(m.id));
    console.log(JSON.stringify({ id: m.id, name: regionName(m), centroid: m.centroid ?? null, bbox: bbox(f), meta: m }));
  }

  const probes = [
    ['Crimea centre', [34.1, 45.3]],
    ['Simferopol', [34.1003, 44.9521]],
    ['Sevastopol', [33.5224, 44.6167]],
    ['Turku / Finland Proper', [22.2666, 60.4518]],
    ['Tampere / inland south Finland', [23.7610, 61.4978]],
    ['Jyväskylä / central shield', [25.7482, 62.2426]],
    ['Oulu / Northern Ostrobothnia', [25.4651, 65.0121]],
    ['Kuusamo / east Northern Ostrobothnia', [29.1888, 65.9646]],
  ];
  console.log('Point ownership:');
  for (const [label, point] of probes) {
    const hits = map.features.filter((f) => pointInFeature(point, f)).map((f) => {
      const id = idOfFeature(f);
      const meta = map.metaById.get(id);
      return { id, name: regionName(meta || f.properties || { id }), bbox: bbox(f) };
    });
    console.log(JSON.stringify({ probe: label, point, hits }));
  }

  const finlandCandidates = map.features.filter((f) => {
    const b = bbox(f);
    if (!b) return false;
    const intersectsFinlandWindow = b[2] >= 19 && b[0] <= 32 && b[3] >= 59 && b[1] <= 70.5;
    if (!intersectsFinlandWindow) return false;
    const id = idOfFeature(f);
    const meta = map.metaById.get(id);
    return /finland|ostrob|fennoscand|shield|lapland|karelia|savonia/i.test(`${id} ${regionName(meta || {})}`) ||
      [[22.27,60.45],[23.76,61.50],[25.75,62.24],[25.47,65.01],[29.19,65.96]].some((p) => pointInFeature(p, f));
  });

  console.log('Finland candidate border matrix:');
  for (let i = 0; i < finlandCandidates.length; i++) {
    for (let j = i + 1; j < finlandCandidates.length; j++) {
      const a = finlandCandidates[i], b = finlandCandidates[j];
      const shared = sharedExactBorderKm(a, b);
      if (!shared.exactSegments) continue;
      const aid = idOfFeature(a), bid = idOfFeature(b);
      console.log(JSON.stringify({
        a: { id: aid, name: regionName(map.metaById.get(aid) || {}) },
        b: { id: bid, name: regionName(map.metaById.get(bid) || {}) },
        ...shared,
      }));
    }
  }
}

const maps = [
  loadMap('grand campaign world', 'data/world'),
  loadMap('fractured 2027 world', 'data/scenarios/fractured-2027/world'),
];

for (const map of maps) audit(map);
