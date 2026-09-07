from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# --- fleets.js small integration refinements ---
p = Path('js/military/fleets.js')
s = p.read_text()
s = replace_once(s,
"function battleEvent(attacker, defender, result, contact = null) {\n  return {\n    type: 'fleet_battle',",
"function battleEvent(attacker, defender, result, contact = null) {\n  return {\n    type: 'fleet_battle',\n    attackerName: attacker.name, defenderName: defender.name,",
'fleet battle names')
s = replace_once(s,
"export function deployFleet(fleet, seaRegionId, ownerRegion, seaRegionsById) {\n  if (!seaRegionsById.has(seaRegionId)) return false;\n  const fromPort = fleet.locationType === 'port' ? fleet.portRegionId : null;\n  if (fromPort && !(ownerRegion?.adjacentSeaIds || []).includes(seaRegionId) && fleet.homePortRegionId === ownerRegion?.id) return false;",
"export function deployFleet(fleet, seaRegionId, regionsById, seaRegionsById) {\n  if (!seaRegionsById.has(seaRegionId)) return false;\n  const fromPort = fleet.locationType === 'port' ? fleet.portRegionId : null;\n  const portRegion = fromPort ? regionsById.get(fromPort) : null;\n  if (fromPort && !(portRegion?.adjacentSeaIds || []).includes(seaRegionId)) return false;",
'allied port deployment')
s = replace_once(s,
"function applyBlockades(fleets, regionsById) {\n  for (const region of regionsById.values()) region.navalBlockadePressure = 0;",
"function applyBlockades(fleets, regionsById) {\n  for (const region of regionsById.values()) {\n    region.navalBlockadePressure = 0;\n    region.fleetPatrolCoverage = 0;\n    region.navalDeployedBoats = 0;\n  }\n  for (const fleet of fleets) {\n    if (fleet.locationType !== 'sea' || !fleet.ships.length) continue;\n    const owner = regionsById.get(fleet.ownerRegionId);\n    if (!owner) continue;\n    regionPresence(owner, fleet);\n  }",
'naval presence reset')
s = replace_once(s,
"function portAssaults(fleets, regionsById, currentTick, rng) {",
"function regionPresence(owner, fleet) {\n  owner.navalDeployedBoats = (owner.navalDeployedBoats || 0) + fleet.ships.length;\n  if (fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT || fleet.mission === FLEET_MISSIONS.ESCORT) {\n    const total = Math.max(1, owner.navy?.boats || fleet.ships.length);\n    owner.fleetPatrolCoverage = clamp((owner.fleetPatrolCoverage || 0) + fleet.ships.length / total);\n  }\n}\n\nfunction chooseAiFleetOrders(fleets, regionsById, seaRegionsById, playerActorId, rng, weeks) {\n  for (const fleet of fleets) {\n    if (!fleet.ships.length || fleet.ownerActorId === playerActorId) continue;\n    const owner = regionsById.get(fleet.ownerRegionId);\n    if (!owner) continue;\n    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72)) {\n      const home = regionsById.get(fleet.homePortRegionId);\n      if (home) {\n        fleet.locationType = 'port'; fleet.portRegionId = home.id; fleet.seaRegionId = null;\n        fleet.mission = FLEET_MISSIONS.RETURN_REFIT; fleet.missionTargetId = null;\n      }\n      continue;\n    }\n    if (fleet.locationType !== 'port' || fleet.supply < 0.88 || fleet.condition < 0.82 || fleet.fatigue > 0.2) continue;\n    const chance = 1 - Math.pow(1 - 0.035, Math.max(0.25, weeks));\n    if (rng() > chance) continue;\n    const port = regionsById.get(fleet.portRegionId);\n    const seas = (port?.adjacentSeaIds || []).filter((id) => seaRegionsById.has(id));\n    if (!seas.length) continue;\n    const seaId = seas[Math.floor(rng() * seas.length)];\n    const sea = seaRegionsById.get(seaId);\n    const hostile = (sea?.adjacentLand || []).map((id) => regionsById.get(id)).filter((r) => r && actorId(r) !== fleet.ownerActorId && attitudeToward(owner, r.id) <= -0.55);\n    const priority = owner.militaryPolicy?.navalPriority || 'trade';\n    let mission = priority === 'war' ? FLEET_MISSIONS.INTERCEPT : FLEET_MISSIONS.PATROL;\n    let targetId = null;\n    if (priority === 'war' && hostile.length && fleet.ships.length >= 3) {\n      const target = hostile[Math.floor(rng() * hostile.length)];\n      targetId = target.id;\n      mission = fleet.ships.length >= 6 && rng() < 0.08 ? FLEET_MISSIONS.PORT_ASSAULT : FLEET_MISSIONS.BLOCKADE;\n    }\n    deployFleet(fleet, seaId, regionsById, seaRegionsById);\n    fleet.mission = mission; fleet.missionTargetId = targetId;\n  }\n}\n\nfunction portAssaults(fleets, regionsById, currentTick, rng) {",
'AI fleet orders')
s = replace_once(s,
"  applyBlockades(fleets, regionsById);\n\n  const bySea = new Map();",
"  chooseAiFleetOrders(fleets, regionsById, seaRegionsById, options.playerActorId || null, rng, weeks);\n  applyBlockades(fleets, regionsById);\n\n  const bySea = new Map();",
'AI fleet tick')
p.write_text(s)

# --- saveGame.js ---
p = Path('js/core/saveGame.js')
s = p.read_text()
s = replace_once(s,
"export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, playerRegionId, playerPolityId = null, fogOfWar }) {",
"export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, fleets = [], clock, playerRegionId, playerPolityId = null, fogOfWar }) {",
'save signature')
s = replace_once(s,
"    activeRaids: encode(activeRaids), activeCampaigns: encode(activeCampaigns),",
"    activeRaids: encode(activeRaids), activeCampaigns: encode(activeCampaigns), fleets: encode(fleets),",
'save fleet data')
s = replace_once(s,
"export function restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, fogOfWar }) {",
"export function restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, fleets = null, clock, fogOfWar }) {",
'restore signature')
s = replace_once(s,
"  activeCampaigns.splice(0, activeCampaigns.length, ...decode(snapshot.activeCampaigns || []));",
"  activeCampaigns.splice(0, activeCampaigns.length, ...decode(snapshot.activeCampaigns || []));\n  const fleetsRestored = Array.isArray(snapshot.fleets);\n  if (fleets && fleetsRestored) fleets.splice(0, fleets.length, ...decode(snapshot.fleets || []));",
'restore fleets')
s = replace_once(s,
"  return { playerRegionId: snapshot.playerRegionId, playerPolityId: snapshot.playerPolityId || null, savedAt: snapshot.savedAt };",
"  return { playerRegionId: snapshot.playerRegionId, playerPolityId: snapshot.playerPolityId || null, savedAt: snapshot.savedAt, fleetsRestored };",
'restore return')
p.write_text(s)

# --- trade blockade integration ---
p = Path('js/economy/trade.js')
s = p.read_text()
s = replace_once(s,
"      reliability: routeReliability(origin, dest) * Math.max(0.72, 1 - passageCount * 0.05),",
"      reliability: routeReliability(origin, dest) * Math.max(0.72, 1 - passageCount * 0.05) *\n        Math.max(0.08, 1 - Math.max(origin.navalBlockadePressure || 0, dest.navalBlockadePressure || 0) * 0.82),",
'blockade reliability')
s = replace_once(s,
"  const patrolCoverage = clamp01((region.navy?.personnel || 0) /\n    Math.max(1, (region.population || 0) * 0.005));",
"  const patrolCoverage = Number.isFinite(region.fleetPatrolCoverage)\n    ? clamp01(region.fleetPatrolCoverage)\n    : clamp01((region.navy?.personnel || 0) / Math.max(1, (region.population || 0) * 0.005));",
'active fleet patrol security')
p.write_text(s)

# --- chokepoint deployed fleet integration ---
p = Path('js/economy/transitTolls.js')
s = p.read_text()
s = replace_once(s,
"  const boats = Math.max(0, region.navy?.boats || 0);",
"  const boats = Math.max(0, Number.isFinite(region.navalDeployedBoats) ? region.navalDeployedBoats : (region.navy?.boats || 0));",
'chokepoint deployed boats')
p.write_text(s)

# --- main.js integration ---
p = Path('js/main.js')
s = p.read_text()
s = replace_once(s,
"import { tickMaritimeExperience } from './technology/seamanship.js?v=20260906-maritime1';",
"import { tickMaritimeExperience } from './technology/seamanship.js?v=20260906-maritime1';\nimport { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';",
'fleet imports')
s = replace_once(s,
"  let activeCampaigns = [];\n  const agreements = [];",
"  let activeCampaigns = [];\n  let fleets = initialiseFleets(regions);\n  const agreements = [];",
'fleet state')
s = replace_once(s,
"const restored = restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, fogOfWar });",
"const restored = restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, fleets, clock, fogOfWar });\n    if (!restored.fleetsRestored) fleets.splice(0, fleets.length, ...initialiseFleets(regions, []));",
'restore main fleets')
s = replace_once(s,
"    syncNextCampaignId(activeCampaigns);\n    syncNextProjectId(regions);",
"    syncNextCampaignId(activeCampaigns);\n    syncNextFleetIds(fleets);\n    syncRegionalNavyLedger(regions, fleets);\n    syncNextProjectId(regions);",
'sync fleet ids')
s = replace_once(s,
"    tickTransitControl(regions, time.elapsedDays);\n    tickTrade(regions, calendarWeek, time, agreements);",
"    const fleetResult = tickFleets(fleets, regions, seaRegions, agreements, calendarWeek, time.elapsedDays, Math.random, { playerActorId: activePlayerPolityId });\n    for (const fleetEvent of fleetResult.events) {\n      if (fleetEvent.type !== 'fleet_contact' || !fleetEventInvolvesActor(fleetEvent, activePlayerPolityId, fleets)) continue;\n      fleetEvent.resolveDecision = (choice) => {\n        const generated = resolveFleetContact(fleetEvent, choice, fleets, regionsById, calendarWeek, Math.random);\n        syncRegionalNavyLedger(regions, fleets);\n        return generated;\n      };\n    }\n    tickTransitControl(regions, time.elapsedDays);\n    tickTrade(regions, calendarWeek, time, agreements);",
'fleet tick')
s = replace_once(s,
"      ...campaignResult.events.filter((event) => {",
"      ...fleetResult.events.filter((event) => fleetEventInvolvesActor(event, activePlayerPolityId, fleets)),\n      ...campaignResult.events.filter((event) => {",
'fleet player events')
s = replace_once(s,
"    get activeCampaigns() { return activeCampaigns; },\n    agreements,",
"    get activeCampaigns() { return activeCampaigns; },\n    get fleets() { return fleets; },\n    get activePlayerPolityId() { return activePlayerPolityId; },\n    fleetApi: { deployFleet, dockFleet, setFleetFlag, setFleetMission, syncRegionalNavyLedger },\n    agreements,",
'expose fleet api')
# Save snapshots are constructed in the menu helper later in this same file.
s = s.replace("activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), clock,", "activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), fleets: window.__worldsim?.fleets || [], clock,")

# Fleet event UI goes immediately after shifting an event.
anchor = "  const event = eventQueue.shift();\n"
insert = """  const event = eventQueue.shift();\n  if (event.type === 'fleet_contact') {\n    document.getElementById('event-title').textContent = 'Fleet sighted';\n    document.getElementById('event-body').textContent = event.description;\n    const options = document.getElementById('event-options');\n    options.innerHTML = event.choices.map((choice) => `<button data-fleet-choice=\"${choice}\">${choice[0].toUpperCase() + choice.slice(1)}</button>`).join(' ');\n    document.getElementById('event-modal').classList.remove('hidden');\n    options.querySelectorAll('[data-fleet-choice]').forEach((button) => button.addEventListener('click', () => {\n      const generated = event.resolveDecision ? event.resolveDecision(button.dataset.fleetChoice) : [];\n      document.getElementById('event-modal').classList.add('hidden');\n      if (generated?.length) eventQueue.unshift(...generated);\n      if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();\n    }));\n    return;\n  }\n  if (event.type === 'fleet_battle' || event.type === 'fleet_port_assault') {\n    const r = event.result;\n    document.getElementById('event-title').textContent = event.type === 'fleet_port_assault' ? 'Fleet attacked in port' : 'Naval battle';\n    document.getElementById('event-body').innerHTML = `${event.attackerName} fought ${event.defenderName}.<br><br>` +\n      `${event.attackerName} sunk: ${formatShipOutcome(r.attackerLost)}; captured by enemy: ${formatShipOutcome(r.attackerCapturedByDefender)}; damaged: ${formatShipOutcome(r.attackerDamaged)}.<br>` +\n      `${event.defenderName} sunk: ${formatShipOutcome(r.defenderLost)}; captured: ${formatShipOutcome(r.defenderCapturedByAttacker)}; damaged: ${formatShipOutcome(r.defenderDamaged)}.` +\n      `${r.portDamage?.length ? `<br>Port infrastructure damaged: ${r.portDamage.map((d) => d.typeId.replaceAll('_', ' ')).join(', ')}.` : ''}`;\n    wireEventContinue(clock, eventQueue);\n    return;\n  }\n  if (event.type === 'fleet_escaped') {\n    document.getElementById('event-title').textContent = 'Fleet escapes';\n    document.getElementById('event-body').textContent = 'The target fleet refused battle and escaped the pursuit.';\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (event.type === 'fleet_hail') {\n    document.getElementById('event-title').textContent = 'Fleet hailed';\n    document.getElementById('event-body').textContent = event.targetResponded ? 'The other fleet answered the hail. Your observers gained a closer look at its ships and flag.' : 'The other fleet ignored the hail and kept its distance.';\n    wireEventContinue(clock, eventQueue); return;\n  }\n"""
s = replace_once(s, anchor, insert, 'fleet event UI')
p.write_text(s)

# --- index.html: fleet management UI module ---
p = Path('index.html')
s = p.read_text()
s = replace_once(s,
"  <script type=\"module\" src=\"js/main.js?v=20260907-art1\"></script>",
"  <script type=\"module\" src=\"js/main.js?v=20260908-fleets1\"></script>\n  <script type=\"module\" src=\"js/ui/fleetUi.js?v=20260908-fleets1\"></script>",
'fleet UI script')
p.write_text(s)

print('persistent fleet integration applied')
