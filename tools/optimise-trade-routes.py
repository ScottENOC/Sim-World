from pathlib import Path
p=Path('js/economy/trade.js'); s=p.read_text()
old="""function routeReliability(regionA, regionB) {
  const security = Math.min(routeSecurity(regionA), routeSecurity(regionB));
  return clamp01(Math.pow(clamp01((security - 0.2) / 0.8), 2) * tradeRelationMultiplier(regionA, regionB));
}"""
new="""function routeReliability(regionA, regionB) {
  const securityA = Number.isFinite(regionA._tradeSecurityThisTick)
    ? regionA._tradeSecurityThisTick : routeSecurity(regionA);
  const securityB = Number.isFinite(regionB._tradeSecurityThisTick)
    ? regionB._tradeSecurityThisTick : routeSecurity(regionB);
  const security = Math.min(securityA, securityB);
  return clamp01(Math.pow(clamp01((security - 0.2) / 0.8), 2) * tradeRelationMultiplier(regionA, regionB));
}"""
if old not in s: raise SystemExit('route reliability anchor missing')
s=s.replace(old,new,1)
old2="""    return {
      mode: 'sea',
      oneWayDays,
      roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
      capacityKgPerMerchant: SEA_KG_PER_MERCHANT * sea.capacityMultiplier,
      transportMultiplier: sea.capacityMultiplier,
      reliability: routeReliability(origin, dest),
    };"""
new2="""    return {
      mode: 'sea',
      oneWayDays,
      roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
      capacityKgPerMerchant: SEA_KG_PER_MERCHANT * sea.capacityMultiplier,
      transportMultiplier: sea.capacityMultiplier,
      reliability: routeReliability(origin, dest),
      cost: SEA_COST_PER_KM * geometry.distanceKm * sea.costMultiplier,
    };"""
if old2 not in s: raise SystemExit('sea route anchor missing')
s=s.replace(old2,new2,1)
old3="""  const oneWayDays = Math.max(1, geometry.distanceKm / (LAND_KM_PER_WEEK * land.speedMultiplier) * 7);
  return {
    mode: 'land',
    oneWayDays,
    roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
    capacityKgPerMerchant: LAND_KG_PER_MERCHANT * land.capacityMultiplier,
    transportMultiplier: land.capacityMultiplier,
    reliability: routeReliability(origin, dest),
    pathIds: land.pathIds,
  };"""
new3="""  const oneWayDays = Math.max(1, geometry.distanceKm / (LAND_KM_PER_WEEK * land.speedMultiplier) * 7);
  const directLandTransport = Math.max(
    horseTransportMultiplier(origin) * overlandInfrastructureMultiplier(origin),
    horseTransportMultiplier(dest) * overlandInfrastructureMultiplier(dest));
  const cost = geometry.adjacent
    ? LAND_ADJACENT_COST / directLandTransport
    : (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / directLandTransport;
  return {
    mode: 'land',
    oneWayDays,
    roundTripDays: oneWayDays * 2 + MARKET_TURNAROUND_DAYS,
    capacityKgPerMerchant: LAND_KG_PER_MERCHANT * land.capacityMultiplier,
    transportMultiplier: land.capacityMultiplier,
    reliability: routeReliability(origin, dest),
    cost,
    pathIds: land.pathIds,
  };"""
if old3 not in s: raise SystemExit('land route anchor missing')
s=s.replace(old3,new3,1)
s=s.replace("    const cost = routeCost(region, dest) + (1 - route.reliability) * 0.1;", "    const cost = route.cost + (1 - route.reliability) * 0.1;", 1)
s=s.replace("      routeCost: routeCost(region, opp.dest),", "      routeCost: opp.route.cost,", 1)
old4="""  for (const region of regions) {
    region.tradeLinks = new Map();
    beginTradeWeek(region);
  }"""
new4="""  for (const region of regions) {
    region.tradeLinks = new Map();
    beginTradeWeek(region);
    // Security is region-local and cannot change during this trade pass, so
    // compute it once rather than once for every candidate route.
    region._tradeSecurityThisTick = routeSecurity(region);
  }"""
if old4 not in s: raise SystemExit('trade begin anchor missing')
s=s.replace(old4,new4,1)
p.write_text(s)
