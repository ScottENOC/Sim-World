import { effectiveInfrastructureCount, operationalInfrastructure } from '../economy/construction.js?v=20260905-projects1';
import { activeAgreementBetween, attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { localPrice } from '../economy/prices.js?v=20260904-weather1';
import { maritimeSkillLevel, maritimeSkillMultiplier, recordMaritimePractice, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';
import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';
import { navalGunCombatProfile } from './earlyModernWarfare.js?v=20260913-early-modern1';

export const FLEET_MISSIONS = Object.freeze({
  PORT: 'port',
  PATROL: 'patrol',
  BLOCKADE: 'blockade',
  PORT_ASSAULT: 'port_assault',
  RAID_SHIPPING: 'raid_shipping',
  ESCORT: 'escort',
  INTERCEPT: 'intercept',
  HIDE: 'hide',
  RETURN_REFIT: 'return_refit',
  TRANSIT: 'transit',
});

export const FLAG_MODES = Object.freeze({ OWN: 'own', NONE: 'none', FALSE: 'false' });

// The combat engine talks to ship designs rather than assuming that every ship
// is equivalent. Current Bronze/Classical designs are deliberately broad; the
// schema is already capable of representing triremes, frigates, carriers, etc.
export const SHIP_DESIGNS = Object.freeze({
  basic_war_boat: {
    id: 'basic_war_boat', label: 'war boat', crew: 8, speed: 1.0,
    combat: 1.0, durability: 1.0, pursuit: 1.0, captureResistance: 0.75,
  },
  advanced_warship: {
    id: 'advanced_warship', label: 'advanced warship', crew: 12, speed: 1.28,
    combat: 1.75, durability: 1.35, pursuit: 1.22, captureResistance: 0.9,
  },
});

const SEARCH_MISSIONS = new Set([
  FLEET_MISSIONS.PATROL, FLEET_MISSIONS.BLOCKADE, FLEET_MISSIONS.RAID_SHIPPING,
  FLEET_MISSIONS.ESCORT, FLEET_MISSIONS.INTERCEPT,
]);
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;
let nextFleetId = 1;
let nextShipId = 1;
let nextEncounterId = 1;

function designOf(ship) { return SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }
function shipLabel(ship) { return ship?.classLabel || designOf(ship).label; }

function makeShip(designId, ownerRegionId, overrides = {}) {
  const spec = SHIP_DESIGNS[designId] || SHIP_DESIGNS.basic_war_boat;
  return {
    id: `ship-${nextShipId++}`,
    designId: spec.id,
    classLabel: spec.label,
    condition: 1,
    prize: false,
    capturedFromActorId: null,
    ownerRegionId,
    ...overrides,
  };
}

export function syncNextFleetIds(fleets = []) {
  const fleetNums = fleets.map((fleet) => Number(String(fleet.id || '').replace(/\D+/g, '')) || 0);
  const shipNums = fleets.flatMap((fleet) => fleet.ships || []).map((ship) => Number(String(ship.id || '').replace(/\D+/g, '')) || 0);
  nextFleetId = Math.max(1, ...fleetNums.map((v) => v + 1));
  nextShipId = Math.max(1, ...shipNums.map((v) => v + 1));
}

function ensureFleetState(fleet) {
  fleet.ships ||= [];
  fleet.mission ||= FLEET_MISSIONS.PORT;
  fleet.flag ||= { mode: FLAG_MODES.OWN, actorId: fleet.ownerActorId };
  fleet.supply = clamp(fleet.supply ?? 1);
  fleet.fatigue = clamp(fleet.fatigue ?? 0);
  fleet.morale = clamp(fleet.morale ?? 1);
  fleet.condition = clamp(fleet.condition ?? 1);
  fleet.lastContactTickByFleet ||= {};
  fleet.history ||= [];
  return fleet;
}

function createHomeFleet(region) {
  const total = Math.max(0, Math.round(region.navy?.boats || 0));
  if (total <= 0 || !(region.adjacentSeaIds || []).length) return null;
  const advanced = Math.min(total, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));
  const ships = [];
  for (let i = 0; i < advanced; i++) ships.push(makeShip('advanced_warship', region.id));
  for (let i = advanced; i < total; i++) ships.push(makeShip('basic_war_boat', region.id));
  const ownerActorId = actorId(region);
  return ensureFleetState({
    id: `fleet-${nextFleetId++}`,
    name: `${region.name} Fleet`,
    ownerRegionId: region.id,
    ownerActorId,
    homePortRegionId: region.id,
    locationType: 'port',
    portRegionId: region.id,
    seaRegionId: null,
    mission: FLEET_MISSIONS.PORT,
    missionTargetId: null,
    flag: { mode: FLAG_MODES.OWN, actorId: ownerActorId },
    ships,
    supply: 1,
    fatigue: 0,
    morale: 1,
    condition: 1,
    weeksAtSea: 0,
    createdFromLegacyNavy: true,
  });
}

export function initialiseFleets(regions, existing = []) {
  if (existing.length) {
    for (const fleet of existing) ensureFleetState(fleet);
    syncNextFleetIds(existing);
    return existing;
  }
  const fleets = [];
  for (const region of regions) {
    const fleet = createHomeFleet(region);
    if (fleet) fleets.push(fleet);
  }
  syncRegionalNavyLedger(regions, fleets);
  return fleets;
}

function fleetForNewShips(fleets, region) {
  return fleets.find((fleet) => fleet.ownerRegionId === region.id && fleet.locationType === 'port' && fleet.portRegionId === region.id)
    || fleets.find((fleet) => fleet.ownerRegionId === region.id)
    || null;
}

// Existing economy code still constructs vessels by changing region.navy.boats.
// Reconcile those newly built boats into persistent ship objects before fleet
// operations, then write the authoritative discrete fleet inventory back after.
export function reconcileFleetLedger(regions, fleets, events = null) {
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
}

export function syncRegionalNavyLedger(regions, fleets) {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const counts = new Map();
  for (const fleet of fleets) {
    const entry = counts.get(fleet.ownerRegionId) || { total: 0, advanced: 0 };
    entry.total += fleet.ships.length;
    entry.advanced += fleet.ships.filter((ship) => ship.designId === 'advanced_warship').length;
    counts.set(fleet.ownerRegionId, entry);
  }
  for (const [regionId, entry] of counts.entries()) {
    const region = regionById.get(regionId);
    if (!region?.navy) continue;
    region.navy.boats = entry.total;
    region.navy.advancedBoats = entry.advanced;
  }
}

export function fleetShipCounts(fleet) {
  const counts = {};
  for (const ship of fleet?.ships || []) counts[shipLabel(ship)] = (counts[shipLabel(ship)] || 0) + 1;
  return counts;
}

export function setFleetMission(fleet, mission, options = {}) {
  if (!Object.values(FLEET_MISSIONS).includes(mission)) return false;
  ensureFleetState(fleet);
  fleet.mission = mission;
  fleet.missionTargetId = options.targetId || null;
  if (options.seaRegionId) {
    fleet.locationType = 'sea';
    fleet.seaRegionId = options.seaRegionId;
    fleet.portRegionId = null;
  }
  return true;
}

function knowsActor(region, actor, regionsById) {
  if (!region || !actor) return false;
  if (actorId(region) === actor) return true;
  if (region.knowledge?.knownSubjectIds?.has(actor) || region.knowledge?.directContactIds?.has(actor)) return true;
  for (const other of regionsById.values()) {
    if (actorId(other) === actor && (region.knowledge?.knownSubjectIds?.has(other.id) || region.knowledge?.directContactIds?.has(other.id))) return true;
  }
  return false;
}

export function setFleetFlag(fleet, mode, falseActorId, regionsById) {
  ensureFleetState(fleet);
  if (!Object.values(FLAG_MODES).includes(mode)) return { changed: false, reason: 'invalid_mode' };
  const owner = regionsById.get(fleet.ownerRegionId);
  if (mode === FLAG_MODES.FALSE) {
    if (!falseActorId || falseActorId === fleet.ownerActorId) return { changed: false, reason: 'invalid_false_flag' };
    if (!knowsActor(owner, falseActorId, regionsById)) return { changed: false, reason: 'unknown_flag' };
    fleet.flag = { mode, actorId: falseActorId };
  } else {
    fleet.flag = { mode, actorId: mode === FLAG_MODES.OWN ? fleet.ownerActorId : null };
  }
  return { changed: true, flag: { ...fleet.flag } };
}

function sameActor(a, b) { return a && b && a === b; }
export function portAccessLevel(fleet, portRegion, regionsById, agreements = []) {
  const owner = regionsById.get(fleet.ownerRegionId);
  if (!owner || !portRegion) return 'denied';
  const ownerActor = fleet.ownerActorId || actorId(owner);
  const portActor = actorId(portRegion);
  if (sameActor(ownerActor, portActor)) return portRegion.id === fleet.homePortRegionId ? 'home' : 'domestic';
  if (activeAgreementBetween(agreements, owner.id, portRegion.id, 'military_support')) return 'ally';
  return 'denied';
}

function payForAlliedFood(owner, port, amount) {
  const available = Math.max(0, port.stockpile?.food || 0);
  const quantity = Math.min(available, Math.max(0, amount));
  if (quantity <= 0) return 0;
  const price = Math.max(0.01, localPrice(port, 'food'));
  const cost = quantity * price;
  const treasury = Math.min(Math.max(0, owner.treasury || 0), cost);
  const wallet = Math.min(Math.max(0, owner.wallet || 0), cost - treasury);
  const paid = treasury + wallet;
  const purchased = quantity * (paid / Math.max(cost, 1e-9));
  owner.treasury -= treasury;
  owner.wallet -= wallet;
  port.treasury = Math.max(0, port.treasury || 0) + paid;
  port.stockpile.food = Math.max(0, available - purchased);
  return purchased;
}

function serviceInPort(fleet, regionsById, agreements, weeks) {
  const port = regionsById.get(fleet.portRegionId);
  const owner = regionsById.get(fleet.ownerRegionId);
  const access = portAccessLevel(fleet, port, regionsById, agreements);
  if (!port || !owner || access === 'denied') return { access, supplied: 0, repaired: 0 };
  const need = (1 - fleet.supply) * fleet.ships.length * 1.5;
  let supplied = 0;
  if (access === 'ally') supplied = payForAlliedFood(owner, port, need);
  else {
    supplied = Math.min(need, Math.max(0, owner.stockpile?.food || 0));
    owner.stockpile.food = Math.max(0, (owner.stockpile.food || 0) - supplied);
  }
  fleet.supply = clamp(fleet.supply + supplied / Math.max(1, fleet.ships.length * 1.5));
  fleet.fatigue = clamp(fleet.fatigue - weeks * (access === 'ally' ? 0.16 : 0.24));
  fleet.morale = clamp(fleet.morale + weeks * 0.06);

  let repairRate = 0;
  if (access !== 'ally') {
    repairRate = 0.006;
    if (operationalInfrastructure(port, 'harbour')) repairRate += 0.012;
    if (operationalInfrastructure(port, 'shipyard')) repairRate += 0.025;
    if (operationalInfrastructure(port, 'naval_base')) repairRate += 0.035;
  } else {
    // Allied docks provide anchorage, victuals, fresh water and shore leave,
    // but do not casually rebuild a foreign warship. Minor maintenance only.
    repairRate = 0.0015;
  }
  const before = fleet.condition;
  fleet.condition = clamp(fleet.condition + repairRate * weeks);
  for (const ship of fleet.ships) ship.condition = clamp((ship.condition ?? fleet.condition) + repairRate * weeks);
  return { access, supplied, repaired: fleet.condition - before };
}

function wearAtSea(fleet, weeks) {
  const missionUse = fleet.mission === FLEET_MISSIONS.HIDE ? 0.7
    : fleet.mission === FLEET_MISSIONS.BLOCKADE || fleet.mission === FLEET_MISSIONS.PATROL ? 1.2 : 1;
  fleet.weeksAtSea = (fleet.weeksAtSea || 0) + weeks;
  fleet.supply = clamp(fleet.supply - 0.025 * weeks * missionUse);
  fleet.fatigue = clamp(fleet.fatigue + 0.018 * weeks * missionUse);
  fleet.condition = clamp(fleet.condition - 0.0015 * weeks * missionUse);
  fleet.morale = clamp(fleet.morale - Math.max(0, 0.55 - fleet.supply) * 0.015 * weeks);
}

function fleetAverageSpeed(fleet) {
  if (!fleet.ships.length) return 0;
  const harmonic = fleet.ships.length / fleet.ships.reduce((sum, ship) => sum + 1 / Math.max(0.2, designOf(ship).speed), 0);
  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10);
}

function fleetCombatPower(fleet, regionsById, { inPort = false } = {}) {
  const origin = regionsById.get(fleet.ownerRegionId);
  const shipPower = fleet.ships.reduce((sum, ship) => sum + designOf(ship).combat * clamp(ship.condition ?? fleet.condition, 0.1, 1), 0);
  const skill = origin ? maritimeSkillMultiplier(origin, MARITIME_SKILLS.COMBAT) : 1;
  const readiness = (0.55 + fleet.supply * 0.25 + (1 - fleet.fatigue) * 0.12 + fleet.morale * 0.08);
  let power = shipPower * skill * readiness;
  if (inPort && fleet.portRegionId) {
    const port = regionsById.get(fleet.portRegionId);
    if (port) {
      power *= 1.75 + Math.min(1.6,
        effectiveInfrastructureCount(port, 'harbour') * 0.25 +
        effectiveInfrastructureCount(port, 'naval_base') * 0.35 +
        effectiveInfrastructureCount(port, 'coastal_fortifications') * 0.55 +
        effectiveInfrastructureCount(port, 'settlement_walls') * 0.25);
    }
  }
  return power;
}

function targetConcealment(fleet) {
  const sizePenalty = Math.min(0.45, Math.log2(1 + fleet.ships.length) * 0.08);
  const hideBonus = fleet.mission === FLEET_MISSIONS.HIDE ? 0.5 : 0;
  const activePenalty = fleet.mission === FLEET_MISSIONS.BLOCKADE ? 0.25 : fleet.mission === FLEET_MISSIONS.PATROL ? 0.14 : 0;
  return clamp(0.42 + hideBonus - sizePenalty - activePenalty, 0.05, 0.92);
}

function visibleFlagActor(fleet) {
  if (fleet.flag?.mode === FLAG_MODES.NONE) return null;
  return fleet.flag?.actorId || fleet.ownerActorId;
}

function representativeRegionForActor(actor, regionsById) {
  for (const region of regionsById.values()) if (actorId(region) === actor) return region;
  return null;
}

function advancedShareForActor(actor, regionsById) {
  const regions = [...regionsById.values()].filter((region) => actorId(region) === actor);
  const total = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.boats || 0), 0);
  const advanced = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.advancedBoats || 0), 0);
  return total > 0 ? advanced / total : 0;
}

function fleetAdvancedShare(fleet) {
  return fleet.ships.length ? fleet.ships.filter((ship) => ship.designId === 'advanced_warship').length / fleet.ships.length : 0;
}

export function identifyFleet(observerFleet, targetFleet, regionsById, rng = Math.random) {
  const observerRegion = regionsById.get(observerFleet.ownerRegionId);
  const presentedActorId = visibleFlagActor(targetFleet);
  const ownActor = observerFleet.ownerActorId;
  const actualActor = targetFleet.ownerActorId;

  // A faction has a perfect registry of its own fleets. An outsider can fly
  // Essex's flag, but Essex immediately knows that the ships are impostors.
  const impersonatingObserver = presentedActorId && presentedActorId === ownActor && actualActor !== ownActor;
  if (actualActor === ownActor) {
    return { certainty: 1, actualActorId: ownActor, presentedActorId: ownActor, isOwnFleet: true,
      falseFlagDetected: targetFleet.flag?.mode === FLAG_MODES.FALSE, designMismatch: false };
  }

  const scouting = observerRegion ? maritimeSkillLevel(observerRegion, MARITIME_SKILLS.SCOUTING) : 0;
  const combat = observerRegion ? maritimeSkillLevel(observerRegion, MARITIME_SKILLS.COMBAT) : 0;
  let designMismatch = false;
  if (presentedActorId) {
    const expected = advancedShareForActor(presentedActorId, regionsById);
    designMismatch = Math.abs(expected - fleetAdvancedShare(targetFleet)) > (0.38 - scouting * 0.18);
  }

  if (impersonatingObserver) {
    return { certainty: 1, actualActorId: null, presentedActorId, isOwnFleet: false,
      falseFlagDetected: true, imposterOfObserver: true, designMismatch: true };
  }

  const recognitionChance = clamp(0.08 + scouting * 0.42 + combat * 0.16 + (designMismatch ? 0.18 : 0));
  const actualKnown = rng() < recognitionChance;
  return {
    certainty: actualKnown ? clamp(0.65 + scouting * 0.3) : presentedActorId ? 0.48 : 0.18,
    actualActorId: actualKnown ? actualActor : null,
    presentedActorId,
    isOwnFleet: false,
    falseFlagDetected: Boolean(actualKnown && targetFleet.flag?.mode === FLAG_MODES.FALSE) || designMismatch,
    imposterOfObserver: false,
    designMismatch,
  };
}

function detectionChance(observer, target, regionsById, weeks) {
  const origin = regionsById.get(observer.ownerRegionId);
  const scouting = origin ? maritimeSkillLevel(origin, MARITIME_SKILLS.SCOUTING) : 0;
  const searchMission = observer.mission === FLEET_MISSIONS.INTERCEPT ? 0.22
    : observer.mission === FLEET_MISSIONS.PATROL ? 0.16
      : observer.mission === FLEET_MISSIONS.BLOCKADE ? 0.13 : 0.08;
  const searchSize = Math.min(0.22, Math.log2(1 + observer.ships.length) * 0.045);
  const perWeek = clamp(0.03 + searchMission + scouting * 0.2 + searchSize - targetConcealment(target) * 0.22, 0.01, 0.65);
  return 1 - Math.pow(1 - perWeek, Math.max(0.1, weeks));
}

function canSearch(fleet) {
  return fleet.locationType === 'sea' && !fleet.routeSeaIds?.length && SEARCH_MISSIONS.has(fleet.mission) && fleet.ships.length > 0;
}

export function orderFleetToSea(fleet, destinationSeaId, regionsById, seaRegionsById, postTransitMission = null) {
  if (!fleet?.ships?.length || !seaRegionsById.has(destinationSeaId)) return { ordered: false, reason: 'invalid_destination' };
  let starts = [];
  if (fleet.locationType === 'sea' && fleet.seaRegionId) starts = [fleet.seaRegionId];
  else if (fleet.locationType === 'port') starts = [...(regionsById.get(fleet.portRegionId)?.adjacentSeaIds || [])];
  if (!starts.length) return { ordered: false, reason: 'no_sea_access' };
  const route = maritimeRouteBetween({ adjacentSeaIds: starts }, { adjacentSeaIds: [destinationSeaId] });
  if (!route?.seaIds?.length) return { ordered: false, reason: 'no_route' };
  fleet.locationType = 'sea';
  fleet.portRegionId = null;
  fleet.seaRegionId = route.seaIds[0];
  fleet.routeSeaIds = route.seaIds;
  fleet.routeIndex = 0;
  fleet.routeDestinationSeaId = destinationSeaId;
  fleet.transitProgressWeeks = 0;
  fleet.postTransitMission = postTransitMission || (fleet.mission === FLEET_MISSIONS.PORT ? FLEET_MISSIONS.PATROL : fleet.mission);
  fleet.mission = route.seaIds.length > 1 ? FLEET_MISSIONS.TRANSIT : fleet.postTransitMission;
  if (route.seaIds.length <= 1) { fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; }
  return { ordered: true, route: [...route.seaIds], passageIds: [...(route.passageIds || [])] };
}

function advanceFleetRoute(fleet, weeks) {
  if (fleet.locationType !== 'sea' || !fleet.routeSeaIds?.length || fleet.routeSeaIds.length <= 1) return false;
  fleet.transitProgressWeeks = (fleet.transitProgressWeeks || 0) + weeks;
  let moved = false;
  while (fleet.routeIndex < fleet.routeSeaIds.length - 1) {
    const hopWeeks = Math.max(0.45, 1.35 / Math.max(0.35, fleetAverageSpeed(fleet)));
    if (fleet.transitProgressWeeks < hopWeeks) break;
    fleet.transitProgressWeeks -= hopWeeks;
    fleet.routeIndex += 1;
    fleet.seaRegionId = fleet.routeSeaIds[fleet.routeIndex];
    moved = true;
  }
  if (fleet.routeIndex >= fleet.routeSeaIds.length - 1) {
    fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; fleet.transitProgressWeeks = 0;
    fleet.mission = fleet.postTransitMission || FLEET_MISSIONS.PATROL;
    fleet.postTransitMission = null;
  }
  return moved;
}

export function orderFleetHome(fleet, regionsById, seaRegionsById) {
  const home = regionsById.get(fleet.homePortRegionId);
  if (!home || !(home.adjacentSeaIds || []).length) return { ordered: false, reason: 'no_home_sea_access' };
  if (fleet.locationType === 'sea' && (home.adjacentSeaIds || []).includes(fleet.seaRegionId)) {
    fleet.mission = FLEET_MISSIONS.RETURN_REFIT;
    fleet.missionTargetId = null;
    return { ordered: true, alreadyAdjacent: true, route: [fleet.seaRegionId] };
  }
  let best = null;
  for (const seaId of home.adjacentSeaIds) {
    if (!seaRegionsById.has(seaId)) continue;
    let starts = [];
    if (fleet.locationType === 'sea' && fleet.seaRegionId) starts = [fleet.seaRegionId];
    else if (fleet.locationType === 'port') starts = [...(regionsById.get(fleet.portRegionId)?.adjacentSeaIds || [])];
    const route = maritimeRouteBetween({ adjacentSeaIds: starts }, { adjacentSeaIds: [seaId] });
    if (!route?.seaIds?.length) continue;
    if (!best || route.seaIds.length < best.route.seaIds.length) best = { seaId, route };
  }
  if (!best) return { ordered: false, reason: 'no_route_home' };
  const result = orderFleetToSea(fleet, best.seaId, regionsById, seaRegionsById, FLEET_MISSIONS.RETURN_REFIT);
  if (result.ordered) fleet.missionTargetId = null;
  return result;
}

function pursuitScore(fleet, regionsById, rng) {
  const region = regionsById.get(fleet.ownerRegionId);
  const skill = region ? maritimeSkillMultiplier(region, MARITIME_SKILLS.SCOUTING) : 1;
  const combatSkill = region ? maritimeSkillMultiplier(region, MARITIME_SKILLS.COMBAT) : 1;
  const shipPursuit = fleet.ships.length
    ? fleet.ships.reduce((sum, ship) => sum + designOf(ship).pursuit, 0) / fleet.ships.length : 0;
  return fleetAverageSpeed(fleet) * shipPursuit * Math.sqrt(skill * combatSkill) * (0.82 + rng() * 0.36);
}

export function attemptPursuit(attacker, target, regionsById, rng = Math.random) {
  const attackerScore = pursuitScore(attacker, regionsById, rng);
  let targetScore = pursuitScore(target, regionsById, rng);
  if (target.mission === FLEET_MISSIONS.HIDE) targetScore *= 1.15;
  if (target.mission === FLEET_MISSIONS.BLOCKADE) targetScore *= 0.95;
  return { caught: attackerScore >= targetScore, attackerScore, targetScore };
}

function removeRandomShip(fleet, rng) {
  if (!fleet.ships.length) return null;
  const index = Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length));
  return fleet.ships.splice(index, 1)[0];
}

function damageRandomShip(fleet, amount, rng) {
  if (!fleet.ships.length) return null;
  const ship = fleet.ships[Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length))];
  ship.condition = clamp((ship.condition ?? fleet.condition) - amount, 0.05, 1);
  return ship;
}

function lossesForSide(fleet, enemyShare, rng, portProtected = false) {
  const results = { sunk: [], capturedCandidates: [], damaged: [] };
  const exposure = clamp(enemyShare * (portProtected ? 0.55 : 1), 0, 1);
  const attempts = Math.min(fleet.ships.length, Math.max(0, Math.floor(fleet.ships.length * exposure * (0.12 + rng() * 0.18) + rng())));
  for (let i = 0; i < attempts; i++) {
    const roll = rng();
    if (roll < 0.38) {
      const ship = removeRandomShip(fleet, rng);
      if (ship) results.sunk.push(ship);
    } else if (roll < 0.72) {
      const ship = removeRandomShip(fleet, rng);
      if (ship) results.capturedCandidates.push(ship);
    } else {
      const ship = damageRandomShip(fleet, 0.15 + rng() * 0.35, rng);
      if (ship) results.damaged.push(ship);
    }
  }
  return results;
}

function captureCandidates(winner, loser, candidates, winnerShare, rng) {
  const captured = [];
  const escaped = [];
  for (const ship of candidates) {
    const spec = designOf(ship);
    const chance = clamp(0.18 + winnerShare * 0.42 - spec.captureResistance * 0.12);
    if (rng() < chance) {
      ship.ownerRegionId = winner.ownerRegionId;
      ship.capturedFromActorId = loser.ownerActorId;
      ship.prize = true;
      ship.condition = Math.min(ship.condition ?? 0.5, 0.55);
      winner.ships.push(ship);
      captured.push(ship);
    } else {
      ship.condition = Math.min(ship.condition ?? 0.5, 0.5);
      loser.ships.push(ship);
      escaped.push(ship);
    }
  }
  return { captured, escaped };
}

function aggregateShipList(ships) {
  const counts = {};
  for (const ship of ships) counts[shipLabel(ship)] = (counts[shipLabel(ship)] || 0) + 1;
  return counts;
}

function damagePortInfrastructure(port, severity, rng) {
  if (!port?.construction?.assets) return [];
  const targets = port.construction.assets.filter((asset) => ['harbour', 'shipyard', 'naval_base', 'coastal_fortifications'].includes(asset.typeId));
  const damaged = [];
  for (const asset of targets) {
    if (rng() > severity) continue;
    const amount = 0.08 + severity * (0.18 + rng() * 0.25);
    asset.condition = clamp((asset.condition ?? 1) - amount);
    damaged.push({ typeId: asset.typeId, damage: amount, condition: asset.condition });
  }
  return damaged;
}

export function resolveFleetBattle(attacker, defender, regionsById, rng = Math.random, options = {}) {
  const defenderInPort = Boolean(options.defenderInPort || defender.locationType === 'port');
  const attackerOrigin = regionsById.get(attacker.ownerRegionId);
  const defenderOrigin = regionsById.get(defender.ownerRegionId);
  const attackerGunnery = attackerOrigin ? navalGunCombatProfile(attackerOrigin, attacker.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const defenderGunnery = defenderOrigin ? navalGunCombatProfile(defenderOrigin, defender.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const attackerPower = fleetCombatPower(attacker, regionsById) * attackerGunnery.multiplier;
  const defenderPower = fleetCombatPower(defender, regionsById, { inPort: defenderInPort }) * defenderGunnery.multiplier;
  const total = Math.max(0.001, attackerPower + defenderPower);
  const attackerShare = attackerPower / total;
  const defenderShare = 1 - attackerShare;

  const attackerLoss = lossesForSide(attacker, defenderShare, rng, false);
  const defenderLoss = lossesForSide(defender, attackerShare, rng, defenderInPort);
  const attackerCapture = captureCandidates(defender, attacker, attackerLoss.capturedCandidates, defenderShare, rng);
  const defenderCapture = captureCandidates(attacker, defender, defenderLoss.capturedCandidates, attackerShare, rng);

  const intensity = (attackerLoss.sunk.length + defenderLoss.sunk.length + attackerCapture.captured.length + defenderCapture.captured.length +
    attackerLoss.damaged.length + defenderLoss.damaged.length + 1) * 6;
  if (attackerOrigin) recordMaritimePractice(attackerOrigin, MARITIME_SKILLS.COMBAT, intensity);
  if (defenderOrigin) recordMaritimePractice(defenderOrigin, MARITIME_SKILLS.COMBAT, intensity);

  attacker.morale = clamp(attacker.morale + (attackerShare - 0.5) * 0.12);
  defender.morale = clamp(defender.morale + (defenderShare - 0.5) * 0.12);
  attacker.condition = clamp(attacker.condition - (attackerLoss.damaged.length + attackerLoss.sunk.length) * 0.015);
  defender.condition = clamp(defender.condition - (defenderLoss.damaged.length + defenderLoss.sunk.length) * 0.015);

  let portDamage = [];
  if (defenderInPort && attackerShare > 0.58 && options.allowPortDamage !== false) {
    const port = regionsById.get(defender.portRegionId);
    portDamage = damagePortInfrastructure(port, clamp((attackerShare - 0.5) * 1.4), rng);
  }

  return {
    attackerShare,
    defenderShare,
    attackerLost: aggregateShipList(attackerLoss.sunk),
    defenderLost: aggregateShipList(defenderLoss.sunk),
    attackerCapturedByDefender: aggregateShipList(attackerCapture.captured),
    defenderCapturedByAttacker: aggregateShipList(defenderCapture.captured),
    attackerDamaged: aggregateShipList(attackerLoss.damaged),
    defenderDamaged: aggregateShipList(defenderLoss.damaged),
    portDamage,
    attackerGunnery, defenderGunnery,
    attackerWon: attackerShare > 0.5,
  };
}

function contactDescription(observer, target, identification, regionsById) {
  const presented = identification.presentedActorId ? representativeRegionForActor(identification.presentedActorId, regionsById) : null;
  const counts = fleetShipCounts(target);
  const composition = Object.entries(counts).map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`).join(', ');
  if (identification.imposterOfObserver) {
    return `Lookouts report ${composition || 'a fleet'} flying our own flag. The ships are not ours. These impostors dared to falsely imitate us.`;
  }
  if (!identification.presentedActorId) {
    return `Lookouts report ${composition || 'a fleet'} carrying no recognised flag.`;
  }
  const mismatch = identification.designMismatch ? ' Its design appears inconsistent with what we know of that fleet.' : '';
  if (identification.actualActorId && identification.actualActorId !== identification.presentedActorId) {
    return `Lookouts report ${composition || 'a fleet'} flying the flag of ${presented?.name || 'another polity'}, but experienced observers believe the flag is false.${mismatch}`;
  }
  return `Lookouts report ${composition || 'a fleet'} flying the flag of ${presented?.name || 'another polity'}.${mismatch}`;
}

function createContact(observer, target, currentTick, regionsById, rng) {
  const identification = identifyFleet(observer, target, regionsById, rng);
  return {
    id: `encounter-${nextEncounterId++}`,
    type: 'fleet_contact',
    tick: currentTick,
    observerFleetId: observer.id,
    targetFleetId: target.id,
    seaRegionId: observer.seaRegionId,
    identification,
    description: contactDescription(observer, target, identification, regionsById),
    choices: ['hail', 'attack', 'leave'],
    resolved: false,
  };
}

function perceivedActor(contact) {
  return contact.identification.actualActorId || contact.identification.presentedActorId || null;
}

function aiContactChoice(observer, target, contact, regionsById) {
  const observerRegion = regionsById.get(observer.ownerRegionId);
  const perceived = perceivedActor(contact);
  if (contact.identification.imposterOfObserver) return 'attack';
  if (!perceived || !observerRegion) return observer.mission === FLEET_MISSIONS.INTERCEPT ? 'hail' : 'leave';
  const representative = representativeRegionForActor(perceived, regionsById);
  const attitude = representative ? attitudeToward(observerRegion, representative.id) : 0;
  if ((observer.mission === FLEET_MISSIONS.INTERCEPT || observer.mission === FLEET_MISSIONS.BLOCKADE) && attitude <= -0.35) return 'attack';
  if (observer.mission === FLEET_MISSIONS.PATROL && attitude <= -0.6) return 'attack';
  return contact.identification.falseFlagDetected ? 'hail' : 'leave';
}

function battleEvent(attacker, defender, result, contact = null) {
  return {
    type: 'fleet_battle',
    attackerName: attacker.name, defenderName: defender.name,
    attackerFleetId: attacker.id,
    defenderFleetId: defender.id,
    attackerOwnerRegionId: attacker.ownerRegionId,
    defenderOwnerRegionId: defender.ownerRegionId,
    attackerOwnerActorId: attacker.ownerActorId,
    defenderOwnerActorId: defender.ownerActorId,
    result,
    contact,
  };
}

export function resolveFleetContact(contact, choice, fleets, regionsById, currentTick, rng = Math.random) {
  if (!contact || contact.resolved) return [];
  const observer = fleets.find((fleet) => fleet.id === contact.observerFleetId);
  const target = fleets.find((fleet) => fleet.id === contact.targetFleetId);
  if (!observer || !target) { contact.resolved = true; return []; }
  contact.resolved = true;
  if (choice === 'leave') return [{ type: 'fleet_contact_ended', contact, outcome: 'left_alone' }];
  if (choice === 'hail') {
    // Hailing improves identification but also tells the other fleet it has
    // been found. False flags are not automatically pierced unless the
    // observer has evidence; own-flag impostors remain perfectly obvious.
    const identification = identifyFleet(observer, target, regionsById, rng);
    identification.certainty = clamp(identification.certainty + 0.18);
    contact.identification = identification;
    return [{ type: 'fleet_hail', contact, targetResponded: rng() < 0.75 }];
  }
  if (choice !== 'attack') return [];

  const targetPower = fleetCombatPower(target, regionsById);
  const observerPower = fleetCombatPower(observer, regionsById);
  const targetChoosesFlight = target.mission === FLEET_MISSIONS.HIDE || targetPower < observerPower * 0.82;
  if (targetChoosesFlight) {
    const pursuit = attemptPursuit(observer, target, regionsById, rng);
    if (!pursuit.caught) return [{ type: 'fleet_escaped', contact, attackerFleetId: observer.id, targetFleetId: target.id, pursuit }];
  }
  const result = resolveFleetBattle(observer, target, regionsById, rng);
  return [battleEvent(observer, target, result, contact)];
}

function applyBlockades(fleets, regionsById) {
  for (const region of regionsById.values()) {
    region.navalBlockadePressure = 0;
    region.fleetPatrolCoverage = 0;
    region.navalDeployedBoats = 0;
  }
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || !fleet.ships.length) continue;
    const owner = regionsById.get(fleet.ownerRegionId);
    if (!owner) continue;
    regionPresence(owner, fleet);
  }
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || fleet.mission !== FLEET_MISSIONS.BLOCKADE || !fleet.missionTargetId) continue;
    const target = regionsById.get(fleet.missionTargetId);
    if (!target || !(target.adjacentSeaIds || []).includes(fleet.seaRegionId)) continue;
    const blockader = fleetCombatPower(fleet, regionsById);
    const harbour = operationalInfrastructure(target, 'harbour') ? 1.15 : 1;
    target.navalBlockadePressure = clamp(Math.max(target.navalBlockadePressure || 0,
      (1 - Math.exp(-blockader / 18)) / harbour));
  }
}

function regionPresence(owner, fleet) {
  owner.navalDeployedBoats = (owner.navalDeployedBoats || 0) + fleet.ships.length;
  if (fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT || fleet.mission === FLEET_MISSIONS.ESCORT) {
    const total = Math.max(1, owner.navy?.boats || fleet.ships.length);
    owner.fleetPatrolCoverage = clamp((owner.fleetPatrolCoverage || 0) + fleet.ships.length / total);
  }
}

function chooseAiFleetOrders(fleets, regionsById, seaRegionsById, playerActorId, rng, weeks) {
  for (const fleet of fleets) {
    if (!fleet.ships.length || fleet.ownerActorId === playerActorId) continue;
    const owner = regionsById.get(fleet.ownerRegionId);
    if (!owner) continue;
    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72)) {
      orderFleetHome(fleet, regionsById, seaRegionsById);
      continue;
    }
    if (fleet.locationType !== 'port' || fleet.supply < 0.88 || fleet.condition < 0.82 || fleet.fatigue > 0.2) continue;
    const chance = 1 - Math.pow(1 - 0.035, Math.max(0.25, weeks));
    if (rng() > chance) continue;
    const port = regionsById.get(fleet.portRegionId);
    const seas = (port?.adjacentSeaIds || []).filter((id) => seaRegionsById.has(id));
    if (!seas.length) continue;
    const seaId = seas[Math.floor(rng() * seas.length)];
    const sea = seaRegionsById.get(seaId);
    const hostile = (sea?.adjacentLand || []).map((id) => regionsById.get(id)).filter((r) => r && actorId(r) !== fleet.ownerActorId && attitudeToward(owner, r.id) <= -0.55);
    const priority = owner.militaryPolicy?.navalPriority || 'trade';
    let mission = priority === 'war' ? FLEET_MISSIONS.INTERCEPT : FLEET_MISSIONS.PATROL;
    let targetId = null;
    if (priority === 'war' && hostile.length && fleet.ships.length >= 3) {
      const target = hostile[Math.floor(rng() * hostile.length)];
      targetId = target.id;
      mission = fleet.ships.length >= 6 && rng() < 0.08 ? FLEET_MISSIONS.PORT_ASSAULT : FLEET_MISSIONS.BLOCKADE;
    }
    deployFleet(fleet, seaId, regionsById, seaRegionsById);
    fleet.mission = mission; fleet.missionTargetId = targetId;
  }
}

function portAssaults(fleets, regionsById, currentTick, rng) {
  const events = [];
  for (const attacker of fleets) {
    if (attacker.locationType !== 'sea' || attacker.mission !== FLEET_MISSIONS.PORT_ASSAULT || !attacker.missionTargetId) continue;
    const targetPort = regionsById.get(attacker.missionTargetId);
    if (!targetPort || !(targetPort.adjacentSeaIds || []).includes(attacker.seaRegionId)) continue;
    const defenders = fleets.filter((fleet) => fleet.locationType === 'port' && fleet.portRegionId === targetPort.id &&
      fleet.ownerActorId !== attacker.ownerActorId && fleet.ships.length > 0);
    for (const defender of defenders) {
      const result = resolveFleetBattle(attacker, defender, regionsById, rng, { defenderInPort: true, allowPortDamage: true });
      events.push({ ...battleEvent(attacker, defender, result), type: 'fleet_port_assault', portRegionId: targetPort.id, tick: currentTick });
      if (!attacker.ships.length) break;
    }
  }
  return events;
}

export function dockFleet(fleet, portRegionId, regionsById, agreements = []) {
  const port = regionsById.get(portRegionId);
  if (!port) return { docked: false, reason: 'missing_port' };
  if (fleet.locationType === 'sea' && !(port.adjacentSeaIds || []).includes(fleet.seaRegionId)) return { docked: false, reason: 'port_not_on_this_sea' };
  const access = portAccessLevel(fleet, port, regionsById, agreements);
  if (access === 'denied') return { docked: false, reason: 'no_access' };
  fleet.locationType = 'port';
  fleet.portRegionId = portRegionId;
  fleet.seaRegionId = null;
  fleet.mission = FLEET_MISSIONS.PORT;
  fleet.missionTargetId = null;
  fleet.routeSeaIds = []; fleet.routeIndex = 0; fleet.routeDestinationSeaId = null; fleet.postTransitMission = null;
  return { docked: true, access };
}

export function deployFleet(fleet, seaRegionId, regionsById, seaRegionsById) {
  if (!seaRegionsById.has(seaRegionId)) return false;
  const fromPort = fleet.locationType === 'port' ? fleet.portRegionId : null;
  const portRegion = fromPort ? regionsById.get(fromPort) : null;
  if (fromPort && !(portRegion?.adjacentSeaIds || []).includes(seaRegionId)) return false;
  fleet.locationType = 'sea';
  fleet.portRegionId = null;
  fleet.seaRegionId = seaRegionId;
  if (fleet.mission === FLEET_MISSIONS.PORT) fleet.mission = FLEET_MISSIONS.PATROL;
  return true;
}

export function tickFleets(fleets, regions, seaRegions, agreements, currentTick, elapsedDays = 7, rng = Math.random, options = {}) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const seaRegionsById = new Map(seaRegions.map((sea) => [sea.id, sea]));
  const weeks = Math.max(0.01, elapsedDays / 7);
  const events = [];
  reconcileFleetLedger(regions, fleets, events);

  for (const fleet of fleets) {
    ensureFleetState(fleet);
    if (!fleet.ships.length) continue;
    if (fleet.locationType === 'port') serviceInPort(fleet, regionsById, agreements, weeks);
    else {
      wearAtSea(fleet, weeks);
      advanceFleetRoute(fleet, weeks);
      const origin = regionsById.get(fleet.ownerRegionId);
      if (origin) {
        const practice = fleet.ships.length * weeks * (fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT ? 2 : 0.8);
        recordMaritimePractice(origin, fleet.mission === FLEET_MISSIONS.PATROL || fleet.mission === FLEET_MISSIONS.INTERCEPT
          ? MARITIME_SKILLS.SCOUTING : MARITIME_SKILLS.COMBAT, practice);
      }
    }
  }

  // A player or AI may set return_refit while far from home. Turn that order
  // into a real routed voyage rather than teleporting to harbour.
  for (const fleet of fleets) {
    if (fleet.locationType === 'sea' && fleet.mission === FLEET_MISSIONS.RETURN_REFIT && !fleet.routeSeaIds?.length) {
      orderFleetHome(fleet, regionsById, seaRegionsById);
    }
  }
  chooseAiFleetOrders(fleets, regionsById, seaRegionsById, options.playerActorId || null, rng, weeks);
  applyBlockades(fleets, regionsById);

  // A return/refit order docks automatically once the fleet reaches a sea
  // touching its home port; fleets farther away keep transiting normally.
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || fleet.mission !== FLEET_MISSIONS.RETURN_REFIT) continue;
    const home = regionsById.get(fleet.homePortRegionId);
    if (home && (home.adjacentSeaIds || []).includes(fleet.seaRegionId)) dockFleet(fleet, home.id, regionsById, agreements);
  }

  const bySea = new Map();
  for (const fleet of fleets) {
    if (fleet.locationType !== 'sea' || !fleet.seaRegionId || !fleet.ships.length) continue;
    if (!bySea.has(fleet.seaRegionId)) bySea.set(fleet.seaRegionId, []);
    bySea.get(fleet.seaRegionId).push(fleet);
  }

  for (const seaFleets of bySea.values()) {
    for (const observer of seaFleets) {
      if (!canSearch(observer)) continue;
      for (const target of seaFleets) {
        if (target === observer || target.ownerActorId === observer.ownerActorId) continue;
        const last = Number(observer.lastContactTickByFleet[target.id]) || -Infinity;
        if (currentTick - last < 4) continue;
        if (rng() >= detectionChance(observer, target, regionsById, weeks)) continue;
        observer.lastContactTickByFleet[target.id] = currentTick;
        const contact = createContact(observer, target, currentTick, regionsById, rng);
        const playerActorId = options.playerActorId || null;
        if (playerActorId && observer.ownerActorId === playerActorId) {
          events.push(contact);
        } else {
          const choice = aiContactChoice(observer, target, contact, regionsById);
          events.push(...resolveFleetContact(contact, choice, fleets, regionsById, currentTick, rng));
        }
      }
    }
  }

  events.push(...portAssaults(fleets, regionsById, currentTick, rng));
  for (let i = fleets.length - 1; i >= 0; i--) if (!fleets[i].ships.length) fleets.splice(i, 1);
  syncRegionalNavyLedger(regions, fleets);
  return { fleets, events, regionsById, seaRegionsById };
}

export function fleetEventInvolvesActor(event, actor, fleets) {
  if (!actor || !event) return false;
  if (event.ownerActorId === actor || event.attackerOwnerActorId === actor || event.defenderOwnerActorId === actor) return true;
  const ids = [event.observerFleetId, event.targetFleetId, event.attackerFleetId, event.defenderFleetId].filter(Boolean);
  return ids.some((id) => fleets.find((fleet) => fleet.id === id)?.ownerActorId === actor) ||
    Boolean(event.attackerOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.attackerOwnerRegionId && fleet.ownerActorId === actor)) ||
    Boolean(event.defenderOwnerRegionId && fleets.some((fleet) => fleet.ownerRegionId === event.defenderOwnerRegionId && fleet.ownerActorId === actor));
}

export function formatShipOutcome(counts = {}) {
  const parts = Object.entries(counts).filter(([, count]) => count > 0)
    .map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'none';
}
