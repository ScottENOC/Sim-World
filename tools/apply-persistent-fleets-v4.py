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
"    attackerOwnerRegionId: attacker.ownerRegionId,\n    defenderOwnerRegionId: defender.ownerRegionId,",
"    attackerOwnerRegionId: attacker.ownerRegionId,\n    defenderOwnerRegionId: defender.ownerRegionId,\n    attackerOwnerActorId: attacker.ownerActorId,\n    defenderOwnerActorId: defender.ownerActorId,",
'battle actor ownership')

s = replace_once(s,
"function pursuitScore(fleet, regionsById, rng) {",
"export function orderFleetHome(fleet, regionsById, seaRegionsById) {\n  const home = regionsById.get(fleet.homePortRegionId);\n  if (!home || !(home.adjacentSeaIds || []).length) return { ordered: false, reason: 'no_home_sea_access' };\n  if (fleet.locationType === 'sea' && (home.adjacentSeaIds || []).includes(fleet.seaRegionId)) {\n    fleet.mission = FLEET_MISSIONS.RETURN_REFIT;\n    fleet.missionTargetId = null;\n    return { ordered: true, alreadyAdjacent: true, route: [fleet.seaRegionId] };\n  }\n  let best = null;\n  for (const seaId of home.adjacentSeaIds) {\n    if (!seaRegionsById.has(seaId)) continue;\n    let starts = [];\n    if (fleet.locationType === 'sea' && fleet.seaRegionId) starts = [fleet.seaRegionId];\n    else if (fleet.locationType === 'port') starts = [...(regionsById.get(fleet.portRegionId)?.adjacentSeaIds || [])];\n    const route = maritimeRouteBetween({ adjacentSeaIds: starts }, { adjacentSeaIds: [seaId] });\n    if (!route?.seaIds?.length) continue;\n    if (!best || route.seaIds.length < best.route.seaIds.length) best = { seaId, route };\n  }\n  if (!best) return { ordered: false, reason: 'no_route_home' };\n  const result = orderFleetToSea(fleet, best.seaId, regionsById, seaRegionsById, FLEET_MISSIONS.RETURN_REFIT);\n  if (result.ordered) fleet.missionTargetId = null;\n  return result;\n}\n\nfunction pursuitScore(fleet, regionsById, rng) {",
'order fleet home')

old_ai = """    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72)) {
      const home = regionsById.get(fleet.homePortRegionId);
      if (home) {
        fleet.locationType = 'port'; fleet.portRegionId = home.id; fleet.seaRegionId = null;
        fleet.mission = FLEET_MISSIONS.RETURN_REFIT; fleet.missionTargetId = null;
      }
      continue;
    }"""
new_ai = """    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72)) {
      orderFleetHome(fleet, regionsById, seaRegionsById);
      continue;
    }"""
s = replace_once(s, old_ai, new_ai, 'AI no-teleport refit')

s = replace_once(s,
"  chooseAiFleetOrders(fleets, regionsById, seaRegionsById, options.playerActorId || null, rng, weeks);\n  applyBlockades(fleets, regionsById);",
"  // A player or AI may set return_refit while far from home. Turn that order\n  // into a real routed voyage rather than teleporting to harbour.\n  for (const fleet of fleets) {\n    if (fleet.locationType === 'sea' && fleet.mission === FLEET_MISSIONS.RETURN_REFIT && !fleet.routeSeaIds?.length) {\n      orderFleetHome(fleet, regionsById, seaRegionsById);\n    }\n  }\n  chooseAiFleetOrders(fleets, regionsById, seaRegionsById, options.playerActorId || null, rng, weeks);\n  applyBlockades(fleets, regionsById);",
'player refit routing')

old_involve = """export function fleetEventInvolvesActor(event, actor, fleets) {
  if (!actor || !event) return false;
  const ids = [event.observerFleetId, event.targetFleetId, event.attackerFleetId, event.defenderFleetId].filter(Boolean);
  return ids.some((id) => fleets.find((fleet) => fleet.id === id)?.ownerActorId === actor) ||
    event.attackerOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.attackerOwnerRegionId && fleet.ownerActorId === actor) ||
    event.defenderOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.defenderOwnerRegionId && fleet.ownerActorId === actor);
}"""
new_involve = """export function fleetEventInvolvesActor(event, actor, fleets) {
  if (!actor || !event) return false;
  if (event.ownerActorId === actor || event.attackerOwnerActorId === actor || event.defenderOwnerActorId === actor) return true;
  const ids = [event.observerFleetId, event.targetFleetId, event.attackerFleetId, event.defenderFleetId].filter(Boolean);
  return ids.some((id) => fleets.find((fleet) => fleet.id === id)?.ownerActorId === actor) ||
    Boolean(event.attackerOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.attackerOwnerRegionId && fleet.ownerActorId === actor)) ||
    Boolean(event.defenderOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.defenderOwnerRegionId && fleet.ownerActorId === actor));
}"""
s = replace_once(s, old_involve, new_involve, 'event ownership')
p.write_text(s)

p = Path('js/main.js')
s = p.read_text()
s = replace_once(s,
"import { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, orderFleetToSea, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';",
"import { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, orderFleetHome, orderFleetToSea, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';",
'home API import')
s = replace_once(s,
"fleetApi: { deployFleet, dockFleet, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },",
"fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },",
'expose home API')
p.write_text(s)

print('persistent fleet v4 final routing/ownership applied')
