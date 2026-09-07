#!/usr/bin/env python3
"""Idempotently integrate the maritime chokepoint graph into trade.js."""
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / 'js' / 'economy' / 'trade.js'
text = PATH.read_text()

IMPORT = "import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';"
if IMPORT not in text:
    anchor = "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';"
    if anchor not in text:
        raise RuntimeError('trade.js seamanship import anchor not found')
    text = text.replace(anchor, anchor + '\n' + IMPORT, 1)

old_geometry = """function routeGeometry(regionA, regionB) {
  if (!(regionA._routeGeometryCache instanceof Map)) regionA._routeGeometryCache = new Map();
  let geometry = regionA._routeGeometryCache.get(regionB.id);
  if (!geometry) {
    geometry = {
      adjacent: (regionA.neighbors || []).includes(regionB.id),
      sharedSea: sharesSea(regionA, regionB),
      distanceKm: centroidDistanceKm(regionA, regionB) ?? 500,
    };
    regionA._routeGeometryCache.set(regionB.id, geometry);
  }
  return geometry;
}
"""
new_geometry = """function routeGeometry(regionA, regionB) {
  if (!(regionA._routeGeometryCache instanceof Map)) regionA._routeGeometryCache = new Map();
  let geometry = regionA._routeGeometryCache.get(regionB.id);
  if (!geometry) {
    const maritime = maritimeRouteBetween(regionA, regionB);
    geometry = {
      adjacent: (regionA.neighbors || []).includes(regionB.id),
      sharedSea: Boolean(maritime),
      maritime,
      chokepointCount: maritime?.passageIds?.length || 0,
      distanceKm: centroidDistanceKm(regionA, regionB) ?? 500,
    };
    regionA._routeGeometryCache.set(regionB.id, geometry);
  }
  return geometry;
}
"""
if old_geometry in text:
    text = text.replace(old_geometry, new_geometry, 1)
elif new_geometry not in text:
    raise RuntimeError('trade.js routeGeometry anchor not found')

old_cost = """  if (geometry.sharedSea) {
    return SEA_COST_PER_KM * geometry.distanceKm * seaTransportProfile(regionA, regionB).costMultiplier;
  }
"""
new_cost = """  if (geometry.sharedSea) {
    const passageFactor = 1 + (geometry.maritime?.physicalFriction || 0);
    return SEA_COST_PER_KM * geometry.distanceKm * seaTransportProfile(regionA, regionB).costMultiplier * passageFactor;
  }
"""
if old_cost in text:
    text = text.replace(old_cost, new_cost, 1)
elif new_cost not in text:
    raise RuntimeError('trade.js routeCost sea anchor not found')

old_venture = """  if (seaRoute) {
    const sea = seaTransportProfile(origin, dest);
    if (geometry.distanceKm > sea.rangeKm) return null;
    const oneWayDays = Math.max(1, geometry.distanceKm / (SEA_KM_PER_WEEK * sea.speedMultiplier) * 7);
    return {
      mode: 'sea',
      oneWayDays,
      roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
      capacityKgPerMerchant: SEA_KG_PER_MERCHANT * sea.capacityMultiplier,
      transportMultiplier: sea.capacityMultiplier,
      reliability: routeReliability(origin, dest),
      cost: SEA_COST_PER_KM * geometry.distanceKm * sea.costMultiplier,
    };
  }
"""
new_venture = """  if (seaRoute) {
    const sea = seaTransportProfile(origin, dest);
    if (geometry.distanceKm > sea.rangeKm) return null;
    const physicalFriction = geometry.maritime?.physicalFriction || 0;
    const passageCount = geometry.chokepointCount || 0;
    const passageDelay = 1 + physicalFriction * 0.45;
    const oneWayDays = Math.max(1,
      geometry.distanceKm / (SEA_KM_PER_WEEK * sea.speedMultiplier) * 7 * passageDelay);
    return {
      mode: 'sea',
      oneWayDays,
      roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
      capacityKgPerMerchant: SEA_KG_PER_MERCHANT * sea.capacityMultiplier,
      transportMultiplier: sea.capacityMultiplier,
      reliability: routeReliability(origin, dest) * Math.max(0.72, 1 - passageCount * 0.05),
      cost: SEA_COST_PER_KM * geometry.distanceKm * sea.costMultiplier * (1 + physicalFriction),
      seaIds: geometry.maritime?.seaIds || [],
      passageIds: geometry.maritime?.passageIds || [],
    };
  }
"""
if old_venture in text:
    text = text.replace(old_venture, new_venture, 1)
elif new_venture not in text:
    raise RuntimeError('trade.js ventureRouteProfile sea anchor not found')

PATH.write_text(text)
print('Chokepoint trade integration present')
