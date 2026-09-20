const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const has = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

export const NAVAL_ROTARY_WING_TECH_ID = 'naval_rotary_wing_operations';
export const HELICOPTER_DECK_MODULE_ID = 'helicopter_deck';

const ELIGIBLE_SHIP_CAPACITY = Object.freeze({
  destroyer: 1,
  fleet_tug: 2,
  steel_warship: 2,
  dreadnought: 4,
});

export function shipRotaryWingPotential(ship) {
  if (!ship) return 0;
  const base = ELIGIBLE_SHIP_CAPACITY[ship.designId] || 0;
  const durability = clamp((ship.condition ?? 1));
  return Math.max(0, Math.floor(base * (.65 + durability * .35)));
}

export function canFitHelicopterDeck(region, ship) {
  if (!region || !ship) return { possible: false, reason: 'missing_platform' };
  if (!has(region, 'rotary_wing_flight')) return { possible: false, reason: 'rotary_wing_flight_not_known' };
  const potential = shipRotaryWingPotential(ship);
  if (potential <= 0) return { possible: false, reason: 'ship_too_small_or_unsuitable' };
  const components = region.industrialPlants?.componentCapability || {};
  const machining = region.industrialSupply?.capability?.precision_machining || 0;
  const marineEngineering = region.industrialMarine?.marineEngineering || 0;
  const readiness = clamp(machining * .40 + marineEngineering * .35 + (components.radio_navigation || components.electronics || 0) * .25);
  if (readiness < .34) return { possible: false, reason: 'insufficient_marine_aviation_support' };
  return { possible: true, capacity: potential, readiness };
}

export function fitHelicopterDeck(region, ship, { capacity = null } = {}) {
  const check = canFitHelicopterDeck(region, ship);
  if (!check.possible) return { fitted: false, reason: check.reason };
  const desired = Math.max(1, Math.min(check.capacity, Math.floor(capacity || check.capacity)));
  const stock = region.stockpile || {};
  const inventory = region.industrialSupply?.inventory || {};
  const steelNeed = 10 + desired * 8;
  const machineNeed = 6 + desired * 5;
  const cashNeed = 18 + desired * 12;
  if ((stock.steel || 0) < steelNeed || (inventory.machine_components || 0) < machineNeed || (region.treasury || 0) < cashNeed) {
    return { fitted: false, reason: 'insufficient_resources', steelNeed, machineNeed, cashNeed };
  }
  stock.steel -= steelNeed;
  inventory.machine_components -= machineNeed;
  region.treasury -= cashNeed;
  region.wallet = (region.wallet || 0) + cashNeed;
  ship.rotaryWingCapacity = desired;
  ship.rotaryWingFacilities = {
    moduleId: HELICOPTER_DECK_MODULE_ID,
    capacity: desired,
    maintenance: clamp(.34 + check.readiness * .48),
    deckHandling: clamp(.30 + check.readiness * .50),
    fittedByRegionId: region.id,
  };
  region.unlockedTechIds?.add?.(NAVAL_ROTARY_WING_TECH_ID);
  return { fitted: true, ship, capacity: desired };
}

export function fleetRotaryWingCapacity(fleet) {
  let capacity = 0, maintenance = 0, deckHandling = 0, equippedShips = 0;
  for (const ship of fleet?.ships || []) {
    const c = Math.max(0, Number(ship.rotaryWingCapacity) || 0);
    if (!c) continue;
    capacity += c;
    equippedShips++;
    maintenance += (ship.rotaryWingFacilities?.maintenance || .35) * c;
    deckHandling += (ship.rotaryWingFacilities?.deckHandling || .35) * c;
  }
  return {
    capacity,
    equippedShips,
    maintenance: capacity ? clamp(maintenance / capacity) : 0,
    deckHandling: capacity ? clamp(deckHandling / capacity) : 0,
  };
}

export function embarkedHelicopters(region, fleetId = null) {
  return (region?.aviation?.aircraft || []).filter(a => a.aircraftType === 'helicopter' && a.status !== 'destroyed' && a.baseFleetId && (!fleetId || a.baseFleetId === fleetId));
}

export function embarkHelicopter(region, helicopterId, fleet) {
  if (!region || !fleet) return { embarked: false, reason: 'missing_platform' };
  const h = (region.aviation?.aircraft || []).find(a => a.id === helicopterId && a.aircraftType === 'helicopter');
  if (!h || h.status === 'destroyed') return { embarked: false, reason: 'helicopter_unavailable' };
  const support = fleetRotaryWingCapacity(fleet);
  if (support.capacity <= 0) return { embarked: false, reason: 'fleet_has_no_rotary_wing_facility' };
  const already = embarkedHelicopters(region, fleet.id).length;
  if (already >= support.capacity) return { embarked: false, reason: 'deck_capacity_full' };
  if (fleet.locationType === 'port' && fleet.portRegionId && fleet.portRegionId !== region.id) return { embarked: false, reason: 'fleet_not_in_origin_port' };
  h.baseType = 'ship';
  h.baseFleetId = fleet.id;
  h.baseRegionId = null;
  h.carrierSeaRegionId = fleet.seaRegionId || null;
  h.carrierPortRegionId = fleet.portRegionId || region.id;
  h.rotaryWingDeckSupport = { maintenance: support.maintenance, deckHandling: support.deckHandling };
  return { embarked: true, helicopter: h, fleetId: fleet.id, support };
}

export function disembarkHelicopter(region, helicopterId, fleet = null) {
  const h = (region?.aviation?.aircraft || []).find(a => a.id === helicopterId && a.aircraftType === 'helicopter');
  if (!h || !h.baseFleetId) return { disembarked: false, reason: 'not_embarked' };
  if (fleet && fleet.id !== h.baseFleetId) return { disembarked: false, reason: 'wrong_fleet' };
  const baseRegionId = fleet?.locationType === 'port' ? fleet.portRegionId : h.carrierPortRegionId || region.id;
  h.baseType = 'field_site';
  h.baseFleetId = null;
  h.baseRegionId = baseRegionId;
  h.carrierSeaRegionId = null;
  h.carrierPortRegionId = null;
  h.rotaryWingDeckSupport = null;
  return { disembarked: true, helicopter: h, baseRegionId };
}

export function syncEmbarkedHelicopters(regions, fleets) {
  const fleetsById = new Map((fleets || []).map(f => [f.id, f]));
  const events = [];
  for (const region of regions || []) {
    for (const h of embarkedHelicopters(region)) {
      const fleet = fleetsById.get(h.baseFleetId);
      if (!fleet) {
        h.status = 'grounded';
        events.push({ type: 'embarked_helicopter_base_missing', helicopterId: h.id, fleetId: h.baseFleetId });
        continue;
      }
      h.carrierSeaRegionId = fleet.seaRegionId || null;
      h.carrierPortRegionId = fleet.portRegionId || h.carrierPortRegionId || null;
      const support = fleetRotaryWingCapacity(fleet);
      h.rotaryWingDeckSupport = { maintenance: support.maintenance, deckHandling: support.deckHandling };
    }
  }
  return events;
}

export function navalHelicopterLaunchAssessment(helicopter, fleet, targetRegion) {
  if (!helicopter || !fleet || !targetRegion) return { possible: false, reason: 'missing_target_or_platform' };
  if (helicopter.baseFleetId !== fleet.id) return { possible: false, reason: 'helicopter_not_embarked_here' };
  const support = fleetRotaryWingCapacity(fleet);
  if (support.capacity <= 0) return { possible: false, reason: 'no_rotary_wing_facility' };
  const targetSeaIds = new Set(targetRegion.adjacentSeaIds || []);
  const atSea = fleet.locationType === 'sea' && fleet.seaRegionId && targetSeaIds.has(fleet.seaRegionId);
  const inPort = fleet.locationType === 'port' && fleet.portRegionId === targetRegion.id;
  if (!atSea && !inPort) return { possible: false, reason: 'target_not_within_littoral_launch_reach' };
  const stats = helicopter.designStats || {};
  const launchReadiness = clamp((helicopter.condition ?? 1) * .45 + support.deckHandling * .25 + support.maintenance * .20 + (stats.reliability || 0) * .10);
  return { possible: launchReadiness >= .35, launchReadiness, atSea, inPort, support };
}
