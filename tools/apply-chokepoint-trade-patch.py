#!/usr/bin/env python3
"""Idempotently integrate maritime chokepoints and transit tolls into trade.js."""
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / 'js' / 'economy' / 'trade.js'
text = PATH.read_text()

IMPORT = "import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';"
if IMPORT not in text:
    anchor = "import { maritimeSkillMultiplier, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';"
    if anchor not in text:
        raise RuntimeError('trade.js seamanship import anchor not found')
    text = text.replace(anchor, anchor + '\n' + IMPORT, 1)

TOLL_IMPORT = "import { collectTransitTolls, estimateTransitToll } from './transitTolls.js?v=20260907-transit1';"
if TOLL_IMPORT not in text:
    text = text.replace(IMPORT, IMPORT + '\n' + TOLL_IMPORT, 1)

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

# Price tolls before merchants choose a route. The toll is a real marginal cost,
# not a post-hoc tax that merchants somehow failed to anticipate.
old_find_sig = "function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById) {"
new_find_sig = "function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements) {"
if old_find_sig in text:
    text = text.replace(old_find_sig, new_find_sig, 1)
elif new_find_sig not in text:
    raise RuntimeError('findOpportunities signature anchor not found')

old_route_cost = """    const route = ventureRouteProfile(region, dest, regionsById);
    if (!route || route.reliability <= 0.001) continue;
    const cost = route.cost + (1 - route.reliability) * 0.1;
    const pricesThere = pricesByRegion.get(dest.id);
"""
new_route_cost = """    const route = ventureRouteProfile(region, dest, regionsById);
    if (!route || route.reliability <= 0.001) continue;
    const transit = estimateTransitToll(region, route, regions, regionsById, agreements);
    const baseCost = route.cost + (1 - route.reliability) * 0.1;
    const pricesThere = pricesByRegion.get(dest.id);
"""
if old_route_cost in text:
    text = text.replace(old_route_cost, new_route_cost, 1)
elif new_route_cost not in text:
    raise RuntimeError('opportunity route cost anchor not found')

old_gap = """      const priceHere = pricesHere[resource];
      const priceThere = pricesThere[resource];
      const gap = priceThere - priceHere - cost;
"""
new_gap = """      const priceHere = pricesHere[resource];
      const priceThere = pricesThere[resource];
      const cost = baseCost + priceHere * transit.rate;
      const gap = priceThere - priceHere - cost;
"""
if old_gap in text:
    text = text.replace(old_gap, new_gap, 1)
elif new_gap not in text:
    raise RuntimeError('opportunity gap anchor not found')

old_push = """        originPrice: priceHere,
        route,
      });
"""
new_push = """        originPrice: priceHere,
        route: { ...route, cost, transit },
      });
"""
if old_push in text:
    text = text.replace(old_push, new_push, 1)
elif new_push not in text:
    raise RuntimeError('opportunity push anchor not found')

old_launch_sig = "function launchVentures(region, opportunities, currentTick, time) {"
new_launch_sig = "function launchVentures(region, opportunities, currentTick, time, regionsById) {"
if old_launch_sig in text:
    text = text.replace(old_launch_sig, new_launch_sig, 1)
elif new_launch_sig not in text:
    raise RuntimeError('launchVentures signature anchor not found')

old_launch_payment = """    region.stockpile[opp.resource] -= cargo;
    exportRemaining[opp.resource] -= cargo;
    economy.ventures.push({
"""
new_launch_payment = """    region.stockpile[opp.resource] -= cargo;
    exportRemaining[opp.resource] -= cargo;
    const tollsPaid = collectTransitTolls(region, opp.route.transit, cargo * opp.originPrice, regionsById, currentTick);
    economy.ventures.push({
"""
if old_launch_payment in text:
    text = text.replace(old_launch_payment, new_launch_payment, 1)
elif new_launch_payment not in text:
    raise RuntimeError('launch toll payment anchor not found')

old_venture_fields = """      routeCost: opp.route.cost,
      reliability: opp.route.reliability,
      transportMode: opp.route.mode,
      pathIds: opp.route.pathIds || null,
"""
new_venture_fields = """      routeCost: opp.route.cost,
      tollsPaid,
      reliability: opp.route.reliability,
      transportMode: opp.route.mode,
      pathIds: opp.route.pathIds || null,
      seaIds: opp.route.seaIds || null,
      passageIds: opp.route.passageIds || null,
"""
if old_venture_fields in text:
    text = text.replace(old_venture_fields, new_venture_fields, 1)
elif new_venture_fields not in text:
    raise RuntimeError('venture transit fields anchor not found')

old_tick_sig = "export function tickTrade(regions, currentTick = null, time = null) {"
new_tick_sig = "export function tickTrade(regions, currentTick = null, time = null, agreements = []) {"
if old_tick_sig in text:
    text = text.replace(old_tick_sig, new_tick_sig, 1)
elif new_tick_sig not in text:
    raise RuntimeError('tickTrade signature anchor not found')

old_find_call = "const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById);"
new_find_call = "const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements);"
if old_find_call in text:
    text = text.replace(old_find_call, new_find_call, 1)
elif new_find_call not in text:
    raise RuntimeError('findOpportunities call anchor not found')

old_launch_call = "launchVentures(region, opportunities, currentTick, time);"
new_launch_call = "launchVentures(region, opportunities, currentTick, time, regionsById);"
if old_launch_call in text:
    text = text.replace(old_launch_call, new_launch_call, 1)
elif new_launch_call not in text:
    raise RuntimeError('launchVentures call anchor not found')

PATH.write_text(text)
print('Chokepoint and transit toll trade integration present')
