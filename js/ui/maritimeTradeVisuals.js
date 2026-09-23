const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function hash01(text) {
  let h = 2166136261;
  for (const ch of String(text || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function geoDistance(a, b) {
  const rad = Math.PI / 180;
  const lat1 = Number(a?.[1]) * rad;
  const lat2 = Number(b?.[1]) * rad;
  const dLat = lat2 - lat1;
  const dLon = (Number(b?.[0]) - Number(a?.[0])) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(Math.max(0, s)), Math.sqrt(Math.max(0, 1 - s)));
}

function buildSeaGraph(seas) {
  const graph = new Map(seas.map((sea) => [sea.id, new Set()]));
  for (const sea of seas) {
    const nearest = seas
      .filter((other) => other.id !== sea.id)
      .map((other) => ({ id: other.id, distance: geoDistance(sea.centroid, other.centroid) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);
    for (const candidate of nearest) {
      graph.get(sea.id).add(candidate.id);
      graph.get(candidate.id)?.add(sea.id);
    }
  }
  return graph;
}

function shortestSeaPath(startIds, targetIds, seaById, graph) {
  const targets = new Set(targetIds);
  const frontier = [];
  const distance = new Map();
  const previous = new Map();
  for (const id of startIds) {
    if (!seaById.has(id)) continue;
    distance.set(id, 0);
    frontier.push(id);
  }
  let found = null;
  while (frontier.length) {
    frontier.sort((a, b) => (distance.get(a) || Infinity) - (distance.get(b) || Infinity));
    const current = frontier.shift();
    if (targets.has(current)) { found = current; break; }
    const currentSea = seaById.get(current);
    for (const next of graph.get(current) || []) {
      const nextSea = seaById.get(next);
      if (!currentSea || !nextSea) continue;
      const candidate = (distance.get(current) || 0) + geoDistance(currentSea.centroid, nextSea.centroid);
      if (candidate >= (distance.get(next) ?? Infinity)) continue;
      distance.set(next, candidate);
      previous.set(next, current);
      if (!frontier.includes(next)) frontier.push(next);
    }
  }
  if (!found) return [];
  const path = [found];
  while (previous.has(path[0])) path.unshift(previous.get(path[0]));
  return path;
}

function pointAlongPolyline(points, t) {
  if (points.length < 2) return points[0] || null;
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const length = Math.hypot(dx, dy);
    lengths.push(length);
    total += length;
  }
  let remaining = clamp01(t) * Math.max(1e-6, total);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining > lengths[i]) { remaining -= lengths[i]; continue; }
    const ratio = lengths[i] > 0 ? remaining / lengths[i] : 0;
    return [
      points[i][0] + (points[i + 1][0] - points[i][0]) * ratio,
      points[i][1] + (points[i + 1][1] - points[i][1]) * ratio,
    ];
  }
  return points[points.length - 1];
}

function projectedSeaRoute(map, origin, dest, cache, seaById, graph) {
  const key = `${origin.id}>${dest.id}`;
  if (cache.has(key)) return cache.get(key);
  const starts = origin.adjacentSeaIds || [];
  const ends = dest.adjacentSeaIds || [];
  const seaIds = shortestSeaPath(starts, ends, seaById, graph);
  if (!seaIds.length) {
    const fallback = [map.projection(origin.centroid), map.projection(dest.centroid)].filter(Boolean);
    cache.set(key, fallback);
    return fallback;
  }
  const seaPoints = seaIds.map((id) => map.projection(seaById.get(id)?.centroid)).filter(Boolean);
  const originCentre = map.projection(origin.centroid);
  const destCentre = map.projection(dest.centroid);
  if (!originCentre || !destCentre || !seaPoints.length) return [];
  const startSea = seaPoints[0];
  const endSea = seaPoints[seaPoints.length - 1];
  const originPort = [originCentre[0] * 0.65 + startSea[0] * 0.35, originCentre[1] * 0.65 + startSea[1] * 0.35];
  const destPort = [destCentre[0] * 0.65 + endSea[0] * 0.35, destCentre[1] * 0.65 + endSea[1] * 0.35];
  const points = [originPort, ...seaPoints, destPort];
  cache.set(key, points);
  return points;
}

export function installMaritimeTradeVisuals(map) {
  if (!map || map.__maritimeTradeVisualsInstalled) return false;
  map.__maritimeTradeVisualsInstalled = true;
  const seaById = new Map((map.seaRegions || []).map((sea) => [sea.id, sea]));
  const graph = buildSeaGraph(map.seaRegions || []);
  const routeCache = new Map();
  const resourceColors = {
    food: '#d7bc68', wood: '#6d9d64', copper: '#c8754f', tin: '#b8c5c9', bronze: '#c08a4e',
    iron: '#87909a', pottery: '#b56f56', textiles: '#9c76b7', pitch: '#57525b',
    basic_boat: '#6ea4b5', advanced_boat: '#8bc4d4',
  };

  map._drawTradeOverlay = function drawTradeOverlay(now = performance.now()) {
    const ctx = this.ctx;
    const k = this.transform.k;
    const u = 1 / k;
    const routes = this._tradeRoutes();
    const maxRoutes = k < 2 ? 90 : 180;
    for (const { origin, dest, venture } of routes.slice(0, maxRoutes)) {
      const points = venture.transportMode === 'sea'
        ? projectedSeaRoute(this, origin, dest, routeCache, seaById, graph)
        : [this.projection(origin.centroid), this.projection(dest.centroid)].filter(Boolean);
      if (points.length < 2) continue;
      const color = resourceColors[venture.resource] || '#d6c49c';
      const merchants = Math.max(1, Number(venture.merchants) || 1);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.28 + clamp01(venture.reliability) * 0.42;
      ctx.lineWidth = Math.min(5, 0.8 + Math.sqrt(merchants) * 0.22) * u;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.stroke();

      const phase = (hash01(venture.id || `${origin.id}:${dest.id}`) + now / 5500) % 1;
      const outward = venture.arrived ? 1 - phase : phase;
      const position = pointAlongPolyline(points, outward);
      if (!position) continue;
      ctx.globalAlpha = 0.95;
      if (venture.transportMode === 'sea') {
        const advancedShare = (origin.tradeEconomy?.advancedMerchantBoats || 0) /
          Math.max(1, origin.tradeEconomy?.merchantBoats || 1);
        this._drawBoat(position[0], position[1], 1.8 * u, advancedShare > 0.35);
      } else {
        ctx.fillStyle = color;
        const s = 2.2 * u;
        ctx.fillRect(position[0] - s, position[1] - s * 0.65, s * 2, s * 1.3);
        ctx.beginPath();
        ctx.arc(position[0] - s * 0.55, position[1] + s, s * 0.38, 0, Math.PI * 2);
        ctx.arc(position[0] + s * 0.55, position[1] + s, s * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };
  return true;
}
