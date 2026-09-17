import { operationalInfrastructure } from '../economy/construction.js?v=20260905-projects1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const TELEGRAPH_TECH_ID = 'electrical_telegraphy';

export function hasOperationalTelegraph(region) {
  if (!region?.unlockedTechIds?.has?.(TELEGRAPH_TECH_ID)) return false;
  return operationalInfrastructure(region, 'telegraph_network').length > 0;
}

export function telegraphPath(origin, target, regionsById, maxHops = 80) {
  if (!origin || !target) return null;
  if (origin.id === target.id) return [origin.id];
  if (!hasOperationalTelegraph(origin) || !hasOperationalTelegraph(target)) return null;
  const queue = [[origin.id]];
  const seen = new Set([origin.id]);
  while (queue.length) {
    const path = queue.shift();
    if (path.length > maxHops + 1) continue;
    const here = regionsById.get(path[path.length - 1]);
    for (const nextId of here?.neighbors || []) {
      if (seen.has(nextId)) continue;
      const next = regionsById.get(nextId);
      if (!next || !hasOperationalTelegraph(next)) continue;
      const nextPath = [...path, nextId];
      if (nextId === target.id) return nextPath;
      seen.add(nextId);
      queue.push(nextPath);
    }
  }
  return null;
}

export function telegraphRouteBetween(origin, target, regionsById) {
  const path = telegraphPath(origin, target, regionsById);
  if (!path) return null;
  const intermediateStations = Math.max(0, path.length - 2);
  const lineCondition = path.reduce((sum, id) => {
    const region = regionsById.get(id);
    const assets = operationalInfrastructure(region, 'telegraph_network');
    const best = assets.reduce((m, a) => Math.max(m, clamp(a.condition ?? 1)), 0);
    return sum + best;
  }, 0) / Math.max(1, path.length);
  return {
    mode: 'telegraph',
    regionIds: path,
    days: Math.max(0.05, 0.08 + intermediateStations * 0.03 + (1 - lineCondition) * 0.8),
    lineCondition,
    stationCount: path.length,
  };
}

export function telegraphInterceptRisk(route, regionsById, senderActorId, targetActorId) {
  if (route?.mode !== 'telegraph') return 0;
  let risk = 0.015;
  for (const id of (route.regionIds || []).slice(1, -1)) {
    const region = regionsById.get(id);
    if (!region) continue;
    const controller = region.governance?.sovereignPolityId || region.controllingActorId || region.id;
    if (controller !== senderActorId && controller !== targetActorId) risk += 0.035;
    risk += (1 - clamp(region.safetyRating ?? 1)) * 0.025;
  }
  return clamp(risk, 0, 0.45);
}

export function telegraphDeliveryTicks(route) {
  return route?.mode === 'telegraph' ? 0 : Math.max(1, Math.ceil((route?.days || 0) / 7));
}
