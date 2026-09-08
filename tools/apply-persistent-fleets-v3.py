from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

p = Path('js/military/fleets.js')
s = p.read_text()
s = replace_once(s,
"import { maritimeSkillLevel, maritimeSkillMultiplier, recordMaritimePractice, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';",
"import { maritimeSkillLevel, maritimeSkillMultiplier, recordMaritimePractice, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';\nimport { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';",
'route import')
s = replace_once(s,
"  RETURN_REFIT: 'return_refit',",
"  RETURN_REFIT: 'return_refit',\n  TRANSIT: 'transit',",
'transit mission')
s = replace_once(s,
"function canSearch(fleet) {\n  return fleet.locationType === 'sea' && SEARCH_MISSIONS.has(fleet.mission) && fleet.ships.length > 0;\n}",
"function canSearch(fleet) {\n  return fleet.locationType === 'sea' && !fleet.routeSeaIds?.length && SEARCH_MISSIONS.has(fleet.mission) && fleet.ships.length > 0;\n}\n\nexport function orderFleetToSea(fleet, destinationSeaId, regionsById, seaRegionsById, postTransitMission = null) {\n  if (!fleet?.ships?.length || !seaRegionsById.has(destinationSeaId)) return { ordered: false, reason: 'invalid_destination' };\n  let starts = [];\n  if (fleet.locationType === 'sea' && fleet.seaRegionId) starts = [fleet.seaRegionId];\n  else if (fleet.locationType === 'port') starts = [...(regionsById.get(fleet.portRegionId)?.adjacentSeaIds || [])];\n  if (!starts.length) return { ordered: false, reason: 'no_sea_access' };\n  const route = maritimeRouteBetween({ adjacentSeaIds: starts }, { adjacentSeaIds: [destinationSeaId] });\n  if (!route?.seaIds?.length) return { ordered: false, reason: 'no_route' };\n  fleet.locationType = 'sea';\n  fleet.portRegionId = null;\n  fleet.seaRegionId = route.seaIds[0];\n  fleet.routeSeaIds = route.seaIds;\n  fleet.routeIndex = 0;\n  fleet.routeDestinationSeaId = destinationSeaId;\n  fleet.transitProgressWeeks = 0;\n  fleet.postTransitMission = postTransitMission || (fleet.mission === FLEET_MISSIONS.PORT ? FLEET_MISSIONS.PATROL : fleet.mission);\n  fleet.mission = route.seaIds.length > 1 ? FLEET_MISSIONS.TRANSIT : fleet.postTransitMission;\n  if (route.seaIds.length <= 1) { fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; }\n  return { ordered: true, route: [...route.seaIds], passageIds: [...(route.passageIds || [])] };\n}\n\nfunction advanceFleetRoute(fleet, weeks) {\n  if (fleet.locationType !== 'sea' || !fleet.routeSeaIds?.length || fleet.routeSeaIds.length <= 1) return false;\n  fleet.transitProgressWeeks = (fleet.transitProgressWeeks || 0) + weeks;\n  let moved = false;\n  while (fleet.routeIndex < fleet.routeSeaIds.length - 1) {\n    const hopWeeks = Math.max(0.45, 1.35 / Math.max(0.35, fleetAverageSpeed(fleet)));\n    if (fleet.transitProgressWeeks < hopWeeks) break;\n    fleet.transitProgressWeeks -= hopWeeks;\n    fleet.routeIndex += 1;\n    fleet.seaRegionId = fleet.routeSeaIds[fleet.routeIndex];\n    moved = true;\n  }\n  if (fleet.routeIndex >= fleet.routeSeaIds.length - 1) {\n    fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; fleet.transitProgressWeeks = 0;\n    fleet.mission = fleet.postTransitMission || FLEET_MISSIONS.PATROL;\n    fleet.postTransitMission = null;\n  }\n  return moved;\n}",
'routed movement')
s = replace_once(s,
"export function dockFleet(fleet, portRegionId, regionsById, agreements = []) {\n  const port = regionsById.get(portRegionId);\n  if (!port) return { docked: false, reason: 'missing_port' };",
"export function dockFleet(fleet, portRegionId, regionsById, agreements = []) {\n  const port = regionsById.get(portRegionId);\n  if (!port) return { docked: false, reason: 'missing_port' };\n  if (fleet.locationType === 'sea' && !(port.adjacentSeaIds || []).includes(fleet.seaRegionId)) return { docked: false, reason: 'port_not_on_this_sea' };",
'no teleport docking')
s = replace_once(s,
"  fleet.missionTargetId = null;\n  return { docked: true, access };",
"  fleet.missionTargetId = null;\n  fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; fleet.postTransitMission = null;\n  return { docked: true, access };",
'clear route on dock')
s = replace_once(s,
"    else {\n      wearAtSea(fleet, weeks);",
"    else {\n      wearAtSea(fleet, weeks);\n      advanceFleetRoute(fleet, weeks);",
'advance routes')
s = replace_once(s,
"  const bySea = new Map();",
"  // A return/refit order docks automatically once the fleet reaches a sea\n  // touching its home port; fleets farther away keep transiting normally.\n  for (const fleet of fleets) {\n    if (fleet.locationType !== 'sea' || fleet.mission !== FLEET_MISSIONS.RETURN_REFIT) continue;\n    const home = regionsById.get(fleet.homePortRegionId);\n    if (home && (home.adjacentSeaIds || []).includes(fleet.seaRegionId)) dockFleet(fleet, home.id, regionsById, agreements);\n  }\n\n  const bySea = new Map();",
'auto refit docking')
p.write_text(s)

# Fleet UI can now order voyages to any reachable sea rather than only the sea
# immediately outside the current port.
p = Path('js/main.js')
s = p.read_text()
s = replace_once(s,
"import { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';",
"import { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, orderFleetToSea, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';",
'route API import')
s = replace_once(s,
"fleetApi: { deployFleet, dockFleet, setFleetFlag, setFleetMission, syncRegionalNavyLedger },",
"fleetApi: { deployFleet, dockFleet, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },",
'expose route API')
p.write_text(s)

p = Path('js/ui/fleetUi.js')
s = p.read_text()
s = replace_once(s,
"    const deployOptions = fleet.locationType === 'port'\n      ? (regionsById.get(fleet.portRegionId)?.adjacentSeaIds || []).map((id) => `<option value=\"${esc(id)}\">${esc(seasById.get(id)?.name || id)}</option>`).join('') : '';",
"    const deployOptions = fleet.locationType === 'port'\n      ? world.seaRegions.map((sea) => `<option value=\"${esc(sea.id)}\">${esc(sea.name)}</option>`).join('') : '';",
'all-sea destinations')
s = replace_once(s,
"      const ok = world.fleetApi.deployFleet(fleet, seaId, regionsById, seasById);\n      status.textContent = ok ? 'Fleet deployed.' : 'That sea cannot be reached directly from this port.';\n      if (ok) renderFleetList();",
"      const result = world.fleetApi.orderFleetToSea(fleet, seaId, regionsById, seasById, 'patrol');\n      status.textContent = result.ordered ? `Fleet sailing via ${result.route.length} sea region(s).` : `Could not sail there (${String(result.reason).replaceAll('_',' ')}).`;\n      if (result.ordered) renderFleetList();",
'routed UI deploy')
p.write_text(s)

print('persistent fleet v3 routing applied')
