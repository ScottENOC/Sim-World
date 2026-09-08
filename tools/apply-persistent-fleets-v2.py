from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Convert fractional legacy navy wear into discrete persistent ship losses
# rather than letting the fleet ledger resurrect worn-out boats.
p = Path('js/military/fleets.js')
s = p.read_text()
old = '''export function reconcileFleetLedger(regions, fleets) {
  const byOwner = new Map();
  for (const fleet of fleets) {
    ensureFleetState(fleet);
    if (!byOwner.has(fleet.ownerRegionId)) byOwner.set(fleet.ownerRegionId, []);
    byOwner.get(fleet.ownerRegionId).push(fleet);
  }
  for (const region of regions) {
    if (!(region.adjacentSeaIds || []).length) continue;
    const owned = byOwner.get(region.id) || [];
    const currentShips = owned.flatMap((fleet) => fleet.ships);
    const actualAdvanced = currentShips.filter((ship) => ship.designId === 'advanced_warship').length;
    const actualTotal = currentShips.length;
    const wantedTotal = Math.max(0, Math.round(region.navy?.boats || 0));
    const wantedAdvanced = Math.min(wantedTotal, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));
    let target = fleetForNewShips(fleets, region);
    if (!target && wantedTotal > 0) {
      target = createHomeFleet({ ...region, navy: { ...region.navy, boats: 0, advancedBoats: 0 } });
      if (target) fleets.push(target);
    }
    if (!target) continue;
    for (let i = actualAdvanced; i < wantedAdvanced; i++) target.ships.push(makeShip('advanced_warship', region.id));
    const basicActual = actualTotal - actualAdvanced;
    const basicWanted = wantedTotal - wantedAdvanced;
    for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
  }
  return fleets;
}'''
new = '''export function reconcileFleetLedger(regions, fleets, events = null) {
  const byOwner = new Map();
  for (const fleet of fleets) {
    ensureFleetState(fleet);
    if (!byOwner.has(fleet.ownerRegionId)) byOwner.set(fleet.ownerRegionId, []);
    byOwner.get(fleet.ownerRegionId).push(fleet);
  }
  for (const region of regions) {
    if (!(region.adjacentSeaIds || []).length) continue;
    const owned = byOwner.get(region.id) || [];
    const wantedTotal = Math.max(0, Math.round(region.navy?.boats || 0));
    const wantedAdvanced = Math.min(wantedTotal, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));

    // The old economy models wear fractionally. Once that fractional ledger
    // crosses an integer boundary, retire a real persistent ship and report
    // exactly which class was lost. Prefer already-damaged vessels.
    const all = () => owned.flatMap((fleet) => fleet.ships.map((ship) => ({ fleet, ship })));
    const retireOne = (predicate) => {
      const candidates = all().filter(({ ship }) => predicate(ship))
        .sort((a, b) => (a.ship.condition ?? 1) - (b.ship.condition ?? 1));
      const chosen = candidates[0];
      if (!chosen) return false;
      const index = chosen.fleet.ships.indexOf(chosen.ship);
      if (index >= 0) chosen.fleet.ships.splice(index, 1);
      if (events) events.push({ type: 'fleet_ship_worn_out', ownerRegionId: region.id,
        ownerActorId: actorId(region), fleetId: chosen.fleet.id, shipId: chosen.ship.id,
        shipClassLabel: shipLabel(chosen.ship) });
      return true;
    };

    let current = all();
    let actualAdvanced = current.filter(({ ship }) => ship.designId === 'advanced_warship').length;
    while (actualAdvanced > wantedAdvanced && retireOne((ship) => ship.designId === 'advanced_warship')) actualAdvanced--;
    current = all();
    while (current.length > wantedTotal && retireOne(() => true)) current = all();

    current = all();
    const actualTotal = current.length;
    actualAdvanced = current.filter(({ ship }) => ship.designId === 'advanced_warship').length;
    let target = fleetForNewShips(fleets, region);
    if (!target && wantedTotal > 0) {
      target = createHomeFleet({ ...region, navy: { ...region.navy, boats: 0, advancedBoats: 0 } });
      if (target) { fleets.push(target); owned.push(target); }
    }
    if (!target) continue;
    for (let i = actualAdvanced; i < wantedAdvanced; i++) target.ships.push(makeShip('advanced_warship', region.id));
    const basicActual = actualTotal - actualAdvanced;
    const basicWanted = wantedTotal - wantedAdvanced;
    for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
  }
  return fleets;
}'''
s = replace_once(s, old, new, 'discrete fleet wear')
s = replace_once(s,
"  reconcileFleetLedger(regions, fleets);\n  const events = [];",
"  const events = [];\n  reconcileFleetLedger(regions, fleets, events);",
'wear event collection')
p.write_text(s)

# Ensure the menu actually passes persistent fleet state into snapshots.
p = Path('js/main.js')
s = p.read_text()
s = replace_once(s,
"        activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(),\n        clock, playerRegionId: getPlayerRegionId(), playerPolityId: activePlayerPolityId, fogOfWar });",
"        activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), fleets: window.__worldsim?.fleets || [],\n        clock, playerRegionId: getPlayerRegionId(), playerPolityId: activePlayerPolityId, fogOfWar });",
'menu fleet save')
# Show an explicit player notification when ordinary wear finally costs a
# discrete ship, preserving the "one ship matters" rule.
s = replace_once(s,
"  if (event.type === 'fleet_escaped') {",
"  if (event.type === 'fleet_ship_worn_out') {\n    document.getElementById('event-title').textContent = `${event.shipClassLabel} lost`;\n    document.getElementById('event-body').textContent = `A ${event.shipClassLabel} has deteriorated beyond service and has been struck from the fleet. Warships are discrete assets; this vessel is gone.`;\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (event.type === 'fleet_escaped') {",
'wear notification')
p.write_text(s)

print('persistent fleet v2 integration applied')
