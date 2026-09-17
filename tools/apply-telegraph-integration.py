#!/usr/bin/env python3
from pathlib import Path

p=Path('js/diplomacy/couriers.js'); s=p.read_text()
# Imports: remove direct routing dependencies, keep telegraph interception helper for per-leg risk.
s=s.replace("import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';\n","")
s=s.replace("import { telegraphDeliveryTicks, telegraphInterceptRisk, telegraphRouteBetween } from './telegraph.js?v=20260917-telegraph1';\n",
            "import { telegraphInterceptRisk } from './telegraph.js?v=20260917-telegraph1';\nimport { messageRouteBetween, messageRouteDeliveryTicks } from './messageRouting.js?v=20260917-message-routing1';\n")
# Remove old landRoute + whole-mode routeFor block.
start=s.index("function landRoute(origin, target, regionsById, maxHops = 14) {")
end=s.index("\nfunction routeRisk(route, regionsById, fleets, senderActorId, targetActorId) {", start)
new_route="""export function routeFor(origin, target, regionsById) {
  return messageRouteBetween(origin, target, regionsById);
}
"""
s=s[:start]+new_route+s[end:]
# Replace routeRisk with per-leg aggregation. Independent leg risks combine multiplicatively.
start=s.index("function routeRisk(route, regionsById, fleets, senderActorId, targetActorId) {")
end=s.index("\nexport function sendJointOperationProposal", start)
new_risk="""function routeRisk(route, regionsById, fleets, senderActorId, targetActorId) {
  if (!route) return { interceptChance: 1, hostileActors: [] };
  const hostileActors = new Set();
  let survival = 1;
  const senderRegion = [...regionsById.values()].find((r) => actorId(r) === senderActorId);
  const legs = route.legs?.length ? route.legs : [route];
  for (const leg of legs) {
    let legRisk = 0;
    if (leg.mode === 'telegraph') {
      legRisk = telegraphInterceptRisk(leg, regionsById, senderActorId, targetActorId);
    } else if (leg.mode === 'horse' || leg.mode === 'rail' || leg.mode === 'land') {
      const mids = (leg.regionIds || []).slice(1, -1);
      const exposure = leg.mode === 'rail' ? 0.55 : 1;
      for (const id of mids) {
        const region = regionsById.get(id); if (!region) continue;
        const safety = clamp(region.safetyRating ?? 1);
        legRisk += ((1 - safety) * 0.08 + clamp(region.conflictPressure || 0) * 0.16) * exposure;
        const controller = actorId(region);
        if (controller && controller !== senderActorId && controller !== targetActorId && senderRegion && attitudeToward(senderRegion, region.id) < -0.45) {
          legRisk += 0.12 * exposure; hostileActors.add(controller);
        }
      }
    } else if (leg.mode === 'sea') {
      for (const fleet of fleets || []) {
        if (fleet.locationType !== 'sea' || !leg.seaIds?.includes(fleet.seaRegionId)) continue;
        if (fleet.ownerActorId === senderActorId || fleet.ownerActorId === targetActorId) continue;
        const owner = [...regionsById.values()].find((r) => actorId(r) === fleet.ownerActorId);
        const hostile = senderRegion && owner ? attitudeToward(senderRegion, owner.id) < -0.35 : false;
        if (!hostile) continue;
        const missionFactor = fleet.mission === 'intercept' ? 0.18 : fleet.mission === 'patrol' ? 0.12 : fleet.mission === 'blockade' ? 0.15 : 0.05;
        legRisk += missionFactor * Math.min(1.5, Math.log2(1 + (fleet.ships?.length || 0)) / 2);
        hostileActors.add(fleet.ownerActorId);
      }
    }
    survival *= 1 - clamp(legRisk, 0, 0.8);
  }
  return { interceptChance: clamp(1 - survival, 0, 0.9), hostileActors: [...hostileActors] };
}
"""
s=s[:start]+new_risk+s[end:]
# Generic itinerary delivery. Resident diplomat path remains same-tick.
s=s.replace("currentTick + telegraphDeliveryTicks(route)","currentTick + messageRouteDeliveryTicks(route)")
p.write_text(s)
print('multimodal courier integration applied')
# trigger multimodal
