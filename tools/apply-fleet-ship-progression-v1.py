from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)


fleet_path = Path('js/military/fleets.js')
fleet = fleet_path.read_text()

fleet = replace_once(fleet,
"import { ensureFleetProvisioning, provisioningCombatMultiplier, serviceProvisioningInPort, shouldReturnForProvisioning, tickProvisioningAtSea } from './oceanicProvisioning.js?v=20260913-provisioning1';",
"import { ensureFleetProvisioning, provisioningCombatMultiplier, serviceProvisioningInPort, shouldReturnForProvisioning, tickProvisioningAtSea } from './oceanicProvisioning.js?v=20260913-provisioning1';\nimport { MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID, STEEL_HULL_TECH_ID } from '../technology/industrialMarine.js?v=20260916-steam1';",
'import industrial marine tech')

old_designs = """// The combat engine talks to ship designs rather than assuming that every ship
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
});"""
new_designs = """// Persistent ship classes span the whole simulation. They are capability-gated,
// not date-gated: a region has to accumulate the boatbuilding, navigation,
// gunnery, steam and metallurgical capability needed to construct/refit them.
export const SHIP_DESIGNS = Object.freeze({
  basic_war_boat: {
    id: 'basic_war_boat', label: 'war boat', tier: 0, advanced: false, propulsion: 'oar_sail', crew: 8, speed: 1.0,
    combat: 1.0, durability: 1.0, pursuit: 1.0, captureResistance: 0.75, gunCapacity: 1, armour: 0,
  },
  galley: {
    id: 'galley', label: 'galley', tier: 1, advanced: true, propulsion: 'oar', crew: 18, speed: 1.24,
    combat: 1.55, durability: 1.22, pursuit: 1.18, captureResistance: 0.86, gunCapacity: 2, armour: 0,
    refitCost: { wood: 60, pitch: 4, textiles: 3, metal: 1 },
  },
  ocean_sailing_warship: {
    id: 'ocean_sailing_warship', label: 'ocean-going sailing warship', tier: 2, advanced: true, propulsion: 'sail', crew: 20, speed: 1.34,
    combat: 1.75, durability: 1.32, pursuit: 1.20, captureResistance: 0.90, gunCapacity: 3, armour: 0,
    refitCost: { wood: 100, pitch: 8, textiles: 8, metal: 2 },
  },
  gunpowder_sailing_warship: {
    id: 'gunpowder_sailing_warship', label: 'armed sailing warship', tier: 3, advanced: true, propulsion: 'sail', crew: 24, speed: 1.30,
    combat: 2.05, durability: 1.42, pursuit: 1.14, captureResistance: 0.93, gunCapacity: 6, armour: 0.05,
    refitCost: { wood: 120, pitch: 8, textiles: 10, metal: 4, gunpowder: 0.5 },
  },
  frigate: {
    id: 'frigate', label: 'frigate', tier: 4, advanced: true, propulsion: 'sail', crew: 30, speed: 1.52,
    combat: 2.45, durability: 1.52, pursuit: 1.42, captureResistance: 0.96, gunCapacity: 10, armour: 0.08,
    refitCost: { wood: 180, pitch: 12, textiles: 14, metal: 8, gunpowder: 1 },
  },
  ship_of_line: {
    id: 'ship_of_line', label: 'ship of the line', tier: 4, advanced: true, propulsion: 'sail', crew: 48, speed: 1.20,
    combat: 3.35, durability: 1.90, pursuit: 0.92, captureResistance: 1.05, gunCapacity: 18, armour: 0.12,
    refitCost: { wood: 280, pitch: 18, textiles: 18, metal: 16, gunpowder: 2 },
  },
  paddle_steam_warship: {
    id: 'paddle_steam_warship', label: 'paddle steam warship', tier: 5, advanced: true, propulsion: 'steam', crew: 34, speed: 1.62,
    fallbackSpeed: 0.82, combat: 2.75, durability: 1.62, pursuit: 1.48, captureResistance: 0.98, gunCapacity: 11, armour: 0.10,
    coalCapacity: 18, coalPerWeek: 1.5, refitCost: { wood: 160, iron: 12, coal: 10, machine: 4 },
  },
  steam_frigate: {
    id: 'steam_frigate', label: 'screw steam frigate', tier: 6, advanced: true, propulsion: 'steam', crew: 36, speed: 1.82,
    fallbackSpeed: 0.88, combat: 3.15, durability: 1.75, pursuit: 1.65, captureResistance: 1.0, gunCapacity: 13, armour: 0.14,
    coalCapacity: 24, coalPerWeek: 1.8, refitCost: { wood: 140, iron: 18, coal: 12, machine: 6 },
  },
  ironclad: {
    id: 'ironclad', label: 'ironclad', tier: 7, advanced: true, propulsion: 'steam', crew: 40, speed: 1.55,
    fallbackSpeed: 0.48, combat: 3.55, durability: 2.65, pursuit: 1.18, captureResistance: 1.18, gunCapacity: 14, armour: 1.0,
    coalCapacity: 30, coalPerWeek: 2.2, refitCost: { wood: 80, iron: 40, coal: 14, machine: 8 },
  },
  steel_warship: {
    id: 'steel_warship', label: 'steel steam warship', tier: 8, advanced: true, propulsion: 'steam', crew: 42, speed: 1.72,
    fallbackSpeed: 0.38, combat: 4.10, durability: 3.05, pursuit: 1.30, captureResistance: 1.24, gunCapacity: 16, armour: 1.25,
    coalCapacity: 36, coalPerWeek: 2.5, refitCost: { wood: 40, steel: 55, coal: 16, machine: 10 },
  },
  // Save compatibility only. New construction no longer creates the old catch-all.
  advanced_warship: {
    id: 'advanced_warship', label: 'legacy advanced warship', tier: 1, advanced: true, propulsion: 'oar_sail', crew: 12, speed: 1.28,
    combat: 1.55, durability: 1.30, pursuit: 1.20, captureResistance: 0.90, gunCapacity: 2, armour: 0,
  },
});"""
fleet = replace_once(fleet, old_designs, new_designs, 'ship designs')

old_helpers = """function designOf(ship) { return SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }
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
}"""
new_helpers = """function designOf(ship) { return SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }
function shipLabel(ship) { return ship?.classLabel || designOf(ship).label; }
function isAdvancedShip(ship) { return Boolean(designOf(ship).advanced); }
function shipTier(ship) { return designOf(ship).tier || 0; }

export function preferredWarshipDesign(region, serial = 0) {
  const tech = region?.unlockedTechIds;
  if (tech?.has(STEEL_HULL_TECH_ID)) return 'steel_warship';
  if (tech?.has(IRON_HULL_TECH_ID)) return 'ironclad';
  if (tech?.has(SCREW_PROPULSION_TECH_ID)) return 'steam_frigate';
  if (tech?.has(MARINE_STEAM_TECH_ID)) return 'paddle_steam_warship';
  if (tech?.has('gunpowder') && tech?.has('ocean_sailing')) {
    const readiness = clamp(region.earlyModernMilitary?.naval?.readiness || 0);
    const heavyFleet = region.militaryPolicy?.navalPriority === 'war' && readiness >= 0.60 && operationalInfrastructure(region, 'naval_base');
    if (heavyFleet && serial % 3 === 0) return 'ship_of_line';
    if (readiness >= 0.30 && operationalInfrastructure(region, 'shipyard')) return 'frigate';
    return 'gunpowder_sailing_warship';
  }
  if (tech?.has('ocean_sailing')) return 'ocean_sailing_warship';
  if (tech?.has('advanced_boatbuilding')) return 'galley';
  return 'basic_war_boat';
}

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
    gunCapacity: spec.gunCapacity || 1,
    propulsion: spec.propulsion || 'oar_sail',
    armour: spec.armour || 0,
    ...overrides,
  };
}

function fleetCoalCapacity(fleet) {
  return (fleet.ships || []).reduce((sum, ship) => sum + Math.max(0, designOf(ship).coalCapacity || 0), 0);
}

function consumeFleetCoal(fleet, weeks) {
  const need = (fleet.ships || []).reduce((sum, ship) => sum + Math.max(0, designOf(ship).coalPerWeek || 0), 0) * Math.max(0, weeks);
  if (need <= 0) { fleet.steamFuelFraction = 1; return 0; }
  const used = Math.min(Math.max(0, fleet.coalBunker || 0), need);
  fleet.coalBunker = Math.max(0, (fleet.coalBunker || 0) - used);
  fleet.steamFuelFraction = clamp(used / need);
  return used;
}

function effectiveShipSpeed(ship, fleet) {
  const spec = designOf(ship);
  if (!spec.coalPerWeek) return spec.speed;
  const fuel = clamp(fleet.steamFuelFraction ?? 1);
  const fallback = spec.fallbackSpeed ?? spec.speed * 0.45;
  return fallback + (spec.speed - fallback) * fuel;
}

function takeRefitMetal(region, amount, preferred = null) {
  if (amount <= 0) return true;
  const keys = preferred ? [preferred] : ['steel', 'iron', 'bronze'];
  if (keys.reduce((sum, key) => sum + Math.max(0, region.stockpile?.[key] || 0), 0) < amount) return false;
  let left = amount;
  for (const key of keys) {
    const take = Math.min(left, Math.max(0, region.stockpile?.[key] || 0));
    if (take > 0) region.stockpile[key] -= take;
    left -= take;
  }
  return left <= 1e-9;
}

function payRefitCost(region, designId) {
  const cost = SHIP_DESIGNS[designId]?.refitCost || {};
  const stock = region.stockpile || {};
  const inventory = region.industrialSupply?.inventory || {};
  for (const [key, amount] of Object.entries(cost)) {
    if (key === 'metal') {
      if (Math.max(0, stock.steel || 0) + Math.max(0, stock.iron || 0) + Math.max(0, stock.bronze || 0) < amount) return false;
    } else if (key === 'machine') {
      if (Math.max(0, inventory.machine_components || 0) < amount) return false;
    } else if (Math.max(0, stock[key] || 0) < amount) return false;
  }
  for (const [key, amount] of Object.entries(cost)) {
    if (key === 'metal') takeRefitMetal(region, amount);
    else if (key === 'machine') inventory.machine_components -= amount;
    else stock[key] -= amount;
  }
  return true;
}

function moderniseOwnedFleet(region, fleets, weeks, events) {
  if (!operationalInfrastructure(region, 'shipyard') && !operationalInfrastructure(region, 'naval_base')) return;
  for (const fleet of fleets) {
    if (fleet.locationType !== 'port' || fleet.portRegionId !== region.id) continue;
    fleet.refitProgress = Math.max(0, fleet.refitProgress || 0) + Math.max(0, weeks) * (operationalInfrastructure(region, 'naval_base') ? 0.06 : 0.035);
    if (fleet.refitProgress < 1) continue;
    const candidates = fleet.ships.map((ship, index) => ({ ship, index, target: preferredWarshipDesign(region, index) }))
      .filter(({ ship, target }) => isAdvancedShip(ship) && (SHIP_DESIGNS[target]?.tier || 0) > shipTier(ship))
      .sort((a, b) => shipTier(a.ship) - shipTier(b.ship));
    const choice = candidates[0];
    if (!choice || !payRefitCost(region, choice.target)) continue;
    const oldLabel = shipLabel(choice.ship);
    const replacement = makeShip(choice.target, region.id, { id: choice.ship.id, prize: false, capturedFromActorId: null });
    fleet.ships[choice.index] = replacement;
    fleet.refitProgress -= 1;
    if (events) events.push({ type: 'fleet_ship_modernised', ownerRegionId: region.id, fleetId: fleet.id,
      shipId: replacement.id, fromClassLabel: oldLabel, toClassLabel: replacement.classLabel });
  }
}"""
fleet = replace_once(fleet, old_helpers, new_helpers, 'fleet design helpers')

fleet = replace_once(fleet,
"""  fleet.lastContactTickByFleet ||= {};
  fleet.history ||= [];
  ensureFleetProvisioning(fleet);""",
"""  fleet.lastContactTickByFleet ||= {};
  fleet.history ||= [];
  fleet.coalBunker = Math.max(0, Number(fleet.coalBunker) || 0);
  fleet.steamFuelFraction = clamp(fleet.steamFuelFraction ?? 1);
  for (const ship of fleet.ships) {
    const spec = designOf(ship);
    ship.classLabel ||= spec.label;
    ship.gunCapacity ||= spec.gunCapacity || 1;
    ship.propulsion ||= spec.propulsion || 'oar_sail';
    if (!Number.isFinite(ship.armour)) ship.armour = spec.armour || 0;
  }
  ensureFleetProvisioning(fleet);""",
'fleet fuel compatibility')

fleet = replace_once(fleet,
"""  for (let i = 0; i < advanced; i++) ships.push(makeShip('advanced_warship', region.id));
  for (let i = advanced; i < total; i++) ships.push(makeShip('basic_war_boat', region.id));""",
"""  for (let i = 0; i < advanced; i++) ships.push(makeShip(preferredWarshipDesign(region, i), region.id));
  for (let i = advanced; i < total; i++) ships.push(makeShip('basic_war_boat', region.id));""",
'initial ship class selection')

fleet = replace_once(fleet,
"export function reconcileFleetLedger(regions, fleets, events = null) {",
"export function reconcileFleetLedger(regions, fleets, events = null, weeks = 1) {",
'reconcile elapsed weeks')
fleet = fleet.replace("current.filter(({ ship }) => ship.designId === 'advanced_warship').length", "current.filter(({ ship }) => isAdvancedShip(ship)).length")
fleet = fleet.replace("retireOne((ship) => ship.designId === 'advanced_warship')", "retireOne((ship) => isAdvancedShip(ship))")
fleet = fleet.replace("target.ships.push(makeShip('advanced_warship', region.id))", "target.ships.push(makeShip(preferredWarshipDesign(region, i), region.id))")
fleet = fleet.replace("fleet.ships.filter((ship) => ship.designId === 'advanced_warship').length", "fleet.ships.filter((ship) => isAdvancedShip(ship)).length")

fleet = replace_once(fleet,
"""    const basicWanted = wantedTotal - wantedAdvanced;
    for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
  }
  return fleets;""",
"""    const basicWanted = wantedTotal - wantedAdvanced;
    for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
    moderniseOwnedFleet(region, owned, weeks, events);
  }
  return fleets;""",
'fleet modernisation')

fleet = replace_once(fleet,
"""  const provisioning = serviceProvisioningInPort(fleet, port, owner, weeks, fleetCrewCount(fleet));
  return { access, supplied, repaired: fleet.condition - before, provisioning };""",
"""  const coalCapacity = fleetCoalCapacity(fleet);
  let coalLoaded = 0;
  if (coalCapacity > 0) {
    const coalNeed = Math.max(0, coalCapacity - (fleet.coalBunker || 0));
    const coalSource = access === 'ally' ? port : owner;
    coalLoaded = Math.min(coalNeed, Math.max(0, coalSource.stockpile?.coal || 0));
    if (coalLoaded > 0) {
      coalSource.stockpile.coal -= coalLoaded;
      fleet.coalBunker += coalLoaded;
      if (access === 'ally') {
        const price = Math.max(0.01, localPrice(port, 'coal'));
        const cost = coalLoaded * price;
        const treasury = Math.min(Math.max(0, owner.treasury || 0), cost);
        const wallet = Math.min(Math.max(0, owner.wallet || 0), cost - treasury);
        const paid = treasury + wallet;
        if (paid < cost) {
          const unpaid = coalLoaded * (1 - paid / Math.max(cost, 1e-9));
          coalSource.stockpile.coal += unpaid;
          fleet.coalBunker -= unpaid;
          coalLoaded -= unpaid;
        }
        owner.treasury -= treasury; owner.wallet -= wallet; port.treasury = Math.max(0, port.treasury || 0) + paid;
      }
    }
    fleet.steamFuelFraction = coalCapacity > 0 ? clamp(fleet.coalBunker / Math.max(1, coalCapacity)) : 1;
  }
  const provisioning = serviceProvisioningInPort(fleet, port, owner, weeks, fleetCrewCount(fleet));
  return { access, supplied, repaired: fleet.condition - before, provisioning, coalLoaded };""",
'coal bunkering')

fleet = replace_once(fleet,
"""function fleetAverageSpeed(fleet) {
  if (!fleet.ships.length) return 0;
  const harmonic = fleet.ships.length / fleet.ships.reduce((sum, ship) => sum + 1 / Math.max(0.2, designOf(ship).speed), 0);
  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10) * provisioningCombatMultiplier(fleet);
}""",
"""function fleetAverageSpeed(fleet) {
  if (!fleet.ships.length) return 0;
  const harmonic = fleet.ships.length / fleet.ships.reduce((sum, ship) => sum + 1 / Math.max(0.2, effectiveShipSpeed(ship, fleet)), 0);
  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10) * provisioningCombatMultiplier(fleet);
}""",
'steam speed')

fleet = replace_once(fleet,
"""function fleetCombatPower(fleet, regionsById, { inPort = false } = {}) {
  const origin = regionsById.get(fleet.ownerRegionId);
  const shipPower = fleet.ships.reduce((sum, ship) => sum + designOf(ship).combat * clamp(ship.condition ?? fleet.condition, 0.1, 1), 0);""",
"""function fleetCombatPower(fleet, regionsById, { inPort = false } = {}) {
  const origin = regionsById.get(fleet.ownerRegionId);
  const shipPower = fleet.ships.reduce((sum, ship) => sum + designOf(ship).combat * clamp(ship.condition ?? fleet.condition, 0.1, 1), 0);""",
'combat anchor')

fleet = replace_once(fleet,
"""function advancedShareForActor(actor, regionsById) {
  const regions = [...regionsById.values()].filter((region) => actorId(region) === actor);
  const total = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.boats || 0), 0);
  const advanced = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.advancedBoats || 0), 0);
  return total > 0 ? advanced / total : 0;
}

function fleetAdvancedShare(fleet) {
  return fleet.ships.length ? fleet.ships.filter((ship) => ship.designId === 'advanced_warship').length / fleet.ships.length : 0;
}""",
"""function advancedShareForActor(actor, regionsById) {
  const regions = [...regionsById.values()].filter((region) => actorId(region) === actor);
  const total = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.boats || 0), 0);
  const advanced = regions.reduce((sum, r) => sum + Math.max(0, r.navy?.advancedBoats || 0), 0);
  return total > 0 ? advanced / total : 0;
}

function fleetAdvancedShare(fleet) {
  return fleet.ships.length ? fleet.ships.filter((ship) => isAdvancedShip(ship)).length / fleet.ships.length : 0;
}""",
'advanced fleet identity')

fleet = replace_once(fleet,
"""function lossesForSide(fleet, enemyShare, rng, portProtected = false) {
  const results = { sunk: [], capturedCandidates: [], damaged: [] };
  const exposure = clamp(enemyShare * (portProtected ? 0.55 : 1), 0, 1);""",
"""function lossesForSide(fleet, enemyShare, rng, portProtected = false) {
  const results = { sunk: [], capturedCandidates: [], damaged: [] };
  const durability = fleet.ships.length ? fleet.ships.reduce((sum, ship) => sum + Math.max(0.5, designOf(ship).durability || 1), 0) / fleet.ships.length : 1;
  const exposure = clamp(enemyShare * (portProtected ? 0.55 : 1) / Math.sqrt(durability), 0, 1);""",
'durability losses')

fleet = replace_once(fleet,
"""export function resolveFleetBattle(attacker, defender, regionsById, rng = Math.random, options = {}) {
  const defenderInPort = Boolean(options.defenderInPort || defender.locationType === 'port');
  const attackerOrigin = regionsById.get(attacker.ownerRegionId);
  const defenderOrigin = regionsById.get(defender.ownerRegionId);
  const attackerGunnery = attackerOrigin ? navalGunCombatProfile(attackerOrigin, attacker.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const defenderGunnery = defenderOrigin ? navalGunCombatProfile(defenderOrigin, defender.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const attackerPower = fleetCombatPower(attacker, regionsById) * attackerGunnery.multiplier;
  const defenderPower = fleetCombatPower(defender, regionsById, { inPort: defenderInPort }) * defenderGunnery.multiplier;""",
"""function armourResistance(fleet, enemyGunnery) {
  if (!fleet.ships.length) return 1;
  const armour = fleet.ships.reduce((sum, ship) => sum + Math.max(0, designOf(ship).armour || ship.armour || 0), 0) / fleet.ships.length;
  if (armour <= 0) return 1;
  const penetration = 0.10 + clamp(enemyGunnery?.rifledShare || 0) * 0.34 + clamp(enemyGunnery?.breechShare || 0) * 0.48 + clamp(enemyGunnery?.steelShare || 0) * 0.10;
  return 1 + armour * Math.max(0.12, 0.64 - penetration * 0.48);
}

export function resolveFleetBattle(attacker, defender, regionsById, rng = Math.random, options = {}) {
  const defenderInPort = Boolean(options.defenderInPort || defender.locationType === 'port');
  const attackerOrigin = regionsById.get(attacker.ownerRegionId);
  const defenderOrigin = regionsById.get(defender.ownerRegionId);
  const attackerGunnery = attackerOrigin ? navalGunCombatProfile(attackerOrigin, attacker.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const defenderGunnery = defenderOrigin ? navalGunCombatProfile(defenderOrigin, defender.ships, { consumeSupplies: true }) : { multiplier: 1 };
  const attackerPower = fleetCombatPower(attacker, regionsById) * attackerGunnery.multiplier * armourResistance(attacker, defenderGunnery);
  const defenderPower = fleetCombatPower(defender, regionsById, { inPort: defenderInPort }) * defenderGunnery.multiplier * armourResistance(defender, attackerGunnery);""",
'armour and gunnery')

fleet = replace_once(fleet,
"""  reconcileFleetLedger(regions, fleets, events);

  for (const fleet of fleets) {""",
"""  reconcileFleetLedger(regions, fleets, events, weeks);

  for (const fleet of fleets) {""",
'tick reconciliation weeks')

fleet = replace_once(fleet,
"""    else {
      wearAtSea(fleet, weeks);
      advanceFleetRoute(fleet, weeks);""",
"""    else {
      consumeFleetCoal(fleet, weeks);
      wearAtSea(fleet, weeks);
      advanceFleetRoute(fleet, weeks);""",
'coal use at sea')

fleet_path.write_text(fleet)

warfare_path = Path('js/military/earlyModernWarfare.js')
warfare = warfare_path.read_text()
warfare = replace_once(warfare,
"""  const advanced = ships.filter((ship) => ship.designId === 'advanced_warship').length;
  const industrial = ships.filter((ship) => ['steam_warship', 'ironclad', 'steel_warship'].includes(ship.designId)).length;
  const capacity = Math.max(1, advanced * 6 + industrial * 10 + (ships.length - advanced - industrial));""",
"""  const capacity = Math.max(1, ships.reduce((sum, ship) => {
    if (Number.isFinite(ship.gunCapacity)) return sum + Math.max(1, ship.gunCapacity);
    if (ship.designId === 'advanced_warship') return sum + 6;
    if (['paddle_steam_warship', 'steam_frigate', 'ironclad', 'steel_warship'].includes(ship.designId)) return sum + 10;
    return sum + 1;
  }, 0));""",
'naval gun capacity by class')
warfare_path.write_text(warfare)

persistent_test = Path('tools/test-persistent-fleets.mjs')
if persistent_test.exists():
    test = persistent_test.read_text()
    test = test.replace("assert.equal(fleetShipCounts(essexFleet)['advanced warship'], 2);", "assert.equal(fleetShipCounts(essexFleet).galley, 2);")
    persistent_test.write_text(test)

print('fleet ship progression integrated')
